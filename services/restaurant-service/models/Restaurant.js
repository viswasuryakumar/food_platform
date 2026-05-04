const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  name_normalized: { type: String, index: true },
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

restaurantSchema.pre('save', function() {
  if (this.name && (this.isModified('name') || this.isNew)) {
    this.name_normalized = this.name.toLowerCase().trim();
  }
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
