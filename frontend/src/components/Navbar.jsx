import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/authSlice";
import { Link, useNavigate } from "react-router-dom";
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

  return (
    <div className="bg-white shadow-md px-6 py-3 flex justify-between items-center">
      
      <h1 className="text-xl font-bold">🍔 FoodApp</h1>

      <div className="flex items-center gap-4">

        {isAuthenticated && (
          <Link to="/restaurants">Restaurants</Link>
        )}

        {user?.role === "restaurant_admin" && (
          <Link to="/admin">Admin</Link>
        )}

        {/* PROFILE DROPDOWN */}
        {isAuthenticated ? (
          <div className="relative">
            
            <button
              onClick={() => setOpen(!open)}
              className="bg-gray-200 px-3 py-1 rounded-md"
            >
              {user?.email}
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-md">
                
                <div className="px-3 py-2 text-sm text-gray-600">
                  Role: {user?.role}
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100"
                >
                  Logout
                </button>

              </div>
            )}

          </div>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}

      </div>
    </div>
  );
}