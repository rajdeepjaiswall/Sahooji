/**
 * Register screen — creates an account. First registered user is admin.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

import { WaterDropLogo } from "@/src/components/WaterDropLogo";
import { useAuth } from "@/src/auth-context";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function RegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [org, setOrg] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!fullName || !email || !password) {
      toast.show("Fill in name, email and password", "error");
      return;
    }
    if (password.length < 6) {
      toast.show("Password must be at least 6 characters", "error");
      return;
    }
    if (password !== confirm) {
      toast.show("Passwords don't match", "error");
      return;
    }
    setBusy(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        organisation_name: org.trim() || undefined,
        mobile: mobile.trim() || undefined,
      });
      toast.show("Welcome to Sahu!", "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.detail || "Registration failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.topbar}>
          <TouchableOpacity onPress={() => router.back()} testID="register-back-button">
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topbarTitle}>Create Account</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <WaterDropLogo size={56} />
            <Text style={styles.title}>Set up your workspace</Text>
            <Text style={styles.subtitle}>
              The first account created becomes the admin.
            </Text>
          </View>

          <View style={styles.card}>
            <Field label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Rajesh Sahu" testID="reg-full-name" />
            <Field label="Organisation" value={org} onChangeText={setOrg} placeholder="Sahu Sales Pvt Ltd" testID="reg-org" />
            <Field label="Mobile (+91)" value={mobile} onChangeText={setMobile} placeholder="9876543210" keyboardType="phone-pad" testID="reg-mobile" />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" testID="reg-email" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Min 6 characters" testID="reg-password" />
            <Field label="Confirm Password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Repeat" testID="reg-confirm" />

            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
              onPress={onSubmit}
              disabled={busy}
              testID="register-submit-button"
            >
              {busy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topbarTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  scroll: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },
  header: { alignItems: "center", marginTop: 8, gap: 6 },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, marginTop: 6 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: 16 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    minHeight: 48,
    marginTop: 6,
  },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
