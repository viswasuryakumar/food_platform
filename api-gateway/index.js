require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Render's `fromService.property: host` gives a bare hostname with no protocol.
// Prepend https:// when needed so proxy targets are valid URLs.
function toServiceUrl(host) {
  if (!host) return undefined;
  return host.startsWith("http") ? host : `https://${host}`;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

// -------------------- MIDDLEWARE --------------------
app.use(cors());
app.use(express.json());
app.use(morgan("dev")); // logging every request

// Rate Limiter
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests
});
app.use(limiter);

// -------------------- AUTH MIDDLEWARE --------------------
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Forward identity to microservices
    req.headers["x-user-id"] = decoded.id;
    req.headers["x-user-role"] = decoded.role;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}


// -------------------- ROUTING TO MICROSERVICES --------------------

app.use((req, res, next) => {
  console.log("Incoming request to Gateway:", req.method, req.url);
  next();
});

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asPositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function bestTextMatch(target, options, getLabel) {
  const normalizedTarget = normalizeLabel(target);
  if (!normalizedTarget) return null;

  let best = null;
  let bestScore = 0;

  for (const option of options) {
    const normalizedOption = normalizeLabel(getLabel(option));
    if (!normalizedOption) continue;

    let score = 0;
    if (normalizedOption === normalizedTarget) {
      score = 3;
    } else if (
      normalizedOption.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedOption)
    ) {
      score = 2;
    } else {
      const targetTokens = normalizedTarget.split(" ");
      const optionTokens = normalizedOption.split(" ");
      const overlap = targetTokens.filter((token) => optionTokens.includes(token)).length;
      if (overlap >= Math.max(1, Math.ceil(targetTokens.length * 0.6))) {
        score = 1;
      }
    }

    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}

function sanitizeCatalog(restaurants) {
  return (Array.isArray(restaurants) ? restaurants : [])
    .filter((restaurant) => restaurant && restaurant._id && restaurant.name)
    .map((restaurant) => ({
      _id: String(restaurant._id),
      name: String(restaurant.name),
      menu: (Array.isArray(restaurant.menu) ? restaurant.menu : [])
        .filter((item) => item && item.name)
        .slice(0, 80)
        .map((item) => ({
          name: String(item.name),
          price: Number(item.price) || 0,
        })),
    }));
}

function extractJsonCandidate(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {}

  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeFenceMatch?.[1]) {
    try {
      return JSON.parse(codeFenceMatch[1]);
    } catch (_) {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const chunk = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(chunk);
    } catch (_) {}
  }

  return null;
}

function localSmartOrder(prompt, catalog) {
  const normalizedPrompt = prompt.toLowerCase();
  
  // 1. Try to find a restaurant in the prompt
  const matchedRestaurant = bestTextMatch(prompt, catalog, (r) => r.name);
  if (!matchedRestaurant) {
    return {
      mode: "clarify",
      clarification: "I couldn't find that restaurant. Could you please specify which one you mean?",
    };
  }

  // 2. Try to find menu items from that restaurant in the prompt
  const items = [];
  for (const menuItem of matchedRestaurant.menu) {
    if (normalizedPrompt.includes(menuItem.name.toLowerCase())) {
      items.push({
        name: menuItem.name,
        price: menuItem.price,
        quantity: 1 // Default to 1 for basic smart search
      });
    }
  }

  if (items.length === 0) {
    return {
      mode: "clarify",
      clarification: `I found ${matchedRestaurant.name}, but I didn't see any matching items in your request.`,
    };
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    mode: "draft",
    draft: {
      restaurant: {
        _id: matchedRestaurant._id,
        name: matchedRestaurant.name,
      },
      items,
      total,
      prompt,
    },
    assistantText: `Local Search: Found items at ${matchedRestaurant.name}. Ready to checkout!`,
  };
}

app.post("/api/ai/smart-order", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  const catalog = sanitizeCatalog(req.body?.restaurants);

  if (!prompt || !catalog.length) {
    return res.status(400).json({ error: "Prompt and catalog are required." });
  }

  try {
    // We now use the local matching logic instead of OpenAI
    const result = localSmartOrder(prompt, catalog);
    return res.json(result);
  } catch (error) {
    console.error("Local smart order error:", error.message);
    return res.status(500).json({ error: "Smart Order processing failed." });
  }
});

// User Service (public routes - no auth required)
app.use(
  "/api/auth",
  createProxyMiddleware({
    target: toServiceUrl(process.env.USER_SERVICE_URL) || "http://localhost:3001",
    changeOrigin: true,
    pathRewrite: (path, req) => `/auth${path}`, // /api/auth/register -> /auth/register
    on: {
      proxyReq: (proxyReq, req, res) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy error for auth:", err.message);
        if (!res.headersSent) {
          if (typeof res.status === "function") {
            res.status(500).json({ error: "Proxy error" });
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Proxy error" }));
          }
        }
      },
    },
  })
);

// Protected routes - require authentication
app.use(verifyToken);


// A. Protect ORDER routes → require login
app.use("/api/orders", (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Login required" });
  }
  next();
});

// B. Protect PAYMENTS → require login
app.use("/api/payments", (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Login required" });
  }
  next();
});

// C. Protect RESTAURANT admin actions
app.use("/api/restaurants", (req, res, next) => {
  // Allow public GET
  if (req.method === "GET") return next();

  // Any POST/PUT/DELETE needs admin
  if (req.user?.role !== "restaurant_admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
});

// Restaurant Service
app.use(
  "/api/restaurants",
  createProxyMiddleware({
    target: toServiceUrl(process.env.RESTAURANT_SERVICE_URL) || "http://localhost:3002",
    changeOrigin: true,
    pathRewrite: (path, req) =>  `/restaurants${path}`,
    on: {
      proxyReq: (proxyReq, req, res) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy error for restaurants:", err.message);
        if (!res.headersSent) {
          if (typeof res.status === "function") {
            res.status(500).json({ error: "Proxy error" });
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Proxy error" }));
          }
        }
      },
    },
  })
);

// Order Service
app.use(
  "/api/orders",
  createProxyMiddleware({
    target: toServiceUrl(process.env.ORDER_SERVICE_URL) || "http://localhost:3003",
    changeOrigin: true,
    pathRewrite: (path, req) => `/orders${path}`,
    on: {
      proxyReq: (proxyReq, req, res) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy error for orders:", err.message);
        if (!res.headersSent) {
          if (typeof res.status === "function") {
            res.status(500).json({ error: "Proxy error" });
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Proxy error" }));
          }
        }
      },
    },
  })
);

// Payment Service
app.use(
  "/api/payments",
  createProxyMiddleware({
    target: toServiceUrl(process.env.PAYMENT_SERVICE_URL) || "http://localhost:3004",
    changeOrigin: true,
    pathRewrite: (path, req) => `/payments${path}`,
    on: { 
      proxyReq: (proxyReq, req, res) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy error for payments:", err.message);
        if (!res.headersSent) {
          if (typeof res.status === "function") {
            res.status(500).json({ error: "Proxy error" });
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Proxy error" }));
          }
        }
      },
    },
  })
);

// Notification Service
app.use(
  "/api/notifications",
  createProxyMiddleware({
    target: toServiceUrl(process.env.NOTIFICATION_SERVICE_URL) || "http://localhost:3005",
    ws: true,
    changeOrigin: true,
    pathRewrite: (path, req) => `/notifications${path}`,
    on: {
      proxyReq: (proxyReq, req, res) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy error for notifications:", err.message);
        if (!res.headersSent) {
          if (typeof res.status === "function") {
            res.status(500).json({ error: "Proxy error" });
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Proxy error" }));
          }
        }
      },
    },
  })
);

app.use((err, req, res, next) => {
  console.error("Error encountered:", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(process.env.PORT, () =>
  console.log(`API Gateway running on port ${process.env.PORT}`)
);
