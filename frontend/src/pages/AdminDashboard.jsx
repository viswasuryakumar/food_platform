import { useEffect, useState } from "react";
import api from "../api/axiosInstance";
import { useSelector } from "react-redux";


export default function AdminDashboard() {
  const token = useSelector((state) => state.auth.token);

  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [menu, setMenu] = useState([]);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  async function fetchOrders() {
    try {
      const res = await api.get("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data || []);
    } catch (err) {
      console.error("Fetch orders error:", err);
    }
  }

  async function fetchRestaurants() {
    try {
      const res = await api.get("/api/restaurants");
      setRestaurants(res.data || []);
    } catch (err) {
      console.error("Fetch restaurants error:", err);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapDashboard() {
      try {
        const [ordersRes, restaurantsRes] = await Promise.all([
          api.get("/api/orders", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get("/api/restaurants"),
        ]);

        if (cancelled) return;
        setOrders(ordersRes.data || []);
        setRestaurants(restaurantsRes.data || []);
      } catch (err) {
        console.error("Dashboard bootstrap error:", err);
      }
    }

    bootstrapDashboard();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function updateStatus(orderId, status) {
    try {
      await api.put(
        `/api/orders/${orderId}/status`,
        { status },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      fetchOrders();
    } catch (err) {
      console.error("Update status error:", err);
    }
  }

  function addMenuItem() {
    if (!itemName || !itemPrice) return;

    setMenu([...menu, { name: itemName, price: Number(itemPrice) }]);
    setItemName("");
    setItemPrice("");
  }

  async function createRestaurant() {
    try {
      await api.post(
        "/api/restaurants",
        {
          name,
          address,
          cuisine,
          menu,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setName("");
      setAddress("");
      setCuisine("");
      setMenu([]);
      fetchRestaurants();
    } catch (err) {
      console.error("Create restaurant error:", err);
      alert("Failed to create restaurant.");
    }
  }

  async function updateRestaurant(id) {
    const newName = prompt("Enter new name");
    if (!newName) return;

    try {
      await api.put(
        `/api/restaurants/${id}`,
        { name: newName },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      fetchRestaurants();
    } catch (err) {
      console.error("Update restaurant error:", err);
    }
  }

  async function deleteRestaurant(id) {
    try {
      await api.delete(`/api/restaurants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchRestaurants();
    } catch (err) {
      console.error("Delete restaurant error:", err);
    }
  }

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Admin</p>
        <h1 className="title-display mt-2">Control Center</h1>
        <p className="muted mt-2 text-sm">
          Manage restaurants and keep order statuses updated for customers.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="surface p-6">
          <h2 className="text-xl font-semibold">Create Restaurant</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Restaurant name"
              className="input-field sm:col-span-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              placeholder="Address"
              className="input-field sm:col-span-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <input
              placeholder="Cuisine"
              className="input-field sm:col-span-2"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
            />
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#6f6356]">Menu Items</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                placeholder="Item name"
                className="input-field min-w-[160px] flex-1"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
              <input
                placeholder="Price"
                type="number"
                className="input-field w-28"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
              />
              <button onClick={addMenuItem} className="btn-soft">
                Add
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {menu.map((m, i) => (
                <div key={i} className="surface-soft flex items-center gap-2 p-2.5">
                  <input
                    value={m.name}
                    onChange={(e) => {
                      const updated = [...menu];
                      updated[i].name = e.target.value;
                      setMenu(updated);
                    }}
                    className="input-field"
                  />
                  <input
                    value={m.price}
                    type="number"
                    onChange={(e) => {
                      const updated = [...menu];
                      updated[i].price = Number(e.target.value);
                      setMenu(updated);
                    }}
                    className="input-field w-28"
                  />
                  <button
                    onClick={() => setMenu(menu.filter((_, index) => index !== i))}
                    className="btn-danger"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={createRestaurant} className="btn-primary mt-5 w-full">
            Create Restaurant
          </button>
        </section>

        <section className="space-y-6">
          <div className="surface p-6">
            <h2 className="text-xl font-semibold">Restaurants</h2>
            <div className="mt-4 space-y-3">
              {restaurants.map((rest) => (
                <article key={rest._id} className="surface-soft p-3">
                  <p className="font-semibold text-[#2f2922]">{rest.name}</p>
                  <p className="muted text-sm">{rest.address}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => updateRestaurant(rest._id)} className="btn-soft">
                      Edit
                    </button>
                    <button onClick={() => deleteRestaurant(rest._id)} className="btn-danger">
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {restaurants.length === 0 && <p className="muted text-sm">No restaurants yet.</p>}
            </div>
          </div>

          <div className="surface p-6">
            <h2 className="text-xl font-semibold">Orders</h2>
            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <article key={order._id} className="surface-soft p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#75695d]">#{order._id}</p>
                    <span className="status-pill">{order.status}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-[#4a4036]">
                    {order.items.map((item, i) => (
                      <p key={i}>
                        {item.name} x {item.quantity}
                      </p>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateStatus(order._id, "preparing")} className="btn-soft">
                      Preparing
                    </button>
                    <button onClick={() => updateStatus(order._id, "on-the-way")} className="btn-soft">
                      On the way
                    </button>
                    <button onClick={() => updateStatus(order._id, "delivered")} className="btn-primary">
                      Delivered
                    </button>
                  </div>
                </article>
              ))}
              {orders.length === 0 && <p className="muted text-sm">No orders yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
