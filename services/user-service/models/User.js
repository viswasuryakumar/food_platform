const mongoose = require("mongoose");

/**
 * Roles are a closed set. `restaurant_admin` is never self-assignable at
 * registration — see the note in app.js — because that would let anyone grant
 * themselves platform-wide administrative access from a public endpoint.
 */
const ROLES = Object.freeze(["user", "restaurant_admin"]);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * Bcrypt hash. `select: false` keeps it out of query results by default so
     * it cannot be leaked accidentally by a route that returns a user document.
     */
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "user" },
    phone: { type: String, trim: true, maxlength: 32 },
    defaultAddress: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

/** Never serialise the hash, even if a caller explicitly selected it. */
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
