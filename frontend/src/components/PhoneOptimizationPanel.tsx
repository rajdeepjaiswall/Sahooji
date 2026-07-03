/**
 * Phone Optimisation panel — 6 live-checked items with Fix buttons.
 * On web/preview: uses stub Web Notification permission for #1 and
 * marks the rest as "Not applicable" (green Done) since native permissions
 * only exist in an APK build. On real Android: actual permission bridge.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";

export type OptimizationItemKey =
  | "notifications"
  | "exact_alarms"
  | "full_screen"
  | "overlay"
  | "battery"
  | "autostart";

type Item = {
  key: OptimizationItemKey;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const ITEMS: Item[] = [
  { key: "notifications", title: "Notifications", desc: "Allow notifications so reminders can pop up.", icon: "notifications" },
  { key: "exact_alarms", title: "Exact Alarms", desc: "Ring exactly on time even in Doze mode.", icon: "alarm" },
  { key: "full_screen", title: "Full-Screen Alarms", desc: "Show the alarm even when phone is locked.", icon: "phone-portrait" },
  { key: "overlay", title: "Display Over Other Apps", desc: "Draw the floating pill + assistant bubble.", icon: "layers" },
  { key: "battery", title: "Battery Optimisation Off", desc: "Prevent the OS from killing background alarms.", icon: "battery-charging" },
  { key: "autostart", title: "Autostart", desc: "Let the app relaunch itself after reboot / kill.", icon: "power" },
];

type Status = Record<OptimizationItemKey, boolean>;

// -----------------------------------------------------------------------------
// Native bridge (via global.SahuNative injected by the future Expo Config Plugin).
// On Expo Go / web / iOS this is undefined — we return sensible defaults.
// -----------------------------------------------------------------------------
type NativeBridge = {
  getPermissionStatus: () => Promise<Status & { manufacturer?: string }>;
  openSettings: (key: OptimizationItemKey) => Promise<void>;
};

function getNativeBridge(): NativeBridge | null {
  const g: any = globalThis as any;
  return g?.SahuNative || null;
}

async function fetchStatus(): Promise<Status> {
  const bridge = getNativeBridge();
  if (bridge) {
    try {
      const s = await bridge.getPermissionStatus();
      return {
        notifications: !!s.notifications,
        exact_alarms: !!s.exact_alarms,
        full_screen: !!s.full_screen,
        overlay: !!s.overlay,
        battery: !!s.battery,
        autostart: !!s.autostart,
      };
    } catch {
      /* fall through */
    }
  }
  // Web / Expo Go fallback: browser notification permission for #1, others granted.
  if (Platform.OS === "web" && typeof (globalThis as any).Notification !== "undefined") {
    return {
      notifications: (globalThis as any).Notification.permission === "granted",
      exact_alarms: true,
      full_screen: true,
      overlay: true,
      battery: true,
      autostart: true,
    };
  }
  return {
    notifications: true,
    exact_alarms: true,
    full_screen: true,
    overlay: true,
    battery: true,
    autostart: true,
  };
}

async function openFixFlow(key: OptimizationItemKey) {
  const bridge = getNativeBridge();
  if (bridge) {
    try {
      await bridge.openSettings(key);
      return;
    } catch {
      /* fall through */
    }
  }
  if (Platform.OS === "web") {
    if (key === "notifications" && typeof (globalThis as any).Notification !== "undefined") {
      await (globalThis as any).Notification.requestPermission();
      return;
    }
  }
  if (Platform.OS === "ios" || Platform.OS === "android") {
    void Linking.openSettings();
  }
}

// -----------------------------------------------------------------------------
// Panel component
// -----------------------------------------------------------------------------
type Props = {
  onAllGranted?: () => void;
  compact?: boolean;
};

export function PhoneOptimizationPanel({ onAllGranted, compact }: Props) {
  const [status, setStatus] = useState<Status>({
    notifications: false,
    exact_alarms: false,
    full_screen: false,
    overlay: false,
    battery: false,
    autostart: false,
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const s = await fetchStatus();
    setStatus(s);
    setLoading(false);
    if (Object.values(s).every(Boolean)) onAllGranted?.();
  }, [onAllGranted]);

  useEffect(() => {
    void reload();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void reload();
    });
    return () => sub.remove();
  }, [reload]);

  const done = useMemo(() => Object.values(status).filter(Boolean).length, [status]);
  const total = ITEMS.length;
  const allDone = done === total;

  return (
    <View style={styles.wrap} testID="phone-optimization-panel">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Phone Optimisation</Text>
          <Text style={styles.sub}>
            {done} of {total} done · reminders work reliably when all are enabled
          </Text>
        </View>
        <TouchableOpacity onPress={reload} style={styles.recheck} testID="phone-opt-recheck">
          <Ionicons name="refresh" size={16} color={COLORS.primary} />
          <Text style={styles.recheckText}>Re-check</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(done / total) * 100}%` }]} />
      </View>

      {allDone ? (
        <View style={styles.allGood} testID="phone-opt-all-good">
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.allGoodText}>Phone fully optimised</Text>
        </View>
      ) : null}

      <View style={{ marginTop: SPACING.md, gap: 8 }}>
        {ITEMS.map((it) => {
          const ok = status[it.key];
          return (
            <View key={it.key} style={styles.row} testID={`phone-opt-row-${it.key}`}>
              <View style={[styles.rowIcon, { backgroundColor: ok ? "#DCFCE7" : "#FEE2E2" }]}>
                <Ionicons name={it.icon} size={16} color={ok ? COLORS.success : COLORS.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{it.title}</Text>
                {!compact ? <Text style={styles.rowDesc}>{it.desc}</Text> : null}
              </View>
              <View style={styles.rowRight}>
                <View style={[styles.badge, { backgroundColor: ok ? "#DCFCE7" : "#FEE2E2" }]}>
                  <Text style={[styles.badgeText, { color: ok ? "#166534" : "#991B1B" }]}>
                    {ok ? "Done" : "Needs action"}
                  </Text>
                </View>
                {!ok ? (
                  <TouchableOpacity
                    style={styles.fixBtn}
                    onPress={async () => {
                      await openFixFlow(it.key);
                    }}
                    testID={`phone-opt-fix-${it.key}`}
                  >
                    <Text style={styles.fixBtnText}>Fix</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {loading ? <Text style={styles.loading}>Checking…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  recheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  recheckText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  progressBar: {
    height: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceMuted,
    marginTop: SPACING.md,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: COLORS.primary },
  allGood: {
    marginTop: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    padding: 10,
    borderRadius: RADIUS.md,
  },
  allGoodText: { color: "#166534", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  rowDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  badgeText: { fontSize: 11, fontWeight: "700" },
  fixBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  fixBtnText: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  loading: { marginTop: 8, color: COLORS.textMuted, fontSize: 12 },
});
