import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

export default function ProtectedAdminRoute({ children }) {
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Optional chaining: `user` can be null for a moment during rehydration, and
  // reading `.role` off it threw a render-time crash.
  if (user?.role !== "restaurant_admin") {
    return <Navigate to="/restaurants" replace />;
  }

  return children;
} 