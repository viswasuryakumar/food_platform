const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { z } = require("zod");

const Order = require("./models/Order");
const { checkTransition, nextStatuses } = require("./lib/orderStatus");
const { priceOrder } = require("./lib/pricing");
const { publishOrderEvent } = require("./lib/notifier");
const { validate } = require("./lib/validate");
const { HttpError, asyncHandler, errorHandler, notFoundHandler } = require("./lib/http");

/**
 * The Express app is built separately from the server bootstrap so tests can
 * import it and drive it with supertest without opening a port or connecting
 * to a real database.
 */
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "100kb" }));

// -------------------- IDENTITY --------------------
// The API gateway verifies the JWT and forwards identity as headers. This
// service trusts those headers, which is only safe because the services are not
// publicly routable — the gateway is the sole ingress.
function requireUser(req, _res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return next(new HttpError(401, "Authentication required", "UNAUTHENTICATED"));
  }
  req.user = { id: String(userId), role: String(req.headers["x-user-role"] || "user") };
  return next();
}

function requireAdmin(req, _res, next) {
  if (req.user?.role !== "restaurant_admin") {
    return next(new HttpError(403, "Admin access required", "FORBIDDEN"));
  }
  return next();
}

// -------------------- SCHEMAS --------------------
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

// Note the absence of `price`: the client states intent (what and how many),
// and the server derives the money. See lib/pricing.js.
const createOrderSchema = z.object({
  restaurantId: objectId,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1, "An order must contain at least one item")
    .max(50),
});

const updateStatusSchema = z.object({
  status: z.string().trim().min(1),
  reason: z.string().trim().max(500).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().trim().optional(),
});

// -------------------- HEALTH --------------------
// Liveness: is the process up? Used by orchestrators to decide on restarts.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "order-service", uptime: process.uptime() });
});

// Readiness: can it actually serve traffic? Separated from liveness because a
// service with a dropped DB connection is alive but must be pulled from the
// load balancer rather than restarted.
app.get("/health/ready", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not_ready",
    service: "order-service",
    dependencies: { mongodb: dbReady ? "up" : "down" },
  });
});

// -------------------- ROUTES --------------------
app.use(requireUser);

/** Admin-only: every order across the platform, paginated. */
app.get(
  "/orders",
  requireAdmin,
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit, status } = req.validated.query;
    const filter = status ? { status } : {};

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

/** The signed-in user's own orders. */
app.get(
  "/orders/history",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validated.query;

    const [orders, total] = await Promise.all([
      Order.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments({ userId: req.user.id }),
    ]);

    res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

app.post(
  "/orders",
  validate(createOrderSchema),
  asyncHandler(async (req, res) => {
    const { restaurantId, items } = req.body;

    // Prices come from the restaurant's menu, never from the request body.
    const priced = await priceOrder(restaurantId, items);

    const order = await Order.create({
      userId: req.user.id,
      restaurantId,
      items: priced.items,
      totalPrice: priced.totalPrice,
      status: "pending",
      statusHistory: [{ status: "pending", at: new Date(), by: req.user.id }],
    });

    await publishOrderEvent({
      orderId: String(order._id),
      userId: order.userId,
      restaurantId: order.restaurantId,
      status: order.status,
    });

    res.status(201).json({ message: "Order created", order });
  })
);

app.get(
  "/orders/:id",
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

    // Ownership check: a user may only read their own orders. Without this,
    // anyone could enumerate order ids and read other customers' data.
    if (order.userId !== req.user.id && req.user.role !== "restaurant_admin") {
      throw new HttpError(403, "You do not have access to this order", "FORBIDDEN");
    }

    res.json({ ...order, allowedNextStatuses: nextStatuses(order.status) });
  })
);

app.put(
  "/orders/:id/status",
  validate(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

    // A customer may cancel their own order; everything else is admin/system.
    const isOwner = order.userId === req.user.id;
    const actingRole = req.user.role === "restaurant_admin" ? "restaurant_admin" : "user";

    if (!isOwner && actingRole !== "restaurant_admin") {
      throw new HttpError(403, "You do not have access to this order", "FORBIDDEN");
    }

    const check = checkTransition(order.status, status, actingRole);
    if (!check.ok) {
      // 409 Conflict is the honest code here: the request is well-formed, it
      // just conflicts with the resource's current state.
      const httpStatus = check.code === "FORBIDDEN_TRANSITION" ? 403 : 409;
      throw new HttpError(httpStatus, check.message, check.code);
    }

    order.status = status;
    order.statusHistory.push({ status, at: new Date(), by: req.user.id });
    if (status === "cancelled" && reason) order.cancelledReason = reason;
    await order.save();

    await publishOrderEvent({
      orderId: String(order._id),
      userId: order.userId,
      restaurantId: order.restaurantId,
      status: order.status,
    });

    res.json({ message: "Status updated", order });
  })
);

/**
 * Internal endpoint used by payment-service to mark an order paid. Split from
 * the public status route because it runs with "system" authority, which no
 * end-user role is allowed to hold.
 */
app.post(
  "/orders/:id/mark-paid",
  asyncHandler(async (req, res) => {
    const expected = process.env.INTERNAL_SERVICE_TOKEN;
    if (!expected || req.headers["x-internal-token"] !== expected) {
      throw new HttpError(403, "Internal endpoint", "FORBIDDEN");
    }

    const order = await Order.findById(req.params.id);
    if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

    // Idempotent: replaying this call on an already-paid order is a success,
    // not an error, so payment retries do not break.
    if (order.status === "paid") {
      return res.json({ message: "Order already paid", order });
    }

    const check = checkTransition(order.status, "paid", "system");
    if (!check.ok) throw new HttpError(409, check.message, check.code);

    order.status = "paid";
    order.statusHistory.push({ status: "paid", at: new Date(), by: "system" });
    await order.save();

    await publishOrderEvent({
      orderId: String(order._id),
      userId: order.userId,
      restaurantId: order.restaurantId,
      status: order.status,
    });

    return res.json({ message: "Order marked paid", order });
  })
);

app.use(notFoundHandler);
app.use(errorHandler("order-service"));

module.exports = app;
