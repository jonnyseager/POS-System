import { create } from "zustand";
import * as api from "../lib/api";
import {
  setToken,
  clearToken,
  setRefreshToken,
  clearRefreshToken,
  getToken,
  getRefreshToken,
} from "../lib/api";
import { setDeviceConfig, getDeviceConfig } from "../db/queries";

/** Base64 URL decode for JWT payloads (works in React Native without atob) */
function decodeBase64(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  // React Native's global has btoa/atob via Hermes, but to be safe we use a manual decoder
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < padded.length; i += 4) {
    const a = chars.indexOf(padded[i]!);
    const b = chars.indexOf(padded[i + 1]!);
    const c = chars.indexOf(padded[i + 2]!);
    const d = chars.indexOf(padded[i + 3]!);
    result += String.fromCharCode(((a << 2) | (b >> 4)) & 0xff);
    if (c !== -1 && padded[i + 2] !== "=")
      result += String.fromCharCode((((b & 15) << 4) | (c >> 2)) & 0xff);
    if (d !== -1 && padded[i + 3] !== "=")
      result += String.fromCharCode((((c & 3) << 6) | d) & 0xff);
  }
  return result;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    businessName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  restoreSession: () => Promise<void>;
  registerDevice: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tenant: null,
  deviceId: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.login(email, password);
      await setToken(result.tokens.accessToken);
      await setRefreshToken(result.tokens.refreshToken);
      set({
        user: result.user,
        tenant: result.tenant,
        isAuthenticated: true,
        isLoading: false,
      });
      // Register device after login
      void get().registerDevice();
    } catch (err) {
      const message =
        err instanceof api.ApiError ? err.message : "Login failed";
      set({ error: message, isLoading: false });
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.register(data);
      await setToken(result.tokens.accessToken);
      await setRefreshToken(result.tokens.refreshToken);
      set({
        user: result.user,
        tenant: result.tenant,
        isAuthenticated: true,
        isLoading: false,
      });
      void get().registerDevice();
    } catch (err) {
      const message =
        err instanceof api.ApiError ? err.message : "Registration failed";
      set({ error: message, isLoading: false });
    }
  },

  logout: async () => {
    await clearToken();
    await clearRefreshToken();
    set({
      user: null,
      tenant: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  refresh: async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;
      const result = await api.refreshAccessToken(refreshToken);
      await setToken(result.accessToken);
      await setRefreshToken(result.refreshToken);
      return true;
    } catch {
      return false;
    }
  },

  restoreSession: async () => {
    set({ isLoading: true });
    try {
      const token = await getToken();
      if (!token) {
        set({ isLoading: false });
        return;
      }
      // Try to decode JWT payload
      const parts = token.split(".");
      if (parts.length !== 3) {
        set({ isLoading: false });
        return;
      }
      const payload = JSON.parse(decodeBase64(parts[1]!));
      const deviceId = getDeviceConfig("deviceId");
      set({
        user: {
          id: payload.userId,
          email: payload.email ?? "",
          firstName: payload.firstName ?? "",
          lastName: payload.lastName ?? "",
        },
        tenant: {
          id: payload.tenantId,
          name: payload.tenantName ?? "",
        },
        deviceId,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Token invalid, try refresh
      const refreshed = await get().refresh();
      if (!refreshed) {
        await clearToken();
        await clearRefreshToken();
      }
      set({ isLoading: false });
    }
  },

  registerDevice: async () => {
    try {
      const existingId = getDeviceConfig("deviceId");
      if (existingId) {
        set({ deviceId: existingId });
        return;
      }
      const result = await api.registerDevice({
        deviceName: "POS Tablet",
        deviceType: "tablet",
        platform: "android",
        appVersion: "0.1.0",
      });
      setDeviceConfig("deviceId", result.id);
      setDeviceConfig("deviceToken", result.deviceToken);
      set({ deviceId: result.id });
    } catch {
      // Device registration can be retried later
    }
  },

  clearError: () => set({ error: null }),
}));
