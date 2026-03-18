import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

export default function OrderHistory() {
  const { token } = useSelector((state) => state.auth);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await axios.get(
          "http://localhost:3000/api/orders/history",
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        setOrders(res.data);
      } catch (err) {
        console.error(err);
      }
    }

    fetchOrders();
  }, [token]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-4">Order History</h2>

      {orders.length === 0 ? (
        <p>No orders yet</p>
      ) : (
        orders.map((order) => (
          <div key={order._id} className="bg-white p-4 rounded-xl shadow-md mb-3">

            <p><b>ID:</b> {order._id}</p>
            <p><b>Status:</b> {order.status}</p>

            {order.items.map((item, i) => (
              <div key={i}>
                {item.name} x {item.quantity}
              </div>
            ))}

          </div>
        ))
      )}

    </div>
  );
}