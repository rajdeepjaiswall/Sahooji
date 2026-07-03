/**
 * Invoices list — tabs Draft/Sent/Paid/Cancelled/All + search + FAB.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { formatDateTime } from "@/src/helpers";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type StatusKey = "draft" | "sent" | "paid" | "cancelled" | "all";

const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  sent: "#3B82F6",
  paid: "#22C55E",
  cancelled: "#EF4444",
};

export default function InvoicesScreen() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<StatusKey>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<any[]>("/invoices", {
        query: { status: status === "all" ? undefined : status, q: q || undefined },
      });
      setRows(list);
    } catch (e: any) {
      toast.show(e?.detail || "Failed to load", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Invoices</Text>
          <Text style={styles.sub}>{rows.length} shown</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/products")}
          style={styles.iconBtn}
          testID="invoices-products-btn"
        >
          <Ionicons name="cube-outline" size={18} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search invoice number"
            value={q}
            onChangeText={setQ}
            placeholderTextColor={COLORS.textMuted}
            testID="invoices-search"
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsWrap}
      >
        {(["all", "draft", "sent", "paid", "cancelled"] as StatusKey[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatus(s)}
            style={[styles.tabChip, status === s && styles.tabChipActive]}
            testID={`invoices-status-${s}`}
          >
            <Text style={[styles.tabChipText, status === s && styles.tabChipTextActive]}>
              {s[0].toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/invoice/${item.id}`)}
            testID={`invoice-row-${item.id}`}
          >
            <View>
              <Text style={styles.invoiceNo}>{item.invoice_number}</Text>
              <Text style={styles.cardMeta}>
                {item.contact?.full_name || "—"} · {formatDateTime(item.invoice_date)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.amount}>₹ {Number(item.grand_total || 0).toFixed(2)}</Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: (STATUS_COLORS[item.status] || COLORS.textMuted) + "22" },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: STATUS_COLORS[item.status] || COLORS.textMuted },
                  ]}
                >
                  {(item.status || "draft").toUpperCase()}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{loading ? "Loading…" : "No invoices"}</Text>
            <Text style={styles.emptySub}>Tap + to create your first invoice.</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/invoice/new")}
        testID="invoices-fab"
      >
        <Ionicons name="add" size={26} color={COLORS.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  searchRow: { paddingHorizontal: SPACING.lg, marginBottom: 8 },
  searchInputWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: COLORS.textPrimary },
  tabsWrap: { maxHeight: 44 },
  tabsRow: { paddingHorizontal: SPACING.lg, gap: 8, alignItems: "center" },
  tabChip: {
    height: 36, paddingHorizontal: 14, justifyContent: "center",
    borderRadius: RADIUS.pill, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
  },
  tabChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  tabChipTextActive: { color: COLORS.white },
  list: { paddingHorizontal: SPACING.lg, paddingVertical: 12, paddingBottom: 96, gap: 10 },
  card: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },
  invoiceNo: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "800", color: COLORS.primary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill, marginTop: 4 },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: 48, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  fab: {
    position: "absolute", right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
    ...SHADOW.raised,
  },
});
