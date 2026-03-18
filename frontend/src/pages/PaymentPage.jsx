import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useSelector } from "react-redux";

export default function PaymentPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { token } = useSelector((state) => state.auth);

  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState("card");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`http://localhost:3000/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOrder(res.data);
      } catch (err) {
        console.error("Failed to fetch order:", err);
        setError("Unable to load this order.");
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderId, token]);

  async function handlePayment() {
    if (!order) return;

    try {
      await axios.post(
        "http://localhost:3000/api/payments/charge",
        {
          orderId,
          amount: order.totalPrice,
          method,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      navigate(`/track/${orderId}`);
    } catch (err) {
      console.error("Payment failed:", err);
      alert("Payment failed. Please try again.");
    }
  }

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Checkout</p>
        <h1 className="title-display mt-2">Payment</h1>
        <p className="muted mt-2 text-sm">Review your order and complete payment securely.</p>
      </header>

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="surface h-64 animate-pulse" />
      ) : !order ? (
        <div className="surface p-6">
          <p className="muted">Order not found.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="surface p-5 md:p-6">
            <h2 className="text-xl font-semibold">Order Summary</h2>
            <div className="mt-4 space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="surface-soft flex items-center justify-between p-3">
                  <p className="text-sm font-medium text-[#352f28]">
                    {item.name} x {item.quantity}
                  </p>
                  <p className="text-sm font-semibold">
                    ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside className="surface h-fit p-5 md:p-6">
            <h2 className="text-xl font-semibold">Pay</h2>
            <p className="muted mt-1 text-sm">Choose payment method and confirm.</p>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Method</label>
              <select
                className="input-field"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="card">Credit / Debit Card</option>
                <option value="upi">UPI</option>
                <option value="netbanking">Net Banking</option>
              </select>
            </div>

            <div className="mt-5 border-t border-[#eadfce] pt-4">
              <p className="flex items-center justify-between text-sm">
                <span className="muted">Total</span>
                <span className="text-lg font-semibold text-[#2e2721]">
                  ${Number(order.totalPrice).toFixed(2)}
                </span>
              </p>
              <button onClick={handlePayment} className="btn-primary mt-4 w-full">
                Confirm Payment
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
