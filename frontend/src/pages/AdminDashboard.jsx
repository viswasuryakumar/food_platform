import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const token = useSelector((state) => state.auth.token);

  async function fetchOrders() {
    try {
      const res = await axios.get(
        "http://localhost:3000/api/orders",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setOrders(res.data);
    } catch (err) {
      console.error("Failed to fetch orders", err);
    }
  }

  async function updateStatus(orderId, status) {
    try {
      await axios.put(
        `http://localhost:3000/api/orders/${orderId}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      fetchOrders();
    } catch (err) {
      console.error("Status update failed", err);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Restaurant Admin Dashboard</h2>

      {orders.map((order) => (
        <div key={order._id} style={{
          border: "1px solid gray",
          margin: "10px",
          padding: "10px"
        }}>
          <p><b>Order ID:</b> {order._id}</p>
          <p><b>Status:</b> {order.status}</p>

          <h4>Items:</h4>
          {order.items.map((item, i) => (
            <div key={i}>
              {item.name} - {item.quantity}
            </div>
          ))}

          <br/>

          <button onClick={() => updateStatus(order._id, "preparing")}>
            Preparing
          </button>

          <button onClick={() => updateStatus(order._id, "on-the-way")}>
            On the way
          </button>

          <button onClick={() => updateStatus(order._id, "delivered")}>
            Delivered
          </button>
        </div>
      ))}
    </div>
  );
}