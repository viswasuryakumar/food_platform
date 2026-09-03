const {
  ORDER_STATUSES,
  checkTransition,
  canTransition,
  isTerminal,
  nextStatuses,
} = require("../lib/orderStatus");

describe("order status state machine", () => {
  describe("happy path", () => {
    it("allows the full lifecycle in order", () => {
      expect(canTransition("pending", "paid")).toBe(true);
      expect(canTransition("paid", "preparing")).toBe(true);
      expect(canTransition("preparing", "on-the-way")).toBe(true);
      expect(canTransition("on-the-way", "delivered")).toBe(true);
    });

    it("allows cancellation up until the food is out for delivery", () => {
      expect(canTransition("pending", "cancelled")).toBe(true);
      expect(canTransition("paid", "cancelled")).toBe(true);
      expect(canTransition("preparing", "cancelled")).toBe(true);
    });
  });

  describe("illegal transitions", () => {
    it("refuses to move backwards through the lifecycle", () => {
      expect(canTransition("delivered", "pending")).toBe(false);
      expect(canTransition("on-the-way", "preparing")).toBe(false);
      expect(canTransition("preparing", "paid")).toBe(false);
    });

    it("refuses to skip payment", () => {
      expect(canTransition("pending", "preparing")).toBe(false);
      expect(canTransition("pending", "delivered")).toBe(false);
    });

    it("refuses to cancel an order already on the way or delivered", () => {
      expect(canTransition("on-the-way", "cancelled")).toBe(false);
      expect(canTransition("delivered", "cancelled")).toBe(false);
    });

    it("treats delivered and cancelled as terminal", () => {
      expect(isTerminal("delivered")).toBe(true);
      expect(isTerminal("cancelled")).toBe(true);
      expect(nextStatuses("delivered")).toEqual([]);
      expect(nextStatuses("cancelled")).toEqual([]);
    });
  });

  describe("checkTransition error codes", () => {
    it("rejects an unknown status", () => {
      const result = checkTransition("pending", "teleported", "restaurant_admin");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INVALID_STATUS");
    });

    it("rejects a no-op transition", () => {
      const result = checkTransition("preparing", "preparing", "restaurant_admin");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("NO_OP");
    });

    it("reports terminal state separately from an illegal transition", () => {
      const result = checkTransition("delivered", "preparing", "restaurant_admin");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("TERMINAL_STATE");
    });

    it("rejects an illegal forward jump", () => {
      const result = checkTransition("pending", "delivered", "restaurant_admin");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("ILLEGAL_TRANSITION");
    });
  });

  describe("role enforcement", () => {
    it("does not let a customer mark their own order paid", () => {
      const result = checkTransition("pending", "paid", "user");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("FORBIDDEN_TRANSITION");
    });

    it("does not let a customer start preparing food", () => {
      const result = checkTransition("paid", "preparing", "user");
      expect(result.ok).toBe(false);
      expect(result.code).toBe("FORBIDDEN_TRANSITION");
    });

    it("lets a customer cancel", () => {
      expect(checkTransition("pending", "cancelled", "user").ok).toBe(true);
    });

    it("lets an admin advance the kitchen states", () => {
      expect(checkTransition("paid", "preparing", "restaurant_admin").ok).toBe(true);
      expect(checkTransition("preparing", "on-the-way", "restaurant_admin").ok).toBe(true);
    });

    it("reserves the paid transition for the payment system", () => {
      expect(checkTransition("pending", "paid", "system").ok).toBe(true);
      expect(checkTransition("pending", "paid", "restaurant_admin").ok).toBe(false);
    });
  });

  it("every status is reachable from the declared transition table", () => {
    const reachable = new Set(["pending"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const status of [...reachable]) {
        for (const next of nextStatuses(status)) {
          if (!reachable.has(next)) {
            reachable.add(next);
            changed = true;
          }
        }
      }
    }
    expect([...reachable].sort()).toEqual([...ORDER_STATUSES].sort());
  });
});
