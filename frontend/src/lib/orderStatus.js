/**
 * Client-side mirror of the order state machine in order-service.
 *
 * This exists so the UI can present only the transitions that will actually be
 * accepted, rather than offering buttons that fail on click. The server remains
 * the authority — this is a usability layer, never a security control.
 */

export const ORDER_FLOW = ["pending", "paid", "preparing", "on-the-way", "delivered"];

export const TRANSITIONS = {
  pending: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["on-the-way", "cancelled"],
  "on-the-way": ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Transitions a restaurant admin is allowed to trigger from the dashboard. */
export const ADMIN_ACTIONS = {
  paid: ["preparing"],
  preparing: ["on-the-way"],
  "on-the-way": ["delivered"],
};

export const STATUS_LABELS = {
  pending: "Awaiting payment",
  paid: "Paid",
  preparing: "Preparing",
  "on-the-way": "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function adminActionsFor(status) {
  return ADMIN_ACTIONS[status] || [];
}

export function canCustomerCancel(status) {
  return (TRANSITIONS[status] || []).includes("cancelled");
}

export function isTerminal(status) {
  return (TRANSITIONS[status] || []).length === 0;
}

/** Index into ORDER_FLOW for progress display; cancelled sits outside the flow. */
export function progressIndex(status) {
  const index = ORDER_FLOW.indexOf(status);
  return index === -1 ? 0 : index;
}
