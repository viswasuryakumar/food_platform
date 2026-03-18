import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Restaurants from "./pages/Restaurants";
import OrderPage from "./pages/OrderPage";
import TrackOrder from "./pages/TrackOrder.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import Navbar from "./components/Navbar"; 
import OrderHistory from "./pages/OrderHistory.jsx";



export default function App() {
  return (
    <BrowserRouter>
    <Navbar/>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/restaurants" element={<Restaurants />} />
        <Route path="/order/:restaurantId" element={<OrderPage />} />
        <Route path="/payment/:orderId" element={<PaymentPage />} />
        <Route path="/track/:orderId" element={<TrackOrder />} />
        <Route
  path="/admin"
  element={
    <ProtectedAdminRoute>
      <AdminDashboard />
    </ProtectedAdminRoute>
  }
/>
        <Route path="/history" element={<OrderHistory />} />
      </Routes>
    </BrowserRouter>
  );
}