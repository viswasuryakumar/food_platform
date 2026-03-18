import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/authSlice";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Navbar() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  function handleLogout() {
    dispatch(logout());
    navigate("/login");
  }

  const navLinkClass = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      isActive ? "bg-[#efe4d8] text-[#2f2922]" : "text-[#6b6054] hover:text-[#2f2922]"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-[#e8dccf] bg-[#f7f3ee]/90 backdrop-blur">
      <div className="app-shell flex flex-wrap items-center justify-between gap-3 py-3">
        <Link to={isAuthenticated ? "/restaurants" : "/login"} className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#efe4d8] text-lg">
            🍔
          </span>
          <span className="text-lg font-semibold tracking-tight">FoodApp</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {isAuthenticated && (
            <NavLink to="/restaurants" className={navLinkClass}>
              Restaurants
            </NavLink>
          )}
          {isAuthenticated && (
            <NavLink to="/history" className={navLinkClass}>
              Orders
            </NavLink>
          )}
          {user?.role === "restaurant_admin" && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}

          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setOpen((state) => !state)}
                className="surface-soft px-3 py-1.5 text-sm font-medium text-[#4c4338]"
              >
                {user?.email}
              </button>
            {open && (
                <div className="surface absolute right-0 mt-2 w-48 p-2">
                  <div className="px-2 py-1.5 text-xs uppercase tracking-wide text-[#7a6f62]">
                    Account
                  </div>
                  <div className="px-2 pb-2 text-sm text-[#5e5246]">
                    Role: {user?.role}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="btn-soft w-full"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <NavLink to="/login" className={navLinkClass}>
                Login
              </NavLink>
              <NavLink to="/register" className="btn-primary">
                Create account
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
