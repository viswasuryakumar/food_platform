import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

export default function AdminDashboard() {
  const token = useSelector((state) => state.auth.token);

  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);

  // CREATE RESTAURANT STATES
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [menu, setMenu] = useState([]);

  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  // ===========================
  // FETCH DATA
  // ===========================
  async function fetchOrders() {
    try {
      const res = await axios.get(
        "http://localhost:3000/api/orders",
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setOrders(res.data);
    } catch (err) {
      console.error("Fetch orders error:", err);
    }
  }

  async function fetchRestaurants() {
    try {
      const res = await axios.get(
        "http://localhost:3000/api/restaurants"
      );
      setRestaurants(res.data);
    } catch (err) {
      console.error("Fetch restaurants error:", err);
    }
  }

  useEffect(() => {
    fetchOrders();
    fetchRestaurants();
  }, []);

  // ===========================
  // ORDER STATUS UPDATE
  // ===========================
  async function updateStatus(orderId, status) {
    try {
      await axios.put(
        `http://localhost:3000/api/orders/${orderId}/status`,
        { status },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      fetchOrders();
    } catch (err) {
      console.error("Update status error:", err);
    }
  }

  // ===========================
  // MENU HANDLING
  // ===========================
  function addMenuItem() {
    if (!itemName || !itemPrice) return;

    setMenu([
      ...menu,
      { name: itemName, price: Number(itemPrice) }
    ]);

    setItemName("");
    setItemPrice("");
  }

  // ===========================
  // CREATE RESTAURANT
  // ===========================
  async function createRestaurant() {
    try {
      await axios.post(
        "http://localhost:3000/api/restaurants",
        {
          name,
          address,
          cuisine,
          menu
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert("Restaurant created!");

      setName("");
      setAddress("");
      setCuisine("");
      setMenu([]);

      fetchRestaurants();

    } catch (err) {
      console.error("Create restaurant error:", err);
      alert("Failed to create restaurant");
    }
  }

  // ===========================
  // UPDATE RESTAURANT
  // ===========================
  async function updateRestaurant(id) {
    const newName = prompt("Enter new name");

    if (!newName) return;

    try {
      await axios.put(
        `http://localhost:3000/api/restaurants/${id}`,
        { name: newName },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert("Updated!");
      fetchRestaurants();

    } catch (err) {
      console.error(err);
    }
  }

  // ===========================
  // DELETE RESTAURANT
  // ===========================
  async function deleteRestaurant(id) {
    try {
      await axios.delete(
        `http://localhost:3000/api/restaurants/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert("Deleted!");
      fetchRestaurants();

    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>

      {/* ================= CREATE RESTAURANT ================= */}
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
  <div key={i} className="flex items-center gap-2 mt-1">

    <input
      value={m.name}
      onChange={(e) => {
        const updated = [...menu];
        updated[i].name = e.target.value;
        setMenu(updated);
      }}
      className="border p-1"
    />

    <input
      value={m.price}
      onChange={(e) => {
        const updated = [...menu];
        updated[i].price = Number(e.target.value);
        setMenu(updated);
      }}
      className="border p-1 w-20"
    />

    <button
      onClick={() => {
        const updated = menu.filter((_, index) => index !== i);
        setMenu(updated);
      }}
      className="bg-red-500 text-white px-2 rounded"
    >
      Delete
    </button>

  </div>
))}
        </div>

        <button
          onClick={createRestaurant}
          className="mt-3 bg-green-500 text-white px-4 py-2 rounded-md"
        >
          Create Restaurant
        </button>
      </div>

      {/* ================= RESTAURANTS LIST ================= */}
      <h3 className="text-xl font-bold">Restaurants</h3>

      {restaurants.map((rest) => (
        <div key={rest._id} className="bg-white p-4 rounded-xl shadow-md mt-3">
          <p><b>{rest.name}</b></p>
          <p>{rest.address}</p>

          <button
            onClick={() => updateRestaurant(rest._id)}
            className="bg-yellow-500 text-white px-2 py-1 mr-2 rounded"
          >
            Edit
          </button>

          <button
            onClick={() => deleteRestaurant(rest._id)}
            className="bg-red-500 text-white px-2 py-1 rounded"
          >
            Delete
          </button>
        </div>
      ))}

      {/* ================= ORDERS ================= */}
      <h3 className="text-xl font-bold mt-6">Orders</h3>

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