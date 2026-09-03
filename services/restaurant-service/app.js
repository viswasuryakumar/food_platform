const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { z } = require("zod");

const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");
const { safeRebuild, dropMenuProjection } = require("./lib/menuProjection");
const { validate } = require("./lib/validate");
const { HttpError, asyncHandler, errorHandler, notFoundHandler } = require("./lib/http");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "200kb" }));

// -------------------- IDENTITY --------------------
function identify(req, _res, next) {
  const userId = req.headers["x-user-id"];
  req.user = userId
    ? { id: String(userId), role: String(req.headers["x-user-role"] || "user") }
    : null;
  return next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Authentication required", "UNAUTHENTICATED"));
  if (req.user.role !== "restaurant_admin") {
    return next(new HttpError(403, "Admin access required", "FORBIDDEN"));
  }
  return next();
}

/**
 * Loads the restaurant and asserts the caller owns it.
 *
 * Being an admin is not sufficient. Without this, any restaurant_admin could
 * edit or delete a competitor's restaurant and menu — the gateway only checked
 * *that* you are an admin, never *which* restaurants are yours.
 */
const loadOwnedRestaurant = asyncHandler(async (req, _res, next) => {
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");

  if (restaurant.createdBy !== req.user.id) {
    throw new HttpError(403, "You do not own this restaurant", "NOT_OWNER");
  }

  req.restaurant = restaurant;
  return next();
});

// -------------------- SCHEMAS --------------------
const menuItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().nonnegative().max(100000),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  image: z.string().trim().max(500).optional(),
  isAvailable: z.boolean().optional(),
});

const createRestaurantSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  cuisine: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
  image: z.string().trim().max(500).optional(),
  menu: z.array(menuItemInput).max(200).default([]),
});

/**
 * `menu` is omitted deliberately. Keeping it would mean a partial update that
 * does not mention the menu silently replaces it with the schema default — an
 * empty array — wiping every item. Menu changes go through the dedicated
 * /menu endpoints, which also keeps the projection rebuild scoped.
 */
const updateRestaurantSchema = createRestaurantSchema.omit({ menu: true }).partial();

const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  cuisine: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(["name", "rating", "newest"]).default("name"),
});

const itemSearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// -------------------- HEALTH --------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "restaurant-service", uptime: process.uptime() });
});

app.get("/health/ready", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not_ready",
    service: "restaurant-service",
    dependencies: { mongodb: dbReady ? "up" : "down" },
  });
});

app.use(identify);

// -------------------- PUBLIC READS --------------------
/**
 * Paginated search. Declared before `/restaurants/:id` so that the literal
 * path "search" is not captured as an id.
 */
app.get(
  "/restaurants/search",
  validate(searchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { q, cuisine, page, limit, sort } = req.validated.query;

    const filter = {};
    if (q) {
      // Escaped so a user-supplied "(" cannot throw an invalid-regex error, and
      // anchored so the query can use the index rather than scanning.
      const safe = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name_normalized: new RegExp("^" + safe) },
        { cuisine_normalized: new RegExp("^" + safe) },
      ];
    }
    if (cuisine) filter.cuisine_normalized = cuisine.toLowerCase().trim();

    const sortBy = {
      name: { name_normalized: 1 },
      rating: { ratingAverage: -1, ratingCount: -1 },
      newest: { createdAt: -1 },
    }[sort];

    const [restaurants, total] = await Promise.all([
      Restaurant.find(filter, { menu: 0 })
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Restaurant.countDocuments(filter),
    ]);

    res.json({ restaurants, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

/**
 * Cross-restaurant item search, served from the flat projection. An embedded
 * array cannot answer "which restaurants sell dosa?" without scanning every
 * restaurant document.
 */
app.get(
  "/restaurants/items/search",
  validate(itemSearchSchema, "query"),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.validated.query;
    const safe = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const items = await MenuItem.find({
      name_normalized: new RegExp(safe),
      isAvailable: true,
    })
      .sort({ price: 1 })
      .limit(limit)
      .lean();

    res.json({ items, total: items.length });
  })
);

app.get(
  "/restaurants",
  asyncHandler(async (_req, res) => {
    const restaurants = await Restaurant.find().lean();
    res.json(restaurants);
  })
);

app.get(
  "/restaurants/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid restaurant id", "INVALID_ID");
    }

    const restaurant = await Restaurant.findById(req.params.id).lean();
    // The original returned `null` with a 200 here, so callers could not tell a
    // missing restaurant from a successful empty response.
    if (!restaurant) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");

    res.json(restaurant);
  })
);

app.get(
  "/restaurants/:id/menu",
  asyncHandler(async (req, res) => {
    const restaurant = await Restaurant.findById(req.params.id).select("menu").lean();
    if (!restaurant) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
    res.json(restaurant.menu || []);
  })
);

// -------------------- ADMIN WRITES --------------------
app.post(
  "/restaurants",
  requireAdmin,
  validate(createRestaurantSchema),
  asyncHandler(async (req, res) => {
    const restaurant = await Restaurant.create({ ...req.body, createdBy: req.user.id });
    await safeRebuild(restaurant);
    res.status(201).json({ message: "Restaurant created", restaurant });
  })
);

/** The restaurants owned by the calling admin. */
app.get(
  "/restaurants/mine/list",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const restaurants = await Restaurant.find({ createdBy: req.user.id }).lean();
    res.json({ restaurants, total: restaurants.length });
  })
);

app.put(
  "/restaurants/:id",
  requireAdmin,
  loadOwnedRestaurant,
  validate(updateRestaurantSchema),
  asyncHandler(async (req, res) => {
    Object.assign(req.restaurant, req.body);
    await req.restaurant.save();
    await safeRebuild(req.restaurant);
    res.json({ message: "Restaurant updated", restaurant: req.restaurant });
  })
);

app.delete(
  "/restaurants/:id",
  requireAdmin,
  loadOwnedRestaurant,
  asyncHandler(async (req, res) => {
    await req.restaurant.deleteOne();
    await dropMenuProjection(req.restaurant._id);
    res.json({ message: "Restaurant deleted" });
  })
);

// -------------------- MENU WRITES --------------------
app.post(
  "/restaurants/:id/menu",
  requireAdmin,
  loadOwnedRestaurant,
  validate(menuItemInput),
  asyncHandler(async (req, res) => {
    req.restaurant.menu.push(req.body);
    await req.restaurant.save();
    await safeRebuild(req.restaurant);

    res.status(201).json({
      message: "Menu item added",
      menuItem: req.restaurant.menu.at(-1),
    });
  })
);

app.put(
  "/restaurants/:id/menu/:itemId",
  requireAdmin,
  loadOwnedRestaurant,
  validate(menuItemInput.partial()),
  asyncHandler(async (req, res) => {
    const item = req.restaurant.menu.id(req.params.itemId);
    if (!item) throw new HttpError(404, "Menu item not found", "MENU_ITEM_NOT_FOUND");

    Object.assign(item, req.body);
    await req.restaurant.save();
    await safeRebuild(req.restaurant);

    res.json({ message: "Menu item updated", menuItem: item });
  })
);

app.delete(
  "/restaurants/:id/menu/:itemId",
  requireAdmin,
  loadOwnedRestaurant,
  asyncHandler(async (req, res) => {
    const item = req.restaurant.menu.id(req.params.itemId);
    if (!item) throw new HttpError(404, "Menu item not found", "MENU_ITEM_NOT_FOUND");

    item.deleteOne();
    await req.restaurant.save();
    await safeRebuild(req.restaurant);

    res.json({ message: "Menu item deleted" });
  })
);

/** Internal: lets review-service push a recomputed rating summary. */
app.post(
  "/internal/restaurants/:id/rating",
  asyncHandler(async (req, res) => {
    const expected = process.env.INTERNAL_SERVICE_TOKEN;
    if (!expected || req.headers["x-internal-token"] !== expected) {
      throw new HttpError(403, "Internal endpoint", "FORBIDDEN");
    }

    const { ratingAverage, ratingCount } = req.body || {};
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { ratingAverage: Number(ratingAverage) || 0, ratingCount: Number(ratingCount) || 0 },
      { returnDocument: "after" }
    );
    if (!restaurant) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");

    res.json({ message: "Rating updated", restaurant });
  })
);

app.use(notFoundHandler);
app.use(errorHandler("restaurant-service"));

module.exports = app;
