import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axiosInstance";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    try {
      await api.post("/api/auth/register", {
        name,
        email,
        password,
      });

      navigate("/login");
    } catch (err) {
      console.error("Registration failed:", err);
      setError("Could not create account. Try a different email.");
    }
  }

  return (
    <section className="view-shell">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.05fr_1fr]">
        <div className="surface p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8a7c6d]">Get Started</p>
          <h1 className="title-display mt-3">Create your account</h1>
          <p className="muted mt-3 text-sm leading-relaxed">
            Set up your profile and start exploring restaurants from a single, simple dashboard.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-[#5a4f44]">
            <li className="surface-soft p-3">Order from seeded demo restaurants right away.</li>
            <li className="surface-soft p-3">Track order status from pending to delivered.</li>
            <li className="surface-soft p-3">Access admin tools with the seeded admin account.</li>
          </ul>
        </div>

        <div className="surface p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Register</h2>
          <p className="muted mt-2 text-sm">Create a user profile in less than a minute.</p>

          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Full name</label>
              <input
                placeholder="Your name"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#554a3f]">Password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-3 py-2 text-sm text-[#8a4330]">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full">
              Create account
            </button>
          </form>

          <p className="muted mt-5 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-[#8a4330] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
