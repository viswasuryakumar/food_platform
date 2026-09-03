import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import api, { API_BASE } from "../api/axiosInstance";
import {
  ORDER_FLOW,
  STATUS_LABELS,
  canCustomerCancel,
  isTerminal,
  progressIndex,
} from "../lib/orderStatus";

/** Reconnect with exponential backoff, capped, so a flapping server is not hammered. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export default function TrackOrder() {
  const { orderId } = useParams();
  const { token } = useSelector((state) => state.auth);

  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("pending");
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptRef = useRef(0);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await api.get(`/api/orders/${orderId}`);
      setOrder(res.data);
      setStatus(res.data.status || "pending");
    } catch (err) {
      console.error("Failed to fetch order", err);
      setError(err.apiMessage || "Unable to fetch order details.");
    }
  }, [orderId]);

  useEffect(() => {
    if (token) fetchOrder();
  }, [fetchOrder, token]);

  useEffect(() => {
    if (!token) return undefined;

    let disposed = false;

    function connect() {
      /**
       * Connect to /api/notifications, not the gateway root.
       *
       * The previous version opened a socket against the bare gateway URL, which
       * matched no upgrade route — so the connection was refused and live status
       * updates silently never arrived. The token goes in the query string
       * because the browser WebSocket API cannot set request headers.
       */
      const wsUrl = `${API_BASE.replace(/^http/, "ws")}/api/notifications?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setLive(true);
        attemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "order_status" && data.orderId === orderId) {
            setStatus(data.status);
            // Refresh so the audit trail and any derived fields stay accurate.
            fetchOrder();
          }
        } catch {
          // Ignore frames that are not JSON.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setLive(false);

        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
        attemptRef.current += 1;
        reconnectRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectRef.current);
      // 1000 = normal closure, so the server does not treat this as a drop.
      socketRef.current?.close(1000, "Component unmounted");
    };
  }, [orderId, token, fetchOrder]);

  async function cancelOrder() {
    if (!window.confirm("Cancel this order?")) return;

    setCancelling(true);
    setError("");
    try {
      const res = await api.put(`/api/orders/${orderId}/status`, {
        status: "cancelled",
        reason: "Cancelled by customer",
      });
      setStatus(res.data.order.status);
      setOrder(res.data.order);
    } catch (err) {
      setError(err.apiMessage || "Could not cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

  const currentIndex = useMemo(() => progressIndex(status), [status]);
  const cancelled = status === "cancelled";

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Tracking</p>
        <h1 className="title-display mt-2">Order Status</h1>
        <p className="muted mt-2 text-sm">Order ID: {orderId}</p>
      </header>

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

      <div className="surface p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span className="muted text-sm">Current:</span>
          <span className="status-pill">{STATUS_LABELS[status] || status}</span>

          <span
            className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${
              live ? "text-[#4a7c59]" : "text-[#8a7c6d]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${live ? "bg-[#4a7c59]" : "bg-[#c4b8a9]"}`}
              aria-hidden="true"
            />
            {live ? "Live updates on" : "Reconnecting..."}
          </span>
        </div>

        {cancelled ? (
          <div className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] p-4">
            <p className="font-semibold text-[#8a4330]">This order was cancelled.</p>
            {order?.cancelledReason && (
              <p className="muted mt-1 text-sm">Reason: {order.cancelledReason}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            {ORDER_FLOW.map((step, idx) => {
              const reached = idx <= currentIndex;
              return (
                <div
                  key={step}
                  className={`rounded-xl border p-3 text-center text-sm font-semibold transition ${
                    reached
                      ? "border-[#d9b8a9] bg-[#f5e7df] text-[#7f4634]"
                      : "border-[#eadfce] bg-[#fffaf3] text-[#887a6d]"
                  }`}
                >
                  {STATUS_LABELS[step]}
                </div>
              );
            })}
          </div>
        )}

        {canCustomerCancel(status) && (
          <button onClick={cancelOrder} className="btn-danger mt-5" disabled={cancelling}>
            {cancelling ? "Cancelling..." : "Cancel Order"}
          </button>
        )}
      </div>

      {order?.statusHistory?.length > 0 && (
        <div className="surface p-6">
          <h2 className="text-lg font-semibold">Timeline</h2>
          <ol className="mt-4 space-y-2">
            {order.statusHistory.map((event, idx) => (
              <li
                key={`${event.status}-${idx}`}
                className="surface-soft flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium text-[#443b32]">
                  {STATUS_LABELS[event.status] || event.status}
                </span>
                <span className="muted text-xs">
                  {new Date(event.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {order && isTerminal(status) && (
        <p className="muted text-center text-sm">This order is complete.</p>
      )}
    </section>
  );
}
