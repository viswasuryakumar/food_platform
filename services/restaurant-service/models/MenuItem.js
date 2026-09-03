const mongoose = require("mongoose");

/**
 * Derived read model, not a source of truth.
 *
 * The authoritative menu is the embedded `menu` array on Restaurant. This
 * collection is a flattened projection of every restaurant's items, rebuilt on
 * write, which supports cross-restaurant queries ("who sells dosa?") that an
 * embedded array cannot answer efficiently. The AI agent reads from here.
 *
 * Because it is derived, it is always safe to drop and rebuild from Restaurant.
 */
const menuItemSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    restaurantName: { type: String, required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    name_normalized: { type: String, index: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String },
    description: { type: String },
    image: { type: String },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/** One projected row per embedded item; makes the rebuild idempotent. */
menuItemSchema.index({ restaurantId: 1, itemId: 1 }, { unique: true });
menuItemSchema.index({ name: "text", category: "text" });

module.exports = mongoose.model("MenuItem", menuItemSchema);
