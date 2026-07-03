/**
 * ReminderAlarmContext — 30-second poll checking pending reminders assigned to
 * the current user. When one becomes due (remind_at <= now), we show the
 * full-screen Alarm modal. This is the web/Expo Go fallback for what the
 * native alarm layer does when the app is killed. On a real APK, the native
 * AlarmManager also fires and would deliver full-screen intents.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { debugLog } from "@/src/debug-log";

export type ReminderRow = {
  id: string;
  event_id?: string;
  remind_at: string;
  status: string;
  assignee_id: string;
  event?: any;
};

const FIRED_KEY_PREFIX = "sahu.fired.";
const POLL_MS = 30000;

type Value = {
  active: ReminderRow | null;
  reminders: ReminderRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  dismiss: () => void;
};

const Ctx = createContext<Value | null>(null);

export function ReminderAlarmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [active, setActive] = useState<ReminderRow | null>(null);
  const [loading, setLoading] = useState(false);
  const firedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await api<ReminderRow[]>("/reminders", { query: { scope: "mine", status: "pending" } });
      setReminders(rows);
    } catch (e: any) {
      debugLog("warn", "alarm", `reminders fetch failed: ${e?.detail || e}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const checkDue = useCallback(() => {
    if (!user || active) return;
    const now = Date.now();
    const due = reminders.find((r) => {
      if (r.status !== "pending") return false;
      if (firedRef.current.has(r.id)) return false;
      const t = new Date(r.remind_at).getTime();
      // Fire within a 90s window after due time (in case poll skipped)
      return t <= now && now - t < 15 * 60 * 1000;
    });
    if (due) {
      firedRef.current.add(due.id);
      debugLog("info", "alarm", `firing reminder ${due.id}`);
      setActive(due);
      // Log 'triggered'
      void api(`/reminders/${due.id}/action`, {
        method: "POST",
        body: { action: "triggered", meta: { source: "in_app_poll" } },
      }).catch(() => undefined);
    }
  }, [user, active, reminders]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, [user, refresh]);

  useEffect(() => {
    checkDue();
    const iv = setInterval(checkDue, 1000);
    return () => clearInterval(iv);
  }, [checkDue]);

  const dismiss = useCallback(() => {
    setActive(null);
    void refresh();
  }, [refresh]);

  const value = useMemo<Value>(() => ({ active, reminders, loading, refresh, dismiss }), [
    active,
    reminders,
    loading,
    refresh,
    dismiss,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminderAlarm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReminderAlarm must be inside ReminderAlarmProvider");
  return ctx;
}

// Utility
export function isOverdue(iso?: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}
