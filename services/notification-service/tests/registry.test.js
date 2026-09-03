const { ConnectionRegistry } = require("../lib/registry");

/** Minimal stand-in for a ws socket; only identity matters to the registry. */
function fakeSocket(id) {
  return { id };
}

describe("ConnectionRegistry", () => {
  let registry;
  beforeEach(() => {
    registry = new ConnectionRegistry();
  });

  it("indexes sockets by user", () => {
    const a = fakeSocket("a");
    registry.add(a, { userId: "user-1", role: "user" });

    expect(registry.socketsForUser("user-1")).toEqual([a]);
    expect(registry.socketsForUser("user-2")).toEqual([]);
  });

  it("supports the same user on multiple devices", () => {
    const phone = fakeSocket("phone");
    const laptop = fakeSocket("laptop");
    registry.add(phone, { userId: "user-1", role: "user" });
    registry.add(laptop, { userId: "user-1", role: "user" });

    expect(registry.socketsForUser("user-1")).toHaveLength(2);
  });

  it("keeps one user's sockets invisible to another user", () => {
    registry.add(fakeSocket("a"), { userId: "user-1", role: "user" });
    registry.add(fakeSocket("b"), { userId: "user-2", role: "user" });

    expect(registry.socketsForUser("user-1")).toHaveLength(1);
    expect(registry.socketsForUser("user-2")).toHaveLength(1);
  });

  it("tracks admins separately so they can receive the order board", () => {
    const admin = fakeSocket("admin");
    registry.add(admin, { userId: "admin-1", role: "restaurant_admin" });
    registry.add(fakeSocket("cust"), { userId: "user-1", role: "user" });

    expect(registry.adminSockets()).toEqual([admin]);
  });

  it("removes a socket on disconnect", () => {
    const a = fakeSocket("a");
    registry.add(a, { userId: "user-1", role: "user" });
    registry.remove(a, { userId: "user-1" });

    expect(registry.socketsForUser("user-1")).toEqual([]);
  });

  it("does not leak an empty entry after the last socket disconnects", () => {
    const a = fakeSocket("a");
    registry.add(a, { userId: "user-1", role: "user" });
    registry.remove(a, { userId: "user-1" });

    // The Map itself must shrink, otherwise it grows forever in a long-lived process.
    expect(registry.byUser.has("user-1")).toBe(false);
    expect(registry.stats().users).toBe(0);
  });

  it("removes an admin from the admin set on disconnect", () => {
    const admin = fakeSocket("admin");
    registry.add(admin, { userId: "admin-1", role: "restaurant_admin" });
    registry.remove(admin, { userId: "admin-1" });

    expect(registry.adminSockets()).toEqual([]);
  });

  it("reports connection stats", () => {
    registry.add(fakeSocket("a"), { userId: "user-1", role: "user" });
    registry.add(fakeSocket("b"), { userId: "user-1", role: "user" });
    registry.add(fakeSocket("c"), { userId: "admin-1", role: "restaurant_admin" });

    expect(registry.stats()).toEqual({ users: 2, connections: 3, admins: 1 });
  });
});
