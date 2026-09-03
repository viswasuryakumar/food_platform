const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");
const { z } = require("zod");

const Payment = require("./models/payment");
const { PAYMENT_METHODS } = require("./models/payment");
const { fetchOrder, markOrderPaid } = require("./lib/orderClient");
const { validate } = require("./lib/validate");
const { HttpError, asyncHandler, errorHandler, notFoundHandler } = require("./lib/http");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "50kb" }));

function requireUser(req, _res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId) return next(new HttpError(401, "Authentication required", "UNAUTHENTICATED"));
  req.user = { id: String(userId), role: String(req.headers["x-user-role"] || "user") };
  return next();
}

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

// Note there is no `amount` field: the charge is priced from the stored order,
// never from the request body. A client that could name its own price could pay
// one cent for a forty dollar order.
const chargeSchema = z.object({
  orderId: objectId,
  method: z.enum(PAYMENT_METHODS).default("card"),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "payment-service", uptime: process.uptime() });
});

app.get("/health/ready", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not_ready",
    service: "payment-service",
    dependencies: { mongodb: dbReady ? "up" : "down" },
  });
});

app.use(requireUser);

app.post(
  "/payments/charge",
  validate(chargeSchema),
  asyncHandler(async (req, res) => {
    const { orderId, method } = req.body;
    // Header form is the industry convention (Stripe et al.); body is accepted
    // as a fallback. Absent a key we generate one, so the request still works
    // but gains no retry protection.
    const idempotencyKey =
      req.headers["idempotency-key"] || req.body.idempotencyKey || randomUUID();

    // Replaying a completed charge must return the original result, not a new one.
    const existing = await Payment.findOne({ userId: req.user.id, idempotencyKey });
    if (existing) {
      return res.status(200).json({
        message: "Payment already processed",
        payment: existing,
        idempotentReplay: true,
      });
    }

    const order = await fetchOrder(orderId, req.user.id);

    if (order.userId !== req.user.id) {
      throw new HttpError(403, "You cannot pay for another user's order", "FORBIDDEN");
    }

    if (order.status !== "pending") {
      /**
       * The order may have become non-payable because a concurrent request
       * carrying *this same key* already paid it: both requests passed the
       * idempotency lookup above before either wrote. Re-check now, so a
       * retried request still returns the original payment instead of a 409.
       *
       * A different key on an already-paid order is a genuinely distinct
       * request and must still be rejected.
       */
      const winner = await Payment.findOne({ userId: req.user.id, idempotencyKey });
      if (winner) {
        return res.status(200).json({
          message: "Payment already processed",
          payment: winner,
          idempotentReplay: true,
        });
      }

      throw new HttpError(
        409,
        `Order is "${order.status}" and cannot be paid`,
        "ORDER_NOT_PAYABLE"
      );
    }

    let payment;
    try {
      payment = await Payment.create({
        orderId,
        userId: req.user.id,
        amount: order.totalPrice, // authoritative, from the order
        method,
        status: "succeeded",
        transactionId: randomUUID(),
        idempotencyKey,
      });
    } catch (err) {
      // A unique-index violation means a concurrent request won the race.
      // Return that winner's result instead of surfacing a 500.
      if (err.code === 11000) {
        const winner = await Payment.findOne({
          $or: [{ userId: req.user.id, idempotencyKey }, { orderId, status: "succeeded" }],
        });
        if (winner) {
          return res.status(200).json({
            message: "Payment already processed",
            payment: winner,
            idempotentReplay: true,
          });
        }
      }
      throw err;
    }

    await markOrderPaid(orderId, req.user.id);

    return res.status(201).json({ message: "Payment successful", payment });
  })
);

app.get(
  "/payments/history",
  validate(historyQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validated.query;

    const [payments, total] = await Promise.all([
      Payment.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Payment.countDocuments({ userId: req.user.id }),
    ]);

    res.json({ payments, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

app.use(notFoundHandler);
app.use(errorHandler("payment-service"));

module.exports = app;
