/**
 * Contacts list — search, colored initials, FAB "Add contact".
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { avatarColor, initials } from "@/src/helpers";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type Contact = {
  id: string;
  full_name: string;
  organisation_name?: string;
  mobile?: string;
  email?: string;
};

export default function ContactsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<"name" | "recent">("recent");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<Contact[]>("/contacts", { query: { q: q || undefined } });
      setContacts(rows);
    } catch (e: any) {
      toast.show(e?.detail || "Failed to load", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sorted = useMemo(() => {
    const rows = [...contacts];
    if (sort === "name") {
      rows.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    }
    return rows;
  }, [contacts, sort]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Contacts</Text>
          <Text style={styles.sub}>{contacts.length} total</Text>
        </View>
        <TouchableOpacity
          onPress={() => setSort(sort === "name" ? "recent" : "name")}
          style={styles.iconBtn}
          testID="contacts-sort-btn"
        >
          <Ionicons name={sort === "name" ? "text" : "time"} size={18} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, org, mobile"
            value={q}
            onChangeText={setQ}
            placeholderTextColor={COLORS.textMuted}
            testID="contacts-search-input"
          />
        </View>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
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
            style={styles.row}
            onPress={() => router.push(`/contact/${item.id}`)}
            testID={`contact-row-${item.id}`}
          >
            <View style={[styles.avatar, { backgroundColor: avatarColor(item.full_name) }]}>
              <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.organisation_name || item.mobile || item.email || "—"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty} testID="contacts-empty">
            <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{loading ? "Loading…" : "No contacts yet"}</Text>
            <Text style={styles.emptySub}>Tap the + button to add your first contact.</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/contact/new")}
        testID="contacts-fab"
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchRow: { paddingHorizontal: SPACING.lg, marginTop: 4, marginBottom: 8 },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: COLORS.textPrimary },
  list: { paddingHorizontal: SPACING.lg, paddingVertical: 8, paddingBottom: 96, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  meta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { alignItems: "center", padding: 48, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.raised,
  },
});
