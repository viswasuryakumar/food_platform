import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import RestaurantCard from "../components/RestaurantCard";

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
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

  return (
    <section className="view-shell space-y-6">
      <header className="surface p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Browse</p>
        <h1 className="title-display mt-2">Restaurants</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          Discover available kitchens and start an order in a few clicks.
        </p>

        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Search restaurants</label>
          <input
            type="text"
            placeholder="Type a restaurant name..."
            className="input-field max-w-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

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
