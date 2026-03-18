import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/authSlice";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  function handleLogout() {
    dispatch(logout());
    navigate("/login");
  }

  return (
    <div className="bg-white shadow-md px-6 py-3 flex justify-between items-center">
      
      {/* Logo */}
      <h1 className="text-xl font-bold">🍔 FoodApp</h1>

      {/* Links */}
      <div className="flex gap-4 items-center">
        
        {isAuthenticated && (
          <Link to="/restaurants" className="hover:text-blue-500">
            Restaurants
          </Link>
        )}

        {/* Show Admin link ONLY for admins */}
        {user?.role === "restaurant_admin" && (
          <Link to="/admin" className="hover:text-blue-500">
            Admin
          </Link>
        )}

        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600"
          >
            Logout
          </button>
        ) : (
          <>
            <Link to="/login" className="hover:text-blue-500">
              Login
            </Link>
            <Link to="/register" className="hover:text-blue-500">
              Register
            </Link>
          </>
        )}
      </div>
    </div>
  );
}