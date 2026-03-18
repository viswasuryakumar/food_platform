require("dotenv").config();
const axios = require("axios");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const Payment = require("./models/Payment");

const app = express();
app.use(cors());
app.use(express.json());

// Connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Payment DB Connected"))
  .catch((err) => console.log("DB Error:", err));


// -------- MAKE PAYMENT --------
app.post("/payments/charge", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const { orderId, amount, method } = req.body;


    if (!orderId || !userId || !amount) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const payment = new Payment({
      orderId,
      userId,
      amount,
      method,
      transactionId: uuidv4(),
    });

    await payment.save();
    // --- NEW: Update Order Service status ---
    try {
      await axios.put(
        `http://localhost:3000/api/orders/${orderId}/status`,
        { status: "paid" },
        {
          headers: {
            Authorization: req.headers.authorization
          }
        }
      );
      console.log(`Order ${orderId} status updated to paid successfully`);
      console.log(`Payment processed for order with payment ID: ${payment}`);
    } catch (err) {
      console.error(`Failed to update order ${orderId} status:`, err.message);
      throw err; // Re-throw to be handled by outer catch
    }
    res.json({ message: "Payment successful", payment });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});



// -------- GET PAYMENT HISTORY --------
app.get("/payments/history", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const payments = await Payment.find({ userId });
    res.json(payments);
  } catch (err) {
    console.error("Payment history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});



app.listen(process.env.PORT, () =>
  console.log(`Payment Service running on port ${process.env.PORT}`)
);
