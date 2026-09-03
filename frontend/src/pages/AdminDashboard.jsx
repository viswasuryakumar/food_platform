import { useCallback, useEffect, useState } from "react";
import api from "../api/axiosInstance";
import { adminActionsFor, STATUS_LABELS } from "../lib/orderStatus";

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [menu, setMenu] = useState([]);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get("/api/orders");
      setOrders(res.data?.orders || []);
    } catch (err) {
      console.error("Fetch orders error:", err);
      setError(err.apiMessage || "Could not load orders.");
    }
  }, []);

  /** Only the restaurants this admin owns — not every restaurant on the platform. */
  const fetchRestaurants = useCallback(async () => {
    try {
      const res = await api.get("/api/restaurants/mine/list");
      setRestaurants(res.data?.restaurants || []);
    } catch (err) {
      console.error("Fetch restaurants error:", err);
      setError(err.apiMessage || "Could not load your restaurants.");
    }
  }, []);

  useEffect(() => {
    // Data fetching on mount. The lint rule guards against synchronous
    // setState cascades; these are async and settle after their await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
    fetchRestaurants();
  }, [fetchOrders, fetchRestaurants]);

  async function updateStatus(orderId, status) {
    setError("");
    try {
      await api.put(`/api/orders/${orderId}/status`, { status });
      fetchOrders();
    } catch (err) {
      console.error("Update status error:", err);
      setError(err.apiMessage || "Could not update that order.");
    }
  }

  function addMenuItem() {
    if (!itemName || !itemPrice) return;

    setMenu([...menu, { name: itemName, price: Number(itemPrice) }]);
    setItemName("");
    setItemPrice("");
  }

  async function createRestaurant() {
    setError("");
    try {
      await api.post("/api/restaurants", { name, address, cuisine, menu });

      setName("");
      setAddress("");
      setCuisine("");
      setMenu([]);
      fetchRestaurants();
    } catch (err) {
      console.error("Create restaurant error:", err);
      setError(err.apiMessage || "Failed to create restaurant.");
    }
  }

  async function updateRestaurant(id) {
    const newName = window.prompt("Enter new name");
    if (!newName) return;

    setError("");
    try {
      await api.put(`/api/restaurants/${id}`, { name: newName });
      fetchRestaurants();
    } catch (err) {
      console.error("Update restaurant error:", err);
      setError(err.apiMessage || "Could not update that restaurant.");
    }
  }

  async function deleteRestaurant(id) {
    if (!window.confirm("Delete this restaurant and its menu?")) return;

    setError("");
    try {
      await api.delete(`/api/restaurants/${id}`);
      fetchRestaurants();
    } catch (err) {
      console.error("Delete restaurant error:", err);
      setError(err.apiMessage || "Could not delete that restaurant.");
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

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

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
              {orders.map((order) => {
                // Only transitions the server will accept from this state are
                // offered, so the dashboard cannot present a button that 409s.
                const actions = adminActionsFor(order.status);

                return (
                  <article key={order._id} className="surface-soft p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#75695d]">#{order._id}</p>
                      <span className="status-pill">
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-[#4a4036]">
                      {order.items.map((item, i) => (
                        <p key={i}>
                          {item.name} x {item.quantity}
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#2e2721]">
                      ${Number(order.totalPrice).toFixed(2)}
                    </p>

                    {actions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.map((next) => (
                          <button
                            key={next}
                            onClick={() => updateStatus(order._id, next)}
                            className={next === "delivered" ? "btn-primary" : "btn-soft"}
                          >
                            Mark {STATUS_LABELS[next]}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted mt-3 text-xs">
                        {order.status === "pending"
                          ? "Waiting for the customer to pay."
                          : "No further action available."}
                      </p>
                    )}
                  </article>
                );
              })}
              {orders.length === 0 && <p className="muted text-sm">No orders yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
