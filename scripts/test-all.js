#!/usr/bin/env node

/**
 * Runs every service's test suite and prints a single summary.
 *
 * Services own their own Jest config and run independently in CI; this is the
 * local convenience wrapper so `npm test` at the root covers the whole system.
 */

const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
// npm exposes its CLI entry point while a package script is running. Launching
// it with Node avoids shell argument concatenation and works consistently.
const npmCli = process.env.npm_execpath;

const suites = [
  { name: "user-service", dir: "services/user-service" },
  { name: "restaurant-service", dir: "services/restaurant-service" },
  { name: "order-service", dir: "services/order-service" },
  { name: "payment-service", dir: "services/payment-service" },
  { name: "notification-service", dir: "services/notification-service" },
];

function runSuite(suite) {
  return new Promise((resolve) => {
    const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
    const args = npmCli ? [npmCli, "test", "--silent"] : ["test", "--silent"];
    const child = spawn(command, args, {
      cwd: path.join(rootDir, suite.dir),
      env: { ...process.env, JWT_SECRET: process.env.JWT_SECRET || "local-test-secret" },
    });

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    child.on("close", (code) => {
      // Jest writes its summary to stderr; pull the counts out of the combined stream.
      const match = output.match(/Tests:\s+(?:(\d+) failed,\s+)?(\d+) passed,\s+(\d+) total/);
      resolve({
        name: suite.name,
        passed: code === 0,
        failed: match ? Number(match[1] || 0) : 0,
        total: match ? Number(match[3]) : 0,
        output,
      });
    });
  });
}

async function main() {
  console.log("Running all service test suites...\n");

  const results = [];
  for (const suite of suites) {
    process.stdout.write(`  ${suite.name.padEnd(24)}`);
    const result = await runSuite(suite);
    results.push(result);
    console.log(
      result.passed ? `PASS  ${result.total} tests` : `FAIL  ${result.failed}/${result.total} failed`
    );
  }

  const failures = results.filter((r) => !r.passed);
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);

  console.log(`\n${"-".repeat(48)}`);
  if (failures.length === 0) {
    console.log(`All ${totalTests} tests passed across ${results.length} services.`);
    return;
  }

  console.log(`${failures.length} suite(s) failed. Output follows:\n`);
  for (const failure of failures) {
    console.log(`===== ${failure.name} =====`);
    console.log(failure.output);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("Test runner failed:", err.message);
  process.exit(1);
});
