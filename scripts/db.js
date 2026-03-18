#!/usr/bin/env node

const { spawnSync } = require("child_process");

const CONTAINER_NAME = "campus-food-mongo";
const VOLUME_NAME = "campus-food-mongo-data";
const IMAGE = "mongo:7";

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
}

function runInteractive(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit" });
}

function ensureDocker() {
  const result = run("docker", ["--version"]);
  if (result.status !== 0) {
    console.error("Docker is required for db commands.");
    process.exit(1);
  }
}

function ensureDockerDaemon() {
  const result = run("docker", ["info"]);
  if (result.status !== 0) {
    console.error("Docker daemon is not running. Start Docker Desktop and retry.");
    process.exit(1);
  }
}

function containerExists() {
  const result = run("docker", ["ps", "-a", "--filter", `name=^${CONTAINER_NAME}$`, "--format", "{{.Names}}"]);
  return result.status === 0 && result.stdout.trim() === CONTAINER_NAME;
}

function containerRunning() {
  const result = run("docker", ["ps", "--filter", `name=^${CONTAINER_NAME}$`, "--format", "{{.Names}}"]);
  return result.status === 0 && result.stdout.trim() === CONTAINER_NAME;
}

function startDb() {
  ensureDocker();
  ensureDockerDaemon();

  if (containerRunning()) {
    console.log(`MongoDB container "${CONTAINER_NAME}" is already running.`);
    return;
  }

  if (containerExists()) {
    const start = runInteractive("docker", ["start", CONTAINER_NAME]);
    if (start.status !== 0) process.exit(start.status || 1);
    console.log(`MongoDB started on 127.0.0.1:27017 (${CONTAINER_NAME}).`);
    return;
  }

  const create = runInteractive("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER_NAME,
    "-p",
    "27017:27017",
    "-v",
    `${VOLUME_NAME}:/data/db`,
    IMAGE,
  ]);

  if (create.status !== 0) {
    process.exit(create.status || 1);
  }

  console.log(`MongoDB created and started on 127.0.0.1:27017 (${CONTAINER_NAME}).`);
}

function stopDb() {
  ensureDocker();
  ensureDockerDaemon();

  if (!containerExists()) {
    console.log(`MongoDB container "${CONTAINER_NAME}" does not exist.`);
    return;
  }

  if (!containerRunning()) {
    console.log(`MongoDB container "${CONTAINER_NAME}" is already stopped.`);
    return;
  }

  const stop = runInteractive("docker", ["stop", CONTAINER_NAME]);
  if (stop.status !== 0) process.exit(stop.status || 1);
}

function statusDb() {
  ensureDocker();
  ensureDockerDaemon();

  if (!containerExists()) {
    console.log(`MongoDB container "${CONTAINER_NAME}" not found.`);
    process.exit(1);
  }

  if (containerRunning()) {
    console.log(`MongoDB container "${CONTAINER_NAME}" is running on 127.0.0.1:27017.`);
    return;
  }

  console.log(`MongoDB container "${CONTAINER_NAME}" exists but is stopped.`);
  process.exit(1);
}

const command = process.argv[2] || "status";

if (command === "start") {
  startDb();
} else if (command === "stop") {
  stopDb();
} else if (command === "status") {
  statusDb();
} else {
  console.error(`Unknown command "${command}". Use: start | stop | status`);
  process.exit(1);
}
