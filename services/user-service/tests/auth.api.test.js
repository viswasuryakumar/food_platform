const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.JWT_SECRET = "test-secret-for-user-service";
process.env.BCRYPT_ROUNDS = "4"; // keep hashing cheap in tests

const app = require("../app");
const User = require("../models/User");

let mongod;

const VALID_USER = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "Str0ngPassw0rd",
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

describe("POST /auth/register", () => {
  it("registers a user and returns a token", async () => {
    const res = await request(app).post("/auth/register").send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("ada@example.com");
  });

  it("never returns the password hash", async () => {
    const res = await request(app).post("/auth/register").send(VALID_USER);
    expect(res.body.user.password).toBeUndefined();
  });

  it("refuses to let a caller grant themselves admin", async () => {
    // The original bug: `role` was read straight from the request body, so this
    // request would have created a platform administrator.
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_USER, role: "restaurant_admin" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("user");

    const stored = await User.findOne({ email: VALID_USER.email });
    expect(stored.role).toBe("user");

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe("user");
  });

  it("normalises email casing and whitespace", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_USER, email: "  ADA@Example.COM  " });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("ada@example.com");
  });

  it("rejects a duplicate email regardless of casing", async () => {
    await request(app).post("/auth/register").send(VALID_USER);
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_USER, email: "ADA@EXAMPLE.COM" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it.each([
    ["too short", "Ab1"],
    ["no uppercase", "weakpassword1"],
    ["no lowercase", "WEAKPASSWORD1"],
    ["no number", "WeakPassword"],
  ])("rejects a password that is %s", async (_label, password) => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_USER, password });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed email", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...VALID_USER, email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("stores a bcrypt hash rather than the plaintext password", async () => {
    await request(app).post("/auth/register").send(VALID_USER);
    const stored = await User.findOne({ email: VALID_USER.email }).select("+password");

    expect(stored.password).not.toBe(VALID_USER.password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send(VALID_USER);
  });

  it("returns a token for correct credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.email).toBe(VALID_USER.email);
  });

  it("gives the same generic error for a wrong password and an unknown account", async () => {
    // Different messages here would let an attacker enumerate registered emails.
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: VALID_USER.email, password: "Wr0ngPassword" });

    const unknownAccount = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "Wr0ngPassword" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownAccount.body.error.message);
    expect(wrongPassword.body.error.code).toBe(unknownAccount.body.error.code);
  });

  it("logs in case-insensitively on email", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ADA@EXAMPLE.COM", password: VALID_USER.password });

    expect(res.status).toBe(200);
  });
});

describe("profile routes", () => {
  let userId;

  beforeEach(async () => {
    const res = await request(app).post("/auth/register").send(VALID_USER);
    userId = res.body.user._id;
  });

  it("returns the signed-in user", async () => {
    const res = await request(app).get("/auth/me").set("x-user-id", userId);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_USER.email);
  });

  it("rejects an unauthenticated profile read", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("updates whitelisted profile fields", async () => {
    const res = await request(app)
      .put("/auth/me")
      .set("x-user-id", userId)
      .send({ name: "Ada King", phone: "555-0100", defaultAddress: "12 Analytical Way" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Ada King");
    expect(res.body.user.phone).toBe("555-0100");
  });

  it("ignores an attempt to escalate role through the profile route", async () => {
    await request(app)
      .put("/auth/me")
      .set("x-user-id", userId)
      .send({ name: "Ada King", role: "restaurant_admin" });

    const stored = await User.findById(userId);
    expect(stored.role).toBe("user");
  });

  it("ignores an attempt to change email through the profile route", async () => {
    await request(app)
      .put("/auth/me")
      .set("x-user-id", userId)
      .send({ email: "attacker@example.com" });

    const stored = await User.findById(userId);
    expect(stored.email).toBe(VALID_USER.email);
  });
});

describe("health endpoints", () => {
  it("reports readiness with dependency state", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.dependencies.mongodb).toBe("up");
  });
});
