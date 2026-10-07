"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setAuthToken, type AuthUser } from "@/lib/api-client";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

// Non-sensitive marker (NOT the token) so the Next middleware can gate /pos/*
// server-side. Real auth is the HttpOnly session cookie + API enforcement.
function setAuthedMarker(on: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `balm_authed=1; path=/; max-age=${12 * 60 * 60}; samesite=lax`
    : "balm_authed=; path=/; max-age=0; samesite=lax";
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setAuthedMarker(true); // refresh the marker for an existing valid session
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
        setAuthedMarker(false);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    setAuthToken(token);
    setUser(u);
    setAuthedMarker(true);
    // Work time is tracked from sign-in → sign-out: auto clock-in.
    api.clockIn(u.id).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    // Clock out the active shift before signing off.
    try {
      if (user) {
        const shift = await api.activeShift(user.id);
        if (shift) await api.clockOut(shift.id);
      }
    } catch {
      /* best-effort */
    }
    void api.logout().catch(() => {});
    setAuthToken(null);
    setUser(null);
    setAuthedMarker(false);
  }, [user]);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
