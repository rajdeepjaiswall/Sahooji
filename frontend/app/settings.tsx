/**
 * Settings — profile, password, ringtone (upload not on web), tags manager,
 * DB connection info, floating assistant toggle, Phone Optimisation, About.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, backendBaseUrl, clearTokens } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PhoneOptimizationPanel } from "@/src/components/PhoneOptimizationPanel";
import { WaterDropLogo } from "@/src/components/WaterDropLogo";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, patchUser, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);

  if (!user) return null;

  const onLogout = async () => {
    await clearTokens();
    await logout();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.identityCard}>
          <WaterDropLogo size={56} onSecretUnlock={() => router.push("/debug")} testID="settings-logo" />
          <Text style={styles.identityName}>{user.full_name || user.email}</Text>
          <Text style={styles.identityMeta}>{user.organisation_name || "—"}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user.role.toUpperCase()}</Text>
          </View>
        </View>

        <Section title="Account">
          <Row icon="person-circle" title="My Profile" onPress={() => setProfileOpen(true)} testID="settings-profile" />
          <Row icon="lock-closed" title="Change Password" onPress={() => setPwOpen(true)} testID="settings-password" />
        </Section>

        <Section title="Alarms & Reminders">
          <Row icon="musical-notes" title="Alarm & Ringtone" onPress={() => toast.show("Ringtone upload requires the APK build", "info")} />
          <RowSwitch
            icon="phone-portrait"
            title="Vibrate on alarm"
            value={!!user.vibrate}
            onValueChange={async (v) => {
              try {
                await patchUser({ vibrate: v });
              } catch (e: any) {
                toast.show(e?.detail || "Failed", "error");
              }
            }}
            testID="settings-vibrate"
          />
          <RowSwitch
            icon="ellipse"
            title="Floating Assistant"
            value={!!user.floating_assistant}
            onValueChange={async (v) => {
              try {
                await patchUser({ floating_assistant: v });
                if (v) toast.show("Requires 'Display over other apps' on Android APK build", "info");
              } catch (e: any) {
                toast.show(e?.detail || "Failed", "error");
              }
            }}
            testID="settings-floating"
          />
          <Row icon="pricetags" title="Event Tags" onPress={() => setTagsOpen(true)} testID="settings-tags" />
          <Row icon="cube-outline" title="Products" onPress={() => router.push("/products")} testID="settings-products" />
        </Section>

        <Section title="Phone Optimisation">
          <PhoneOptimizationPanel />
        </Section>

        <Section title="Database Connection">
          <View style={styles.dbCard}>
            <Text style={styles.dbLine}>Backend: <Text style={styles.dbMono}>{backendBaseUrl()}</Text></Text>
            <Text style={styles.dbLine}>Status: <Text style={{ color: COLORS.success, fontWeight: "700" }}>Connected</Text></Text>
          </View>
        </Section>

        <Section title="About">
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>Sahu Sales Solution</Text>
            <Text style={styles.aboutMeta}>v1.0.0 · Internal build</Text>
            <Text style={styles.aboutMeta}>Tap the drop logo 7 times to open /debug.</Text>
          </View>
        </Section>

        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} testID="settings-logout">
          <Ionicons name="log-out" size={18} color={COLORS.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
      <PasswordSheet visible={pwOpen} onClose={() => setPwOpen(false)} />
      <TagsSheet visible={tagsOpen} onClose={() => setTagsOpen(false)} />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  onPress,
  testID,
}: {
  icon: any;
  title: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function RowSwitch({
  icon,
  title,
  value,
  onValueChange,
  testID,
}: {
  icon: any;
  title: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={[styles.rowTitle, { flex: 1 }]}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: COLORS.primary, false: COLORS.border }}
        thumbColor={COLORS.white}
        testID={testID}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const { user, patchUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [org, setOrg] = useState(user?.organisation_name || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await patchUser({ full_name: fullName, organisation_name: org, mobile });
      toast.show("Profile updated", "success");
      onClose();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="My Profile">
      <F label="Full name" value={fullName} onChangeText={setFullName} testID="profile-name" />
      <F label="Organisation" value={org} onChangeText={setOrg} testID="profile-org" />
      <F label="Mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" testID="profile-mobile" />
      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy} testID="profile-save">
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>Save profile</Text>}
      </TouchableOpacity>
    </Sheet>
  );
}

function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!cur || nw.length < 6) {
      toast.show("Enter current & new (min 6) password", "error");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password-change", { method: "POST", body: { current_password: cur, new_password: nw } });
      toast.show("Password changed", "success");
      onClose();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Change Password">
      <F label="Current password" value={cur} onChangeText={setCur} secureTextEntry testID="pw-current" />
      <F label="New password" value={nw} onChangeText={setNw} secureTextEntry testID="pw-new" />
      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy} testID="pw-save">
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>Update password</Text>}
      </TouchableOpacity>
    </Sheet>
  );
}

function TagsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1565C0");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const rows = await api<any[]>("/tags");
      setTags(rows);
    } catch {
      /* noop */
    }
  };

  React.useEffect(() => {
    if (visible) void load();
  }, [visible]);

  const add = async () => {
    if (!name) return;
    setBusy(true);
    try {
      await api("/tags", { method: "POST", body: { name, color, icon: "tag" } });
      setName("");
      await load();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await api(`/tags/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    }
  };

  const swatches = ["#1565C0", "#F97316", "#3B82F6", "#22C55E", "#EAB308", "#EF4444", "#8B5CF6", "#10B981", "#EC4899"];

  return (
    <Sheet visible={visible} onClose={onClose} title="Event Tags">
      <View style={{ maxHeight: 260 }}>
        <ScrollView>
          {tags.map((t) => (
            <View key={t.id} style={styles.tagRow}>
              <View style={[styles.tagDot, { backgroundColor: t.color }]} />
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontWeight: "600" }}>{t.name}</Text>
              <TouchableOpacity onPress={() => del(t.id)} testID={`tag-del-${t.id}`}>
                <Ionicons name="trash" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
      <F label="New tag name" value={name} onChangeText={setName} testID="tag-new-name" />
      <Text style={styles.label}>Color</Text>
      <View style={styles.swatchRow}>
        {swatches.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c, borderColor: color === c ? COLORS.textPrimary : "transparent" }]}
          />
        ))}
      </View>
      <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={add} disabled={busy || !name} testID="tag-add-btn">
        <Text style={styles.primaryBtnText}>Add tag</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function F({
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
  topbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  topbarTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  scroll: { padding: SPACING.lg, paddingBottom: 48 },
  identityCard: {
    alignItems: "center", padding: 20, gap: 6,
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },
  identityName: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8 },
  identityMeta: { fontSize: 13, color: COLORS.textSecondary },
  roleBadge: { backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, marginTop: 4 },
  roleBadgeText: { color: COLORS.primary, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  sectionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primarySoft, alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.textPrimary },
  dbCard: { padding: 14, gap: 6, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  dbLine: { fontSize: 13, color: COLORS.textSecondary },
  dbMono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), color: COLORS.textPrimary, fontSize: 12 },
  aboutCard: { padding: 14, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  aboutTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  aboutMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  logoutBtn: {
    marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.danger,
  },
  logoutText: { color: COLORS.danger, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: "88%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.textPrimary, backgroundColor: COLORS.surface, minHeight: 48, marginTop: 6,
  },
  primaryBtn: {
    marginTop: 20, backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: RADIUS.md, alignItems: "center", minHeight: 48, justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  tagRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tagDot: { width: 14, height: 14, borderRadius: 7 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
});
