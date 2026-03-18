import { Link } from "react-router-dom";

export default function RestaurantCard({ rest }) {
  return (
    <article className="surface flex h-full flex-col p-5">
      <div className="mb-4 rounded-xl border border-[#e8dccf] bg-gradient-to-r from-[#f5ece2] via-[#f3e8db] to-[#efe2d4] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#7c6f62]">{rest.cuisine || "Campus Kitchen"}</p>
        <h3 className="mt-1 text-xl font-semibold text-[#2f2922]">{rest.name}</h3>
      </div>

      <p className="muted text-sm">{rest.address}</p>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[#8a7d6f]">Open now</span>
        <Link to={`/order/${rest._id}`} className="btn-primary">
          Order
        </Link>
      </div>
    </article>
  );
}
