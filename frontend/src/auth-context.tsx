/**
 * Auth context — stores current user + provides login/register/logout.
 * On mount, tries to hydrate user via /auth/me using stored token.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, clearTokens, saveTokens } from "@/src/api";
import { debugLog } from "@/src/debug-log";

export type UserProfile = {
  id: string;
  email: string;
  full_name?: string;
  organisation_name?: string;
  mobile?: string;
  role: "admin" | "team_member";
  avatar_url?: string | null;
  ringtone_url?: string | null;
  vibrate?: boolean;
  is_disabled?: boolean;
  floating_assistant?: boolean;
  permissions?: Record<string, boolean>;
};

type AuthValue = {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (data: {
    full_name: string;
    email: string;
    password: string;
    organisation_name?: string;
    mobile?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  patchUser: (patch: Partial<UserProfile>) => Promise<UserProfile>;
};

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<UserProfile>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ access_token: string; refresh_token: string; user: UserProfile }>(
      "/auth/login",
      { method: "POST", body: { email, password }, auth: false },
    );
    await saveTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    debugLog("info", "auth", `login ok: ${email}`);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload: {
      full_name: string;
      email: string;
      password: string;
      organisation_name?: string;
      mobile?: string;
    }) => {
      const data = await api<{ access_token: string; refresh_token: string; user: UserProfile }>(
        "/auth/register",
        { method: "POST", body: payload, auth: false },
      );
      await saveTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      debugLog("info", "auth", `register ok: ${payload.email}`);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    debugLog("info", "auth", "logout");
  }, []);

  const patchUser = useCallback(async (patch: Partial<UserProfile>) => {
    const updated = await api<UserProfile>("/auth/me", { method: "PATCH", body: patch });
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, register, logout, refreshUser, patchUser }),
    [user, loading, login, register, logout, refreshUser, patchUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
