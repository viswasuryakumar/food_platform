const MenuItem = require("../models/MenuItem");

/**
 * Rebuilds the flat `menuitems` read model for one restaurant from its
 * authoritative embedded menu.
 *
 * Written as a full replace (delete-then-insert scoped to this restaurant)
 * rather than a diff: the operation is then idempotent and self-healing, so a
 * projection that drifted for any reason is corrected on the next write. Menus
 * are small enough that the extra writes are irrelevant.
 *
 * Projection failure must not fail the caller's write — the source of truth is
 * already saved, and a stale projection can be rebuilt.
 */
async function rebuildMenuProjection(restaurant) {
  const restaurantId = restaurant._id;

  const rows = (restaurant.menu || []).map((item) => ({
    restaurantId,
    restaurantName: restaurant.name,
    itemId: item._id,
    name: item.name,
    name_normalized: item.name_normalized,
    price: item.price,
    category: item.category,
    description: item.description,
    image: item.image,
    isAvailable: item.isAvailable !== false,
  }));

  await MenuItem.deleteMany({ restaurantId });
  if (rows.length > 0) {
    await MenuItem.insertMany(rows, { ordered: false });
  }

  return rows.length;
}

/** Removes a restaurant's projected rows, e.g. when the restaurant is deleted. */
async function dropMenuProjection(restaurantId) {
  await MenuItem.deleteMany({ restaurantId });
}

/** Best-effort wrapper: logs and swallows, so projection never breaks a write. */
async function safeRebuild(restaurant) {
  try {
    return await rebuildMenuProjection(restaurant);
  } catch (err) {
    console.error(
      `[restaurant-service] menu projection rebuild failed for ${restaurant._id}: ${err.message}`
    );
    return 0;
  }
}

module.exports = { rebuildMenuProjection, dropMenuProjection, safeRebuild };
