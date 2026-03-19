require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");

const app = express();
app.use(cors());
app.use(express.json());
mongoose.set("bufferCommands", false);
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 2000);

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function scoreSearch(query, candidate) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return normalizedQuery ? 0 : 1;

  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.includes(normalizedQuery)) return 0.95;
  if (normalizedQuery.includes(normalizedCandidate)) return 0.85;

  const queryTokens = [...new Set(tokenizeSearchText(normalizedQuery))];
  const candidateTokens = new Set(tokenizeSearchText(normalizedCandidate));
  if (!queryTokens.length || !candidateTokens.size) return 0;

  const overlap = queryTokens.filter((token) => candidateTokens.has(token)).length;
  if (!overlap) return 0;
  return overlap / queryTokens.length;
}

function parseLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}


// --------- RESTAURANT ROUTES ---------

// Create restaurant
app.post("/restaurants", async (req, res) => {
  try {
    const createdBy = req.headers["x-user-id"]; // Admin ID
    const restaurant = new Restaurant({
      ...req.body,
      createdBy
    });

    await restaurant.save();
    res.json({ message: "Restaurant created", restaurant });
  } catch (err) {
    console.error("Restaurant error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


// Get all restaurants
app.get("/restaurants", async (req, res) => {
  const restaurants = await Restaurant.find();
  res.json(restaurants);
});

// Search restaurants
app.get("/restaurants/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = parseLimit(req.query.limit, 100, 5000);
  const restaurants = await Restaurant.find({}, { name: 1, address: 1, cuisine: 1 });

  const ranked = restaurants
    .map((restaurant) => {
      const score = Math.max(
        scoreSearch(query, restaurant.name),
        scoreSearch(query, restaurant.cuisine),
        scoreSearch(query, restaurant.address),
        scoreSearch(query, `${restaurant.cuisine || ""} ${restaurant.name || ""}`)
      );

      return {
        _id: restaurant._id.toString(),
        name: restaurant.name,
        cuisine: restaurant.cuisine || "",
        address: restaurant.address || "",
        score: Number(score.toFixed(3)),
      };
    })
    .filter((restaurant) => (!query ? true : restaurant.score > 0))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  res.json({
    query,
    count: ranked.length,
    restaurants: ranked,
  });
});

// Search all menu items across all restaurants
app.get("/restaurants/items/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = parseLimit(req.query.limit, 200, 5000);
  const restaurants = await Restaurant.find({}, { name: 1, cuisine: 1, menu: 1 });

  const items = [];
  for (const restaurant of restaurants) {
    for (const menuItem of Array.isArray(restaurant.menu) ? restaurant.menu : []) {
      const itemName = String(menuItem?.name || "").trim();
      if (!itemName) continue;

      const score = Math.max(
        scoreSearch(query, itemName),
        scoreSearch(query, `${restaurant.name || ""} ${itemName}`),
        scoreSearch(query, `${restaurant.cuisine || ""} ${itemName}`)
      );

      if (query && score <= 0) continue;

      items.push({
        name: itemName,
        price: Number(menuItem.price) || 0,
        restaurantId: restaurant._id.toString(),
        restaurantName: restaurant.name,
        cuisine: restaurant.cuisine || "",
        score: Number(score.toFixed(3)),
      });
    }
  }

  items.sort(
    (a, b) =>
      b.score - a.score ||
      a.restaurantName.localeCompare(b.restaurantName) ||
      a.name.localeCompare(b.name)
  );

  res.json({
    query,
    count: items.length,
    items: items.slice(0, limit),
  });
});

// Get one restaurant
app.get("/restaurants/:id", async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);
  res.json(restaurant);
});

// Update restaurant
app.put("/restaurants/:id", async (req, res) => {
  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ message: "Restaurant updated", restaurant });
});

// Delete restaurant
app.delete("/restaurants/:id", async (req, res) => {
  await Restaurant.findByIdAndDelete(req.params.id);
  res.json({ message: "Restaurant deleted" });
});


// --------- MENU ROUTES ---------

// Create menu item
app.post("/restaurants/:id/menu", async (req, res) => {
  const menuItem = new MenuItem({
    restaurantId: req.params.id,
    ...req.body
  });
  await menuItem.save();
  res.json({ message: "Menu item added", menuItem });
});

// Get menu for restaurant
app.get("/restaurants/:id/menu", async (req, res) => {
  const items = await MenuItem.find({ restaurantId: req.params.id });
  res.json(items);
});

async function startServer() {
  while (true) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 3000,
      });
      console.log("Restaurant DB Connected");
      break;
    } catch (err) {
      console.error(
        `Restaurant DB connection failed (${err.message}). Retrying in ${DB_RETRY_DELAY_MS}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }

  app.listen(process.env.PORT, () =>
    console.log(`Restaurant Service running on port ${process.env.PORT}`)
  );
}

startServer();
