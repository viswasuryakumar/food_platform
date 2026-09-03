const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { z } = require("zod");

const { HttpError, asyncHandler, errorHandler, notFoundHandler } = require("./lib/http");
const { validate } = require("./lib/validate");

/**
 * Builds the HTTP half of the notification service. The WebSocket half is
 * attached in index.js, because it needs the underlying http.Server.
 *
 * @param {{registry: import('./lib/registry').ConnectionRegistry, deliver: Function}} deps
 */
function createApp({ registry, deliver }) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "50kb" }));

  const notifySchema = z.object({
    orderId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    restaurantId: z.string().trim().optional(),
    status: z.string().trim().min(1),
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "notification-service", uptime: process.uptime() });
  });

  app.get("/health/ready", (_req, res) => {
    // No database dependency, so readiness reports live socket stats instead —
    // useful for spotting an instance that has silently stopped accepting them.
    res.json({ status: "ready", service: "notification-service", sockets: registry.stats() });
  });

  /**
   * Publish endpoint, called by order-service.
   *
   * Guarded by a shared internal token: without it, anyone who can reach this
   * port could forge "your order was delivered" messages to any user.
   */
  app.post(
    "/notify",
    (req, _res, next) => {
      const expected = process.env.INTERNAL_SERVICE_TOKEN;
      if (!expected || req.headers["x-internal-token"] !== expected) {
        return next(new HttpError(403, "Internal endpoint", "FORBIDDEN"));
      }
      return next();
    },
    validate(notifySchema),
    asyncHandler(async (req, res) => {
      const delivered = await deliver(req.body);
      res.json({ message: "Notification dispatched", delivered });
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler("notification-service"));

  return app;
}

module.exports = { createApp };
