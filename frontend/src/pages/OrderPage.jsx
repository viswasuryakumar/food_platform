import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";

export default function OrderPage() {
  const { restaurantId } = useParams();
  const { token } = useSelector((state) => state.auth);

  const [menu, setMenu] = useState([]);
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function fetchMenu() {
      const res = await axios.get(
        `http://localhost:3000/api/restaurants/${restaurantId}`
      );
      setMenu(res.data.menu);
    }

    fetchMenu();
  }, [restaurantId]);

  // ADD ITEM
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

  // INCREASE
  function increase(item) {
    setItems(
      items.map((i) =>
        i.name === item.name
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
    );
  }

  // DECREASE
  function decrease(item) {
    const updated = items
      .map((i) =>
        i.name === item.name
          ? { ...i, quantity: i.quantity - 1 }
          : i
      )
      .filter((i) => i.quantity > 0);

    setItems(updated);
  }

  async function placeOrder() {
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

    window.location.href = `/payment/${res.data.order._id}`;
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h2 className="text-2xl font-bold mb-4">Menu</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {menu.map((item, index) => (
          <div key={index} className="bg-white p-4 rounded-xl shadow-md">
            <h3>{item.name}</h3>
            <p>${item.price}</p>

            <button
              onClick={() => addItem(item)}
              className="mt-2 bg-blue-500 text-white px-3 py-1 rounded"
            >
              Add
            </button>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-xl font-bold">Your Order</h3>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-3 mt-2">

          <span>{item.name}</span>

          <button
            onClick={() => decrease(item)}
            className="bg-red-400 px-2 rounded"
          >
            -
          </button>

          <span>{item.quantity}</span>

          <button
            onClick={() => increase(item)}
            className="bg-green-400 px-2 rounded"
          >
            +
          </button>

        </div>
      ))}

      <button
        onClick={placeOrder}
        className="mt-4 bg-green-500 text-white px-4 py-2 rounded"
      >
        Place Order
      </button>
    </div>
  );
}