import { useParams } from "react-router-dom";
import axios from "axios";
import { useSelector } from "react-redux";
import { useState } from "react";

export default function PaymentPage() {
  const { orderId } = useParams();
  const { token } = useSelector((state) => state.auth);
  const [amount, setAmount] = useState("");

  async function handlePayment() {
    try {
      const res = await axios.post(
        "http://localhost:3000/api/payments/charge",
        {
          orderId,
          amount,  // frontend enters total price manually for now
          method: "card",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Payment successful!");
      window.location.href = `/track/${orderId}`;

    } catch (err) {
      console.error("Payment failed", err);
      alert("Payment failed");
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Payment Page</h2>
      <h3>Order ID: {orderId}</h3>

      <input
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <br /><br />

      <button onClick={handlePayment}>Pay Now</button>
    </div>
  );
}