const mongoose = require("mongoose");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Menu items are embedded rather than referenced.
 *
 * They are small, bounded, always read together with their restaurant, and
 * rarely written — which is precisely the access pattern embedding is designed
 * for. It also makes a menu read a single document fetch instead of a join.
 * The separate `menuitems` collection is maintained as a derived read model for
 * cross-restaurant item search (see lib/menuProjection.js).
 */
const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    name_normalized: { type: String },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: String, trim: true, maxlength: 500 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: true }
);

// Zero-arg hooks run synchronously in Mongoose; declaring a `next` parameter
// would switch it to callback style, which this version no longer supplies.
menuItemSchema.pre("validate", function normalizeItem() {
  this.name_normalized = normalize(this.name);
});

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    name_normalized: { type: String, index: true },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    cuisine: { type: String, trim: true, maxlength: 80 },
    cuisine_normalized: { type: String, index: true },
    image: { type: String, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 1000 },
    /** Owning admin. Used to stop one admin editing another's restaurant. */
    createdBy: { type: String, required: true, index: true },
    isOpen: { type: Boolean, default: true },
    menu: { type: [menuItemSchema], default: [] },

    /** Denormalised rating summary, recomputed when reviews change. */
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/**
 * `pre('validate')` rather than `pre('save')` so the normalised fields exist
 * before schema validation runs. Kept synchronous (no `next` parameter) to
 * match Mongoose's sync-hook form.
 */
restaurantSchema.pre("validate", function normalizeRestaurant() {
  this.name_normalized = normalize(this.name);
  this.cuisine_normalized = normalize(this.cuisine);
});

// Full-text search across the fields users actually search by.
restaurantSchema.index({ name: "text", cuisine: "text", description: "text" });

module.exports = mongoose.model("Restaurant", restaurantSchema);
module.exports.normalize = normalize;
