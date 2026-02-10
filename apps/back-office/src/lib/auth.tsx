"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  login as apiLogin,
  register as apiRegister,
  setToken,
  getToken,
} from "./api";

interface User {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    businessName: string,
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        // Decode JWT payload (no verification — that's the API's job)
        const payload = JSON.parse(atob(token.split(".")[1]!));
        const stored = localStorage.getItem("auth_user");
        const userData = stored ? JSON.parse(stored) : null;
        setUser({
          id: payload.userId,
          email: userData?.email || "",
          fullName: userData?.fullName || "",
          tenantId: payload.tenantId,
        });
      } catch {
        setToken(null);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email, password);
      setToken(result.token);
      localStorage.setItem("auth_user", JSON.stringify(result.user));
      const payload = JSON.parse(atob(result.token.split(".")[1]!));
      setUser({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        tenantId: payload.tenantId,
      });
      router.push("/");
    },
    [router],
  );

  const register = useCallback(
    async (
      businessName: string,
      email: string,
      password: string,
      fullName: string,
    ) => {
      const result = await apiRegister({
        businessName,
        email,
        password,
        fullName,
      });
      setToken(result.token);
      localStorage.setItem("auth_user", JSON.stringify(result.user));
      const payload = JSON.parse(atob(result.token.split(".")[1]!));
      setUser({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        tenantId: payload.tenantId,
      });
      router.push("/");
    },
    [router],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
