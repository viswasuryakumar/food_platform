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
