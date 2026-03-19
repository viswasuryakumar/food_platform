import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
import WebGLPageTransition from "./components/WebGLPageTransition";

function pathSignature(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function getHistoryIndex() {
  if (typeof window === "undefined") return 0;
  const idx = window.history?.state?.idx;
  return Number.isFinite(idx) ? idx : 0;
}

function AppRoutes({ location }) {
  return (
    <Routes location={location}>
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
  );
}

function AppShell() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [incomingLocation, setIncomingLocation] = useState(null);
  const [incomingDirection, setIncomingDirection] = useState("forward");
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [displayHistoryIndex, setDisplayHistoryIndex] = useState(() => getHistoryIndex());
  const transitionRafRef = useRef(0);
  const settleRafRef = useRef(0);
  const currentPath = useMemo(() => pathSignature(location), [location]);
  const displayPath = useMemo(() => pathSignature(displayLocation), [displayLocation]);

  useEffect(() => {
    if (currentPath === displayPath) return;
    const nextHistoryIndex = getHistoryIndex();
    setIncomingDirection(nextHistoryIndex < displayHistoryIndex ? "backward" : "forward");
    setIncomingLocation(location);
    setTransitionProgress(0);
  }, [location, currentPath, displayPath, displayHistoryIndex]);

  useEffect(() => {
    if (!incomingLocation) return undefined;
    cancelAnimationFrame(transitionRafRef.current);

    const targetLocation = incomingLocation;
    const start = performance.now();
    const durationMs = 1280;

    const tick = (now) => {
      const raw = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - raw, 4);
      setTransitionProgress(eased);

      if (raw < 1) {
        transitionRafRef.current = requestAnimationFrame(tick);
        return;
      }

      setTransitionProgress(1);
      setDisplayLocation(targetLocation);
      setDisplayHistoryIndex(getHistoryIndex());
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = requestAnimationFrame(() => {
        setIncomingLocation(null);
        settleRafRef.current = 0;
      });
    };

    transitionRafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(transitionRafRef.current);
      cancelAnimationFrame(settleRafRef.current);
    };
  }, [incomingLocation, incomingDirection]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(transitionRafRef.current);
      cancelAnimationFrame(settleRafRef.current);
    };
  }, []);

  const revealPercent = Math.max(0, Math.min(100, transitionProgress * 100));
  const seamOverlap = 0.35;

  const overlayStyle =
    incomingDirection === "backward"
      ? (() => {
          const edgePercent = Math.min(100, revealPercent + seamOverlap);
          return {
            clipPath: `inset(0 ${Math.max(0, 100 - edgePercent)}% 0 0)`,
            "--edge-percent": `${edgePercent}%`,
          };
        })()
      : (() => {
          const edgePercent = Math.max(0, 100 - revealPercent - seamOverlap);
          return {
            clipPath: `inset(0 0 0 ${edgePercent}%)`,
            "--edge-percent": `${edgePercent}%`,
          };
        })();

  const overlayClass =
    incomingDirection === "backward"
      ? "route-scene-overlay route-scene-overlay-backward"
      : "route-scene-overlay route-scene-overlay-forward";

  return (
    <div className="min-h-screen pb-10">
      <Navbar />
      <main className="route-transition-shell">
        <div className="route-scene">
          <AppRoutes location={displayLocation} />
        </div>

        {incomingLocation && (
          <div
            key={pathSignature(incomingLocation)}
            className={`route-scene ${overlayClass}`}
            style={overlayStyle}
          >
            <WebGLPageTransition direction={incomingDirection} progress={transitionProgress} />
            <AppRoutes location={incomingLocation} />
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
