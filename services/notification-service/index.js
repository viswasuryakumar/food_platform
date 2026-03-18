require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

// Simple REST endpoint (for testing)
app.get("/", (req, res) => {
  res.send("Notification Service Running");
});

// -------------------
// WEBSOCKET SERVER
// -------------------
const PORT = process.env.PORT || 3005;
const server = app.listen(PORT, () =>
  console.log(`Notification Service running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

let clients = [];

wss.on("connection", (ws) => {
  console.log("Client connected to WebSocket");

  clients.push(ws);

  ws.on("close", () => {
    console.log("Client disconnected");
    clients = clients.filter((c) => c !== ws);
  });
});

// Function to broadcast messages
function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  });
}

// Endpoint to trigger notification (Order Service will call this later)
app.post("/notify", (req, res) => {
  const { orderId, status } = req.body;

  broadcast({ orderId, status });

  res.json({ message: "Notification sent" });
});
