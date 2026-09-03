const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../app");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");

let mongod;

const OWNER_ID = "507f1f77bcf86cd799439011";
const OTHER_ADMIN_ID = "507f1f77bcf86cd799439012";
const CUSTOMER_ID = "507f1f77bcf86cd799439013";

const asOwner = { "x-user-id": OWNER_ID, "x-user-role": "restaurant_admin" };
const asOtherAdmin = { "x-user-id": OTHER_ADMIN_ID, "x-user-role": "restaurant_admin" };
const asCustomer = { "x-user-id": CUSTOMER_ID, "x-user-role": "user" };

const SAMPLE = {
  name: "Campus Bites",
  address: "North Block, Main Campus",
  cuisine: "Indian",
  menu: [
    { name: "Masala Dosa", price: 6.5 },
    { name: "Filter Coffee", price: 2.5 },
  ],
};

async function createRestaurant(headers = asOwner, payload = SAMPLE) {
  const res = await request(app).post("/restaurants").set(headers).send(payload);
  return res.body.restaurant;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Restaurant.syncIndexes();
  await MenuItem.syncIndexes();
});

afterEach(async () => {
  await Restaurant.deleteMany({});
  await MenuItem.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

describe("POST /restaurants", () => {
  it("creates a restaurant owned by the calling admin", async () => {
    const res = await request(app).post("/restaurants").set(asOwner).send(SAMPLE);

    expect(res.status).toBe(201);
    expect(res.body.restaurant.createdBy).toBe(OWNER_ID);
    expect(res.body.restaurant.menu).toHaveLength(2);
  });

  it("normalises name and cuisine for indexed search", async () => {
    const restaurant = await createRestaurant(asOwner, { ...SAMPLE, name: "  Campus BITES  " });
    expect(restaurant.name_normalized).toBe("campus bites");
    expect(restaurant.cuisine_normalized).toBe("indian");
  });

  it("refuses a customer", async () => {
    const res = await request(app).post("/restaurants").set(asCustomer).send(SAMPLE);
    expect(res.status).toBe(403);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).post("/restaurants").send(SAMPLE);
    expect(res.status).toBe(401);
  });

  it.each([
    ["a missing name", { ...SAMPLE, name: "" }],
    ["a missing address", { ...SAMPLE, address: "" }],
    ["a negative item price", { ...SAMPLE, menu: [{ name: "X", price: -5 }] }],
    ["a non-numeric price", { ...SAMPLE, menu: [{ name: "X", price: "free" }] }],
  ])("rejects %s", async (_label, payload) => {
    const res = await request(app).post("/restaurants").set(asOwner).send(payload);
    expect(res.status).toBe(400);
  });
});

describe("ownership enforcement", () => {
  it("stops another admin editing a restaurant they do not own", async () => {
    const restaurant = await createRestaurant();

    const res = await request(app)
      .put(`/restaurants/${restaurant._id}`)
      .set(asOtherAdmin)
      .send({ name: "Hijacked" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_OWNER");
  });

  it("stops another admin deleting a restaurant they do not own", async () => {
    const restaurant = await createRestaurant();

    const res = await request(app).delete(`/restaurants/${restaurant._id}`).set(asOtherAdmin);

    expect(res.status).toBe(403);
    expect(await Restaurant.countDocuments()).toBe(1);
  });

  it("stops another admin adding items to a menu they do not own", async () => {
    const restaurant = await createRestaurant();

    const res = await request(app)
      .post(`/restaurants/${restaurant._id}/menu`)
      .set(asOtherAdmin)
      .send({ name: "Sneaky Item", price: 1 });

    expect(res.status).toBe(403);
  });

  it("allows the owner to edit their own restaurant", async () => {
    const restaurant = await createRestaurant();

    const res = await request(app)
      .put(`/restaurants/${restaurant._id}`)
      .set(asOwner)
      .send({ name: "Campus Bites Deluxe" });

    expect(res.status).toBe(200);
    expect(res.body.restaurant.name).toBe("Campus Bites Deluxe");
  });

  it("lists only the calling admin's restaurants", async () => {
    await createRestaurant(asOwner);
    await createRestaurant(asOtherAdmin, { ...SAMPLE, name: "Other Place" });

    const res = await request(app).get("/restaurants/mine/list").set(asOwner);

    expect(res.body.restaurants).toHaveLength(1);
    expect(res.body.restaurants[0].createdBy).toBe(OWNER_ID);
  });
});

describe("menu as single source of truth", () => {
  it("projects embedded menu items into the flat read model on create", async () => {
    const restaurant = await createRestaurant();

    const projected = await MenuItem.find({ restaurantId: restaurant._id }).lean();
    expect(projected).toHaveLength(2);
    expect(projected.map((i) => i.name).sort()).toEqual(["Filter Coffee", "Masala Dosa"]);
    expect(projected[0].restaurantName).toBe("Campus Bites");
  });

  it("keeps the projection in step when an item is added", async () => {
    const restaurant = await createRestaurant();

    await request(app)
      .post(`/restaurants/${restaurant._id}/menu`)
      .set(asOwner)
      .send({ name: "Paneer Wrap", price: 7.25 });

    expect(await MenuItem.countDocuments({ restaurantId: restaurant._id })).toBe(3);
  });

  it("keeps the projection in step when an item price changes", async () => {
    const restaurant = await createRestaurant();
    const itemId = restaurant.menu[0]._id;

    await request(app)
      .put(`/restaurants/${restaurant._id}/menu/${itemId}`)
      .set(asOwner)
      .send({ price: 9.99 });

    const projected = await MenuItem.findOne({ restaurantId: restaurant._id, itemId }).lean();
    expect(projected.price).toBe(9.99);
  });

  it("keeps the projection in step when an item is deleted", async () => {
    const restaurant = await createRestaurant();
    const itemId = restaurant.menu[0]._id;

    await request(app)
      .delete(`/restaurants/${restaurant._id}/menu/${itemId}`)
      .set(asOwner);

    expect(await MenuItem.countDocuments({ restaurantId: restaurant._id })).toBe(1);
  });

  it("clears the projection when the restaurant is deleted", async () => {
    const restaurant = await createRestaurant();
    await request(app).delete(`/restaurants/${restaurant._id}`).set(asOwner);

    expect(await MenuItem.countDocuments({ restaurantId: restaurant._id })).toBe(0);
  });

  it("rebuilds the projection idempotently on repeated writes", async () => {
    const restaurant = await createRestaurant();

    await request(app).put(`/restaurants/${restaurant._id}`).set(asOwner).send({ cuisine: "South Indian" });
    await request(app).put(`/restaurants/${restaurant._id}`).set(asOwner).send({ cuisine: "Indian" });

    // A non-idempotent rebuild would duplicate rows on every write.
    expect(await MenuItem.countDocuments({ restaurantId: restaurant._id })).toBe(2);
  });
});

describe("GET /restaurants/search", () => {
  beforeEach(async () => {
    await createRestaurant(asOwner, { ...SAMPLE, name: "Campus Bites", cuisine: "Indian" });
    await createRestaurant(asOwner, { ...SAMPLE, name: "Campus Cafe", cuisine: "Coffee" });
    await createRestaurant(asOwner, { ...SAMPLE, name: "Noodle House", cuisine: "Chinese" });
  });

  it("matches on a name prefix", async () => {
    const res = await request(app).get("/restaurants/search?q=campus");
    expect(res.body.total).toBe(2);
  });

  it("matches on a cuisine prefix", async () => {
    const res = await request(app).get("/restaurants/search?q=chin");
    expect(res.body.total).toBe(1);
    expect(res.body.restaurants[0].name).toBe("Noodle House");
  });

  it("returns everything for an empty query", async () => {
    const res = await request(app).get("/restaurants/search");
    expect(res.body.total).toBe(3);
  });

  it("paginates", async () => {
    const res = await request(app).get("/restaurants/search?page=1&limit=2");
    expect(res.body.restaurants).toHaveLength(2);
    expect(res.body.pages).toBe(2);
  });

  it("omits the menu from list results to keep the payload small", async () => {
    const res = await request(app).get("/restaurants/search");
    expect(res.body.restaurants[0].menu).toBeUndefined();
  });

  it("survives regex metacharacters in the query", async () => {
    // An unescaped "(" would throw an invalid-regex error and 500.
    const res = await request(app).get("/restaurants/search?q=%28unclosed");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("rejects an out-of-range limit", async () => {
    const res = await request(app).get("/restaurants/search?limit=5000");
    expect(res.status).toBe(400);
  });
});

describe("GET /restaurants/items/search", () => {
  it("finds items across different restaurants", async () => {
    await createRestaurant(asOwner, {
      ...SAMPLE,
      name: "Dosa Corner",
      menu: [{ name: "Masala Dosa", price: 5.0 }],
    });
    await createRestaurant(asOwner, {
      ...SAMPLE,
      name: "South Express",
      menu: [{ name: "Plain Dosa", price: 4.0 }],
    });

    const res = await request(app).get("/restaurants/items/search?q=dosa");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    // Cheapest first, and each row carries the restaurant it belongs to.
    expect(res.body.items[0].price).toBe(4.0);
    expect(res.body.items[0].restaurantName).toBe("South Express");
  });
});

describe("GET /restaurants/:id", () => {
  it("returns 404 for a missing restaurant instead of a null body", async () => {
    const res = await request(app).get(`/restaurants/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESTAURANT_NOT_FOUND");
  });

  it("returns 400 for a malformed id rather than a cast error", async () => {
    const res = await request(app).get("/restaurants/not-a-real-id");
    expect(res.status).toBe(400);
  });
});
