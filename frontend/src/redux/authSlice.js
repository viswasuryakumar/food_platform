import { createSlice } from "@reduxjs/toolkit";
import {jwtDecode} from "jwt-decode";

const token = localStorage.getItem("token");
let user = null;

if (token) {
  try {
    user = jwtDecode(token);
  } catch (err) {
    console.error("Invalid token");
  }
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token: token || null,
    user: user || null,
    isAuthenticated: !!token,
  },

  reducers: {
    login(state, action) {
      const token = action.payload;
      state.token = token;
      state.user = jwtDecode(token);
      state.isAuthenticated = true;
      localStorage.setItem("token", token);
    },

    logout(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      localStorage.removeItem("token");
    },
  },
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;