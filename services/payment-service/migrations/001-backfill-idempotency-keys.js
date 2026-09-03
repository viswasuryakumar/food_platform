require("dotenv").config();
const mongoose = require("mongoose");

/**
 * Migration: make historical payments compatible with the new unique indexes.
 *
 * Adding `unique: true` to a field that existing documents do not have fails at
 * index-build time: every legacy row has `idempotencyKey: null`, and a unique
 * index permits only one null. The data must be reconciled before the
 * constraint can exist.
 *
 * Three fixes, all idempotent so the script is safe to re-run:
 *   1. Backfill a deterministic idempotency key derived from each _id.
 *   2. Normalise the legacy status value "success" to the enum's "succeeded".
 *   3. Demote duplicate succeeded payments for one order, keeping the earliest,
 *      so the one-successful-payment-per-order index can build.
 *
 * Run with: npm run migrate
 */
async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to database");

  const payments = mongoose.connection.collection("payments");

  /**
   * --- 0. Drop the new constraints before touching data -----------------
   *
   * Ordering matters. If the unique indexes already exist from a previous
   * partial run, normalising legacy rows into the states those indexes cover
   * fails halfway through — leaving the data in a mixed state. Constraints come
   * off first, data is reconciled, then the constraints go back on.
   */
  const existing = await payments.indexes();
  for (const name of ["uniq_succeeded_payment_per_order", "userId_1_idempotencyKey_1"]) {
    if (existing.some((index) => index.name === name)) {
      await payments.dropIndex(name);
      console.log(`Dropped index ${name} so data can be reconciled`);
    }
  }

  // --- 1. Normalise legacy status values -------------------------------
  const statusResult = await payments.updateMany(
    { status: "success" },
    { $set: { status: "succeeded" } }
  );
  console.log(`Normalised status on ${statusResult.modifiedCount} payment(s)`);

  // --- 2. Backfill missing idempotency keys ----------------------------
  const missing = await payments
    .find({ $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }] })
    .toArray();

  for (const payment of missing) {
    // Derived from _id so the value is stable across re-runs and cannot collide.
    await payments.updateOne(
      { _id: payment._id },
      { $set: { idempotencyKey: `legacy_${payment._id.toString()}` } }
    );
  }
  console.log(`Backfilled idempotencyKey on ${missing.length} payment(s)`);

  // --- 3. Resolve duplicate succeeded payments per order ----------------
  const duplicates = await payments
    .aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: "$orderId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  let demoted = 0;
  for (const group of duplicates) {
    // Keep the earliest payment (lowest ObjectId) as the real one.
    const [, ...extras] = group.ids.sort((a, b) => (a.toString() < b.toString() ? -1 : 1));
    if (extras.length === 0) continue;

    await payments.updateMany(
      { _id: { $in: extras } },
      { $set: { status: "failed", duplicateOfOrder: group._id } }
    );
    demoted += extras.length;
  }
  console.log(`Demoted ${demoted} duplicate succeeded payment(s) across ${duplicates.length} order(s)`);

  // --- 4. Build the indexes now that the data satisfies them ------------
  await require("../models/payment").syncIndexes();
  console.log("Indexes synced");

  await mongoose.connection.close();
  console.log("\nMigration complete.");
}

run().catch(async (err) => {
  console.error("\nMigration failed:", err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
