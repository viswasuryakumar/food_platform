require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

mongoose.set("bufferCommands", false);

const PORT = process.env.PORT || 3002;
const DB_RETRY_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS || 2000);
const MAX_DB_ATTEMPTS = Number(process.env.DB_MAX_ATTEMPTS || 15);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
      console.log("Restaurant DB Connected");
      return;
    } catch (err) {
      console.error(
        `Restaurant DB connection failed (attempt ${attempt}/${MAX_DB_ATTEMPTS}): ${err.message}`
      );
      if (attempt === MAX_DB_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function startServer() {
  await connectWithRetry();

  const server = app.listen(PORT, () =>
    console.log(`Restaurant Service running on port ${PORT}`)
  );

  async function shutdown(signal) {
    console.log(`[restaurant-service] ${signal} received, shutting down...`);
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
  console.error("Restaurant service failed to start:", err.message);
  process.exit(1);
});
