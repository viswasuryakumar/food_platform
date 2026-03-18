export default function RestaurantCard({ rest }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition">

      <h3 className="text-lg font-semibold">{rest.name}</h3>

      <p className="text-gray-600">{rest.address}</p>

      <p className="text-sm">Cuisine: {rest.cuisine}</p>

      <button
        onClick={() => window.location.href = `/order/${rest._id}`}
        className="mt-3 bg-blue-500 text-white px-3 py-1 rounded-md"
      >
        Order Now
      </button>

    </div>
  );
}