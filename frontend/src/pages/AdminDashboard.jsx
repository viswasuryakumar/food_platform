import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

export default function AdminDashboard() {
  const token = useSelector((state) => state.auth.token);

  const [orders, setOrders] = useState([]);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [menu, setMenu] = useState([]);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  async function fetchOrders() {
    try {
      const res = await axios.get(
        "http://localhost:3000/api/orders",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setOrders(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function updateStatus(orderId, status) {
    try {
      await axios.put(
        `http://localhost:3000/api/orders/${orderId}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchOrders();
    } catch (err) {
      console.error(err);
    }
  }

  function addMenuItem() {
    setMenu([...menu, { name: itemName, price: Number(itemPrice) }]);
    setItemName("");
    setItemPrice("");
  }

  async function createRestaurant() {
    try {
      await axios.post(
        "http://localhost:3000/api/restaurants",
        {
          name,
          address,
          cuisine,
          menu,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Restaurant created!");

      setName("");
      setAddress("");
      setCuisine("");
      setMenu([]);

    } catch (err) {
      console.error(err);
      alert("Failed to create restaurant");
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>

      {/* CREATE RESTAURANT */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6">
        <h3 className="font-bold mb-2">Create Restaurant</h3>

        <input
          placeholder="Name"
          className="border p-2 mr-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          placeholder="Address"
          className="border p-2 mr-2"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <input
          placeholder="Cuisine"
          className="border p-2 mr-2"
          value={cuisine}
          onChange={(e) => setCuisine(e.target.value)}
        />

        <br /><br />

        {/* ADD MENU ITEMS */}
        <h4 className="font-semibold">Add Menu Item</h4>

        <input
          placeholder="Item Name"
          className="border p-2 mr-2"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
        />

        <input
          placeholder="Price"
          className="border p-2 mr-2"
          value={itemPrice}
          onChange={(e) => setItemPrice(e.target.value)}
        />

        <button
          onClick={addMenuItem}
          className="bg-blue-500 text-white px-3 py-1 rounded-md"
        >
          Add Item
        </button>

        <div className="mt-2">
          {menu.map((m, i) => (
            <div key={i}>{m.name} - ${m.price}</div>
          ))}
        </div>

        <button
          onClick={createRestaurant}
          className="mt-3 bg-green-500 text-white px-4 py-2 rounded-md"
        >
          Create Restaurant
        </button>
      </div>

      {/* ORDERS SECTION */}
      <h3 className="text-xl font-bold">Orders</h3>

      {orders.map((order) => (
        <div key={order._id} className="bg-white p-4 rounded-xl shadow-md mt-3">

          <p><b>ID:</b> {order._id}</p>
          <p><b>Status:</b> {order.status}</p>

          {order.items.map((item, i) => (
            <div key={i}>
              {item.name} x {item.quantity}
            </div>
          ))}

          <div className="mt-2">
            <button
              onClick={() => updateStatus(order._id, "preparing")}
              className="bg-yellow-500 text-white px-2 py-1 mr-2 rounded"
            >
              Preparing
            </button>

            <button
              onClick={() => updateStatus(order._id, "on-the-way")}
              className="bg-blue-500 text-white px-2 py-1 mr-2 rounded"
            >
              On the way
            </button>

            <button
              onClick={() => updateStatus(order._id, "delivered")}
              className="bg-green-500 text-white px-2 py-1 rounded"
            >
              Delivered
            </button>
          </div>

        </div>
      ))}

    </div>
  );
}