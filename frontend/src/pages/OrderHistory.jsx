import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axiosInstance";
import { useSelector } from "react-redux";
import { STATUS_LABELS } from "../lib/orderStatus";

export default function OrderHistory() {
  const { token } = useSelector((state) => state.auth);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      setError("");
      try {
        // The endpoint now returns a paginated envelope rather than a bare array.
        const res = await api.get("/api/orders/history");
        setOrders(res.data?.orders || []);
      } catch (err) {
        console.error("Failed to fetch order history:", err);
        setError(err.apiMessage || "Could not fetch order history.");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [token]);

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">History</p>
        <h1 className="title-display mt-2">Your Orders</h1>
        <p className="muted mt-2 text-sm">See previous and active orders in one place.</p>
      </header>

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="surface h-28 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-lg font-semibold">No orders yet</p>
          <p className="muted mt-1 text-sm">Place your first order from the Restaurants page.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order._id} className="surface p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[#8a7c6d]">Order ID</p>
                  <p className="text-sm font-semibold text-[#3d352d]">{order._id}</p>
                </div>
                <span className="status-pill">{STATUS_LABELS[order.status] || order.status}</span>
              </div>

              <div className="mt-4 grid gap-2">
                {order.items.map((item, i) => (
                  <div key={i} className="surface-soft flex items-center justify-between px-3 py-2">
                    <p className="text-sm text-[#443b32]">
                      {item.name} x {item.quantity}
                    </p>
                    <p className="text-sm font-semibold">
                      ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eadfce] pt-3">
                <p className="text-sm">
                  <span className="muted">Total </span>
                  <span className="font-semibold text-[#2e2721]">
                    ${Number(order.totalPrice).toFixed(2)}
                  </span>
                </p>
                <Link to={`/track/${order._id}`} className="btn-soft">
                  Track order
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
