import { useEffect, useState } from "react";
import axios from "axios";
import RestaurantCard from "../components/RestaurantCard";

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState([]);

  // FETCH RESTAURANTS FROM BACKEND
  useEffect(() => {
    async function fetchRestaurants() {
      try {
        const res = await axios.get(
          "http://localhost:3000/api/restaurants"
        );

        setRestaurants(res.data);
        setFiltered(res.data);

      } catch (err) {
        console.error("Error fetching restaurants:", err);
      }
    }

    fetchRestaurants();
  }, []);

  // FILTER BASED ON SEARCH
  useEffect(() => {
    const result = restaurants.filter((rest) =>
      rest.name.toLowerCase().includes(search.toLowerCase())
    );

    setFiltered(result);
  }, [search, restaurants]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      {/* TITLE */}
      <h2 className="text-6xl text-red-500 font-bold ">Restaurants</h2>

      {/* SEARCH BAR */}
      <input
        type="text"
        placeholder="Search restaurants..."
        className="border p-2 mb-4 w-full rounded-md"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* GRID OF RESTAURANTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p>No restaurants found</p>
        ) : (
          filtered.map((rest) => (
            <RestaurantCard key={rest._id} rest={rest} />
          ))
        )}
      </div>

    </div>
  );
}