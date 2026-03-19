import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import api from "../api/axiosInstance";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function OrderPage() {
  const { restaurantId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useSelector((state) => state.auth);

  const [restaurant, setRestaurant] = useState(null);
  const [items, setItems] = useState([]);
  const [draftNotice, setDraftNotice] = useState("");
  const [draftApplied, setDraftApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchRestaurant() {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/api/restaurants/${restaurantId}`);
        setRestaurant(res.data);
      } catch (err) {
        console.error("Failed to fetch menu:", err);
        setError("Could not load this restaurant menu.");
      } finally {
        setLoading(false);
      }
    }

    fetchRestaurant();
  }, [restaurantId]);

  const menu = restaurant?.menu || [];
  const draftItems = useMemo(
    () =>
      Array.isArray(location.state?.draftItems)
        ? location.state.draftItems.filter((item) => item?.name)
        : [],
    [location.state]
  );

  useEffect(() => {
    setDraftApplied(false);
    setDraftNotice("");
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurant || draftApplied) return;
    if (!draftItems.length) {
      setDraftApplied(true);
      return;
    }

    const menuByName = new Map(
      (restaurant.menu || []).map((item) => [normalizeName(item.name), item])
    );

    const hydrated = [];
    const missing = [];

    for (const draftItem of draftItems) {
      const matchedItem = menuByName.get(normalizeName(draftItem.name));
      if (!matchedItem) {
        missing.push(draftItem.name);
        continue;
      }

      hydrated.push({
        ...matchedItem,
        quantity: Math.max(1, Number(draftItem.quantity) || 1),
      });
    }

    if (hydrated.length > 0) {
      setItems(hydrated);
      setDraftNotice(
        missing.length
          ? `Assistant draft loaded. Skipped unavailable items: ${missing.join(", ")}.`
          : "Assistant draft loaded into your cart."
      );
    } else {
      setDraftNotice("Couldn't map the assistant draft to this menu. Please add items manually.");
    }

    setDraftApplied(true);
  }, [restaurant, draftItems, draftApplied]);

  function addItem(item) {
    const existing = items.find((i) => i.name === item.name);
    if (existing) {
      setItems(items.map((i) => (i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i)));
      return;
    }
    setItems([...items, { ...item, quantity: 1 }]);
  }

  function increase(item) {
    setItems(items.map((i) => (i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i)));
  }

  function decrease(item) {
    setItems(
      items
        .map((i) => (i.name === item.name ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0),
    [items]
  );

  async function placeOrder() {
    if (!token) {
      alert("Please log in first.");
      navigate("/login");
      return;
    }

    if (items.length === 0) {
      alert("Add at least one item to place an order.");
      return;
    }

    try {
      const res = await api.post(
        "/api/orders",
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

      navigate(`/payment/${res.data.order._id}`);
    } catch (err) {
      console.error("Order failed:", err);
      alert("Unable to place order right now.");
    }
  }

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Order</p>
        <h1 className="title-display mt-2">{restaurant?.name || "Menu"}</h1>
        <p className="muted mt-2 text-sm">{restaurant?.address || "Pick items and place your order."}</p>
      </header>

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

      {draftNotice && (
        <p className="rounded-xl border border-[#e4d6c6] bg-[#f8efe5] px-4 py-3 text-sm text-[#5f5143]">
          {draftNotice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="surface p-5 md:p-6">
          <h2 className="mb-4 text-xl font-semibold">Menu Items</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-[#ecdfd1] bg-[#f6eee4]" />
              ))}
            </div>
          ) : menu.length === 0 ? (
            <p className="muted text-sm">No menu items available.</p>
          ) : (
            <div className="space-y-3">
              {menu.map((item, index) => (
                <article
                  key={`${item.name}-${index}`}
                  className="surface-soft flex items-center justify-between p-4"
                >
                  <div>
                    <h3 className="font-semibold text-[#342d26]">{item.name}</h3>
                    <p className="muted text-sm">${Number(item.price).toFixed(2)}</p>
                  </div>
                  <button onClick={() => addItem(item)} className="btn-soft">
                    Add
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="surface h-fit p-5 md:p-6">
          <h2 className="text-xl font-semibold">Your Order</h2>
          {items.length === 0 ? (
            <p className="muted mt-3 text-sm">Your cart is empty.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="surface-soft p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[#352f28]">{item.name}</p>
                    <p className="text-sm font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => decrease(item)} className="btn-soft h-8 w-8 px-0">
                      -
                    </button>
                    <span className="text-sm font-semibold">{item.quantity}</span>
                    <button onClick={() => increase(item)} className="btn-soft h-8 w-8 px-0">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-[#eadfce] pt-4">
            <p className="flex items-center justify-between text-sm">
              <span className="muted">Total</span>
              <span className="text-lg font-semibold text-[#2e2721]">${total.toFixed(2)}</span>
            </p>
            <button
              onClick={placeOrder}
              className="btn-primary mt-4 w-full"
              disabled={items.length === 0}
            >
              Place Order
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
