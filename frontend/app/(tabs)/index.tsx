/**
 * Dashboard — MY | TEAM | ACTIVITY tabs (+ admin ALL CONTACTS | ALL EVENTS | ALL REMINDERS).
 * Reminder cards + activity feed.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
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
import { useAuth } from "@/src/auth-context";
import { formatDateTime, initials, avatarColor, relativeTime } from "@/src/helpers";
import { WaterDropLogo } from "@/src/components/WaterDropLogo";
import { COLORS, RADIUS, REMINDER_BORDERS, SHADOW, SPACING, TAG_COLORS } from "@/src/theme";
import { isOverdue } from "@/src/reminder-alarm";

type TabKey = "my" | "team" | "activity" | "all_contacts" | "all_events" | "all_reminders";
type FilterKey = "all" | "today" | "overdue" | "snoozed";

const ACT_ICON: Record<string, string> = {
  triggered: "🔔",
  snoozed: "💤",
  ended: "✅",
  delegated: "👤",
};

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<TabKey>("my");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [teamReminders, setTeamReminders] = useState<any[]>([]);
  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [allReminders, setAllReminders] = useState<any[]>([]);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const [mine, act] = await Promise.all([
          api<any[]>("/reminders", { query: { scope: "mine" } }),
          api<any[]>("/activity", { query: { limit: 60 } }),
        ]);
        setReminders(mine);
        setActivity(act);
        if (isAdmin) {
          const [teamR, allC, allE, allR] = await Promise.all([
            api<any[]>("/reminders", { query: { scope: "all" } }),
            api<any[]>("/contacts", { query: { scope: "all" } }),
            api<any[]>("/events", { query: { scope: "all" } }),
            api<any[]>("/reminders", { query: { scope: "all" } }),
          ]);
          setTeamReminders(teamR.filter((r) => r.assignee_id !== user?.id));
          setAllContacts(allC);
          setAllEvents(allE);
          setAllReminders(allR);
        }
      } catch {
        /* toast handled elsewhere */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdmin, user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Auto refresh activity every 30s
  useEffect(() => {
    const iv = setInterval(() => load({ silent: true }), 30000);
    return () => clearInterval(iv);
  }, [load]);

  const filteredReminders = useMemo(() => {
    let src: any[] =
      tab === "my"
        ? reminders
        : tab === "team"
        ? teamReminders
        : tab === "all_reminders"
        ? allReminders
        : [];
    const q = search.trim().toLowerCase();
    if (q) {
      src = src.filter((r) => {
        const ev = r.event || {};
        const c = ev.contact || {};
        return [c.full_name, c.organisation_name, ev.title].some((v) =>
          (v || "").toString().toLowerCase().includes(q),
        );
      });
    }
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 3600 * 1000;
    if (filter === "today") {
      src = src.filter((r) => {
        const t = new Date(r.remind_at).getTime();
        return t >= startOfDay && t < endOfDay;
      });
    } else if (filter === "overdue") {
      src = src.filter((r) => r.status === "pending" && isOverdue(r.remind_at));
    } else if (filter === "snoozed") {
      src = src.filter((r) => r.status === "snoozed");
    }
    return src;
  }, [tab, reminders, teamReminders, allReminders, filter, search]);

  const tabs: { key: TabKey; label: string }[] = useMemo(() => {
    const base: { key: TabKey; label: string }[] = [
      { key: "my", label: "MY" },
      { key: "team", label: "TEAM" },
      { key: "activity", label: "ACTIVITY" },
    ];
    if (isAdmin) {
      base.push({ key: "all_contacts", label: "ALL CONTACTS" });
      base.push({ key: "all_events", label: "ALL EVENTS" });
      base.push({ key: "all_reminders", label: "ALL REMINDERS" });
    }
    return base;
  }, [isAdmin]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>
            {greeting}, {user?.full_name?.split(" ")[0] || "there"}
          </Text>
          <Text style={styles.role}>
            {isAdmin ? "Admin" : "Team member"} · {user?.organisation_name || "—"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={styles.iconBtn}
          testID="dashboard-settings-btn"
        >
          <Ionicons name="settings-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <WaterDropLogo size={40} onSecretUnlock={() => router.push("/debug")} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsWrap}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
            testID={`dash-tab-${t.key}`}
          >
            <Text style={[styles.tabChipText, tab === t.key && styles.tabChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "my" || tab === "team" || tab === "all_reminders" ? (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search reminders"
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={COLORS.textMuted}
                testID="dashboard-search"
              />
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={styles.filterWrap}
          >
            {(["all", "today", "overdue", "snoozed"] as FilterKey[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.filterChip, filter === f && styles.filterChipActive]}
                testID={`dash-filter-${f}`}
              >
                <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                  {f[0].toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredReminders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load({ silent: true });
                }}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item }) => <ReminderCard reminder={item} />}
            ListEmptyComponent={
              loading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : (
                <View style={styles.emptyState} testID="dashboard-empty">
                  <Ionicons name="notifications-off-outline" size={48} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No reminders here</Text>
                  <Text style={styles.emptySub}>Create an event with a reminder to see it here.</Text>
                </View>
              )
            }
          />
        </>
      ) : null}

      {tab === "activity" ? (
        <FlatList
          data={activity}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ silent: true });
              }}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => <ActivityRow row={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="pulse" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          }
        />
      ) : null}

      {tab === "all_contacts" ? (
        <FlatList
          data={allContacts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => router.push(`/contact/${item.id}`)}
            >
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.full_name) }]}>
                <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{item.full_name}</Text>
                <Text style={styles.contactMeta}>{item.organisation_name || item.mobile || "—"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No contacts across the team.</Text>
            </View>
          }
        />
      ) : null}

      {tab === "all_events" ? (
        <FlatList
          data={allEvents}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.eventRow}
              onPress={() => router.push(`/event/${item.id}`)}
            >
              <View
                style={[
                  styles.eventBar,
                  { backgroundColor: (item.tag?.color) || COLORS.primary },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventMeta}>
                  {item.contact?.full_name || "—"} · {formatDateTime(item.event_at)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No events across the team.</Text>
            </View>
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

function ReminderCard({ reminder }: { reminder: any }) {
  const router = useRouter();
  const ev = reminder.event || {};
  const contact = ev.contact || {};
  const tag = ev.tag || null;
  const status = reminder.status || "pending";
  let borderColor = REMINDER_BORDERS.upcoming;
  if (status === "snoozed") borderColor = REMINDER_BORDERS.snoozed;
  else if (status === "archived") borderColor = REMINDER_BORDERS.archived;
  else if (isOverdue(reminder.remind_at)) borderColor = REMINDER_BORDERS.overdue;

  const tagColor = tag ? TAG_COLORS[tag.name] || tag.color || COLORS.primary : COLORS.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { borderLeftColor: borderColor }]}
      onPress={() => ev.id && router.push(`/event/${ev.id}`)}
      testID={`reminder-card-${reminder.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>
            {contact.full_name || ev.title || "Reminder"}
          </Text>
          {contact.organisation_name ? (
            <Text style={styles.cardOrg}>{contact.organisation_name}</Text>
          ) : null}
        </View>
        {tag ? (
          <View style={[styles.tagBadge, { backgroundColor: tagColor }]}>
            <Text style={styles.tagBadgeText}>{tag.name}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.cardMetaRow}>
          <Ionicons name="time" size={14} color={COLORS.textMuted} />
          <Text style={styles.cardMeta}>{formatDateTime(reminder.remind_at)}</Text>
        </View>
        {reminder.event?.assignee ? (
          <View style={styles.cardMetaRow}>
            <Ionicons name="person" size={14} color={COLORS.textMuted} />
            <Text style={styles.cardMeta}>{reminder.event.assignee.full_name || "—"}</Text>
          </View>
        ) : null}
        <View style={[styles.statusPill, { backgroundColor: `${borderColor}22` }]}>
          <Text style={[styles.statusPillText, { color: borderColor }]}>{status.toUpperCase()}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ActivityRow({ row }: { row: any }) {
  const icon = ACT_ICON[row.action] || "•";
  return (
    <View style={styles.activityRow} testID={`activity-row-${row.id}`}>
      <Text style={styles.activityIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityText}>
          <Text style={styles.activityStrong}>{row.actor?.full_name || "Someone"}</Text>{" "}
          {row.action}
          {row.contact_name ? (
            <>
              {" · "}
              <Text style={styles.activityStrong}>{row.contact_name}</Text>
            </>
          ) : null}
          {row.event_title ? ` (${row.event_title})` : ""}
        </Text>
        <Text style={styles.activityMeta}>{relativeTime(row.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  greeting: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  role: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
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
  tabsWrap: { maxHeight: 44, marginTop: 4 },
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
  tabChipText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 1 },
  tabChipTextActive: { color: COLORS.white },
  searchRow: { paddingHorizontal: SPACING.lg, marginTop: 8 },
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
  filterWrap: { maxHeight: 44, marginTop: 6 },
  filterRow: { paddingHorizontal: SPACING.lg, gap: 8, alignItems: "center" },
  filterChip: {
    height: 32,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexShrink: 0,
  },
  filterChipActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  filterChipTextActive: { color: COLORS.primary },
  listContent: { paddingHorizontal: SPACING.lg, paddingTop: 8, paddingBottom: 32, gap: 10 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 5,
    ...SHADOW.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  cardOrg: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  tagBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardFooter: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8, alignItems: "center" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMeta: { fontSize: 12, color: COLORS.textSecondary },
  statusPill: { marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  statusPillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  emptyState: { alignItems: "center", padding: 32, gap: 6 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },
  emptySub: { color: COLORS.textMuted, fontSize: 12, textAlign: "center" },
  activityRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  activityIcon: { fontSize: 22 },
  activityText: { fontSize: 14, color: COLORS.textPrimary },
  activityStrong: { fontWeight: "700" },
  activityMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  contactName: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  contactMeta: { fontSize: 12, color: COLORS.textSecondary },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  eventBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  eventTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  eventMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
