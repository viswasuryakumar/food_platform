const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const User = require("./models/User");
const { validate } = require("./lib/validate");
const { HttpError, asyncHandler, errorHandler, notFoundHandler } = require("./lib/http");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "50kb" }));

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const TOKEN_TTL = process.env.JWT_TTL || "1d";

// -------------------- SCHEMAS --------------------
/**
 * `role` is deliberately absent from this schema and stripped from the request.
 *
 * The previous implementation did `role: role || "user"`, which let anyone
 * register as a restaurant_admin simply by adding a field to the request body —
 * self-granted platform administration from an unauthenticated endpoint.
 * Elevation now happens only through the seeded-admin path or a direct DB
 * change, never through public input.
 */
const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: z.string().trim().toLowerCase().email("Must be a valid email address").max(200),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(200, "Password is too long")
      .regex(/[a-z]/, "Password must contain a lowercase letter")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
  })
  .strip();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1, "Password is required").max(200),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  defaultAddress: z.string().trim().max(300).optional(),
});

function signToken(user) {
  return jwt.sign(
    { id: String(user._id), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

// -------------------- HEALTH --------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "user-service", uptime: process.uptime() });
});

app.get("/health/ready", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ready" : "not_ready",
    service: "user-service",
    dependencies: { mongodb: dbReady ? "up" : "down" },
  });
});

// -------------------- AUTH --------------------
app.post(
  "/auth/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      throw new HttpError(409, "An account with that email already exists", "EMAIL_TAKEN");
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ name, email, password: hashed, role: "user" });

    // Return a token so the client can proceed straight to a signed-in state
    // instead of immediately posting the credentials again.
    res.status(201).json({ message: "User registered", token: signToken(user), user });
  })
);

app.post(
  "/auth/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // The hash is `select: false` on the schema, so ask for it explicitly.
    const user = await User.findOne({ email }).select("+password");

    /**
     * One generic message for both "no such account" and "wrong password".
     * Distinguishing them turns this endpoint into an account-enumeration
     * oracle: an attacker could discover which emails are registered.
     */
    const invalid = () => new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");

    if (!user) {
      // Spend comparable time hashing anyway, so response latency does not
      // reveal whether the account exists.
      await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
      throw invalid();
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw invalid();

    res.json({ message: "Login successful", token: signToken(user), user });
  })
);

// -------------------- PROFILE --------------------
function requireUser(req, _res, next) {
  const userId = req.headers["x-user-id"];
  if (!userId) return next(new HttpError(401, "Authentication required", "UNAUTHENTICATED"));
  req.user = { id: String(userId), role: String(req.headers["x-user-role"] || "user") };
  return next();
}

app.get(
  "/auth/me",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    res.json({ user });
  })
);

app.put(
  "/auth/me",
  requireUser,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    // Only the whitelisted profile fields are updatable; role and email are not
    // reachable through this route.
    const user = await User.findByIdAndUpdate(req.user.id, req.body, {
      returnDocument: "after",
      runValidators: true,
    });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    res.json({ message: "Profile updated", user });
  })
);

/** Internal lookup used by other services to enrich records with user details. */
app.post(
  "/internal/users/lookup",
  asyncHandler(async (req, res) => {
    const expected = process.env.INTERNAL_SERVICE_TOKEN;
    if (!expected || req.headers["x-internal-token"] !== expected) {
      throw new HttpError(403, "Internal endpoint", "FORBIDDEN");
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 100) : [];
    const users = await User.find({ _id: { $in: ids } }).select("name email");
    res.json({ users });
  })
);

app.use(notFoundHandler);
app.use(errorHandler("user-service"));

module.exports = app;
