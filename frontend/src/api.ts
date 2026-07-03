/**
 * API client + auth token handling.
 * Backend URL: EXPO_PUBLIC_BACKEND_URL (routes prefixed /api).
 */

import { storage } from "@/src/utils/storage";

const BASE_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
const ACCESS_KEY = "sahu.accessToken";
const REFRESH_KEY = "sahu.refreshToken";

export type ApiError = { status: number; detail: string };

export async function saveTokens(access: string, refresh: string) {
  await storage.secureSet(ACCESS_KEY, access);
  await storage.secureSet(REFRESH_KEY, refresh);
}
export async function clearTokens() {
  await storage.secureRemove(ACCESS_KEY);
  await storage.secureRemove(REFRESH_KEY);
}
export async function getAccessToken(): Promise<string | null> {
  const v = await storage.secureGet<string>(ACCESS_KEY, "");
  return v || null;
}
export async function getRefreshToken(): Promise<string | null> {
  const v = await storage.secureGet<string>(REFRESH_KEY, "");
  return v || null;
}

async function tryRefresh(): Promise<boolean> {
  const rt = await getRefreshToken();
  if (!rt) return false;
  try {
    const r = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    await saveTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

type FetchOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
};

export async function api<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = opts;
  const url = new URL(`${BASE_URL}/api${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  if (auth) {
    const at = await getAccessToken();
    if (at) headers.set("Authorization", `Bearer ${at}`);
  }

  const doFetch = async () =>
    fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 401 && auth) {
    const ok = await tryRefresh();
    if (ok) {
      const at = await getAccessToken();
      if (at) headers.set("Authorization", `Bearer ${at}`);
      res = await doFetch();
    }
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    const err: ApiError = { status: res.status, detail: String(detail) };
    throw err;
  }
  return data as T;
}

export function backendBaseUrl() {
  return BASE_URL;
}
