import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { useSelector } from "react-redux";

export default function PaymentPage() {
  const { orderId } = useParams();
  const { token } = useSelector((state) => state.auth);

  const [order, setOrder] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [method, setMethod] = useState("card");

  // Fetch order details
  useEffect(() => {
    async function fetchOrder() {
      const res = await axios.get(
        `http://localhost:3000/api/orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setOrder(res.data);
    }

    fetchOrder();
  }, [orderId, token]);

  async function handlePayment() {
    try {
      await axios.post(
        "http://localhost:3000/api/payments/charge",
        {
          orderId,
          amount: order.totalPrice,
          method
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert("Payment successful!");
      window.location.href = `/track/${orderId}`;

    } catch (err) {
      console.error(err);
      alert("Payment failed");
    }
  }

  if (!order) return <p>Loading...</p>;

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-4">Payment</h2>

      {/* ORDER SUMMARY */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-4">
        <h3 className="font-bold">Order Summary</h3>

        {order.items.map((item, i) => (
          <div key={i}>
            {item.name} x {item.quantity}
          </div>
        ))}

        <p className="mt-3 text-lg font-semibold">
          Total: ${order.totalPrice}
        </p>
      </div>

      {/* PAY BUTTON */}
      <button
        onClick={() => setShowPopup(true)}
        className="bg-green-500 text-white px-4 py-2 rounded-md"
      >
        Pay ${order.totalPrice}
      </button>

      {/* PAYMENT POPUP */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">

          <div className="bg-white p-6 rounded-xl w-80">

            <h3 className="font-bold mb-3">Select Payment Method</h3>

            <select
              className="border p-2 w-full mb-3"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="card">Credit / Debit Card</option>
              <option value="upi">UPI</option>
              <option value="netbanking">Net Banking</option>
            </select>

            <button
              onClick={handlePayment}
              className="bg-blue-500 text-white px-3 py-2 rounded w-full"
            >
              Confirm Payment
            </button>

            <button
              onClick={() => setShowPopup(false)}
              className="mt-2 text-red-500"
            >
              Cancel
            </button>

          </div>
        </div>
      )}

    </div>
  );
}