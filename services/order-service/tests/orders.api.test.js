const request = require("supertest");
const mongoose = require("mongoose");

const { connectTestDb, clearTestDb, closeTestDb } = require("./setup");

// The pricing module reaches out to restaurant-service over HTTP. We stub that
// single boundary so these tests stay hermetic, while everything else (routing,
// validation, the state machine, Mongoose) runs for real.
jest.mock("../lib/pricing", () => {
  const actual = jest.requireActual("../lib/pricing");
  return { ...actual, priceOrder: jest.fn() };
});
jest.mock("../lib/notifier", () => ({ publishOrderEvent: jest.fn().mockResolvedValue(undefined) }));

const { priceOrder } = require("../lib/pricing");
const { publishOrderEvent } = require("../lib/notifier");
const app = require("../app");
const Order = require("../models/Order");

const RESTAURANT_ID = "507f1f77bcf86cd799439011";
const CUSTOMER_ID = "507f1f77bcf86cd799439012";
const OTHER_CUSTOMER_ID = "507f1f77bcf86cd799439013";
const ADMIN_ID = "507f1f77bcf86cd799439014";

const asCustomer = { "x-user-id": CUSTOMER_ID, "x-user-role": "user" };
const asOtherCustomer = { "x-user-id": OTHER_CUSTOMER_ID, "x-user-role": "user" };
const asAdmin = { "x-user-id": ADMIN_ID, "x-user-role": "restaurant_admin" };

/** Creates an order directly in the DB, bypassing the API, at a given status. */
async function seedOrder(overrides = {}) {
  return Order.create({
    userId: CUSTOMER_ID,
    restaurantId: RESTAURANT_ID,
    items: [{ name: "Masala Dosa", price: 6.5, quantity: 1 }],
    totalPrice: 6.5,
    status: "pending",
    statusHistory: [{ status: "pending", at: new Date(), by: CUSTOMER_ID }],
    ...overrides,
  });
}

beforeAll(connectTestDb);
afterEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});
afterAll(closeTestDb);

describe("POST /orders", () => {
  beforeEach(() => {
    priceOrder.mockResolvedValue({
      restaurant: { _id: RESTAURANT_ID, name: "Campus Bites" },
      items: [{ name: "Masala Dosa", price: 6.5, quantity: 2 }],
      totalPrice: 13.0,
    });
  });

  it("creates an order and returns 201", async () => {
    const res = await request(app)
      .post("/orders")
      .set(asCustomer)
      .send({ restaurantId: RESTAURANT_ID, items: [{ name: "Masala Dosa", quantity: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.totalPrice).toBe(13.0);
    expect(res.body.order.status).toBe("pending");
    expect(res.body.order.userId).toBe(CUSTOMER_ID);
  });

  it("ignores a client-supplied price and uses the menu price instead", async () => {
    // The attack: order a $6.50 dosa for one cent by forging the request body.
    const res = await request(app)
      .post("/orders")
      .set(asCustomer)
      .send({
        restaurantId: RESTAURANT_ID,
        items: [{ name: "Masala Dosa", quantity: 2, price: 0.01 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.order.totalPrice).toBe(13.0);
    expect(res.body.order.items[0].price).toBe(6.5);
  });

  it("records the opening status in the audit trail", async () => {
    const res = await request(app)
      .post("/orders")
      .set(asCustomer)
      .send({ restaurantId: RESTAURANT_ID, items: [{ name: "Masala Dosa", quantity: 2 }] });

    expect(res.body.order.statusHistory).toHaveLength(1);
    expect(res.body.order.statusHistory[0]).toMatchObject({ status: "pending", by: CUSTOMER_ID });
  });

  it("publishes a notification event", async () => {
    await request(app)
      .post("/orders")
      .set(asCustomer)
      .send({ restaurantId: RESTAURANT_ID, items: [{ name: "Masala Dosa", quantity: 2 }] });

    expect(publishOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", userId: CUSTOMER_ID })
    );
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ restaurantId: RESTAURANT_ID, items: [{ name: "Masala Dosa", quantity: 1 }] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["an empty item list", { restaurantId: RESTAURANT_ID, items: [] }],
    ["a malformed restaurant id", { restaurantId: "not-an-id", items: [{ name: "X", quantity: 1 }] }],
    ["zero quantity", { restaurantId: RESTAURANT_ID, items: [{ name: "X", quantity: 0 }] }],
    [
      "a negative quantity",
      { restaurantId: RESTAURANT_ID, items: [{ name: "X", quantity: -3 }] },
    ],
    [
      "a fractional quantity",
      { restaurantId: RESTAURANT_ID, items: [{ name: "X", quantity: 1.5 }] },
    ],
  ])("rejects %s with 400", async (_label, payload) => {
    const res = await request(app).post("/orders").set(asCustomer).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("surfaces unavailable menu items as 422", async () => {
    const { HttpError } = require("../lib/http");
    priceOrder.mockRejectedValue(
      new HttpError(422, "These items are not on the menu: Sushi", "ITEMS_UNAVAILABLE")
    );

    const res = await request(app)
      .post("/orders")
      .set(asCustomer)
      .send({ restaurantId: RESTAURANT_ID, items: [{ name: "Sushi", quantity: 1 }] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ITEMS_UNAVAILABLE");
  });
});

describe("GET /orders/:id", () => {
  it("returns the order to its owner", async () => {
    const order = await seedOrder();
    const res = await request(app).get(`/orders/${order._id}`).set(asCustomer);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(String(order._id));
    expect(res.body.allowedNextStatuses).toEqual(["paid", "cancelled"]);
  });

  it("does not leak another customer's order", async () => {
    const order = await seedOrder();
    const res = await request(app).get(`/orders/${order._id}`).set(asOtherCustomer);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows an admin to read any order", async () => {
    const order = await seedOrder();
    const res = await request(app).get(`/orders/${order._id}`).set(asAdmin);
    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing order", async () => {
    const res = await request(app)
      .get(`/orders/${new mongoose.Types.ObjectId()}`)
      .set(asCustomer);
    expect(res.status).toBe(404);
  });
});

describe("GET /orders (admin listing)", () => {
  it("refuses a non-admin", async () => {
    const res = await request(app).get("/orders").set(asCustomer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns a paginated envelope for an admin", async () => {
    await seedOrder();
    await seedOrder();
    const res = await request(app).get("/orders?page=1&limit=1").set(asAdmin);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body).toMatchObject({ total: 2, page: 1, pages: 2 });
  });
});

describe("GET /orders/history", () => {
  it("returns only the caller's own orders", async () => {
    await seedOrder();
    await seedOrder({ userId: OTHER_CUSTOMER_ID });

    const res = await request(app).get("/orders/history").set(asCustomer);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].userId).toBe(CUSTOMER_ID);
  });
});

describe("PUT /orders/:id/status", () => {
  it("lets an admin advance a paid order to preparing", async () => {
    const order = await seedOrder({ status: "paid" });
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asAdmin)
      .send({ status: "preparing" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("preparing");
  });

  it("appends to the audit trail on each change", async () => {
    const order = await seedOrder({ status: "paid" });
    await request(app).put(`/orders/${order._id}/status`).set(asAdmin).send({ status: "preparing" });
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asAdmin)
      .send({ status: "on-the-way" });

    expect(res.body.order.statusHistory.map((e) => e.status)).toEqual([
      "pending",
      "preparing",
      "on-the-way",
    ]);
    expect(res.body.order.statusHistory.at(-1).by).toBe(ADMIN_ID);
  });

  it("rejects an illegal transition with 409", async () => {
    const order = await seedOrder({ status: "pending" });
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asAdmin)
      .send({ status: "delivered" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ILLEGAL_TRANSITION");
  });

  it("rejects any change to a delivered order", async () => {
    const order = await seedOrder({ status: "delivered" });
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asAdmin)
      .send({ status: "preparing" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TERMINAL_STATE");
  });

  it("does not let a customer promote their own order", async () => {
    const order = await seedOrder({ status: "paid" });
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asCustomer)
      .send({ status: "preparing" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_TRANSITION");
  });

  it("lets a customer cancel their own pending order with a reason", async () => {
    const order = await seedOrder();
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asCustomer)
      .send({ status: "cancelled", reason: "Ordered by mistake" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("cancelled");
    expect(res.body.order.cancelledReason).toBe("Ordered by mistake");
  });

  it("does not let a customer touch someone else's order", async () => {
    const order = await seedOrder();
    const res = await request(app)
      .put(`/orders/${order._id}/status`)
      .set(asOtherCustomer)
      .send({ status: "cancelled" });

    expect(res.status).toBe(403);
  });
});

describe("POST /orders/:id/mark-paid (internal)", () => {
  const INTERNAL_TOKEN = "test-internal-token";
  let previousToken;

  beforeAll(() => {
    previousToken = process.env.INTERNAL_SERVICE_TOKEN;
    process.env.INTERNAL_SERVICE_TOKEN = INTERNAL_TOKEN;
  });
  afterAll(() => {
    process.env.INTERNAL_SERVICE_TOKEN = previousToken;
  });

  it("marks a pending order paid when the internal token matches", async () => {
    const order = await seedOrder();
    const res = await request(app)
      .post(`/orders/${order._id}/mark-paid`)
      .set({ ...asCustomer, "x-internal-token": INTERNAL_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("paid");
    expect(res.body.order.statusHistory.at(-1).by).toBe("system");
  });

  it("is idempotent, so a payment retry does not error", async () => {
    const order = await seedOrder();
    const headers = { ...asCustomer, "x-internal-token": INTERNAL_TOKEN };

    const first = await request(app).post(`/orders/${order._id}/mark-paid`).set(headers);
    const second = await request(app).post(`/orders/${order._id}/mark-paid`).set(headers);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.order.status).toBe("paid");
    // Crucially, the retry must not append a duplicate history entry.
    expect(second.body.order.statusHistory.filter((e) => e.status === "paid")).toHaveLength(1);
  });

  it("refuses a request without the internal token", async () => {
    const order = await seedOrder();
    const res = await request(app).post(`/orders/${order._id}/mark-paid`).set(asCustomer);

    expect(res.status).toBe(403);
  });
});

describe("health endpoints", () => {
  it("reports liveness", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("reports readiness including dependency state", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.dependencies.mongodb).toBe("up");
  });
});
