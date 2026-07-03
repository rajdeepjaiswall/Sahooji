/**
 * Debug page — hidden. Access by tapping the water-drop logo 7 times.
 * Shows session, JWT decode, DB counts, storage inspector, and live log viewer.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, backendBaseUrl, getAccessToken, getRefreshToken } from "@/src/api";
import { debugLog, getDebugLogs, subscribeDebugLogs } from "@/src/debug-log";
import { COLORS, RADIUS, SPACING } from "@/src/theme";

function decodeJwt(token: string | null): any | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
    const decoded = typeof atob === "function" ? atob(pad) : Buffer.from(pad, "base64").toString("binary");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export default function DebugScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<string | null>(null);
  const [counts, setCounts] = useState<any | null>(null);
  const [countsErr, setCountsErr] = useState<string | null>(null);
  const [storageKeys, setStorageKeys] = useState<{ key: string; value: string }[]>([]);
  const [logs, setLogs] = useState(getDebugLogs());
  const [busy, setBusy] = useState(false);

  const loadTokens = useCallback(async () => {
    setToken(await getAccessToken());
    setRefresh(await getRefreshToken());
  }, []);

  const loadStorage = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const rows = await AsyncStorage.multiGet(keys);
      setStorageKeys(rows.map(([k, v]) => ({ key: k, value: v || "" })));
    } catch {
      setStorageKeys([]);
    }
  }, []);

  const runDbTests = useCallback(async () => {
    setBusy(true);
    setCountsErr(null);
    try {
      const c = await api<any>("/debug/counts");
      setCounts(c);
    } catch (e: any) {
      setCountsErr(String(e?.detail || e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
    void loadStorage();
    void runDbTests();
    const unsub = subscribeDebugLogs(() => setLogs(getDebugLogs()));
    return () => {
      unsub();
    };
  }, [loadTokens, loadStorage, runDbTests]);

  const payload = decodeJwt(token);
  const now = Math.floor(Date.now() / 1000);
  const valid = payload && payload.exp && payload.exp > now;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} testID="debug-back">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>/debug</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Section title="Session">
          <Row label="Backend" value={backendBaseUrl()} />
          <Row label="Access token" value={token ? `${token.slice(0, 24)}…` : "—"} />
          <Row label="Refresh token" value={refresh ? `${refresh.slice(0, 24)}…` : "—"} />
          {payload ? (
            <>
              <Row label="sub" value={String(payload.sub)} />
              <Row label="role" value={String(payload.role)} />
              <Row label="exp" value={new Date(payload.exp * 1000).toISOString()} />
              <View style={[styles.badge, { backgroundColor: valid ? COLORS.success : COLORS.danger }]}>
                <Text style={styles.badgeText}>{valid ? "VALID" : "EXPIRED"}</Text>
              </View>
            </>
          ) : null}
          <TouchableOpacity style={styles.actionBtn} onPress={loadTokens} testID="debug-refresh-tokens">
            <Ionicons name="refresh" size={16} color={COLORS.primary} />
            <Text style={styles.actionBtnText}>Refresh</Text>
          </TouchableOpacity>
        </Section>

        <Section title="DB Tests">
          <TouchableOpacity style={styles.actionBtn} onPress={runDbTests} disabled={busy} testID="debug-run-db">
            {busy ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <>
                <Ionicons name="play" size={16} color={COLORS.primary} />
                <Text style={styles.actionBtnText}>Run DB tests</Text>
              </>
            )}
          </TouchableOpacity>
          {countsErr ? <Text style={styles.err}>{countsErr}</Text> : null}
          {counts ? (
            <View style={{ marginTop: 8 }}>
              {Object.entries(counts).map(([k, v]) => (
                <Row key={k} label={k} value={String(v)} />
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Storage inspector">
          <TouchableOpacity style={styles.actionBtn} onPress={loadStorage} testID="debug-reload-storage">
            <Ionicons name="refresh" size={16} color={COLORS.primary} />
            <Text style={styles.actionBtnText}>Reload</Text>
          </TouchableOpacity>
          {storageKeys.map((k) => (
            <View key={k.key} style={styles.storageRow}>
              <Text style={[styles.mono, k.key.includes("Token") && { color: COLORS.danger }]}>{k.key}</Text>
              <Text style={styles.mono} numberOfLines={1}>
                {k.value.length > 80 ? `${k.value.slice(0, 80)}…` : k.value}
              </Text>
            </View>
          ))}
        </Section>

        <Section title={`Live logs (${logs.length}/500)`}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => debugLog("info", "debug", "manual test log")}
            testID="debug-add-log"
          >
            <Ionicons name="add" size={16} color={COLORS.primary} />
            <Text style={styles.actionBtnText}>Add test log</Text>
          </TouchableOpacity>
          {logs.slice(0, 100).map((l, i) => (
            <View
              key={`${l.ts}-${i}`}
              style={[
                styles.logRow,
                { borderLeftColor: l.level === "error" ? COLORS.danger : l.level === "warn" ? COLORS.warning : COLORS.info },
              ]}
            >
              <Text style={styles.logTs}>{new Date(l.ts).toLocaleTimeString()}</Text>
              <Text style={styles.logTag}>[{l.tag}]</Text>
              <Text style={styles.logMsg} numberOfLines={3}>{l.message}</Text>
            </View>
          ))}
          {logs.length === 0 ? <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>No logs yet</Text> : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{label}</Text>
      <Text style={styles.kvVal} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  topbarTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  scroll: { padding: SPACING.lg, paddingBottom: 48, gap: 12 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  sectionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 12, gap: 4 },
  kv: { flexDirection: "row", paddingVertical: 4, gap: 8, alignItems: "flex-start" },
  kvKey: { width: 90, fontSize: 11, color: COLORS.textSecondary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  kvVal: { flex: 1, fontSize: 12, color: COLORS.textPrimary, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: RADIUS.pill, backgroundColor: COLORS.primarySoft, marginTop: 6,
  },
  actionBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  storageRow: { paddingVertical: 6, gap: 2, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11, color: COLORS.textPrimary },
  logRow: {
    borderLeftWidth: 3, paddingVertical: 4, paddingHorizontal: 8,
    marginTop: 4, backgroundColor: COLORS.surface, gap: 2,
  },
  logTs: { fontSize: 10, color: COLORS.textMuted },
  logTag: { fontSize: 10, color: COLORS.primary, fontWeight: "700" },
  logMsg: { fontSize: 12, color: COLORS.textPrimary },
  err: { color: COLORS.danger, marginTop: 8, fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 11 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, marginTop: 6 },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
});
