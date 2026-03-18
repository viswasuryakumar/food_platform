#!/usr/bin/env node

const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetScript = "dev";

const apps = [
  { name: "gateway", dir: "api-gateway" },
  { name: "user", dir: "services/user-service" },
  { name: "restaurant", dir: "services/restaurant-service" },
  { name: "order", dir: "services/order-service" },
  { name: "payment", dir: "services/payment-service" },
  { name: "notification", dir: "services/notification-service" },
  { name: "frontend", dir: "frontend" },
];

const children = [];
let isShuttingDown = false;

function pipeWithPrefix(stream, prefix, output) {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      output.write(`${prefix} ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffer.length > 0) {
      output.write(`${prefix} ${buffer}\n`);
    }
  });
}

function shutdown(reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    const exitCode = reason === "error" ? 1 : reason === "SIGINT" ? 130 : 0;
    process.exit(exitCode);
  }, 1000);
}

for (const app of apps) {
  const child = spawn(npmCommand, ["run", targetScript], {
    cwd: path.join(rootDir, app.dir),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  children.push(child);
  pipeWithPrefix(child.stdout, `[${app.name}]`, process.stdout);
  pipeWithPrefix(child.stderr, `[${app.name}]`, process.stderr);

  child.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") return;

    console.error(
      `\n[${app.name}] exited unexpectedly (code: ${code ?? "null"}, signal: ${signal ?? "none"})`
    );
    shutdown("error");
  });

  child.on("error", (error) => {
    if (isShuttingDown) return;
    console.error(`\n[${app.name}] failed to start: ${error.message}`);
    shutdown("error");
  });
}

console.log(`Running ${apps.length} apps with "npm run ${targetScript}"...`);
console.log("Press Ctrl+C to stop all processes.\n");

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
