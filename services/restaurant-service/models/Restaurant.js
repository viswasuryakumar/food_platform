const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  cuisine: { type: String },
  image: { type: String },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
  menu: [
    {
      name: String,
      price: Number
    }
  ]
}); 

module.exports = mongoose.model("Restaurant", restaurantSchema);
