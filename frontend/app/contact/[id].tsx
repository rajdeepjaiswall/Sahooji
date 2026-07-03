/**
 * Contact create/edit — /contact/new or /contact/[id]?edit=1
 */

import React, { useEffect, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type Form = {
  full_name: string;
  organisation_name: string;
  mobile: string;
  alternate_mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gps_lat?: number;
  gps_lng?: number;
  notes: string;
  purchase_history: string;
  tags: string;
};

const EMPTY: Form = {
  full_name: "",
  organisation_name: "",
  mobile: "",
  alternate_mobile: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  notes: "",
  purchase_history: "",
  tags: "",
};

export default function ContactFormScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (isNew) return;
      try {
        const c = await api<any>(`/contacts/${params.id}`);
        setForm({
          full_name: c.full_name || "",
          organisation_name: c.organisation_name || "",
          mobile: c.mobile || "",
          alternate_mobile: c.alternate_mobile || "",
          email: c.email || "",
          address: c.address || "",
          city: c.city || "",
          state: c.state || "",
          pincode: c.pincode || "",
          gps_lat: c.gps_lat,
          gps_lng: c.gps_lng,
          notes: c.notes || "",
          purchase_history: c.purchase_history || "",
          tags: (c.tags || []).join(", "),
        });
      } catch (e: any) {
        toast.show(e?.detail || "Failed to load", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, params.id, toast]);

  const detectLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        toast.show("Location permission denied", "error");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm((f) => ({ ...f, gps_lat: pos.coords.latitude, gps_lng: pos.coords.longitude }));
      toast.show("GPS captured", "success");
    } catch {
      toast.show("Failed to get location", "error");
    } finally {
      setLocBusy(false);
    }
  };

  const submit = async () => {
    if (!form.full_name) {
      toast.show("Full name required", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (isNew) {
        await api("/contacts", { method: "POST", body });
        toast.show("Contact created", "success");
      } else {
        await api(`/contacts/${params.id}`, { method: "PATCH", body });
        toast.show("Contact updated", "success");
      }
      router.back();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} testID="contact-form-back">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>{isNew ? "New Contact" : "Edit Contact"}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <F label="Full Name *" value={form.full_name} onChangeText={(v) => setForm({ ...form, full_name: v })} testID="contact-name" />
          <F label="Organisation" value={form.organisation_name} onChangeText={(v) => setForm({ ...form, organisation_name: v })} testID="contact-org" />
          <F label="Mobile (+91)" value={form.mobile} onChangeText={(v) => setForm({ ...form, mobile: v })} keyboardType="phone-pad" testID="contact-mobile" />
          <F label="Alternate Mobile" value={form.alternate_mobile} onChangeText={(v) => setForm({ ...form, alternate_mobile: v })} keyboardType="phone-pad" />
          <F label="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
          <F label="Address" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 2 }}>
              <F label="City" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
            </View>
            <View style={{ flex: 2 }}>
              <F label="State" value={form.state} onChangeText={(v) => setForm({ ...form, state: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <F label="Pin" value={form.pincode} onChangeText={(v) => setForm({ ...form, pincode: v })} keyboardType="number-pad" />
            </View>
          </View>

          <View style={styles.gpsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GPS</Text>
              <Text style={styles.gpsText}>
                {form.gps_lat && form.gps_lng ? `${form.gps_lat.toFixed(5)}, ${form.gps_lng.toFixed(5)}` : "Not set"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={detectLocation}
              disabled={locBusy}
              testID="contact-gps-btn"
            >
              {locBusy ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="location" size={16} color={COLORS.white} />
                  <Text style={styles.gpsBtnText}>Detect</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <F label="Tags (comma separated)" value={form.tags} onChangeText={(v) => setForm({ ...form, tags: v })} />
          <F label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />
          <F label="Purchase History" value={form.purchase_history} onChangeText={(v) => setForm({ ...form, purchase_history: v })} multiline />

          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
            onPress={submit}
            disabled={saving}
            testID="contact-form-submit"
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>{isNew ? "Create Contact" : "Save Changes"}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function F({
  label,
  testID,
  multiline,
  ...props
}: {
  label: string;
  testID?: string;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 76, textAlignVertical: "top" }]}
        placeholderTextColor={COLORS.textMuted}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  topbarTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  scroll: { padding: SPACING.lg, paddingBottom: 48 },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.textPrimary,
    backgroundColor: COLORS.white, minHeight: 48, marginTop: 6,
  },
  gpsRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 8 },
  gpsText: { fontSize: 14, color: COLORS.textPrimary, marginTop: 8 },
  gpsBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 12, borderRadius: RADIUS.md,
  },
  gpsBtnText: { color: COLORS.white, fontSize: 13, fontWeight: "700" },
  primaryBtn: {
    marginTop: 24, backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: RADIUS.md, alignItems: "center", minHeight: 48, justifyContent: "center",
    ...SHADOW.card,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
});
