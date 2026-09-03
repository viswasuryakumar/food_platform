import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { useSelector } from "react-redux";
import Home from "./pages/Home";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import OfflineNotice from "./components/OfflineNotice";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Restaurants = lazy(() => import("./pages/Restaurants"));
const OrderPage = lazy(() => import("./pages/OrderPage"));
const TrackOrder = lazy(() => import("./pages/TrackOrder.jsx"));
const PaymentPage = lazy(() => import("./pages/PaymentPage.jsx"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard.jsx"));
const ProtectedAdminRoute = lazy(() => import("./components/ProtectedAdminRoute"));
const OrderHistory = lazy(() => import("./pages/OrderHistory.jsx"));
const Chatbot = lazy(() => import("./components/Chatbot"));

function PageLoader() {
  return (
    <div className="view-shell" role="status">
      <div className="surface h-48 animate-pulse" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}

export default function App() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

  return (
    <BrowserRouter>
      <div className={`min-h-screen ${isAuthenticated ? "pb-24 sm:pb-10" : "pb-0"}`}>
        <OfflineNotice />
        <Navbar />
        <main>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={isAuthenticated ? <Navigate to="/restaurants" replace /> : <Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/restaurants" element={<ProtectedRoute><Restaurants /></ProtectedRoute>} />
            <Route path="/order/:restaurantId" element={<ProtectedRoute><OrderPage /></ProtectedRoute>} />
            <Route path="/payment/:orderId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
            <Route path="/track/:orderId" element={<ProtectedRoute><TrackOrder /></ProtectedRoute>} />
            <Route
              path="/admin"
              element={
                <ProtectedAdminRoute>
                  <AdminDashboard />
                </ProtectedAdminRoute>
              }
            />
            <Route path="/history" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </main>
        {isAuthenticated && <Suspense fallback={null}><Chatbot /></Suspense>}
      </div>
    </BrowserRouter>
  );
}
