const axios = require("axios");
const { HttpError } = require("./http");

const ORDER_SERVICE_URL = (process.env.ORDER_SERVICE_URL || "http://localhost:3003").replace(
  /\/$/,
  ""
);
const REQUEST_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS || 5000);

function internalHeaders(userId, role = "user") {
  return {
    "x-user-id": userId,
    "x-user-role": role,
    "x-internal-token": process.env.INTERNAL_SERVICE_TOKEN || "",
  };
}

/** Fetches an order so the charge can be priced from it rather than from the client. */
async function fetchOrder(orderId, userId) {
  try {
    const { data } = await axios.get(`${ORDER_SERVICE_URL}/orders/${orderId}`, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: internalHeaders(userId),
    });
    return data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");
    if (status === 403) throw new HttpError(403, "You do not own this order", "FORBIDDEN");
    throw new HttpError(503, "Order service is unavailable", "UPSTREAM_UNAVAILABLE");
  }
}

/**
 * Advances the order to "paid" via the internal system endpoint.
 *
 * Uses the dedicated internal route rather than the public status API, because
 * "paid" is a system-authority transition that no end-user role may perform.
 */
async function markOrderPaid(orderId, userId) {
  try {
    const { data } = await axios.post(
      `${ORDER_SERVICE_URL}/orders/${orderId}/mark-paid`,
      {},
      { timeout: REQUEST_TIMEOUT_MS, headers: internalHeaders(userId) }
    );
    return data;
  } catch (err) {
    throw new HttpError(
      502,
      "Payment recorded but the order could not be updated",
      "ORDER_UPDATE_FAILED"
    );
  }
}

module.exports = { fetchOrder, markOrderPaid };
