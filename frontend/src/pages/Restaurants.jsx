import { useEffect, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const { token, isAuthenticated } = useSelector((state) => state.auth);
  console.log("Current Bearer Token from Redux:", token);

  // Redirect if NOT logged in
  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = "/login";
    }
  }, [isAuthenticated]);

  // Fetch restaurants after login
  useEffect(() => {
    async function fetchRestaurants() {
      try {
        const res = await axios.get(
          "http://localhost:3000/api/restaurants",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        setRestaurants(res.data);
      } catch (err) {
        console.error("Error fetching restaurants", err);
      }
    }

    if (token) fetchRestaurants();
  }, [token]);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Restaurants</h2>

      {restaurants.length === 0 ? (
        <p>No restaurants found</p>
      ) : (
        restaurants.map((rest) => (
          <div
            key={rest._id}
            style={{
              border: "1px solid gray",
              padding: "10px",
              margin: "10px 0",
              borderRadius: "8px",
            }}
          >
            <h3>{rest.name}</h3>
            <p>{rest.address}</p>
            <p>Cuisine: {rest.cuisine}</p>
            <button onClick={() => window.location.href = `/order/${rest._id}`}>
    Order Now
  </button>
          </div>
        ))
      )}
    </div>
  );
}