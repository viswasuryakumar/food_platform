import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";

export default function OrderPage() {
  const { restaurantId } = useParams();
  const { token } = useSelector((state) => state.auth);

  const [menu, setMenu] = useState([]);
  const [items, setItems] = useState([]);

  // Fetch menu from backend
  useEffect(() => {
    async function fetchMenu() {
      try {
        const res = await axios.get(
          `http://localhost:3000/api/restaurants/${restaurantId}`
        );
        setMenu(res.data.menu);
      } catch (err) {
        console.error("Error fetching menu", err);
      }
    }

    fetchMenu();
  }, [restaurantId]);

  // Add item to order
  function addItem(item) {
    const existing = items.find((i) => i.name === item.name);

    if (existing) {
      setItems(
        items.map((i) =>
          i.name === item.name
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      );
    } else {
      setItems([...items, { ...item, quantity: 1 }]);
    }
  }

  // Place order
  async function placeOrder() {
    try {
      const res = await axios.post(
        "http://localhost:3000/api/orders",
        {
          restaurantId,
          items,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Order placed successfully!");

      window.location.href = `/payment/${res.data.order._id}`;
    } catch (err) {
      console.error("Order failed", err);
      alert("Order failed");
    }
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h2 className="text-2xl font-bold mb-4">Menu</h2>

      {/* MENU LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {menu.map((item, index) => (
          <div
            key={index}
            className="bg-white p-4 rounded-xl shadow-md"
          >
            <h3 className="text-lg font-semibold">{item.name}</h3>
            <p>${item.price}</p>

            <button
              onClick={() => addItem(item)}
              className="mt-2 bg-blue-500 text-white px-3 py-1 rounded-md"
            >
              Add
            </button>
          </div>
        ))}
      </div>

      {/* ORDER SUMMARY */}
      <h3 className="mt-6 text-xl font-bold">Your Order</h3>

      {items.length === 0 ? (
        <p>No items added</p>
      ) : (
        items.map((item, index) => (
          <div key={index}>
            {item.name} - {item.quantity}
          </div>
        ))
      )}

      {/* PLACE ORDER BUTTON */}
      <button
        onClick={placeOrder}
        className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md"
      >
        Place Order
      </button>
    </div>
  );
}