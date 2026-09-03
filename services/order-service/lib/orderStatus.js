/**
 * Order lifecycle state machine.
 *
 * Kept as a pure module (no Mongoose, no Express, no I/O) so the business rules
 * can be unit tested in isolation and reused by any caller that needs to reason
 * about order state.
 */

const ORDER_STATUSES = Object.freeze([
  "pending",
  "paid",
  "preparing",
  "on-the-way",
  "delivered",
  "cancelled",
]);

/**
 * Allowed forward transitions. Anything not listed here is rejected, which
 * prevents nonsense like `delivered -> pending` or skipping payment entirely.
 */
const TRANSITIONS = Object.freeze({
  pending: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["on-the-way", "cancelled"],
  "on-the-way": ["delivered"],
  delivered: [],
  cancelled: [],
});

/** States from which an order can never move again. */
const TERMINAL_STATUSES = Object.freeze(
  ORDER_STATUSES.filter((status) => TRANSITIONS[status].length === 0)
);

/** Roles permitted to move an order into a given status. */
const TRANSITION_ROLES = Object.freeze({
  paid: ["system"],
  preparing: ["restaurant_admin"],
  "on-the-way": ["restaurant_admin"],
  delivered: ["restaurant_admin"],
  cancelled: ["user", "restaurant_admin"],
});

function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

function nextStatuses(status) {
  return TRANSITIONS[status] ? [...TRANSITIONS[status]] : [];
}

function canTransition(from, to) {
  if (!isValidStatus(from) || !isValidStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

function canRoleSet(role, to) {
  const allowed = TRANSITION_ROLES[to];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Validates a requested transition and returns a structured result rather than
 * throwing, so callers can map failures onto the right HTTP status code.
 *
 * @returns {{ok: true} | {ok: false, code: string, message: string}}
 */
function checkTransition(from, to, role) {
  if (!isValidStatus(to)) {
    return {
      ok: false,
      code: "INVALID_STATUS",
      message: `Unknown status "${to}". Valid statuses: ${ORDER_STATUSES.join(", ")}.`,
    };
  }

  if (from === to) {
    return {
      ok: false,
      code: "NO_OP",
      message: `Order is already "${from}".`,
    };
  }

  if (isTerminal(from)) {
    return {
      ok: false,
      code: "TERMINAL_STATE",
      message: `Order is "${from}", which is final and cannot be changed.`,
    };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `Cannot move an order from "${from}" to "${to}". Allowed next: ${
        nextStatuses(from).join(", ") || "none"
      }.`,
    };
  }

  if (role && !canRoleSet(role, to)) {
    return {
      ok: false,
      code: "FORBIDDEN_TRANSITION",
      message: `Role "${role}" is not permitted to set status "${to}".`,
    };
  }

  return { ok: true };
}

module.exports = {
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  TRANSITION_ROLES,
  isValidStatus,
  isTerminal,
  nextStatuses,
  canTransition,
  canRoleSet,
  checkTransition,
};
