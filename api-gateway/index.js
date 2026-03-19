require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
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

async function callOpenAiSmartOrder(prompt, catalog) {
  const systemPrompt = [
    "You convert food-order chat requests into structured JSON.",
    "Use only the provided restaurant catalog and menu items.",
    "If request is unclear or missing a mappable restaurant/menu item, return status='clarify'.",
    "Output strict JSON only with keys:",
    "status ('draft' or 'clarify'), restaurantName, items, clarification.",
    "For draft: restaurantName must exactly match one catalog restaurant name.",
    "For draft: each item name must exactly match one menu item name from that restaurant.",
    "Quantity must be an integer 1..20.",
  ].join(" ");

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ prompt, restaurants: catalog }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonCandidate(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI response did not contain valid JSON.");
  }

  return parsed;
}

function buildDraftFromAi(parsed, prompt, catalog) {
  const status = String(parsed?.status || "").toLowerCase();
  if (status === "clarify") {
    return {
      clarification:
        parsed.clarification ||
        "Please include restaurant name and menu items so I can build your order.",
    };
  }

  const restaurantName =
    parsed?.restaurantName || parsed?.restaurant || parsed?.restaurant_name;
  const matchedRestaurant = bestTextMatch(restaurantName, catalog, (r) => r.name);
  if (!matchedRestaurant) {
    return {
      clarification:
        "I couldn't map the restaurant from that request. Please mention the exact restaurant name.",
    };
  }

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!rawItems.length) {
    return {
      clarification:
        `I found ${matchedRestaurant.name} but no valid items. Please mention item names from that menu.`,
    };
  }

  const byItemName = new Map();
  const missingItems = [];

  for (const item of rawItems) {
    const itemName = item?.name || item?.itemName || item?.item;
    const matchedItem = bestTextMatch(itemName, matchedRestaurant.menu, (m) => m.name);
    if (!matchedItem) {
      if (itemName) missingItems.push(String(itemName));
      continue;
    }

    const quantity = asPositiveInt(item?.quantity || item?.qty || 1, 1);
    const existing = byItemName.get(matchedItem.name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      byItemName.set(matchedItem.name, {
        name: matchedItem.name,
        price: Number(matchedItem.price) || 0,
        quantity,
      });
    }
  }

  const items = [...byItemName.values()];
  if (!items.length) {
    return {
      clarification:
        `I couldn't map requested items to ${matchedRestaurant.name}'s menu. Try exact menu item names.`,
    };
  }

  const total = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const skipped = missingItems.length
    ? ` I skipped unmatched items: ${missingItems.join(", ")}.`
    : "";

  return {
    draft: {
      restaurant: {
        _id: matchedRestaurant._id,
        name: matchedRestaurant.name,
      },
      items,
      total,
      prompt,
    },
    assistantText:
      parsed?.clarification ||
      `Draft ready from ${matchedRestaurant.name}.${skipped}`.trim(),
  };
}

app.post("/api/ai/smart-order", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  const catalog = sanitizeCatalog(req.body?.restaurants);

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  if (!catalog.length) {
    return res.status(400).json({ error: "Restaurant catalog is required." });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: "Smart Order AI is not configured. Add OPENAI_API_KEY in api-gateway/.env.",
      code: "OPENAI_NOT_CONFIGURED",
    });
  }

  try {
    const parsed = await callOpenAiSmartOrder(prompt, catalog);
    const result = buildDraftFromAi(parsed, prompt, catalog);

    if (result.draft) {
      return res.json({
        mode: "draft",
        draft: result.draft,
        assistantText: result.assistantText,
        provider: "openai",
      });
    }

    return res.json({
      mode: "clarify",
      clarification: result.clarification,
      provider: "openai",
    });
  } catch (error) {
    console.error("Smart order AI error:", error.message);
    return res.status(502).json({
      error: "Smart Order AI request failed.",
      code: "OPENAI_REQUEST_FAILED",
    });
  }
});

// User Service (public routes - no auth required)
app.use(
  "/api/auth",
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL, // http://localhost:3001
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
    target: process.env.RESTAURANT_SERVICE_URL,
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
    target: process.env.ORDER_SERVICE_URL,
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
    target: process.env.PAYMENT_SERVICE_URL,
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
    target: process.env.NOTIFICATION_SERVICE_URL,
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
