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

const QUANTITY_HINTS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const MATCH_STOP_WORDS = new Set([
  "i",
  "want",
  "wanna",
  "would",
  "like",
  "please",
  "get",
  "give",
  "me",
  "my",
  "for",
  "from",
  "with",
  "and",
  "the",
  "to",
  "of",
  "on",
  "in",
  "order",
  "cart",
  "add",
  "make",
]);

function tokenizeForMatch(value) {
  return normalizeLabel(value)
    .split(" ")
    .filter((token) => token && !MATCH_STOP_WORDS.has(token));
}

function scoreTextSimilarity(query, candidate) {
  const normalizedQuery = normalizeLabel(query);
  const normalizedCandidate = normalizeLabel(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;

  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.includes(normalizedQuery)) return 0.95;
  if (normalizedQuery.includes(normalizedCandidate)) return 0.9;

  const queryTokens = [...new Set(tokenizeForMatch(normalizedQuery))];
  const candidateTokens = [...new Set(tokenizeForMatch(normalizedCandidate))];
  if (!queryTokens.length || !candidateTokens.length) return 0;

  const overlap = queryTokens.filter((token) => candidateTokens.includes(token)).length;
  let score = overlap > 0 ? overlap / queryTokens.length : 0;

  if (score === 0) {
    const partialOverlap = queryTokens.some((token) => normalizedCandidate.includes(token));
    if (partialOverlap) score = 0.25;
  }

  return Math.min(1, score);
}

function quantityHintFromPrompt(prompt, fallback = 1) {
  const normalized = normalizeLabel(prompt);
  if (!normalized) return fallback;

  const digitMatch = normalized.match(/\b(\d+)\b/);
  if (digitMatch?.[1]) {
    return asPositiveInt(digitMatch[1], fallback);
  }

  for (const [word, quantity] of Object.entries(QUANTITY_HINTS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalized)) {
      return asPositiveInt(quantity, fallback);
    }
  }

  return fallback;
}

function findBestCatalogItem(query, catalog, restaurantHint = "") {
  const normalizedQuery = normalizeLabel(query);
  if (!normalizedQuery) return null;

  let best = null;
  let bestScore = 0;

  for (const restaurant of Array.isArray(catalog) ? catalog : []) {
    const restaurantBoost = restaurantHint
      ? scoreTextSimilarity(restaurantHint, restaurant.name) * 0.25
      : 0;

    for (const item of Array.isArray(restaurant.menu) ? restaurant.menu : []) {
      const itemScore = scoreTextSimilarity(normalizedQuery, item.name);
      const combinedScore = scoreTextSimilarity(
        normalizedQuery,
        `${restaurant.name} ${item.name}`
      );
      const score = Math.max(itemScore, combinedScore * 0.9) + restaurantBoost;

      if (score > bestScore) {
        best = { restaurant, item, score };
        bestScore = score;
      }
    }
  }

  return bestScore >= 0.3 ? best : null;
}

function buildBestMatchFallbackDraft(prompt, catalog, options = {}) {
  const restaurantHint = String(options.restaurantHint || "");
  const rawItems = Array.isArray(options.rawItems) ? options.rawItems : [];
  const candidates = [];

  for (const rawItem of rawItems) {
    const itemName = String(
      rawItem?.name || rawItem?.itemName || rawItem?.item || ""
    ).trim();
    if (!itemName) continue;

    const quantity = asPositiveInt(
      rawItem?.quantity || rawItem?.qty || quantityHintFromPrompt(prompt, 1),
      1
    );

    candidates.push({ query: itemName, quantity });
    if (restaurantHint) {
      candidates.push({ query: `${restaurantHint} ${itemName}`.trim(), quantity });
    }
  }

  candidates.push({
    query: prompt,
    quantity: quantityHintFromPrompt(prompt, 1),
  });

  let best = null;
  for (const candidate of candidates) {
    const found = findBestCatalogItem(candidate.query, catalog, restaurantHint);
    if (!found) continue;

    if (!best || found.score > best.score) {
      best = { ...found, quantity: candidate.quantity };
    }
  }

  if (!best) return null;

  const quantity = asPositiveInt(best.quantity, 1);
  const matchedItem = {
    name: String(best.item.name),
    price: Number(best.item.price) || 0,
    quantity,
  };

  return {
    draft: {
      restaurant: {
        _id: String(best.restaurant._id),
        name: String(best.restaurant.name),
      },
      items: [matchedItem],
      total: matchedItem.price * quantity,
      prompt,
    },
    assistantText: `Draft ready with best match: ${quantity} x ${matchedItem.name} from ${best.restaurant.name}.`,
  };
}

function sanitizeCatalog(restaurants) {
  return (Array.isArray(restaurants) ? restaurants : [])
    .filter((restaurant) => restaurant && restaurant._id && restaurant.name)
    .map((restaurant) => ({
      _id: String(restaurant._id),
      name: String(restaurant.name),
      cuisine: String(restaurant.cuisine || ""),
      address: String(restaurant.address || ""),
      menu: (Array.isArray(restaurant.menu) ? restaurant.menu : [])
        .filter((item) => item && item.name)
        .slice(0, 80)
        .map((item) => ({
          name: String(item.name),
          price: Number(item.price) || 0,
        })),
    }));
}

async function fetchRestaurantServiceSearch(path) {
  const baseUrl = toServiceUrl(process.env.RESTAURANT_SERVICE_URL) || "http://localhost:3002";
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Restaurant search failed (${response.status}): ${body.slice(0, 120)}`);
  }
  return response.json();
}

function rankRestaurantResults(restaurants, query) {
  const normalizedQuery = normalizeLabel(query);
  const list = Array.isArray(restaurants) ? restaurants : [];

  return list
    .map((restaurant) => {
      const score = normalizedQuery
        ? Math.max(
            scoreTextSimilarity(normalizedQuery, restaurant?.name),
            scoreTextSimilarity(normalizedQuery, restaurant?.cuisine),
            scoreTextSimilarity(normalizedQuery, restaurant?.address),
            scoreTextSimilarity(
              normalizedQuery,
              `${restaurant?.name || ""} ${restaurant?.cuisine || ""}`
            )
          )
        : 1;

      return {
        _id: String(restaurant?._id || ""),
        name: String(restaurant?.name || ""),
        cuisine: String(restaurant?.cuisine || ""),
        address: String(restaurant?.address || ""),
        score: Number(score.toFixed(3)),
      };
    })
    .filter((restaurant) => restaurant._id && restaurant.name)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function rankFoodItemResults(items, query) {
  const normalizedQuery = normalizeLabel(query);
  const list = Array.isArray(items) ? items : [];

  return list
    .map((item) => {
      const score = normalizedQuery
        ? Math.max(
            scoreTextSimilarity(normalizedQuery, item?.name),
            scoreTextSimilarity(
              normalizedQuery,
              `${item?.restaurantName || ""} ${item?.name || ""}`
            ),
            scoreTextSimilarity(normalizedQuery, `${item?.cuisine || ""} ${item?.name || ""}`)
          )
        : 1;

      return {
        name: String(item?.name || ""),
        price: Number(item?.price) || 0,
        restaurantId: String(item?.restaurantId || ""),
        restaurantName: String(item?.restaurantName || ""),
        cuisine: String(item?.cuisine || ""),
        score: Number(score.toFixed(3)),
      };
    })
    .filter((item) => item.name && item.restaurantId)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.restaurantName.localeCompare(b.restaurantName) ||
        a.name.localeCompare(b.name)
    );
}

async function searchRestaurantsTool(query, limit) {
  const safeQuery = String(query || "").trim();
  const safeLimit = asPositiveInt(limit, 10);
  const payload = await fetchRestaurantServiceSearch("/restaurants/search?limit=5000");
  const allRestaurants = Array.isArray(payload?.restaurants) ? payload.restaurants : [];
  const ranked = rankRestaurantResults(allRestaurants, safeQuery).slice(0, safeLimit);

  return {
    fetchedCount: allRestaurants.length,
    results: ranked,
  };
}

async function searchFoodItemsTool(query, limit) {
  const safeQuery = String(query || "").trim();
  const safeLimit = asPositiveInt(limit, 20);
  const payload = await fetchRestaurantServiceSearch("/restaurants/items/search?limit=5000");
  const allItems = Array.isArray(payload?.items) ? payload.items : [];
  const ranked = rankFoodItemResults(allItems, safeQuery).slice(0, safeLimit);

  return {
    fetchedCount: allItems.length,
    results: ranked,
  };
}

function parseToolArgs(rawArguments) {
  if (!rawArguments) return {};
  try {
    const parsed = JSON.parse(rawArguments);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
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
    "You convert food-order chat requests into structured draft orders.",
    "You have two tools: search_restaurants and search_food_items.",
    "You must call both tools once before producing the final answer.",
    "Each tool returns full data first, then ranked similarity; use those results to choose the best matching restaurant and menu items.",
    "When prompt is vague (example: 'chinese noodles'), still return best match as status='draft' if a reasonable item exists.",
    "Only return status='clarify' when there is no reasonable match.",
    "Return strict JSON with keys: status ('draft' or 'clarify'), restaurantName, items, clarification.",
    "For draft: restaurantName should match a catalog restaurant name.",
    "For draft: each item should map to a menu item from that restaurant and quantity must be integer 1..20.",
  ].join(" ");

  const tools = [
    {
      type: "function",
      function: {
        name: "search_restaurants",
        description: "Search restaurants by user intent.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 20 },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_food_items",
        description: "Search food/menu items across all restaurants by user intent.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 30 },
          },
          required: ["query"],
        },
      },
    },
  ];

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({ prompt, restaurants: catalog }),
    },
  ];
  const toolTrace = [];

  async function requestCompletion(toolChoice, responseFormat) {
    const body = {
      model: OPENAI_MODEL,
      temperature: 0,
      tools,
      tool_choice: toolChoice,
      messages,
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenAI request failed (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const payload = await response.json();
    const message = payload?.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenAI response was missing a message.");
    }
    return message;
  }

  const requiredTools = ["search_restaurants", "search_food_items"];
  for (const toolName of requiredTools) {
    const assistantMessage = await requestCompletion({
      type: "function",
      function: { name: toolName },
    });

    const fallbackToolCall = {
      id: `local_${toolName}_${Date.now()}`,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify({ query: prompt }),
      },
    };

    const selectedToolCall =
      assistantMessage?.tool_calls?.find((call) => call?.function?.name === toolName) ||
      assistantMessage?.tool_calls?.[0] ||
      fallbackToolCall;

    const args = parseToolArgs(selectedToolCall?.function?.arguments);
    const query = String(args?.query || prompt).trim();
    const limit = asPositiveInt(args?.limit, toolName === "search_restaurants" ? 8 : 12);
    const toolCallId = selectedToolCall.id || `local_${toolName}_${Date.now()}`;

    let toolPayload;
    if (toolName === "search_restaurants") {
      const restaurants = await searchRestaurantsTool(query, limit);
      toolPayload = {
        query,
        fetchedCount: restaurants.fetchedCount,
        count: restaurants.results.length,
        restaurants: restaurants.results,
      };
    } else {
      const items = await searchFoodItemsTool(query, limit);
      toolPayload = {
        query,
        fetchedCount: items.fetchedCount,
        count: items.results.length,
        items: items.results,
      };
    }
    toolTrace.push({
      tool: toolName,
      query,
      limit,
      fetchedCount: toolPayload.fetchedCount,
      count: toolPayload.count,
    });
    console.log(
      `Smart-order tool call: ${toolName} query="${query}" fetched=${toolPayload.fetchedCount} ranked=${toolPayload.count}`
    );

    messages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: [
        {
          id: toolCallId,
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify({ query, limit }),
          },
        },
      ],
    });

    messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      name: toolName,
      content: JSON.stringify(toolPayload),
    });
  }

  messages.push({
    role: "system",
    content:
      "Now return only the final JSON object with keys status, restaurantName, items, clarification.",
  });

  const finalMessage = await requestCompletion("none", { type: "json_object" });
  const parsed = extractJsonCandidate(finalMessage?.content || "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI response did not contain valid JSON.");
  }

  return { parsed, toolTrace };
}

function buildDraftFromAi(parsed, prompt, catalog) {
  const status = String(parsed?.status || "").toLowerCase();
  const restaurantName =
    parsed?.restaurantName || parsed?.restaurant || parsed?.restaurant_name;
  const matchedRestaurant = bestTextMatch(restaurantName, catalog, (r) => r.name);

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  if (matchedRestaurant && rawItems.length) {
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
    if (items.length) {
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
  }

  const focusedCatalog = matchedRestaurant ? [matchedRestaurant] : catalog;
  const focusedFallback = buildBestMatchFallbackDraft(prompt, focusedCatalog, {
    restaurantHint: restaurantName,
    rawItems,
  });
  if (focusedFallback) return focusedFallback;

  const globalFallback = buildBestMatchFallbackDraft(prompt, catalog, {
    restaurantHint: restaurantName,
    rawItems,
  });
  if (globalFallback) return globalFallback;

  if (status === "clarify") {
    return {
      clarification:
        parsed?.clarification ||
        "I couldn't confidently map that request to a menu item. Try a more specific food name.",
    };
  }

  return {
    clarification:
      "I couldn't map that request to a menu item. Try adding one or two food keywords.",
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
    const ai = await callOpenAiSmartOrder(prompt, catalog);
    const result = buildDraftFromAi(ai.parsed, prompt, catalog);

    if (result.draft) {
      return res.json({
        mode: "draft",
        draft: result.draft,
        assistantText: result.assistantText,
        provider: "openai",
        toolTrace: ai.toolTrace,
      });
    }

    return res.json({
      mode: "clarify",
      clarification: result.clarification,
      provider: "openai",
      toolTrace: ai.toolTrace,
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
