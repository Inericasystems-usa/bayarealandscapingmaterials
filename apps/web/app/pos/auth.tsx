"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setAuthToken, type AuthUser } from "@/lib/api-client";
import { watchIdle } from "@/lib/idle";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

// No cookie is written here. The API sets the HttpOnly session cookie on sign-in
// and clears it on sign-out, and the Next middleware gates /pos/* on that cookie.

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
      })
      .catch(() => {
        if (!alive) return;
        setUser(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // 15 minutes without input ends the session and brings back the sign-in
  // screen (lib/idle.ts). A lock, not a sign-off: the shift stays clocked in
  // and the drawer stays open, so signing in again carries on.
  useEffect(() => {
    if (!user) return;
    return watchIdle(() => {
      void api.logout().catch(() => {});
      setAuthToken(null);
      setUser(null);
    });
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    setAuthToken(token);
    setUser(u);
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
  }, [user]);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
