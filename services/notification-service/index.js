require("dotenv").config();
const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");

const { createApp } = require("./app");
const { ConnectionRegistry } = require("./lib/registry");

const PORT = process.env.PORT || 3005;
const HEARTBEAT_INTERVAL_MS = Number(process.env.WS_HEARTBEAT_MS || 30000);

const registry = new ConnectionRegistry();

/**
 * Sends an order event to the sockets entitled to see it: the customer who
 * placed the order, plus any connected restaurant admin (who needs the live
 * order board). Everyone else receives nothing.
 */
function deliver({ orderId, userId, restaurantId, status }) {
  const payload = JSON.stringify({
    type: "order_status",
    orderId,
    restaurantId,
    status,
    at: new Date().toISOString(),
  });

  const targets = new Set([...registry.socketsForUser(userId), ...registry.adminSockets()]);

  let delivered = 0;
  for (const socket of targets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
      delivered += 1;
    }
  }

  return delivered;
}

const app = createApp({ registry, deliver });
const server = app.listen(PORT, () =>
  console.log(`Notification Service running on port ${PORT}`)
);

// `noServer` + a manual upgrade handler lets us reject unauthenticated clients
// during the HTTP handshake, before a WebSocket is ever established.
const wss = new WebSocketServer({ noServer: true });

function authenticate(request) {
  // The browser WebSocket API cannot set request headers, so the token travels
  // as a query parameter. Trade-off: query strings can end up in access logs,
  // so the gateway is configured not to log them, and tokens are short-lived.
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { userId: String(decoded.id), role: decoded.role || "user" };
  } catch (_err) {
    return null;
  }
}

server.on("upgrade", (request, socket, head) => {
  const identity = authenticate(request);

  if (!identity) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, identity);
  });
});

wss.on("connection", (ws, _request, identity) => {
  registry.add(ws, identity);
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => registry.remove(ws, identity));
  ws.on("error", () => registry.remove(ws, identity));

  ws.send(JSON.stringify({ type: "connected", userId: identity.userId }));
});

/**
 * Heartbeat. A client that loses power or network never sends a TCP FIN, so the
 * server would keep a dead socket forever and leak memory. Ping every interval
 * and terminate anything that failed to pong since the last round.
 */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(heartbeat));

function shutdown(signal) {
  console.log(`[notification-service] ${signal} received, shutting down...`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "Server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { deliver, registry };
