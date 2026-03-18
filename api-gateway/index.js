require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

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
