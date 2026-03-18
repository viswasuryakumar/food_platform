import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

export default function ProtectedAdminRoute({ children }) {
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (user.role !== "restaurant_admin") {
    return <Navigate to="/restaurants" />;
  }

  return children;
} 