import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/axiosInstance";
import { useSelector } from "react-redux";

const orderFlow = ["pending", "preparing", "on-the-way", "delivered"];



export default function TrackOrder() {
  const { orderId } = useParams();
  const { token } = useSelector((state) => state.auth);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/api/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setStatus(res.data.status || "pending");
      } catch (err) {
        console.error("Failed to fetch order", err);
        setError("Unable to fetch order details.");
      }
    };

    if (token) {
      fetchOrder();
    }
  }, [orderId, token]);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const wsUrl = baseUrl.replace(/^http/, "ws");
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.orderId === orderId) {
        setStatus(data.status);
      }
    };

    return () => socket.close();
  }, [orderId]);

  const currentIndex = useMemo(() => {
    const index = orderFlow.indexOf(status);
    return index === -1 ? 0 : index;
  }, [status]);

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
        <div className="mb-5 flex items-center gap-2">
          <span className="muted text-sm">Current:</span>
          <span className="status-pill">{status}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {orderFlow.map((step, idx) => {
            const reached = idx <= currentIndex;
            return (
              <div
                key={step}
                className={`rounded-xl border p-3 text-center text-sm font-semibold capitalize transition ${
                  reached
                    ? "border-[#d9b8a9] bg-[#f5e7df] text-[#7f4634]"
                    : "border-[#eadfce] bg-[#fffaf3] text-[#887a6d]"
                }`}
              >
                {step}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
