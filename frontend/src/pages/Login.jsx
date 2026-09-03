import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axiosInstance";
import { useDispatch } from "react-redux";
import { login } from "../redux/authSlice";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Set by the axios interceptor when it rejects an expired token.
  const sessionExpired = searchParams.get("expired") === "1";

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    setSubmitting(true);
    try {
      const res = await api.post("/api/auth/login", { email, password });
      dispatch(login({ token: res.data.token, user: res.data.user }));
      navigate("/restaurants");
    } catch (err) {
      console.error("Login failed:", err);
      // Surface the server's message so rate limiting reads as "too many
      // attempts" rather than a generic credential failure.
      setError(err.apiMessage || "Could not sign in. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view-shell">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="surface p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">CampusCrave</p>
          <h1 className="title-display mt-3">Welcome back</h1>
          <p className="muted mt-3 text-sm leading-relaxed">
            Sign in to browse restaurants, place orders, and track delivery updates in real time.
          </p>

          <div className="mt-8 space-y-3 text-sm text-[#5a4f44]">
            <div className="surface-soft p-3">
              <p className="font-semibold text-[#4c4338]">Smart discovery</p>
              <p className="muted mt-1">Search kitchens or describe the meal you want.</p>
            </div>
            <div className="surface-soft p-3">
              <p className="font-semibold text-[#4c4338]">Live updates</p>
              <p className="muted mt-1">Follow a verified timeline from payment to delivery.</p>
            </div>
          </div>
        </div>

        <div className="surface p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Sign In</h2>
          <p className="muted mt-2 text-sm">Use your account credentials to continue.</p>

          {sessionExpired && (
            <p className="mt-4 rounded-xl border border-[#e4d6c6] bg-[#f8efe5] px-3 py-2 text-sm text-[#5f5143]">
              Your session expired. Please sign in again.
            </p>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            {error && (
              <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-3 py-2 text-sm text-[#8a4330]">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="muted mt-5 text-sm">
            New here?{" "}
            <Link to="/register" className="font-semibold text-[#8a4330] hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
