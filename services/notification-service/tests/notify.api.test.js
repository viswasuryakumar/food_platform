const request = require("supertest");
const { createApp } = require("../app");
const { ConnectionRegistry } = require("../lib/registry");

const INTERNAL_TOKEN = "test-internal-token";

let app;
let deliver;
let registry;

beforeAll(() => {
  process.env.INTERNAL_SERVICE_TOKEN = INTERNAL_TOKEN;
});

beforeEach(() => {
  registry = new ConnectionRegistry();
  deliver = jest.fn().mockReturnValue(2);
  app = createApp({ registry, deliver });
});

describe("POST /notify", () => {
  const validBody = {
    orderId: "order-1",
    userId: "user-1",
    restaurantId: "rest-1",
    status: "preparing",
  };

  it("dispatches a well-formed event when the internal token matches", async () => {
    const res = await request(app)
      .post("/notify")
      .set("x-internal-token", INTERNAL_TOKEN)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(2);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining(validBody));
  });

  it("refuses a request with no internal token", async () => {
    const res = await request(app).post("/notify").send(validBody);

    expect(res.status).toBe(403);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong internal token", async () => {
    const res = await request(app)
      .post("/notify")
      .set("x-internal-token", "guessed-wrong")
      .send(validBody);

    expect(res.status).toBe(403);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects a payload missing the target user", async () => {
    const res = await request(app)
      .post("/notify")
      .set("x-internal-token", INTERNAL_TOKEN)
      .send({ orderId: "order-1", status: "preparing" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("health endpoints", () => {
  it("reports liveness", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("notification-service");
  });

  it("reports socket stats on readiness", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.sockets).toEqual({ users: 0, connections: 0, admins: 0 });
  });
});
