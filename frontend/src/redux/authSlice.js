import { createSlice } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";

/**
 * Rehydrates auth state from localStorage on boot.
 *
 * Expired tokens are discarded here rather than being trusted until the first
 * API call fails, which previously left the UI rendering a signed-in shell for
 * a session the server would reject.
 */
function loadInitialState() {
  const token = localStorage.getItem("token");
  if (!token) return { token: null, user: null, isAuthenticated: false };

  try {
    const decoded = jwtDecode(token);

    // `exp` is in seconds since epoch.
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      return { token: null, user: null, isAuthenticated: false };
    }

    const storedUser = localStorage.getItem("user");
    return {
      token,
      user: storedUser ? JSON.parse(storedUser) : decoded,
      isAuthenticated: true,
    };
  } catch {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return { token: null, user: null, isAuthenticated: false };
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState: loadInitialState(),

  reducers: {
    login(state, action) {
      // Accepts { token, user }; falls back to a bare token string so any
      // older call site keeps working.
      const payload = action.payload;
      const token = typeof payload === "string" ? payload : payload.token;
      const user = typeof payload === "string" ? jwtDecode(payload) : payload.user;

      state.token = token;
      state.user = user || jwtDecode(token);
      state.isAuthenticated = true;

      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(state.user));
    },

    logout(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    },
  },
});

export const { login, logout } = authSlice.actions;

export const selectIsAdmin = (state) => state.auth.user?.role === "restaurant_admin";

export default authSlice.reducer;
