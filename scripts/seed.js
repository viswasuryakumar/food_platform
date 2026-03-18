#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const rootDir = path.resolve(__dirname, "..");
const reset = process.argv.includes("--reset");

const defaultUris = {
  user: "mongodb://127.0.0.1:27017/food_user",
  restaurant: "mongodb://127.0.0.1:27017/food_restaurant",
  order: "mongodb://127.0.0.1:27017/food_order",
  payment: "mongodb://127.0.0.1:27017/food_payment",
};

function readEnv(relativePath) {
  const envPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath, "utf8"));
}

function getMongoUri(relativePath, fallback) {
  const env = readEnv(relativePath);
  return env.MONGO_URI || fallback;
}

async function connectDb(uri, name) {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await connection.asPromise();
    return connection;
  } catch (error) {
    throw new Error(`Unable to connect to ${name} DB at ${uri}: ${error.message}`);
  }
}

function makeModels(connections) {
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
  });

  const restaurantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    cuisine: { type: String },
    image: { type: String },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, required: true },
    menu: [{ name: String, price: Number }],
  });

  const menuItemSchema = new mongoose.Schema({
    restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String },
    image: { type: String },
    createdAt: { type: Date, default: Date.now },
  });

  const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    items: [{ name: String, price: Number, quantity: Number }],
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "preparing", "on-the-way", "delivered"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
  });

  const paymentSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: "card" },
    status: { type: String, default: "success" },
    transactionId: { type: String, required: true },
    date: { type: Date, default: Date.now },
  });

  return {
    User: connections.user.model("User", userSchema),
    Restaurant: connections.restaurant.model("Restaurant", restaurantSchema),
    MenuItem: connections.restaurant.model("MenuItem", menuItemSchema),
    Order: connections.order.model("Order", orderSchema),
    Payment: connections.payment.model("Payment", paymentSchema),
  };
}

function buildRestaurants(adminId) {
  return [
    {
      name: "Campus Bites",
      address: "North Block, Main Campus",
      cuisine: "Indian",
      createdBy: adminId,
      menu: [
        { name: "Masala Dosa", price: 6.5 },
        { name: "Paneer Wrap", price: 7.25 },
        { name: "Filter Coffee", price: 2.5 },
      ],
    },
    {
      name: "Pasta Theory",
      address: "Food Court, Level 1",
      cuisine: "Italian",
      createdBy: adminId,
      menu: [
        { name: "Arrabbiata Pasta", price: 9.5 },
        { name: "Alfredo Pasta", price: 10.25 },
        { name: "Garlic Bread", price: 4.0 },
      ],
    },
    {
      name: "Sushi Lab",
      address: "East Wing, Student Plaza",
      cuisine: "Japanese",
      createdBy: adminId,
      menu: [
        { name: "Veggie Roll", price: 8.25 },
        { name: "Tofu Teriyaki Bowl", price: 11.0 },
        { name: "Miso Soup", price: 3.25 },
      ],
    },
    {
      name: "Burger Garage",
      address: "South Gate, Street Lane",
      cuisine: "American",
      createdBy: adminId,
      menu: [
        { name: "Classic Veg Burger", price: 7.0 },
        { name: "Cheese Fries", price: 4.75 },
        { name: "Cold Brew", price: 3.5 },
      ],
    },
  ];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeItem(item, fallbackName = "Sample Item", fallbackPrice = 5) {
  return {
    name: item?.name || fallbackName,
    price: toNumber(item?.price, fallbackPrice),
    quantity: toNumber(item?.quantity, 1),
  };
}

function buildOrders(users, restaurants) {
  const defaultMenus = {
    "Campus Bites": [
      { name: "Masala Dosa", price: 6.5 },
      { name: "Filter Coffee", price: 2.5 },
    ],
    "Pasta Theory": [
      { name: "Alfredo Pasta", price: 10.25 },
      { name: "Garlic Bread", price: 4.0 },
    ],
    "Sushi Lab": [
      { name: "Veggie Roll", price: 8.25 },
      { name: "Tofu Teriyaki Bowl", price: 11.0 },
    ],
  };

  const byName = new Map(restaurants.map((restaurant) => [restaurant.name, restaurant]));

  const pickItems = (restaurantName) => {
    const restaurant = byName.get(restaurantName);
    if (!restaurant) return [];

    const sourceMenu = Array.isArray(restaurant.menu) && restaurant.menu.length > 0
      ? restaurant.menu
      : defaultMenus[restaurantName] || [];

    const chosen = sourceMenu.slice(0, 2).map((item) => normalizeItem(item));
    if (chosen.length > 0) return chosen;

    return [normalizeItem(null, "Chef Special", 9)];
  };

  const total = (items) =>
    items.reduce((sum, item) => sum + toNumber(item.price) * toNumber(item.quantity, 1), 0);

  const templates = [
    { restaurantName: "Campus Bites", userId: users.demoUser, status: "delivered" },
    { restaurantName: "Pasta Theory", userId: users.demoUser, status: "preparing" },
    { restaurantName: "Sushi Lab", userId: users.secondUser, status: "pending" },
  ];

  const orders = [];
  for (const template of templates) {
    const restaurant = byName.get(template.restaurantName);
    if (!restaurant) continue;

    const items = pickItems(template.restaurantName);
    orders.push({
      userId: template.userId,
      restaurantId: restaurant._id.toString(),
      items,
      totalPrice: total(items),
      status: template.status,
    });
  }

  return orders;
}

async function seedUsers(User) {
  const demoPassword = "demo12345";
  const users = [
    {
      key: "demoUser",
      name: "Demo User",
      email: "demo.user@campusfood.dev",
      role: "user",
      password: demoPassword,
    },
    {
      key: "secondUser",
      name: "Test Student",
      email: "student@campusfood.dev",
      role: "user",
      password: demoPassword,
    },
    {
      key: "adminUser",
      name: "Restaurant Admin",
      email: "admin@campusfood.dev",
      role: "restaurant_admin",
      password: demoPassword,
    },
  ];

  const ids = {};
  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const doc = await User.findOneAndUpdate(
      { email: user.email },
      {
        name: user.name,
        email: user.email,
        role: user.role,
        password: hashedPassword,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    ids[user.key] = doc._id.toString();
  }

  return {
    ids,
    demoPassword,
  };
}

async function seedRestaurants(Restaurant, MenuItem, adminId) {
  const restaurants = buildRestaurants(adminId);

  for (const restaurant of restaurants) {
    await Restaurant.findOneAndUpdate(
      { name: restaurant.name, address: restaurant.address },
      restaurant,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  const docs = await Restaurant.find({
    name: { $in: restaurants.map((item) => item.name) },
  }).sort({ name: 1 });

  for (const restaurant of docs) {
    for (const item of restaurant.menu) {
      await MenuItem.findOneAndUpdate(
        { restaurantId: restaurant._id, name: item.name },
        {
          restaurantId: restaurant._id,
          name: item.name,
          price: item.price,
          category: "main",
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }
  }

  return docs;
}

async function seedOrders(Order, userIds, restaurants) {
  const existing = await Order.countDocuments();
  if (existing > 0 && !reset) {
    return { inserted: 0, skipped: true };
  }

  const orders = buildOrders(userIds, restaurants);
  if (orders.length === 0) {
    return { inserted: 0, skipped: true };
  }

  await Order.insertMany(orders);
  return { inserted: orders.length, skipped: false };
}

async function seedPayments(Payment, Order) {
  const existing = await Payment.countDocuments();
  if (existing > 0 && !reset) {
    return { inserted: 0, skipped: true };
  }

  const deliveredOrders = await Order.find({ status: "delivered" }).limit(2);
  if (deliveredOrders.length === 0) {
    return { inserted: 0, skipped: true };
  }

  const payments = deliveredOrders.map((order) => ({
    orderId: order._id.toString(),
    userId: order.userId,
    amount: order.totalPrice,
    method: "card",
    status: "success",
    transactionId: crypto.randomUUID(),
  }));

  await Payment.insertMany(payments);
  return { inserted: payments.length, skipped: false };
}

async function closeConnections(connections) {
  await Promise.all(
    Object.values(connections)
      .filter(Boolean)
      .map((connection) =>
        connection.close().catch(() => undefined)
      )
  );
}

async function main() {
  const uris = {
    user: getMongoUri("services/user-service/.env", defaultUris.user),
    restaurant: getMongoUri("services/restaurant-service/.env", defaultUris.restaurant),
    order: getMongoUri("services/order-service/.env", defaultUris.order),
    payment: getMongoUri("services/payment-service/.env", defaultUris.payment),
  };

  const connections = {
    user: null,
    restaurant: null,
    order: null,
    payment: null,
  };

  try {
    connections.user = await connectDb(uris.user, "user-service");
    connections.restaurant = await connectDb(uris.restaurant, "restaurant-service");
    connections.order = await connectDb(uris.order, "order-service");
    connections.payment = await connectDb(uris.payment, "payment-service");

    const { User, Restaurant, MenuItem, Order, Payment } = makeModels(connections);

    if (reset) {
      await Promise.all([
        MenuItem.deleteMany({}),
        Restaurant.deleteMany({}),
        Order.deleteMany({}),
        Payment.deleteMany({}),
      ]);
      console.log("Reset existing restaurant/order/payment data.");
    }

    const { ids: userIds, demoPassword } = await seedUsers(User);
    const restaurants = await seedRestaurants(Restaurant, MenuItem, userIds.adminUser);
    const orderResult = await seedOrders(Order, userIds, restaurants);
    const paymentResult = await seedPayments(Payment, Order);

    console.log("\nMock data ready.");
    console.log(`Users ensured: 3`);
    console.log(`Restaurants ensured: ${restaurants.length}`);
    console.log(
      orderResult.skipped
        ? "Orders: skipped (existing orders found)"
        : `Orders inserted: ${orderResult.inserted}`
    );
    console.log(
      paymentResult.skipped
        ? "Payments: skipped (existing payments found or no delivered orders)"
        : `Payments inserted: ${paymentResult.inserted}`
    );

    console.log("\nDemo credentials:");
    console.log(`User: demo.user@campusfood.dev / ${demoPassword}`);
    console.log(`Admin: admin@campusfood.dev / ${demoPassword}`);
  } catch (error) {
    console.error("Seeding failed.");
    console.error(error.message);
    if (/connect|ECONN|ENOTFOUND|topology|server selection/i.test(error.message)) {
      console.error("Make sure MongoDB is running first: npm run db:start");
    }
    process.exitCode = 1;
  } finally {
    await closeConnections(connections);
  }
}

main();
