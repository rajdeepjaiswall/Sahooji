/**
 * Full-screen Alarm Takeover modal.
 * Shown when a reminder becomes due (web/Expo Go in-app fallback).
 */

import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, Vibration } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { formatDateTime, openSms, openTel, openWhatsApp } from "@/src/helpers";
import { useReminderAlarm } from "@/src/reminder-alarm";
import { COLORS, RADIUS, SPACING, TAG_COLORS } from "@/src/theme";
import { useToast } from "@/src/toast";

const SNOOZE_OPTIONS = [
  { label: "3 sec (test)", minutes: 0.05 },
  { label: "30 min", minutes: 30 },
  { label: "50 min", minutes: 50 },
  { label: "3 hr", minutes: 180 },
];

export function AlarmTakeover() {
  const { active, dismiss } = useReminderAlarm();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowSnooze(false);
      setShowAssign(false);
      setMuted(false);
      return;
    }
    // Vibrate loop while active on native
    if (Platform.OS !== "web" && !muted) {
      Vibration.vibrate([0, 800, 400, 800], true);
    }
    return () => {
      if (Platform.OS !== "web") Vibration.cancel();
    };
  }, [active, muted]);

  useEffect(() => {
    if (!active) return;
    api<any[]>("/team")
      .then((rows) => setTeammates(rows.filter((t) => t.id !== user?.id && !t.is_disabled)))
      .catch(() => undefined);
  }, [active, user]);

  if (!active) return null;

  const ev = active.event || {};
  const contact = ev.contact || {};
  const tag = ev.tag || null;
  const tagColor = (tag?.name && TAG_COLORS[tag.name]) || tag?.color || COLORS.primary;

  const doEnd = async () => {
    setBusy(true);
    try {
      await api(`/reminders/${active.id}/action`, { method: "POST", body: { action: "ended" } });
      toast.show("Reminder ended", "success");
      dismiss();
    } catch (e: any) {
      toast.show(e?.detail || "Failed to end", "error");
    } finally {
      setBusy(false);
    }
  };

  const doSnooze = async (minutes: number) => {
    setBusy(true);
    try {
      await api(`/reminders/${active.id}/action`, {
        method: "POST",
        body: { action: "snoozed", snooze_minutes: minutes },
      });
      toast.show(`Snoozed ${minutes} min`, "success");
      dismiss();
    } catch (e: any) {
      toast.show(e?.detail || "Failed to snooze", "error");
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async (uid: string) => {
    setBusy(true);
    try {
      await api(`/reminders/${active.id}/action`, {
        method: "POST",
        body: { action: "delegated", delegate_to: uid },
      });
      toast.show("Assigned to teammate", "success");
      dismiss();
    } catch (e: any) {
      toast.show(e?.detail || "Failed to assign", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!active}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent={false}
      onRequestClose={() => undefined}
    >
      <LinearGradient
        colors={[tagColor, "#0F172A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.pulse}>
            <Ionicons name="notifications" size={20} color={COLORS.white} />
          </View>
          <Text style={styles.headerLabel}>Reminder</Text>
          <TouchableOpacity
            style={styles.muteBtn}
            onPress={() => {
              setMuted(true);
              if (Platform.OS !== "web") Vibration.cancel();
            }}
            testID="alarm-mute"
          >
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {tag ? (
            <View style={[styles.tagBadge, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Text style={styles.tagBadgeText}>{tag.name}</Text>
            </View>
          ) : null}
          <Text style={styles.contactName} numberOfLines={2} testID="alarm-contact-name">
            {contact.full_name || ev.title || "Reminder"}
          </Text>
          {contact.organisation_name ? (
            <Text style={styles.contactOrg}>{contact.organisation_name}</Text>
          ) : null}
          <Text style={styles.time} testID="alarm-time">
            {formatDateTime(ev.event_at || active.remind_at)}
          </Text>
          {ev.title ? <Text style={styles.title}>{ev.title}</Text> : null}
          {ev.description ? <Text style={styles.desc}>{ev.description}</Text> : null}

          <View style={styles.quickRow}>
            <QuickBtn
              icon="call"
              label="Call"
              onPress={() => contact.mobile && openTel(contact.mobile)}
              testID="alarm-quick-call"
            />
            <QuickBtn
              icon="logo-whatsapp"
              label="WhatsApp"
              onPress={() => contact.mobile && openWhatsApp(contact.mobile)}
              testID="alarm-quick-whatsapp"
            />
            <QuickBtn
              icon="chatbubble"
              label="SMS"
              onPress={() => contact.mobile && openSms(contact.mobile)}
              testID="alarm-quick-sms"
            />
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
            onPress={doEnd}
            disabled={busy}
            testID="alarm-end-btn"
          >
            <Ionicons name="close-circle" size={22} color={COLORS.white} />
            <Text style={styles.actionText}>END</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.warning }]}
            onPress={() => setShowSnooze(true)}
            disabled={busy}
            testID="alarm-snooze-btn"
          >
            <Ionicons name="moon" size={22} color={COLORS.white} />
            <Text style={styles.actionText}>SNOOZE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
            onPress={() => setShowAssign(true)}
            disabled={busy || teammates.length === 0}
            testID="alarm-assign-btn"
          >
            <Ionicons name="people" size={22} color={COLORS.white} />
            <Text style={styles.actionText}>ASSIGN</Text>
          </TouchableOpacity>
        </View>

        {/* Snooze picker */}
        {showSnooze ? (
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowSnooze(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Snooze for</Text>
              {SNOOZE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.label}
                  style={styles.sheetRow}
                  onPress={() => doSnooze(o.minutes)}
                  testID={`snooze-${o.minutes}`}
                >
                  <Ionicons name="time" size={18} color={COLORS.primary} />
                  <Text style={styles.sheetRowText}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        ) : null}

        {/* Assign picker */}
        {showAssign ? (
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowAssign(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Assign to teammate</Text>
              {teammates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.sheetRow}
                  onPress={() => doAssign(t.id)}
                  testID={`assign-${t.id}`}
                >
                  <Ionicons name="person" size={18} color={COLORS.primary} />
                  <Text style={styles.sheetRowText}>{t.full_name || t.email}</Text>
                </TouchableOpacity>
              ))}
              {teammates.length === 0 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>No teammates yet</Text>
              ) : null}
            </Pressable>
          </Pressable>
        ) : null}
      </LinearGradient>
    </Modal>
  );
}

function QuickBtn({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.quickBtn} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={COLORS.white} />
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: 48, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  pulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: { color: COLORS.white, fontSize: 14, fontWeight: "700", flex: 1 },
  muteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, justifyContent: "center" },
  tagBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    marginBottom: 12,
  },
  tagBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  contactName: { color: COLORS.white, fontSize: 34, fontWeight: "800", lineHeight: 38 },
  contactOrg: { color: "rgba(255,255,255,0.85)", fontSize: 16, marginTop: 4 },
  time: { color: COLORS.white, fontSize: 18, fontWeight: "600", marginTop: 18 },
  title: { color: "rgba(255,255,255,0.85)", fontSize: 16, marginTop: 12 },
  desc: { color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 },
  quickRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  quickBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
    gap: 6,
  },
  quickLabel: { color: COLORS.white, fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
    gap: 6,
  },
  actionText: { color: COLORS.white, fontWeight: "800", letterSpacing: 1 },
  sheetBackdrop: {
    position: "absolute",
    inset: 0 as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetRowText: { fontSize: 15, color: COLORS.textPrimary, fontWeight: "600" },
});
