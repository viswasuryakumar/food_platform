#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = new Set(process.argv.slice(2));
const envOnly = args.has("--env-only");
const skipInstall = args.has("--skip-install") || envOnly;

const projects = [
  { name: "root", dir: "." },
  { name: "api-gateway", dir: "api-gateway" },
  { name: "user-service", dir: "services/user-service" },
  { name: "restaurant-service", dir: "services/restaurant-service" },
  { name: "order-service", dir: "services/order-service" },
  { name: "payment-service", dir: "services/payment-service" },
  { name: "notification-service", dir: "services/notification-service" },
  { name: "frontend", dir: "frontend" },
];

const envTemplates = [
  {
    file: "api-gateway/.env",
    content: [
      "PORT=3000",
      "JWT_SECRET=dev_secret_123",
      "USER_SERVICE_URL=http://localhost:3001",
      "RESTAURANT_SERVICE_URL=http://localhost:3002",
      "ORDER_SERVICE_URL=http://localhost:3003",
      "PAYMENT_SERVICE_URL=http://localhost:3004",
      "NOTIFICATION_SERVICE_URL=http://localhost:3005",
      "",
    ].join("\n"),
  },
  {
    file: "services/user-service/.env",
    content: [
      "PORT=3001",
      "MONGO_URI=mongodb://127.0.0.1:27017/food_user",
      "JWT_SECRET=dev_secret_123",
      "",
    ].join("\n"),
  },
  {
    file: "services/restaurant-service/.env",
    content: [
      "PORT=3002",
      "MONGO_URI=mongodb://127.0.0.1:27017/food_restaurant",
      "",
    ].join("\n"),
  },
  {
    file: "services/order-service/.env",
    content: [
      "PORT=3003",
      "MONGO_URI=mongodb://127.0.0.1:27017/food_order",
      "",
    ].join("\n"),
  },
  {
    file: "services/payment-service/.env",
    content: [
      "PORT=3004",
      "MONGO_URI=mongodb://127.0.0.1:27017/food_payment",
      "",
    ].join("\n"),
  },
  {
    file: "services/notification-service/.env",
    content: ["PORT=3005", ""].join("\n"),
  },
];

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command failed with code ${code}: ${command} ${args.join(" ")}`
          )
        );
      }
    });
  });
}

function ensureEnvFiles() {
  for (const template of envTemplates) {
    const envPath = path.join(rootDir, template.file);

    if (fs.existsSync(envPath)) {
      console.log(`skip  ${template.file} (already exists)`);
      continue;
    }

    fs.writeFileSync(envPath, template.content, "utf8");
    console.log(`create ${template.file}`);
  }
}

async function installAll() {
  for (const project of projects) {
    const cwd = path.join(rootDir, project.dir);
    console.log(`\nInstalling dependencies in ${project.name}...`);
    await runCommand(npmCommand, ["install"], cwd);
  }
}

async function main() {
  console.log("Setting up campus-food-platform...");

  if (skipInstall) {
    console.log("Skipping dependency installation.");
  } else {
    await installAll();
  }

  console.log("\nCreating missing .env files...");
  ensureEnvFiles();

  console.log("\nSetup complete.");
  if (envOnly) {
    console.log("Dependency install was skipped (--env-only).");
  } else {
    console.log("Start MongoDB, then run:");
    console.log("  npm run db:start");
    console.log("  npm run dev");
  }
}

main().catch((error) => {
  console.error("\nSetup failed.");
  console.error(error.message);
  process.exit(1);
});
