"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setAuthToken, type AuthUser } from "@/lib/api-client";
import { watchIdle } from "@/lib/idle";

/** After the password: signed in, or a second step (code, or enrolment) to finish first. */
export type SignInStep = { kind: "done" } | { kind: "verify" | "enrol"; challenge: string; expiresAt: string };

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SignInStep>;
  /** Start the POS with a session from the second step (LoginScreen). */
  finishSignIn: (token: string, user: AuthUser) => void;
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

  const finishSignIn = useCallback((token: string, u: AuthUser) => {
    setAuthToken(token);
    setUser(u);
    // Work time is tracked from sign-in → sign-out: auto clock-in.
    api.clockIn(u.id).catch(() => {});
  }, []);

  // Admins and managers get no session from the password alone: the API hands
  // back a short-lived challenge for the code step (or authenticator enrolment).
  const login = useCallback(
    async (email: string, password: string): Promise<SignInStep> => {
      const result = await api.login(email, password);
      if (result.mfa) return { kind: result.mfa, challenge: result.challenge, expiresAt: result.expiresAt };
      finishSignIn(result.token, result.user);
      return { kind: "done" };
    },
    [finishSignIn],
  );

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

  return <Ctx.Provider value={{ user, loading, login, finishSignIn, logout }}>{children}</Ctx.Provider>;
}
