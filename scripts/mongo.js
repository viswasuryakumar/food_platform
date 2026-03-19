#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const mongoHome = path.join(rootDir, ".mongodb");
const dataDir = process.env.MONGO_DBPATH || path.join(mongoHome, "data");
const logFile = process.env.MONGO_LOG_PATH || path.join(mongoHome, "mongod.log");
const pidFile = process.env.MONGO_PID_PATH || path.join(mongoHome, "mongod.pid");
const port = String(process.env.MONGO_PORT || "27017");
const bindIp = process.env.MONGO_BIND_IP || "127.0.0.1";
const mongodPath = process.env.MONGOD_PATH || "mongod";

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function printInstallHelp() {
  console.error('Could not find "mongod" on your machine.');
  console.error("");
  console.error("Install MongoDB server first, then retry:");
  console.error("  brew tap mongodb/brew");
  console.error("  brew install mongodb-community");
  console.error("");
  console.error("If mongod is installed in a custom location, set MONGOD_PATH.");
}

function ensureMongodBinary() {
  const check = run(mongodPath, ["--version"]);
  if (check.status !== 0) {
    printInstallHelp();
    process.exit(1);
  }
}

function readPid() {
  if (!fs.existsSync(pidFile)) return null;
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!raw) return null;
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureDirs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
}

function clearStalePid() {
  const pid = readPid();
  if (!pid) return;
  if (!isPidRunning(pid) && fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function startMongo() {
  ensureMongodBinary();
  clearStalePid();

  const existingPid = readPid();
  if (isPidRunning(existingPid)) {
    console.log(`MongoDB is already running (pid ${existingPid}) on ${bindIp}:${port}.`);
    return;
  }

  ensureDirs();
  const child = spawn(
    mongodPath,
    [
      "--bind_ip",
      bindIp,
      "--port",
      port,
      "--nounixsocket",
      "--dbpath",
      dataDir,
      "--logpath",
      logFile,
      "--logappend",
      "--pidfilepath",
      pidFile,
    ],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();

  const timeoutMs = 5000;
  const start = Date.now();
  let pid = null;
  while (Date.now() - start < timeoutMs) {
    pid = readPid();
    if (isPidRunning(pid)) break;
    sleep(100);
  }

  if (isPidRunning(pid)) {
    console.log(`MongoDB started (pid ${pid}) on ${bindIp}:${port}.`);
  } else {
    console.error("Failed to start MongoDB.");
    console.error(`Check logs: ${logFile}`);
    process.exit(1);
  }
}

function stopMongo() {
  ensureMongodBinary();
  clearStalePid();

  const pid = readPid();
  if (!isPidRunning(pid)) {
    console.log("MongoDB is not running.");
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    console.error(`Failed to send SIGTERM to MongoDB pid ${pid}: ${error.message}`);
    process.exit(1);
  }

  const timeoutMs = 5000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidRunning(pid)) break;
    sleep(100);
  }

  if (isPidRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      console.error(`Failed to force-stop MongoDB pid ${pid}: ${error.message}`);
      process.exit(1);
    }
  }

  clearStalePid();
  console.log("MongoDB stopped.");
}

function statusMongo() {
  const pid = readPid();
  if (isPidRunning(pid)) {
    console.log(`MongoDB is running (pid ${pid}) on ${bindIp}:${port}.`);
    return;
  }

  console.log("MongoDB is not running.");
  process.exit(1);
}

const command = process.argv[2] || "status";

if (command === "start") {
  startMongo();
} else if (command === "stop") {
  stopMongo();
} else if (command === "status") {
  statusMongo();
} else {
  console.error(`Unknown command "${command}". Use: start | stop | status`);
  process.exit(1);
}
