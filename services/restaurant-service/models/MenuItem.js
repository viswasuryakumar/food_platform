const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  name_normalized: { type: String, index: true },
  price: { type: Number, required: true },
  category: { type: String },
  image: { type: String },
  createdAt: { type: Date, default: Date.now }
});

menuItemSchema.pre('save', function() {
  if (this.name && (this.isModified('name') || this.isNew)) {
    this.name_normalized = this.name.toLowerCase().trim();
  }
});

module.exports = mongoose.model("MenuItem", menuItemSchema);
