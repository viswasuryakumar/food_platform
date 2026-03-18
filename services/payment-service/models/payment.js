const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: "card" },  // card, upi, wallet
  status: { type: String, default: "success" },
  transactionId: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", paymentSchema);
