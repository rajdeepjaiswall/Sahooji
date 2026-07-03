/**
 * Team — admin manages, members read-only.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { avatarColor, initials } from "@/src/helpers";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type Member = {
  id: string;
  email: string;
  full_name?: string;
  organisation_name?: string;
  mobile?: string;
  role: "admin" | "team_member";
  is_disabled?: boolean;
  permissions?: Record<string, boolean>;
};

export default function TeamScreen() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<Member[]>("/team");
      setMembers(rows);
    } catch (e: any) {
      toast.show(e?.detail || "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Team</Text>
          <Text style={styles.sub}>{members.length} members</Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, item.is_disabled && { opacity: 0.5 }]}
            onPress={() => isAdmin && setEditing(item)}
            disabled={!isAdmin}
            testID={`team-row-${item.id}`}
          >
            <View style={[styles.avatar, { backgroundColor: avatarColor(item.full_name || item.email) }]}>
              <Text style={styles.avatarText}>{initials(item.full_name || item.email)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name || item.email}</Text>
              <Text style={styles.email}>{item.email}</Text>
              {item.mobile ? <Text style={styles.email}>{item.mobile}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <View style={[styles.roleBadge, { backgroundColor: item.role === "admin" ? COLORS.primary : COLORS.surfaceMuted }]}>
                <Text style={[styles.roleBadgeText, { color: item.role === "admin" ? COLORS.white : COLORS.textSecondary }]}>
                  {item.role.replace("_", " ")}
                </Text>
              </View>
              {item.is_disabled ? (
                <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: "700" }}>DISABLED</Text>
              ) : (
                <Text style={{ fontSize: 11, color: COLORS.success, fontWeight: "700" }}>ACTIVE</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No team members yet</Text>
            </View>
          )
        }
      />

      {isAdmin ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAdd(true)}
          testID="team-fab"
        >
          <Ionicons name="person-add" size={24} color={COLORS.white} />
        </TouchableOpacity>
      ) : null}

      <AddMemberSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={async () => {
          setShowAdd(false);
          await load();
        }}
      />

      <EditMemberSheet
        member={editing}
        onClose={() => setEditing(null)}
        onUpdated={async () => {
          setEditing(null);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Add member sheet
// ---------------------------------------------------------------------------
function AddMemberSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [pw, setPw] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({
    contacts: true,
    events: true,
    reminders: true,
    invoices: true,
    team: false,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !fullName || !pw) {
      toast.show("Fill in name, email, temporary password", "error");
      return;
    }
    setBusy(true);
    try {
      await api("/team", {
        method: "POST",
        body: { email, full_name: fullName, mobile, password: pw, permissions: perms, role: "team_member" },
      });
      toast.show("Team member added", "success");
      setEmail("");
      setFullName("");
      setMobile("");
      setPw("");
      await onCreated();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Add team member</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <Field label="Full name" value={fullName} onChangeText={setFullName} testID="team-add-name" />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="team-add-email" />
              <Field label="Mobile (+91)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" testID="team-add-mobile" />
              <Field label="Temporary password" value={pw} onChangeText={setPw} secureTextEntry testID="team-add-pw" />

              <Text style={styles.section}>Permissions</Text>
              {(["contacts", "events", "reminders", "invoices", "team"] as const).map((k) => (
                <View style={styles.permRow} key={k}>
                  <Text style={styles.permLabel}>
                    {k === "team" ? "Manage team" : `Create ${k}`}
                  </Text>
                  <Switch
                    value={!!perms[k]}
                    onValueChange={(v) => setPerms({ ...perms, [k]: v })}
                    trackColor={{ true: COLORS.primary, false: COLORS.border }}
                    thumbColor={COLORS.white}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                onPress={submit}
                disabled={busy}
                testID="team-add-submit"
              >
                {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>Add member</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit member sheet
// ---------------------------------------------------------------------------
function EditMemberSheet({
  member,
  onClose,
  onUpdated,
}: {
  member: Member | null;
  onClose: () => void;
  onUpdated: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [disabled, setDisabled] = useState(false);
  const [role, setRole] = useState<"admin" | "team_member">("team_member");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setPerms(member.permissions || {});
      setDisabled(!!member.is_disabled);
      setRole(member.role);
      setNewPw("");
    }
  }, [member]);

  if (!member) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/team/${member.id}`, {
        method: "PATCH",
        body: { permissions: perms, is_disabled: disabled, role },
      });
      toast.show("Updated", "success");
      await onUpdated();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const resetPw = async () => {
    if (!newPw || newPw.length < 6) {
      toast.show("Password must be at least 6 characters", "error");
      return;
    }
    setBusy(true);
    try {
      await api(`/team/${member.id}/reset-password`, { method: "POST", body: { new_password: newPw } });
      toast.show("Password reset", "success");
      setNewPw("");
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!member} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{member.full_name || member.email}</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.metaEmail}>{member.email}</Text>

              <Text style={styles.section}>Role</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["admin", "team_member"] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRole(r)}
                    style={[
                      styles.pickerChip,
                      role === r && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                    ]}
                    testID={`role-${r}`}
                  >
                    <Text style={[styles.pickerChipText, role === r && { color: COLORS.white }]}>
                      {r.replace("_", " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.section}>Permissions</Text>
              {(["contacts", "events", "reminders", "invoices", "team"] as const).map((k) => (
                <View style={styles.permRow} key={k}>
                  <Text style={styles.permLabel}>
                    {k === "team" ? "Manage team" : `Create ${k}`}
                  </Text>
                  <Switch
                    value={!!perms[k]}
                    onValueChange={(v) => setPerms({ ...perms, [k]: v })}
                    trackColor={{ true: COLORS.primary, false: COLORS.border }}
                    thumbColor={COLORS.white}
                  />
                </View>
              ))}

              <View style={[styles.permRow, { marginTop: 4 }]}>
                <Text style={[styles.permLabel, { color: COLORS.danger }]}>Disabled</Text>
                <Switch
                  value={disabled}
                  onValueChange={setDisabled}
                  trackColor={{ true: COLORS.danger, false: COLORS.border }}
                  thumbColor={COLORS.white}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
                onPress={save}
                disabled={busy}
                testID="team-edit-save"
              >
                {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>Save changes</Text>}
              </TouchableOpacity>

              <Text style={styles.section}>Reset password</Text>
              <TextInput
                style={styles.input}
                placeholder="New password"
                value={newPw}
                onChangeText={setNewPw}
                secureTextEntry
                placeholderTextColor={COLORS.textMuted}
                testID="team-edit-newpw"
              />
              <TouchableOpacity style={styles.outlineBtn} onPress={resetPw} disabled={busy} testID="team-edit-reset-btn">
                <Text style={styles.outlineBtnText}>Send password reset</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({
  label,
  testID,
  ...props
}: {
  label: string;
  testID?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={COLORS.textMuted}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", padding: SPACING.lg },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: SPACING.lg, paddingVertical: 4, paddingBottom: 96, gap: 10 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.white, fontWeight: "800", fontSize: 15 },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  email: { fontSize: 12, color: COLORS.textSecondary },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill },
  roleBadgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: 48, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  fab: {
    position: "absolute", right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
    ...SHADOW.raised,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: "90%",
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  metaEmail: { fontSize: 12, color: COLORS.textSecondary },
  section: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.textPrimary, backgroundColor: COLORS.surface,
    minHeight: 48, marginTop: 6,
  },
  permRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  permLabel: { fontSize: 14, color: COLORS.textPrimary, fontWeight: "600" },
  pickerChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pickerChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  primaryBtn: {
    marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: RADIUS.md, alignItems: "center", minHeight: 48, justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  outlineBtn: {
    marginTop: 10, borderWidth: 1, borderColor: COLORS.primary, paddingVertical: 12,
    borderRadius: RADIUS.md, alignItems: "center", minHeight: 48, justifyContent: "center",
  },
  outlineBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
});
