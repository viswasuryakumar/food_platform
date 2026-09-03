const axios = require("axios");

const NOTIFICATION_SERVICE_URL = (
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3005"
).replace(/\/$/, "");

const REQUEST_TIMEOUT_MS = Number(process.env.NOTIFY_TIMEOUT_MS || 2000);

/**
 * Publishes an order event to the notification service.
 *
 * Deliberately fire-and-forget: notification delivery is a *soft* dependency.
 * If the notification service is down, the customer's order must still succeed —
 * losing a status toast is acceptable, losing an order is not. So failures are
 * logged and swallowed rather than propagated to the caller.
 *
 * (Phase 2 replaces this direct HTTP call with Redis Pub/Sub so that events
 * reach every notification-service instance, not just the one we happened to
 * call. The fire-and-forget contract stays the same.)
 */
async function publishOrderEvent({ orderId, userId, restaurantId, status }) {
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/notify`,
      { orderId, userId, restaurantId, status },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "" },
      }
    );
  } catch (err) {
    console.warn(
      `[order-service] notification publish failed for order ${orderId} (status=${status}): ${err.message}`
    );
  }
}

module.exports = { publishOrderEvent };
