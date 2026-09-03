#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
  { name: "ai-agent-node-tools", dir: "services/ai-agent" },
  { name: "frontend", dir: "frontend" },
];

/**
 * Secrets are read from the environment (or a root .env), never hardcoded.
 *
 * The previous version of this script embedded a live MongoDB Atlas password in
 * source and wrote it into every service's .env. Anyone with repository access
 * — including anyone browsing the git history — had production database
 * credentials.
 */
function loadRootEnv() {
  const rootEnvPath = path.join(rootDir, ".env");
  if (!fs.existsSync(rootEnvPath)) return {};

  const parsed = {};
  for (const line of fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    parsed[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return parsed;
}

const rootEnv = loadRootEnv();

function readSecret(key, { required = false, fallback = "" } = {}) {
  const value = process.env[key] || rootEnv[key] || fallback;
  if (required && !value) {
    throw new Error(
      `Missing required secret ${key}.\n` +
        `  Set it in your shell, or create a root .env file (copy .env.example).\n` +
        `  Never commit that file — it is listed in .gitignore.`
    );
  }
  return value;
}

/** Generates a strong random secret so no shared default ever ships. */
function generatedSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function buildEnvTemplates() {
  const mongoUri = readSecret("MONGO_URI", { required: true });

  // Generated once per setup run and shared by every service that must verify
  // the same tokens.
  const jwtSecret = readSecret("JWT_SECRET") || generatedSecret();
  const internalToken = readSecret("INTERNAL_SERVICE_TOKEN") || generatedSecret();

  const shared = [`JWT_SECRET=${jwtSecret}`, `INTERNAL_SERVICE_TOKEN=${internalToken}`];

  return [
    {
      file: "api-gateway/.env",
      content: [
        "PORT=3000",
        ...shared,
        "USER_SERVICE_URL=http://localhost:3001",
        "RESTAURANT_SERVICE_URL=http://localhost:3002",
        "ORDER_SERVICE_URL=http://localhost:3003",
        "PAYMENT_SERVICE_URL=http://localhost:3004",
        "NOTIFICATION_SERVICE_URL=http://localhost:3005",
        "AI_SERVICE_URL=http://localhost:8000",
        "CORS_ORIGIN=http://localhost:5173",
        "",
      ].join("\n"),
    },
    {
      file: "services/user-service/.env",
      content: ["PORT=3001", `MONGO_URI=${mongoUri}`, ...shared, ""].join("\n"),
    },
    {
      file: "services/restaurant-service/.env",
      content: ["PORT=3002", `MONGO_URI=${mongoUri}`, ...shared, ""].join("\n"),
    },
    {
      file: "services/order-service/.env",
      content: [
        "PORT=3003",
        `MONGO_URI=${mongoUri}`,
        ...shared,
        "RESTAURANT_SERVICE_URL=http://localhost:3002",
        "NOTIFICATION_SERVICE_URL=http://localhost:3005",
        "",
      ].join("\n"),
    },
    {
      file: "services/payment-service/.env",
      content: [
        "PORT=3004",
        `MONGO_URI=${mongoUri}`,
        ...shared,
        "ORDER_SERVICE_URL=http://localhost:3003",
        "",
      ].join("\n"),
    },
    {
      file: "services/notification-service/.env",
      content: ["PORT=3005", ...shared, ""].join("\n"),
    },
    {
      file: "services/ai-agent/.env",
      content: [
        `MONGO_URI=${mongoUri}`,
        `OPENAI_API_BASE=${readSecret("OPENAI_API_BASE", { fallback: "https://openrouter.ai/api/v1" })}`,
        `OPENROUTER_API_KEY=${readSecret("OPENROUTER_API_KEY")}`,
        `OPENROUTER_MODEL=${readSecret("OPENROUTER_MODEL", { fallback: "openai/gpt-4o-mini" })}`,
        "CORS_ORIGIN=http://localhost:5173",
        "",
      ].join("\n"),
    },
    {
      file: "frontend/.env",
      content: ["VITE_API_URL=http://localhost:3000", ""].join("\n"),
    },
  ];
}

function runCommand(command, commandArgs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${command} ${commandArgs.join(" ")}`));
    });
  });
}

function ensureEnvFiles(templates) {
  for (const template of templates) {
    const envPath = path.join(rootDir, template.file);

    if (fs.existsSync(envPath)) {
      console.log(`skip   ${template.file} (already exists)`);
      continue;
    }

    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, template.content, "utf8");
    console.log(`create ${template.file}`);
  }
}

async function installAll() {
  for (const project of projects) {
    console.log(`\nInstalling dependencies in ${project.name}...`);
    await runCommand(npmCommand, ["install"], path.join(rootDir, project.dir));
  }
}

async function main() {
  console.log("Setting up campus-food-platform...\n");

  // Build templates first so a missing secret fails before a long install.
  const templates = buildEnvTemplates();

  if (skipInstall) {
    console.log("Skipping dependency installation.");
  } else {
    await installAll();
  }

  console.log("\nCreating missing .env files...");
  ensureEnvFiles(templates);

  console.log("\nSetup complete.");
  if (envOnly) {
    console.log("Dependency install was skipped (--env-only).");
  } else {
    console.log("Next: npm run dev");
  }
}

main().catch((error) => {
  console.error("\nSetup failed.\n");
  console.error(error.message);
  process.exit(1);
});
