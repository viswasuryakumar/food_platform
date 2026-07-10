const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  name_normalized: { type: String, index: true },
  address: { type: String, required: true },
  cuisine: { type: String },
  cuisine_normalized: { type: String, index: true },
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
  if (this.cuisine && (this.isModified('cuisine') || this.isNew)) {
    this.cuisine_normalized = this.cuisine.toLowerCase().trim();
  } else if (!this.cuisine) {
    this.cuisine_normalized = "";
  }
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
