const mongoose = require("mongoose");

const PAYMENT_STATUSES = Object.freeze(["succeeded", "failed"]);
const PAYMENT_METHODS = Object.freeze(["card", "upi", "wallet"]);

const paymentSchema = new mongoose.Schema(
  {
    // No field-level `index` here: the partial unique index declared below
    // already covers this key, and declaring both collides on the generated name.
    orderId: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, default: "card" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "succeeded" },
    transactionId: { type: String, required: true, unique: true },

    /**
     * Client-supplied key that makes a charge safely retryable. Replaying a
     * request with the same key returns the original payment instead of
     * charging again.
     */
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true }
);

/**
 * The database — not application code — is what actually guarantees a single
 * charge per key. Two concurrent retries can both pass an "already exists?"
 * check before either writes; only a unique index reliably rejects the loser.
 * Scoped per user so keys cannot collide across accounts.
 */
paymentSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

/** One successful payment per order, enforced at the storage layer. */
paymentSchema.index(
  { orderId: 1 },
  {
    name: "uniq_succeeded_payment_per_order",
    unique: true,
    partialFilterExpression: { status: "succeeded" },
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
