/**
 * Products manager — reusable products for invoice autocomplete.
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type Product = { id: string; name: string; description?: string; unit_price: number; tax_percent: number; unit?: string };

export default function ProductsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<Product[]>("/products");
      setRows(list);
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} testID="products-back">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>Products</Text>
        <TouchableOpacity onPress={() => setCreating(true)} testID="products-add-btn">
          <Ionicons name="add" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => setEditing(item)}
            testID={`product-row-${item.id}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.price}>₹ {(item.unit_price || 0).toFixed(2)}</Text>
              <Text style={styles.meta}>{item.tax_percent || 0}% · {item.unit || "pcs"}</Text>
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
              <Ionicons name="cube-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No products yet</Text>
              <Text style={styles.emptySub}>Add reusable products for invoice line items.</Text>
            </View>
          )
        }
      />

      <ProductSheet
        visible={creating || !!editing}
        product={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function ProductSheet({
  visible,
  product,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [name, setName] = useState(product?.name || "");
  const [desc, setDesc] = useState(product?.description || "");
  const [price, setPrice] = useState<string>(String(product?.unit_price ?? ""));
  const [tax, setTax] = useState<string>(String(product?.tax_percent ?? ""));
  const [unit, setUnit] = useState(product?.unit || "pcs");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(product?.name || "");
    setDesc(product?.description || "");
    setPrice(String(product?.unit_price ?? ""));
    setTax(String(product?.tax_percent ?? ""));
    setUnit(product?.unit || "pcs");
  }, [product]);

  const save = async () => {
    if (!name) {
      toast.show("Name required", "error");
      return;
    }
    setBusy(true);
    try {
      const body = {
        name,
        description: desc,
        unit_price: Number(price) || 0,
        tax_percent: Number(tax) || 0,
        unit: unit || "pcs",
      };
      if (product) {
        await api(`/products/${product.id}`, { method: "PATCH", body });
      } else {
        await api("/products", { method: "POST", body });
      }
      toast.show("Product saved", "success");
      await onSaved();
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    setBusy(true);
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      toast.show("Deleted", "success");
      await onSaved();
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
                <Text style={styles.sheetTitle}>{product ? "Edit product" : "New product"}</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <Field label="Name" value={name} onChangeText={setName} testID="prod-name" />
              <Field label="Description" value={desc} onChangeText={setDesc} multiline />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Unit price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" testID="prod-price" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Tax %" value={tax} onChangeText={setTax} keyboardType="decimal-pad" testID="prod-tax" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Unit" value={unit} onChangeText={setUnit} testID="prod-unit" />
                </View>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy} testID="prod-save">
                {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>{product ? "Save" : "Create"}</Text>}
              </TouchableOpacity>
              {product ? (
                <TouchableOpacity style={styles.dangerBtn} onPress={remove} disabled={busy} testID="prod-delete">
                  <Text style={styles.dangerBtnText}>Delete product</Text>
                </TouchableOpacity>
              ) : null}
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
  multiline,
  ...props
}: {
  label: string;
  testID?: string;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 4 }}>
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
  topbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  topbarTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  list: { padding: SPACING.lg, gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },
  name: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  desc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  price: { fontSize: 15, fontWeight: "800", color: COLORS.primary },
  meta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  empty: { alignItems: "center", padding: 48, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: "88%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 8, textTransform: "uppercase", letterSpacing: 1 },
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
  dangerBtn: { marginTop: 8, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.danger, alignItems: "center" },
  dangerBtnText: { color: COLORS.danger, fontWeight: "700" },
});
