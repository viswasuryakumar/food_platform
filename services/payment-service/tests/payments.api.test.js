const request = require("supertest");

const { connectTestDb, clearTestDb, closeTestDb } = require("./setup");

jest.mock("../lib/orderClient", () => ({
  fetchOrder: jest.fn(),
  markOrderPaid: jest.fn().mockResolvedValue({ message: "Order marked paid" }),
}));

const { fetchOrder, markOrderPaid } = require("../lib/orderClient");
const app = require("../app");
const Payment = require("../models/payment");

const ORDER_ID = "507f1f77bcf86cd799439011";
const CUSTOMER_ID = "507f1f77bcf86cd799439012";
const OTHER_CUSTOMER_ID = "507f1f77bcf86cd799439013";

const asCustomer = { "x-user-id": CUSTOMER_ID, "x-user-role": "user" };

function pendingOrder(overrides = {}) {
  return {
    _id: ORDER_ID,
    userId: CUSTOMER_ID,
    restaurantId: "507f1f77bcf86cd799439014",
    totalPrice: 42.5,
    status: "pending",
    ...overrides,
  };
}

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});
afterAll(closeTestDb);

describe("POST /payments/charge", () => {
  beforeEach(() => {
    fetchOrder.mockResolvedValue(pendingOrder());
    markOrderPaid.mockResolvedValue({ message: "Order marked paid" });
  });

  it("charges the order's stored total", async () => {
    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-basic-001")
      .send({ orderId: ORDER_ID, method: "card" });

    expect(res.status).toBe(201);
    expect(res.body.payment.amount).toBe(42.5);
  });

  it("ignores a client-supplied amount", async () => {
    // The attack: pay one cent for a $42.50 order.
    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-forge-001")
      .send({ orderId: ORDER_ID, method: "card", amount: 0.01 });

    expect(res.status).toBe(201);
    expect(res.body.payment.amount).toBe(42.5);
  });

  it("advances the order to paid via the internal endpoint", async () => {
    await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-mark-001")
      .send({ orderId: ORDER_ID });

    expect(markOrderPaid).toHaveBeenCalledWith(ORDER_ID, CUSTOMER_ID);
  });

  it("refuses to pay for another user's order", async () => {
    fetchOrder.mockResolvedValue(pendingOrder({ userId: OTHER_CUSTOMER_ID }));

    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-other-001")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(403);
    expect(await Payment.countDocuments()).toBe(0);
  });

  it.each(["paid", "preparing", "delivered", "cancelled"])(
    "refuses to charge an order already in state %s",
    async (status) => {
      fetchOrder.mockResolvedValue(pendingOrder({ status }));

      const res = await request(app)
        .post("/payments/charge")
        .set(asCustomer)
        .set("idempotency-key", `key-state-${status}`)
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORDER_NOT_PAYABLE");
    }
  );

  it("rejects an unauthenticated charge", async () => {
    const res = await request(app).post("/payments/charge").send({ orderId: ORDER_ID });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed order id", async () => {
    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .send({ orderId: "nope" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unsupported payment method", async () => {
    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .send({ orderId: ORDER_ID, method: "cheque" });

    expect(res.status).toBe(400);
  });
});

describe("idempotency", () => {
  beforeEach(() => {
    fetchOrder.mockResolvedValue(pendingOrder());
    markOrderPaid.mockResolvedValue({ message: "Order marked paid" });
  });

  it("returns the original payment when a request is retried with the same key", async () => {
    const send = () =>
      request(app)
        .post("/payments/charge")
        .set(asCustomer)
        .set("idempotency-key", "retry-key-123")
        .send({ orderId: ORDER_ID });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.idempotentReplay).toBe(true);
    expect(second.body.payment.transactionId).toBe(first.body.payment.transactionId);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it("does not double-charge when two identical requests race", async () => {
    // Fired concurrently so both pass the "already exists?" lookup before either
    // writes. Only the unique index can decide this; application code cannot.
    const send = () =>
      request(app)
        .post("/payments/charge")
        .set(asCustomer)
        .set("idempotency-key", "race-key-456")
        .send({ orderId: ORDER_ID });

    const results = await Promise.all([send(), send(), send()]);

    expect(await Payment.countDocuments()).toBe(1);
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it("replays rather than 409s when a concurrent request already paid the order", async () => {
    // Reproduces the race: the first caller passes the idempotency lookup, a
    // second caller with the same key completes and flips the order to "paid",
    // and the first caller then sees a non-payable order. It must still receive
    // the original payment, not a conflict.
    const key = "concurrent-key-789";
    let callCount = 0;
    fetchOrder.mockImplementation(async () => {
      callCount += 1;
      // First call sees a payable order; every later call sees it already paid.
      return callCount === 1 ? pendingOrder() : pendingOrder({ status: "paid" });
    });

    const first = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", key)
      .send({ orderId: ORDER_ID });

    const retry = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", key)
      .send({ orderId: ORDER_ID });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.idempotentReplay).toBe(true);
    expect(retry.body.payment.transactionId).toBe(first.body.payment.transactionId);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it("still rejects a different key against an already-paid order", async () => {
    // A distinct request is not a retry, so the conflict must stand.
    fetchOrder.mockResolvedValue(pendingOrder({ status: "paid" }));

    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "an-entirely-different-key")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ORDER_NOT_PAYABLE");
  });

  it("allows a genuinely different charge with a different key", async () => {
    await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-one")
      .send({ orderId: ORDER_ID });

    fetchOrder.mockResolvedValue(pendingOrder({ _id: "507f1f77bcf86cd799439099" }));
    const res = await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "key-two")
      .send({ orderId: "507f1f77bcf86cd799439099" });

    expect(res.status).toBe(201);
    expect(await Payment.countDocuments()).toBe(2);
  });

  it("scopes keys per user so two customers can reuse the same key", async () => {
    await request(app)
      .post("/payments/charge")
      .set(asCustomer)
      .set("idempotency-key", "shared-key")
      .send({ orderId: ORDER_ID });

    fetchOrder.mockResolvedValue(
      pendingOrder({ _id: "507f1f77bcf86cd799439077", userId: OTHER_CUSTOMER_ID })
    );
    const res = await request(app)
      .post("/payments/charge")
      .set({ "x-user-id": OTHER_CUSTOMER_ID, "x-user-role": "user" })
      .set("idempotency-key", "shared-key")
      .send({ orderId: "507f1f77bcf86cd799439077" });

    expect(res.status).toBe(201);
    expect(await Payment.countDocuments()).toBe(2);
  });
});

describe("GET /payments/history", () => {
  it("returns only the caller's payments, paginated", async () => {
    await Payment.create({
      orderId: ORDER_ID,
      userId: CUSTOMER_ID,
      amount: 10,
      transactionId: "t1",
      idempotencyKey: "k1",
    });
    await Payment.create({
      orderId: "507f1f77bcf86cd799439055",
      userId: OTHER_CUSTOMER_ID,
      amount: 20,
      transactionId: "t2",
      idempotencyKey: "k2",
    });

    const res = await request(app).get("/payments/history").set(asCustomer);

    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].userId).toBe(CUSTOMER_ID);
  });
});

describe("health endpoints", () => {
  it("reports readiness with dependency state", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.dependencies.mongodb).toBe("up");
  });
});
