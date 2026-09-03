import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import api from "../api/axiosInstance";
import { login } from "../redux/authSlice";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setFieldErrors([]);
    setSubmitting(true);

    try {
      const res = await api.post("/api/auth/register", { name, email, password });

      // Registration now returns a token, so land the user straight in the app
      // instead of bouncing them to the login form to retype credentials.
      dispatch(login({ token: res.data.token, user: res.data.user }));
      navigate("/restaurants");
    } catch (err) {
      console.error("Registration failed:", err);
      // Show the specific password/email rules that failed, not a generic message.
      setFieldErrors(err.apiDetails || []);
      setError(err.apiMessage || "Could not create account. Try a different email.");
    } finally {
      setSubmitting(false);
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
            <li className="surface-soft p-3">Browse restaurants and build an order in a few clicks.</li>
            <li className="surface-soft p-3">Track order status from pending to delivered.</li>
            <li className="surface-soft p-3">Get live updates without repeatedly refreshing the page.</li>
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
              <p className="muted mt-1.5 text-xs">
                Needs 8+ characters with an uppercase letter, a lowercase letter, and a number.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-[#e8c9bc] bg-[#f9e7df] px-3 py-2 text-sm text-[#8a4330]">
                <p>{error}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                    {fieldErrors.map((detail, i) => (
                      <li key={i}>{detail.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Creating account..." : "Create account"}
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
