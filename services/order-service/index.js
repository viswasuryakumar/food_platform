require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

mongoose.set("bufferCommands", false);

const PORT = process.env.PORT || 3003;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 2000);
const MAX_DB_ATTEMPTS = Number(process.env.DB_MAX_ATTEMPTS || 15);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
      console.log("Order DB Connected");
      return;
    } catch (err) {
      console.error(
        `Order DB connection failed (attempt ${attempt}/${MAX_DB_ATTEMPTS}): ${err.message}`
      );
      if (attempt === MAX_DB_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function startServer() {
  // Bounded retry rather than an infinite loop: a service that can never reach
  // its database should exit loudly so a supervisor can restart or alert, not
  // spin silently forever.
  await connectWithRetry();

  const server = app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));

  // Graceful shutdown: stop accepting new connections, finish in-flight
  // requests, then close the DB pool. Without this, a deploy can drop requests.
  async function shutdown(signal) {
    console.log(`[order-service] ${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.connection.close(false);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("Order service failed to start:", err.message);
  process.exit(1);
});
