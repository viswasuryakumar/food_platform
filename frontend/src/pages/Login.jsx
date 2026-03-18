import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { login } from "../redux/authSlice";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    try {
      const res = await axios.post("http://localhost:3000/api/auth/login", {
        email,
        password,
      });
      dispatch(login(res.data.token));
      navigate("/restaurants");
    } catch (err) {
      console.error("Login failed:", err);
      setError("Could not sign in. Check your credentials and try again.");
    }
  }

  return (
    <section className="view-shell">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="surface p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Campus Food Platform</p>
          <h1 className="title-display mt-3">Welcome back</h1>
          <p className="muted mt-3 text-sm leading-relaxed">
            Sign in to browse restaurants, place orders, and track delivery updates in real time.
          </p>

          <div className="mt-8 space-y-3 text-sm">
            <div className="surface-soft p-3">
              <p className="font-semibold text-[#4c4338]">Demo User</p>
              <p className="muted">demo.user@campusfood.dev / demo12345</p>
            </div>
            <div className="surface-soft p-3">
              <p className="font-semibold text-[#4c4338]">Demo Admin</p>
              <p className="muted">admin@campusfood.dev / demo12345</p>
            </div>
          </div>
        </div>

        <div className="surface p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Sign In</h2>
          <p className="muted mt-2 text-sm">Use your account credentials to continue.</p>

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

            <button type="submit" className="btn-primary w-full">
              Sign in
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
