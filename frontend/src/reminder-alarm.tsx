/**
 * ReminderAlarmContext — 30-second poll checking pending reminders assigned to
 * the current user. When one becomes due (remind_at <= now), we show the
 * full-screen Alarm modal (in-app fallback, works in Expo Go / web / when
 * the app is open on Android).
 *
 * When the APK build is running (native module present), we ALSO:
 *   - schedule every future reminder in AlarmManager so it fires when the
 *     app is killed / phone is locked;
 *   - drain any Snooze/Cancel actions the native receiver saved while the
 *     app was dead and sync them to the backend.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { debugLog } from "@/src/debug-log";
import {
  AlarmItem,
  cancelAllAlarms,
  drainPendingActions,
  isNativeAlarmAvailable,
  scheduleAlarms,
  startKeepAlive,
} from "@/src/native-alarm";
import { TAG_COLORS } from "@/src/theme";

export type ReminderRow = {
  id: string;
  event_id?: string;
  remind_at: string;
  status: string;
  assignee_id: string;
  event?: any;
};

const POLL_MS = 30000;

type Value = {
  active: ReminderRow | null;
  reminders: ReminderRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  dismiss: () => void;
};

const Ctx = createContext<Value | null>(null);

function toAlarmItems(rows: ReminderRow[]): AlarmItem[] {
  return rows
    .filter((r) => r.status === "pending")
    .map((r) => {
      const ev = r.event || {};
      const c = ev.contact || {};
      const tag = ev.tag || null;
      const tagName = tag?.name || null;
      const tagColor = tagName ? TAG_COLORS[tagName] || tag?.color || null : tag?.color || null;
      return {
        id: r.id,
        remind_at: r.remind_at,
        title: ev.title || "Reminder",
        body: ev.description || "",
        contact_name: c.full_name || null,
        organisation: c.organisation_name || null,
        mobile: c.mobile || null,
        tag_name: tagName,
        tag_color: tagColor,
        vibrate: true,
      };
    });
}

export function ReminderAlarmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [active, setActive] = useState<ReminderRow | null>(null);
  const [loading, setLoading] = useState(false);
  const firedRef = useRef<Set<string>>(new Set());

  // Drain any pending native Snooze/End actions from a killed session.
  const drainNative = useCallback(async () => {
    if (!isNativeAlarmAvailable()) return;
    const actions = await drainPendingActions();
    for (const a of actions) {
      try {
        if (a.action === "snoozed") {
          await api(`/reminders/${a.reminder_id}/action`, {
            method: "POST",
            body: {
              action: "snoozed",
              snooze_minutes: a.snooze_minutes || 30,
              meta: { source: "native_action" },
            },
          });
        } else if (a.action === "ended") {
          await api(`/reminders/${a.reminder_id}/action`, {
            method: "POST",
            body: { action: "ended", meta: { source: "native_action" } },
          });
        }
      } catch (e: any) {
        debugLog("warn", "alarm", `drain sync failed: ${e?.detail || e}`);
      }
    }
    if (actions.length) debugLog("info", "alarm", `synced ${actions.length} native actions`);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await api<ReminderRow[]>("/reminders", {
        query: { scope: "mine", status: "pending" },
      });
      setReminders(rows);
      // Also push to native scheduler if available.
      if (isNativeAlarmAvailable()) {
        try {
          await cancelAllAlarms();
          const n = await scheduleAlarms(toAlarmItems(rows));
          debugLog("info", "alarm", `native scheduled ${n} alarms`);
          await startKeepAlive();
        } catch (e: any) {
          debugLog("warn", "alarm", `native scheduling failed: ${e?.message || e}`);
        }
      }
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
      return t <= now && now - t < 15 * 60 * 1000;
    });
    if (due) {
      firedRef.current.add(due.id);
      debugLog("info", "alarm", `firing reminder ${due.id}`);
      setActive(due);
      void api(`/reminders/${due.id}/action`, {
        method: "POST",
        body: { action: "triggered", meta: { source: "in_app_poll" } },
      }).catch(() => undefined);
    }
  }, [user, active, reminders]);

  useEffect(() => {
    if (!user) return;
    void drainNative();
    void refresh();
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, [user, refresh, drainNative]);

  useEffect(() => {
    checkDue();
    const iv = setInterval(checkDue, 1000);
    return () => clearInterval(iv);
  }, [checkDue]);

  const dismiss = useCallback(() => {
    setActive(null);
    void refresh();
  }, [refresh]);

  const value = useMemo<Value>(
    () => ({ active, reminders, loading, refresh, dismiss }),
    [active, reminders, loading, refresh, dismiss],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminderAlarm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReminderAlarm must be inside ReminderAlarmProvider");
  return ctx;
}

export function isOverdue(iso?: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}
