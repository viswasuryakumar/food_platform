import { useEffect, useMemo, useState } from "react";
import api from "../api/axiosInstance";
import { useNavigate } from "react-router-dom";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import RestaurantCard from "../components/RestaurantCard";

export default function Restaurants() {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [draftOrder, setDraftOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchRestaurants() {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/api/restaurants");
        setRestaurants(res.data || []);
      } catch (err) {
        console.error("Error fetching restaurants:", err);
        setError("Could not load restaurants right now.");
      } finally {
        setLoading(false);
      }
    }

    fetchRestaurants();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return restaurants;
    return restaurants.filter((rest) => rest.name.toLowerCase().includes(query));
  }, [search, restaurants]);

  const latestAssistantMessage =
    assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1]?.text || ""
      : "";

  function pushAssistantMessages(_userText, assistantText) {
    setAssistantMessages([{ role: "assistant", text: assistantText }]);
  }

  function navigateToDraftOrder(draft) {
    if (!draft?.restaurant?._id || !Array.isArray(draft?.items) || draft.items.length === 0) {
      return;
    }

    navigate(`/order/${draft.restaurant._id}`, {
      state: {
        source: "assistant",
        prompt: draft.prompt,
        draftItems: draft.items,
      },
    });
  }

  async function handleAssistantSubmit(e) {
    e.preventDefault();
    const prompt = assistantPrompt.trim();
    if (!prompt || assistantLoading) return;

    setAssistantLoading(true);
    try {
      const catalog = restaurants.map((restaurant) => ({
        _id: restaurant._id,
        name: restaurant.name,
        menu: (restaurant.menu || []).map((item) => ({
          name: item.name,
          price: Number(item.price) || 0,
        })),
      }));

      const response = await api.post("/api/ai/smart-order", {
        prompt,
        restaurants: catalog,
      });

      const data = response.data || {};
      if (data.mode === "draft" && data.draft) {
        setDraftOrder(data.draft);
        pushAssistantMessages(
          prompt,
          data.assistantText ||
            `Draft ready from ${data.draft.restaurant.name}. Review and place when ready.`
        );
        navigateToDraftOrder(data.draft);
      } else if (data.mode === "clarify") {
        setDraftOrder(null);
        pushAssistantMessages(
          prompt,
          data.clarification || "Please clarify your request with restaurant and menu item names."
        );
      } else {
        setDraftOrder(null);
        pushAssistantMessages(
          prompt,
          "Smart Order AI: I couldn't process that request. Please try again."
        );
      }
    } catch (err) {
      console.error("Smart Order AI request failed:", err);
      setDraftOrder(null);
      const apiMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Smart Order service is unavailable right now.";
      pushAssistantMessages(prompt, `Smart Order AI: ${apiMessage}`);
    } finally {
      setAssistantPrompt("");
      setAssistantLoading(false);
    }
  }

  function openDraftOrder() {
    if (!draftOrder) return;
    navigateToDraftOrder(draftOrder);
  }

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Browse</p>
        <h1 className="title-display mt-2">Restaurants</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Discover available kitchens and start an order in a few clicks.
        </p>

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-[#554a3f]">
            {assistantEnabled ? "Describe your order" : "Search restaurants"}
          </label>

          {assistantEnabled ? (
            <form onSubmit={handleAssistantSubmit}>
              <div className="relative w-full max-w-2xl">
                <button
                  type="button"
                  className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    assistantEnabled
                      ? "border-[#c06749] bg-[#f9e2d8] text-[#8a4330]"
                      : "border-[#dccfbe] bg-[#f7f1e8] text-[#75685c]"
                  }`}
                  onClick={() => setAssistantEnabled((state) => !state)}
                >
                  Smart Order
                </button>
                <input
                  type="text"
                  placeholder="Example: 2 Masala Dosa and 1 Filter Coffee from Campus Bites"
                  className="input-field pl-32 pr-12"
                  value={assistantPrompt}
                  onChange={(e) => setAssistantPrompt(e.target.value)}
                  disabled={assistantLoading}
                />
                {assistantPrompt.trim() && (
                  <button
                    type="submit"
                    aria-label="Send order prompt"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-[#c06749] bg-[#c06749] px-2.5 py-1 text-sm font-semibold text-white transition hover:bg-[#a9553e] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={assistantLoading}
                  >
                    ↑
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="relative max-w-xl">
              <button
                type="button"
                className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  assistantEnabled
                    ? "border-[#c06749] bg-[#f9e2d8] text-[#8a4330]"
                    : "border-[#dccfbe] bg-[#f7f1e8] text-[#75685c]"
                }`}
                onClick={() => setAssistantEnabled((state) => !state)}
              >
                Smart Order
              </button>
              <input
                type="text"
                placeholder="Type a restaurant name..."
                className="input-field pl-32"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
      </header>

      {assistantEnabled && (
        assistantLoading ? (
          <section className="surface p-5 md:p-6">
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[#e8dccf] bg-[#fffaf4] p-4">
              <DotLottieReact
                src="/Cooking.lottie"
                autoplay
                loop
                className="h-36 w-36 md:h-44 md:w-44"
              />
              <p className="muted text-sm">Smart Order is cooking your result...</p>
            </div>
          </section>
        ) : (
          <section className="surface space-y-4 p-5 md:p-6">
            <h2 className="text-lg font-semibold">Order Assistant</h2>

            {!latestAssistantMessage ? (
              <p className="muted text-sm">
                Ask naturally, for example: "I want 2 Veggie Roll from Sushi Lab".
              </p>
            ) : (
              <div className="rounded-xl border border-[#e8dccf] bg-[#fffaf4] px-3 py-2 text-sm text-[#51463a]">
                {latestAssistantMessage}
              </div>
            )}

            {draftOrder && (
              <div className="surface-soft space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#3d3329]">
                    Draft from {draftOrder.restaurant.name}
                  </p>
                  <p className="text-sm font-semibold text-[#8a4330]">
                    ${draftOrder.total.toFixed(2)}
                  </p>
                </div>
                <ul className="space-y-1 text-sm text-[#5a4e42]">
                  {draftOrder.items.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      {item.quantity} x {item.name}
                    </li>
                  ))}
                </ul>
                <button onClick={openDraftOrder} className="btn-primary">
                  Review And Place
                </button>
              </div>
            )}
          </section>
        )
      )}

      {error && (
        <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-4 py-3 text-sm text-[#8a4330]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="surface h-44 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-lg font-semibold">No restaurants found</p>
          <p className="muted mt-1 text-sm">Try another search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((rest) => (
            <RestaurantCard key={rest._id} rest={rest} />
          ))}
        </div>
      )}
    </section>
  );
}
