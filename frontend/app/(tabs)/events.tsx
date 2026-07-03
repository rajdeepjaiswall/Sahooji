/**
 * Events list — filter tabs (Upcoming/Completed/Cancelled/All), by tag, by assignee.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { formatDateTime } from "@/src/helpers";
import { COLORS, RADIUS, SHADOW, SPACING, TAG_COLORS } from "@/src/theme";
import { useToast } from "@/src/toast";

type StatusKey = "upcoming" | "completed" | "cancelled" | "all";

export default function EventsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<StatusKey>("upcoming");
  const [tagId, setTagId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ev, tg, tm] = await Promise.all([
        api<any[]>("/events", {
          query: {
            status: status === "all" ? undefined : status,
            tag_id: tagId || undefined,
            assignee: assigneeId || undefined,
          },
        }),
        api<any[]>("/tags"),
        api<any[]>("/team"),
      ]);
      setEvents(ev);
      setTags(tg);
      setTeam(tm);
    } catch (e: any) {
      toast.show(e?.detail || "Failed to load", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, tagId, assigneeId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTag = useMemo(() => tags.find((t) => t.id === tagId), [tags, tagId]);
  const activeAssignee = useMemo(() => team.find((t) => t.id === assigneeId), [team, assigneeId]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.sub}>{events.length} shown</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          style={styles.iconBtn}
          testID="events-filter-btn"
        >
          <Ionicons name="options" size={18} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsWrap}
      >
        {(["upcoming", "completed", "cancelled", "all"] as StatusKey[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatus(s)}
            style={[styles.tabChip, status === s && styles.tabChipActive]}
            testID={`events-status-${s}`}
          >
            <Text style={[styles.tabChipText, status === s && styles.tabChipTextActive]}>
              {s[0].toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {(activeTag || activeAssignee) ? (
        <View style={styles.chipRow}>
          {activeTag ? (
            <View style={[styles.activeChip, { backgroundColor: TAG_COLORS[activeTag.name] || activeTag.color }]}>
              <Text style={styles.activeChipText}>{activeTag.name}</Text>
              <TouchableOpacity onPress={() => setTagId(null)} testID="events-clear-tag">
                <Ionicons name="close" size={14} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ) : null}
          {activeAssignee ? (
            <View style={[styles.activeChip, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.activeChipText}>{activeAssignee.full_name}</Text>
              <TouchableOpacity onPress={() => setAssigneeId(null)} testID="events-clear-assignee">
                <Ionicons name="close" size={14} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
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
            onPress={() => router.push(`/event/${item.id}`)}
            testID={`event-row-${item.id}`}
          >
            <View
              style={[
                styles.bar,
                { backgroundColor: (item.tag && (TAG_COLORS[item.tag.name] || item.tag.color)) || COLORS.primary },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.contact?.full_name || "—"} · {formatDateTime(item.event_at)}
              </Text>
              <View style={styles.cardFooter}>
                {item.tag ? (
                  <View style={[styles.tagBadge, { backgroundColor: (TAG_COLORS[item.tag.name] || item.tag.color) }]}>
                    <Text style={styles.tagBadgeText}>{item.tag.name}</Text>
                  </View>
                ) : null}
                <Text style={styles.statusText}>{(item.status || "upcoming").toUpperCase()}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{loading ? "Loading…" : "No events"}</Text>
            <Text style={styles.emptySub}>Tap + to schedule your first event.</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/event/new")}
        testID="events-fab"
      >
        <Ionicons name="add" size={26} color={COLORS.white} />
      </TouchableOpacity>

      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowFilters(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Filter by tag</Text>
            <View style={styles.pickerWrap}>
              <TouchableOpacity
                onPress={() => setTagId(null)}
                style={[styles.pickerChip, !tagId && styles.pickerChipActive]}
              >
                <Text style={[styles.pickerChipText, !tagId && { color: COLORS.white }]}>All tags</Text>
              </TouchableOpacity>
              {tags.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTagId(t.id)}
                  style={[
                    styles.pickerChip,
                    tagId === t.id && { backgroundColor: TAG_COLORS[t.name] || t.color, borderColor: TAG_COLORS[t.name] || t.color },
                  ]}
                  testID={`filter-tag-${t.id}`}
                >
                  <Text style={[styles.pickerChipText, tagId === t.id && { color: COLORS.white }]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sheetTitle, { marginTop: 16 }]}>Filter by assignee</Text>
            <View style={styles.pickerWrap}>
              <TouchableOpacity
                onPress={() => setAssigneeId(null)}
                style={[styles.pickerChip, !assigneeId && styles.pickerChipActive]}
              >
                <Text style={[styles.pickerChipText, !assigneeId && { color: COLORS.white }]}>Anyone</Text>
              </TouchableOpacity>
              {team.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setAssigneeId(t.id)}
                  style={[styles.pickerChip, assigneeId === t.id && styles.pickerChipActive]}
                  testID={`filter-assignee-${t.id}`}
                >
                  <Text style={[styles.pickerChipText, assigneeId === t.id && { color: COLORS.white }]}>
                    {t.full_name || t.email}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => setShowFilters(false)}
              testID="events-apply-filter"
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  tabsWrap: { maxHeight: 44 },
  tabsRow: { paddingHorizontal: SPACING.lg, gap: 8, alignItems: "center" },
  tabChip: {
    height: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  tabChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  tabChipTextActive: { color: COLORS.white },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: SPACING.lg, marginTop: 8 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  activeChipText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
  list: { paddingHorizontal: SPACING.lg, paddingVertical: 12, paddingBottom: 96, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...SHADOW.card,
  },
  bar: { width: 4, borderRadius: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  tagBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  statusText: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, letterSpacing: 0.5 },
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
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
  },
  sheetTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pickerChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  applyBtn: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  applyBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
});
