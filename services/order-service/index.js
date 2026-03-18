require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");


const Order = require("./models/Order");

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Order DB Connected"))
  .catch((err) => console.log("DB Error:", err));

// GET ALL ORDERS (ADMIN)
app.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// ----------- CREATE ORDER -----------
app.post("/orders", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const { restaurantId, items } = req.body;


  // calculate price
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = new Order({
    userId,
    restaurantId,
    items,
    totalPrice
  });

  await order.save();
  res.json({ message: "Order created", order });
});

// ----------- GET USER ORDER HISTORY -----------
app.get("/orders/history", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const orders = await Order.find({ userId });
  res.json(orders);
});

// ----------- GET ORDER BY ID -----------
app.get("/orders/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});







// ----------- UPDATE ORDER STATUS  and send it to notification service----------- 
app.put("/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    console.log("Updating order " + req.params.id + " status to:", status);
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    console.log("Updated order:", order);
    if (!order) return res.status(404).json({ message: "Order not found" });
    
    // remove this if not needed
     // --- NEW: Send notification to notification service ---
    //  await axios.post("http://localhost:3005/notify", {
    //     orderId: order._id,x
    //    status: order.status
    //  });

    res.json({ message: "Status updated", order });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Order Service running on port ${process.env.PORT}`)
);
