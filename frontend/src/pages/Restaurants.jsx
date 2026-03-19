import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import RestaurantCard from "../components/RestaurantCard";

const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseQuantity(token) {
  const normalized = normalizeText(token);
  if (!normalized) return 1;
  if (NUMBER_WORDS[normalized]) return NUMBER_WORDS[normalized];
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function quantityForItem(prompt, itemName) {
  const normalizedPrompt = normalizeText(prompt);
  const normalizedItem = normalizeText(itemName);
  if (!normalizedPrompt || !normalizedItem) return 1;

  const qtyPattern = "\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten";
  const itemPattern = escapeRegExp(normalizedItem).replace(/\\ /g, "\\s+");
  const beforeItem = new RegExp(`(?:^|\\b)(${qtyPattern})\\s+${itemPattern}(?:\\b|$)`, "i");
  const afterItem = new RegExp(`(?:^|\\b)${itemPattern}\\s*(?:x|times)?\\s*(${qtyPattern})(?:\\b|$)`, "i");

  const beforeMatch = normalizedPrompt.match(beforeItem);
  if (beforeMatch?.[1]) return parseQuantity(beforeMatch[1]);

  const afterMatch = normalizedPrompt.match(afterItem);
  if (afterMatch?.[1]) return parseQuantity(afterMatch[1]);

  return 1;
}

function includesPhrase(text, phrase) {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedText || !normalizedPhrase) return false;

  const phrasePattern = escapeRegExp(normalizedPhrase).replace(/\\ /g, "\\s+");
  return new RegExp(`(?:^|\\b)${phrasePattern}(?:\\b|$)`, "i").test(normalizedText);
}

function getItemMatches(prompt, restaurant) {
  const menu = Array.isArray(restaurant?.menu) ? restaurant.menu : [];

  return menu
    .filter((item) => includesPhrase(prompt, item?.name))
    .map((item) => ({
      name: item.name,
      price: Number(item.price) || 0,
      quantity: quantityForItem(prompt, item.name),
    }));
}

function buildDraft(prompt, restaurants) {
  const text = prompt.trim();
  if (!text) {
    return { error: "Tell me what you'd like to eat and from which restaurant." };
  }

  if (!restaurants.length) {
    return { error: "Restaurants are still loading. Try again in a second." };
  }

  const namedRestaurants = restaurants.filter((restaurant) => includesPhrase(text, restaurant.name));

  if (namedRestaurants.length > 1) {
    return {
      error: `I found multiple restaurants in your request: ${namedRestaurants
        .map((r) => r.name)
        .join(", ")}. Please choose one.`,
    };
  }

  const perRestaurantMatches = restaurants
    .map((restaurant) => ({
      restaurant,
      items: getItemMatches(text, restaurant),
    }))
    .filter((entry) => entry.items.length > 0);

  let selection = null;
  if (namedRestaurants.length === 1) {
    const chosen = namedRestaurants[0];
    const itemMatch = perRestaurantMatches.find((entry) => entry.restaurant._id === chosen._id);
    if (!itemMatch) {
      const menuHint = (chosen.menu || []).slice(0, 3).map((item) => item.name).join(", ");
      return {
        error: `I found ${chosen.name}, but couldn't match menu items. Try names like: ${menuHint || "menu item names"}.`,
      };
    }
    selection = itemMatch;
  } else {
    if (!perRestaurantMatches.length) {
      return {
        error: "I couldn't match your request to a restaurant menu item. Try: '2 Masala Dosa from Campus Bites'.",
      };
    }

    const sorted = [...perRestaurantMatches].sort((a, b) => b.items.length - a.items.length);
    const top = sorted[0];
    const runnerUp = sorted[1];

    if (runnerUp && top.items.length === runnerUp.items.length) {
      return {
        error: `I found matching items in multiple restaurants (${top.restaurant.name}, ${runnerUp.restaurant.name}). Please mention the restaurant name.`,
      };
    }

    selection = top;
  }

  const total = selection.items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  return {
    draft: {
      restaurant: selection.restaurant,
      items: selection.items,
      total,
      prompt: text,
    },
  };
}

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
        const res = await axios.get("http://localhost:3000/api/restaurants");
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

  function pushAssistantMessages(userText, assistantText) {
    setAssistantMessages((prev) =>
      [
        ...prev,
        { role: "user", text: userText },
        { role: "assistant", text: assistantText },
      ].slice(-8)
    );
  }

  function applyLocalDraft(prompt, prefix = "") {
    const result = buildDraft(prompt, restaurants);
    if (result.error) {
      setDraftOrder(null);
      pushAssistantMessages(prompt, `${prefix}${result.error}`.trim());
      return;
    }

    const draft = result.draft;
    const summary = draft.items.map((item) => `${item.quantity} x ${item.name}`).join(", ");
    pushAssistantMessages(
      prompt,
      `${prefix}Draft ready from ${draft.restaurant.name}: ${summary}. Estimated total $${draft.total.toFixed(2)}.`.trim()
    );
    setDraftOrder(draft);
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

      const response = await axios.post("http://localhost:3000/api/ai/smart-order", {
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
      } else if (data.mode === "clarify") {
        setDraftOrder(null);
        pushAssistantMessages(
          prompt,
          data.clarification || "Please clarify your request with restaurant and menu item names."
        );
      } else {
        applyLocalDraft(prompt);
      }
    } catch (err) {
      console.error("Smart Order AI request failed:", err);
      if (err?.response?.data?.code === "OPENAI_NOT_CONFIGURED") {
        applyLocalDraft(prompt, "Smart Order AI is not configured yet. Using local parser. ");
      } else {
        applyLocalDraft(prompt, "Smart Order AI is unavailable right now. Using local parser. ");
      }
    } finally {
      setAssistantPrompt("");
      setAssistantLoading(false);
    }
  }

  function openDraftOrder() {
    if (!draftOrder) return;
    navigate(`/order/${draftOrder.restaurant._id}`, {
      state: {
        source: "assistant",
        prompt: draftOrder.prompt,
        draftItems: draftOrder.items,
      },
    });
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
            <form onSubmit={handleAssistantSubmit} className="space-y-2">
              <div className="flex flex-col gap-2 md:flex-row">
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
                    className="input-field pl-32"
                    value={assistantPrompt}
                    onChange={(e) => setAssistantPrompt(e.target.value)}
                    disabled={assistantLoading}
                  />
                </div>
                <button type="submit" className="btn-primary md:w-auto" disabled={assistantLoading}>
                  {assistantLoading ? "Building..." : "Build Draft"}
                </button>
              </div>
              <p className="muted text-xs">
                Mention both items and restaurant. I will build an order draft you can review and place.
              </p>
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
        <section className="surface space-y-4 p-5 md:p-6">
          <h2 className="text-lg font-semibold">Order Assistant</h2>

          {assistantMessages.length === 0 ? (
            <p className="muted text-sm">
              Ask naturally, for example: "I want 2 Veggie Roll from Sushi Lab".
            </p>
          ) : (
            <div className="space-y-2">
              {assistantMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "ml-auto max-w-[95%] bg-[#f6ebe0] text-[#4a3f34]"
                      : "max-w-[95%] border border-[#e8dccf] bg-[#fffaf4] text-[#51463a]"
                  }`}
                >
                  {message.text}
                </div>
              ))}
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
