import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({ baseURL: API_BASE });

/**
 * Attach the bearer token to every request.
 *
 * Previously each call site passed `headers: { Authorization }` by hand, which
 * meant a forgotten header silently produced a 401 at runtime. Reading from
 * localStorage here (rather than importing the Redux store) keeps this module
 * free of a circular dependency with the store.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Normalises errors so components can rely on a single shape, and handles
 * expired sessions in one place instead of at every call site.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data?.error;
    const code = payload?.code;

    if (code === "TOKEN_EXPIRED" || code === "INVALID_TOKEN") {
      localStorage.removeItem("token");
      // Full reload so Redux rehydrates as signed-out. Guarded to avoid a
      // redirect loop when the login page itself gets a 401.
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }

    error.apiMessage =
      payload?.message || error.response?.data?.message || error.message || "Something went wrong";
    error.apiCode = code;
    error.apiDetails = payload?.details;

    return Promise.reject(error);
  }
);

export default api;
