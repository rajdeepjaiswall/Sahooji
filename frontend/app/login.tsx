/**
 * Login screen — internal sign-in only.
 * - centered card with water-drop logo
 * - email + password
 * - large Sign In button
 * - "Create Admin Account" outlined button
 * - BLACK "Optimise phone for reliable reminders" box turning GREEN then disappearing
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

import { PhoneOptimizationPanel } from "@/src/components/PhoneOptimizationPanel";
import { WaterDropLogo } from "@/src/components/WaterDropLogo";
import { useAuth } from "@/src/auth-context";
import { debugLog } from "@/src/debug-log";
import { storage } from "@/src/utils/storage";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

const OPT_DISMISSED_KEY = "sahu.phoneOptDismissed";

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const { login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [optDismissed, setOptDismissed] = useState(true);
  const [allGranted, setAllGranted] = useState(false);
  const [flashGreen, setFlashGreen] = useState(false);

  useEffect(() => {
    (async () => {
      const dismissed = await storage.getItem<boolean>(OPT_DISMISSED_KEY, false);
      setOptDismissed(!!dismissed);
    })();
  }, []);

  useEffect(() => {
    if (user) router.replace("/(tabs)");
  }, [user, router]);

  const onLogin = async () => {
    if (!email || !password) {
      toast.show("Enter email and password", "error");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e?.detail || "Login failed", "error");
      debugLog("error", "auth", `login error: ${e?.detail}`);
    } finally {
      setBusy(false);
    }
  };

  const onAllGranted = () => {
    if (!allGranted) {
      setAllGranted(true);
      setFlashGreen(true);
      setTimeout(async () => {
        setFlashGreen(false);
        await storage.setItem(OPT_DISMISSED_KEY, true);
        setOptDismissed(true);
      }, 3000);
    }
  };

  const showBox = !optDismissed || !allGranted;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <WaterDropLogo size={72} testID="login-logo" />
            <Text style={styles.brand}>Sahu Sales Solution</Text>
            <Text style={styles.subtitle}>Internal sign-in only</Text>
          </View>

          <View style={styles.card} testID="login-card">
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholderTextColor={COLORS.textMuted}
              testID="login-email-input"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor={COLORS.textMuted}
              testID="login-password-input"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
              onPress={onLogin}
              disabled={busy}
              testID="login-submit-button"
            >
              {busy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => router.push("/register")}
              testID="login-create-admin-button"
            >
              <Text style={styles.outlineBtnText}>Create Admin Account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgot}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {showBox ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowPanel(true)}
              style={[
                styles.optBox,
                {
                  backgroundColor: flashGreen ? COLORS.success : "#0F172A",
                },
              ]}
              testID="phone-opt-box"
            >
              <Ionicons name={flashGreen ? "checkmark-circle" : "construct"} size={18} color={COLORS.white} />
              <Text style={styles.optBoxText}>
                {flashGreen
                  ? "Phone fully optimised"
                  : "🔧 Optimise phone for reliable reminders"}
              </Text>
              {!flashGreen ? (
                <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
              ) : null}
            </TouchableOpacity>
          ) : null}

          <Text style={styles.footer}>Sahu Sales Solution · v1.0.0</Text>
        </ScrollView>

        <TouchableOpacity
          style={styles.wrenchFab}
          onPress={() => setShowPanel(true)}
          testID="phone-opt-fab"
        >
          <Ionicons name="construct" size={20} color={COLORS.white} />
        </TouchableOpacity>

        <Modal
          visible={showPanel}
          animationType="slide"
          transparent
          onRequestClose={() => setShowPanel(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowPanel(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Phone Optimisation</Text>
                <TouchableOpacity onPress={() => setShowPanel(false)} testID="phone-opt-close">
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                <PhoneOptimizationPanel onAllGranted={onAllGranted} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 48 },
  header: { alignItems: "center", marginTop: 24, gap: 8 },
  brand: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, marginTop: 8 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 6,
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
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  outlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  outlineBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
  forgot: { alignItems: "center", marginTop: 12 },
  forgotText: { color: COLORS.textSecondary, fontSize: 13 },
  optBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  optBoxText: { flex: 1, color: COLORS.white, fontWeight: "600", fontSize: 14 },
  footer: { textAlign: "center", color: COLORS.textMuted, fontSize: 12, marginTop: 20 },
  wrenchFab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.raised,
  },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: "88%",
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
});
