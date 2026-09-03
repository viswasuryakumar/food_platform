require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set. Refusing to start.");
  process.exit(1);
}

/**
 * Render's `fromService.property: host` yields a bare hostname with no scheme.
 * Prepend https:// so proxy targets are always valid absolute URLs.
 */
function toServiceUrl(host, fallback) {
  if (!host) return fallback;
  return host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
}

const SERVICES = {
  user: toServiceUrl(process.env.USER_SERVICE_URL, "http://localhost:3001"),
  restaurant: toServiceUrl(process.env.RESTAURANT_SERVICE_URL, "http://localhost:3002"),
  order: toServiceUrl(process.env.ORDER_SERVICE_URL, "http://localhost:3003"),
  payment: toServiceUrl(process.env.PAYMENT_SERVICE_URL, "http://localhost:3004"),
  notification: toServiceUrl(process.env.NOTIFICATION_SERVICE_URL, "http://localhost:3005"),
  ai: toServiceUrl(process.env.AI_SERVICE_URL, "http://localhost:8000"),
};

// -------------------- BASE MIDDLEWARE --------------------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || true,
    credentials: true,
  })
);

/**
 * Access logs deliberately exclude the query string: WebSocket clients pass
 * their JWT as a query parameter (the browser WebSocket API cannot set
 * headers), and logging it would write credentials to disk.
 */
morgan.token("path-only", (req) => req.originalUrl.split("?")[0]);
app.use(morgan(':method :path-only :status :response-time ms'));

// -------------------- RATE LIMITING --------------------
const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: "Too many requests, slow down.", code: "RATE_LIMITED" } },
});

/**
 * Auth endpoints get a far tighter budget than general browsing. A single
 * platform-wide limit either throttles legitimate menu browsing or leaves
 * credential stuffing effectively unlimited; it cannot do both.
 *
 * Counted per IP and in-process, which means the limit multiplies by the number
 * of gateway instances. Phase 2 moves this store to Redis so the budget is
 * shared across the fleet.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts consume the budget
  message: {
    error: { message: "Too many authentication attempts, try again later.", code: "RATE_LIMITED" },
  },
});

app.use(standardLimiter);

// -------------------- AUTH --------------------
/** Decodes the JWT if present, but does not require one. */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  // Strip any client-supplied identity headers so a caller cannot simply set
  // `x-user-role: restaurant_admin` and impersonate an administrator. Only the
  // gateway is allowed to populate these.
  delete req.headers["x-user-id"];
  delete req.headers["x-user-role"];
  delete req.headers["x-internal-token"];

  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    req.user = decoded;
    req.headers["x-user-id"] = decoded.id;
    req.headers["x-user-role"] = decoded.role || "user";
    return next();
  } catch (err) {
    const expired = err.name === "TokenExpiredError";
    return res.status(401).json({
      error: {
        message: expired ? "Session expired, please log in again" : "Invalid token",
        code: expired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      },
    });
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res
      .status(401)
      .json({ error: { message: "Login required", code: "UNAUTHENTICATED" } });
  }
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res
        .status(403)
        .json({ error: { message: "Admin access required", code: "FORBIDDEN" } });
    }
    return next();
  };
}

app.use(optionalAuth);

// -------------------- HEALTH --------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway", uptime: process.uptime() });
});

/**
 * Fans out to every downstream service so one call reveals which part of the
 * system is unhealthy. Returns 503 if any dependency is down, so an
 * orchestrator can act on the aggregate rather than polling five endpoints.
 */
app.get("/health/services", async (_req, res) => {
  const checks = await Promise.all(
    Object.entries(SERVICES).map(async ([name, url]) => {
      const startedAt = Date.now();
      try {
        const { data } = await axios.get(`${url}/health/ready`, { timeout: 3000 });
        return [name, { status: data.status || "ready", latencyMs: Date.now() - startedAt }];
      } catch (err) {
        return [
          name,
          { status: "down", latencyMs: Date.now() - startedAt, error: err.message },
        ];
      }
    })
  );

  const services = Object.fromEntries(checks);
  const allUp = Object.values(services).every((s) => s.status !== "down");

  res.status(allUp ? 200 : 503).json({ status: allUp ? "ok" : "degraded", services });
});

// -------------------- PROXY --------------------
/**
 * Express parses the JSON body before the proxy runs, which consumes the
 * request stream. Without re-writing it here, every POST/PUT would hang until
 * the upstream timed out.
 */
function forwardBody(proxyReq, req) {
  if (!req.body || Object.keys(req.body).length === 0) return;
  const bodyData = JSON.stringify(req.body);
  proxyReq.setHeader("Content-Type", "application/json");
  proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
}

function proxyError(name) {
  return (err, req, res) => {
    console.error(`[gateway] proxy error for ${name}: ${err.message}`);
    if (res.headersSent) return;

    const body = JSON.stringify({
      error: { message: `${name} service is unavailable`, code: "SERVICE_UNAVAILABLE" },
    });

    // `res` is a raw ServerResponse on some error paths, so avoid res.json().
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(body);
  };
}

function serviceProxy(
  name,
  target,
  prefix,
  timeoutMs = Number(process.env.PROXY_TIMEOUT_MS || 10000)
) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // 503 rather than a hung socket when an upstream is slow.
    proxyTimeout: timeoutMs,
    timeout: timeoutMs,
    pathRewrite: (path) => `${prefix}${path}`,
    on: { proxyReq: forwardBody, error: proxyError(name) },
  });
}

app.use(express.json({ limit: "200kb" }));

// Auth: public, but rate limited hard against credential stuffing.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", serviceProxy("user", SERVICES.user, "/auth"));

// Restaurants: public to read, admin to write. Ownership is enforced by the
// restaurant service itself, which is the only place that knows who owns what.
app.use("/api/restaurants", (req, res, next) => {
  if (req.method === "GET") return next();
  if (!req.user) return requireAuth(req, res, next);
  return requireRole("restaurant_admin")(req, res, next);
});
app.use("/api/restaurants", serviceProxy("restaurant", SERVICES.restaurant, "/restaurants"));

// Orders and payments: always authenticated.
app.use("/api/orders", requireAuth, serviceProxy("order", SERVICES.order, "/orders"));
app.use("/api/payments", requireAuth, serviceProxy("payment", SERVICES.payment, "/payments"));
app.use(
  "/api/ai",
  requireAuth,
  serviceProxy("ai", SERVICES.ai, "", Number(process.env.AI_PROXY_TIMEOUT_MS || 120000))
);

app.use(
  "/api/notifications",
  requireAuth,
  serviceProxy("notification", SERVICES.notification, "")
);

app.use((req, res) => {
  res.status(404).json({
    error: { message: `No route for ${req.method} ${req.path}`, code: "NOT_FOUND" },
  });
});

app.use((err, req, res, _next) => {
  console.error("[gateway] unhandled error:", err.message);
  res.status(err.status || 500).json({
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  });
});

const server = app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));

/**
 * WebSocket upgrades bypass Express middleware entirely, so they must be
 * handled on the raw server.
 *
 * The previous setup relied on `ws: true` on a proxy registered under
 * /api/notifications, but the browser connected to the gateway root — so the
 * upgrade never matched that route and real-time updates silently never worked.
 * Here we forward any /api/notifications upgrade to the notification service,
 * which authenticates the token itself before accepting the socket.
 */
const notificationTarget = SERVICES.notification.replace(/^http/, "ws");
const wsProxy = createProxyMiddleware({
  target: SERVICES.notification,
  changeOrigin: true,
  ws: true,
  pathRewrite: (path) => path.replace(/^\/api\/notifications/, "") || "/",
  on: { error: (err) => console.error(`[gateway] ws proxy error: ${err.message}`) },
});

server.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/api/notifications")) {
    socket.destroy();
    return;
  }
  wsProxy.upgrade(req, socket, head);
});

function shutdown(signal) {
  console.log(`[gateway] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { app, server, notificationTarget };
