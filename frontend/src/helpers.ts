/**
 * Common formatting + platform helpers.
 */

import { Linking, Platform } from "react-native";

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (same(d, today)) return `Today ${time}`;
  if (same(d, tomorrow)) return `Tomorrow ${time}`;
  if (same(d, yesterday)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/** Deterministic color for an avatar based on the name. */
export function avatarColor(name?: string | null): string {
  const palette = ["#1565C0", "#EC4899", "#8B5CF6", "#F97316", "#22C55E", "#3B82F6", "#EF4444", "#EAB308", "#10B981", "#0EA5E9"];
  const s = (name || "?").toString();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function normalizePhone(mobile?: string | null): string | null {
  if (!mobile) return null;
  const digits = mobile.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export function openTel(mobile?: string | null) {
  const n = normalizePhone(mobile);
  if (n) void Linking.openURL(`tel:${n}`);
}
export function openSms(mobile?: string | null, body?: string) {
  const n = normalizePhone(mobile);
  if (!n) return;
  const q = body ? `?body=${encodeURIComponent(body)}` : "";
  void Linking.openURL(`sms:${n}${q}`);
}
export function openWhatsApp(mobile?: string | null, body?: string) {
  const n = (normalizePhone(mobile) || "").replace("+", "");
  if (!n) return;
  const q = body ? `?text=${encodeURIComponent(body)}` : "";
  void Linking.openURL(`https://wa.me/${n}${q}`);
}
export function openEmail(email?: string | null, subject?: string) {
  if (!email) return;
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  void Linking.openURL(`mailto:${email}${q}`);
}

export const isAndroid = Platform.OS === "android";
export const isIOS = Platform.OS === "ios";
export const isWeb = Platform.OS === "web";
