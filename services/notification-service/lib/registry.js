/**
 * Tracks which WebSocket connections belong to which user.
 *
 * The previous implementation kept a flat `clients[]` array and broadcast every
 * event to every socket, which meant any signed-in customer received live
 * updates for *all* orders on the platform. This registry indexes sockets by
 * user id so an event can be delivered only to the people entitled to see it.
 *
 * State is per-process and therefore per-instance. That is the exact limitation
 * Redis Pub/Sub solves in Phase 2: with two instances behind a load balancer, a
 * user connected to instance A would never receive an event published on B.
 */
class ConnectionRegistry {
  constructor() {
    /** @type {Map<string, Set<import('ws').WebSocket>>} */
    this.byUser = new Map();
    /** @type {Set<import('ws').WebSocket>} */
    this.admins = new Set();
  }

  add(ws, { userId, role }) {
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId).add(ws);
    if (role === "restaurant_admin") this.admins.add(ws);
  }

  remove(ws, { userId }) {
    const sockets = this.byUser.get(userId);
    if (sockets) {
      sockets.delete(ws);
      // Drop the empty Set so the Map does not grow unbounded over time.
      if (sockets.size === 0) this.byUser.delete(userId);
    }
    this.admins.delete(ws);
  }

  socketsForUser(userId) {
    return [...(this.byUser.get(userId) || [])];
  }

  adminSockets() {
    return [...this.admins];
  }

  stats() {
    let connections = 0;
    for (const sockets of this.byUser.values()) connections += sockets.size;
    return { users: this.byUser.size, connections, admins: this.admins.size };
  }
}

module.exports = { ConnectionRegistry };
