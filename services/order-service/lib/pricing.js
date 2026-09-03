const axios = require("axios");
const { HttpError } = require("./http");

const RESTAURANT_SERVICE_URL = (
  process.env.RESTAURANT_SERVICE_URL || "http://localhost:3002"
).replace(/\/$/, "");

const REQUEST_TIMEOUT_MS = Number(process.env.SERVICE_TIMEOUT_MS || 5000);

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Money is computed in integer cents to avoid float drift, then converted back. */
function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

async function fetchRestaurant(restaurantId) {
  try {
    const { data } = await axios.get(`${RESTAURANT_SERVICE_URL}/restaurants/${restaurantId}`, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
    }
    // Upstream is down or slow: 503 tells the caller this is retryable, unlike a 500.
    throw new HttpError(
      503,
      "Restaurant service is unavailable, please try again",
      "UPSTREAM_UNAVAILABLE"
    );
  }
}

/**
 * Prices an order using the restaurant's own menu as the single source of truth.
 *
 * The client sends only item names and quantities. Any `price` it supplies is
 * ignored, because a client-supplied price can be forged — a caller could
 * otherwise order a $40 steak for $0.01 by editing the request body.
 *
 * @param {string} restaurantId
 * @param {Array<{name: string, quantity: number}>} requestedItems
 * @returns {Promise<{restaurant: object, items: Array, totalPrice: number}>}
 */
async function priceOrder(restaurantId, requestedItems) {
  const restaurant = await fetchRestaurant(restaurantId);

  if (!restaurant || !restaurant._id) {
    throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }

  const menuByName = new Map(
    (Array.isArray(restaurant.menu) ? restaurant.menu : [])
      .filter((item) => item && item.name)
      .map((item) => [normalizeName(item.name), item])
  );

  const pricedItems = [];
  const unavailable = [];
  let totalCents = 0;

  for (const requested of requestedItems) {
    const menuItem = menuByName.get(normalizeName(requested.name));

    if (!menuItem) {
      unavailable.push(requested.name);
      continue;
    }

    const unitCents = toCents(menuItem.price);
    totalCents += unitCents * requested.quantity;

    pricedItems.push({
      name: menuItem.name, // canonical spelling from the menu, not the client's
      price: unitCents / 100,
      quantity: requested.quantity,
    });
  }

  if (unavailable.length > 0) {
    throw new HttpError(
      422,
      `These items are not on the menu: ${unavailable.join(", ")}`,
      "ITEMS_UNAVAILABLE"
    );
  }

  return {
    restaurant,
    items: pricedItems,
    totalPrice: totalCents / 100,
  };
}

module.exports = { priceOrder, normalizeName, toCents };
