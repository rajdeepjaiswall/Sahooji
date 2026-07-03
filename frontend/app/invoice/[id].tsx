/**
 * Invoice create/edit — includes items table with autocomplete from products,
 * PDF generation via expo-print, share via expo-sharing + WhatsApp.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { openWhatsApp } from "@/src/helpers";
import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";
import { useToast } from "@/src/toast";

type Item = { name: string; qty: number; unit: string; unit_price: number; tax_percent: number; row_tax: number; row_total: number };

const emptyItem = (): Item => ({ name: "", qty: 1, unit: "pcs", unit_price: 0, tax_percent: 0, row_tax: 0, row_total: 0 });

function calcItem(it: Item): Item {
  const base = it.qty * it.unit_price;
  const row_tax = (base * (it.tax_percent || 0)) / 100;
  return { ...it, row_tax: round2(row_tax), row_total: round2(base + row_tax) };
}
function round2(n: number) { return Math.round(n * 100) / 100; }

export default function InvoiceFormScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";

  const [contacts, setContacts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any | null>(null);

  const [contactId, setContactId] = useState<string | null>(null);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Errors & Omissions Excepted");
  const [discount, setDiscount] = useState<number>(0);
  const [invStatus, setInvStatus] = useState<string>("draft");
  const [pickContact, setPickContact] = useState(false);
  const [contactQ, setContactQ] = useState("");
  const [prodSuggest, setProdSuggest] = useState<{ idx: number; matches: any[] } | null>(null);

  const loadRefs = useCallback(async () => {
    const [cs, ps] = await Promise.all([
      api<any[]>("/contacts", { query: { q: contactQ || undefined } }),
      api<any[]>("/products"),
    ]);
    setContacts(cs);
    setProducts(ps);
  }, [contactQ]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadRefs();
        if (!isNew) {
          const inv = await api<any>(`/invoices/${params.id}`);
          setInvoice(inv);
          setContactId(inv.contact_id);
          setInvoiceDate((inv.invoice_date || "").slice(0, 10));
          setDueDate((inv.due_date || "").slice(0, 10));
          setItems((inv.items || []).map((i: any) => calcItem({ ...emptyItem(), ...i })));
          setNotes(inv.notes || "");
          setTerms(inv.terms || "Errors & Omissions Excepted");
          setDiscount(inv.discount || 0);
          setInvStatus(inv.status || "draft");
        }
      } catch (e: any) {
        toast.show(e?.detail || "Failed to load", "error");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const selectedContact = useMemo(() => contacts.find((c) => c.id === contactId), [contacts, contactId]);

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.qty * it.unit_price, 0), [items]);
  const taxTotal = useMemo(() => items.reduce((s, it) => s + it.row_tax, 0), [items]);
  const grandTotal = useMemo(() => round2(subtotal + taxTotal - (Number(discount) || 0)), [subtotal, taxTotal, discount]);

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((rows) => rows.map((it, i) => (i === idx ? calcItem({ ...it, ...patch }) : it)));
  };
  const removeItem = (idx: number) => setItems((rows) => rows.filter((_, i) => i !== idx));
  const addItem = () => setItems((rows) => [...rows, emptyItem()]);

  const onNameChange = (idx: number, v: string) => {
    updateItem(idx, { name: v });
    const matches = v ? products.filter((p) => (p.name || "").toLowerCase().includes(v.toLowerCase())).slice(0, 5) : [];
    setProdSuggest(matches.length ? { idx, matches } : null);
  };

  const applyProduct = (idx: number, p: any) => {
    updateItem(idx, {
      name: p.name,
      unit_price: p.unit_price || 0,
      tax_percent: p.tax_percent || 0,
      unit: p.unit || "pcs",
    });
    setProdSuggest(null);
  };

  const submit = async () => {
    if (!contactId) {
      toast.show("Pick a contact", "error");
      return;
    }
    setSaving(true);
    try {
      const body = {
        contact_id: contactId,
        invoice_date: new Date(invoiceDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        items,
        subtotal: round2(subtotal),
        tax_total: round2(taxTotal),
        discount: Number(discount) || 0,
        grand_total: grandTotal,
        notes,
        terms,
        status: invStatus,
      };
      let saved: any;
      if (isNew) {
        saved = await api("/invoices", { method: "POST", body });
        toast.show(`Invoice ${saved.invoice_number} created`, "success");
      } else {
        saved = await api(`/invoices/${params.id}`, { method: "PATCH", body });
        toast.show("Invoice updated", "success");
      }
      setInvoice(saved);
      if (isNew) router.replace(`/invoice/${saved.id}`);
    } catch (e: any) {
      toast.show(e?.detail || "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const generateHTML = (inv: any): string => {
    const rows = (inv.items || []).map((it: Item, i: number) => `
      <tr style="background:${i % 2 === 0 ? "#F8FAFC" : "#FFFFFF"}">
        <td style="padding:8px;border-bottom:1px solid #E2E8F0;">${escapeHtml(it.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #E2E8F0;text-align:right;">${it.qty} ${it.unit || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #E2E8F0;text-align:right;">₹ ${(it.unit_price || 0).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #E2E8F0;text-align:right;">${it.tax_percent || 0}%</td>
        <td style="padding:8px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;">₹ ${(it.row_total || 0).toFixed(2)}</td>
      </tr>`).join("");
    const contact = inv.contact || selectedContact || {};
    return `<!doctype html><html><body style="font-family:Inter,sans-serif;color:#0F172A;padding:32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1565C0;padding-bottom:16px;">
        <div>
          <h1 style="color:#1565C0;margin:0;">${escapeHtml(user?.organisation_name || "Sahu Sales Solution")}</h1>
          <div style="color:#475569;font-size:13px;">${escapeHtml(user?.mobile || "")} · ${escapeHtml(user?.email || "")}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px;font-weight:800;letter-spacing:2px;">INVOICE</div>
          <div style="color:#475569;">${escapeHtml(inv.invoice_number || "")}</div>
        </div>
      </div>
      <div style="display:flex;gap:24px;margin-top:24px;">
        <div style="flex:1;background:#F8FAFC;padding:16px;border-radius:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#475569;font-weight:700;">Invoice details</div>
          <div style="margin-top:6px;">Date: ${new Date(inv.invoice_date).toLocaleDateString()}</div>
          ${inv.due_date ? `<div>Due: ${new Date(inv.due_date).toLocaleDateString()}</div>` : ""}
          <div>FY: ${escapeHtml(inv.financial_year || "")}</div>
          <div>Status: ${escapeHtml(inv.status || "draft")}</div>
        </div>
        <div style="flex:1;background:#F8FAFC;padding:16px;border-radius:8px;">
          <div style="font-size:11px;text-transform:uppercase;color:#475569;font-weight:700;">Bill To</div>
          <div style="margin-top:6px;font-weight:700;">${escapeHtml(contact.full_name || "")}</div>
          <div>${escapeHtml(contact.organisation_name || "")}</div>
          <div>${escapeHtml(contact.mobile || "")}</div>
          <div>${escapeHtml([contact.address, contact.city, contact.state, contact.pincode].filter(Boolean).join(", "))}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:24px;">
        <thead style="background:#1565C0;color:#fff;">
          <tr>
            <th style="padding:10px;text-align:left;">Item</th>
            <th style="padding:10px;text-align:right;">Qty</th>
            <th style="padding:10px;text-align:right;">Rate</th>
            <th style="padding:10px;text-align:right;">Tax</th>
            <th style="padding:10px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <div style="min-width:260px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal</span><span>₹ ${(inv.subtotal || 0).toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Tax</span><span>₹ ${(inv.tax_total || 0).toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Discount</span><span>- ₹ ${(inv.discount || 0).toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #1565C0;margin-top:8px;font-size:18px;font-weight:800;color:#1565C0;"><span>Grand Total</span><span>₹ ${(inv.grand_total || 0).toFixed(2)}</span></div>
        </div>
      </div>
      ${inv.notes ? `<div style="margin-top:24px;padding:12px;background:#F8FAFC;border-radius:8px;"><b>Notes:</b> ${escapeHtml(inv.notes)}</div>` : ""}
      <div style="margin-top:24px;color:#475569;font-size:12px;">${escapeHtml(inv.terms || "Errors & Omissions Excepted")}</div>
      <div style="margin-top:48px;display:flex;justify-content:flex-end;">
        <div style="width:200px;text-align:center;border-top:1px solid #0F172A;padding-top:6px;">Authorised signature</div>
      </div>
    </body></html>`;
  };

  const savePdfAndShare = async (viaWhatsApp: boolean) => {
    if (!invoice) {
      toast.show("Save the invoice first", "error");
      return;
    }
    try {
      const html = generateHTML(invoice);
      const file = await Print.printToFileAsync({ html, base64: false });
      if (Platform.OS === "web") {
        toast.show("PDF opened", "info");
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: invoice.invoice_number });
      }
      if (viaWhatsApp && invoice.contact?.mobile) {
        openWhatsApp(
          invoice.contact.mobile,
          `Invoice ${invoice.invoice_number} — please find the PDF attached (share manually if not attached).`,
        );
        toast.show("Attach the PDF in WhatsApp manually", "info");
      }
    } catch (e: any) {
      toast.show(e?.message || "PDF failed", "error");
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
        <TouchableOpacity onPress={() => router.back()} testID="invoice-form-back">
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>
          {isNew ? "New Invoice" : invoice?.invoice_number || "Invoice"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Label>Contact *</Label>
          <TouchableOpacity style={styles.selector} onPress={() => setPickContact(true)} testID="inv-pick-contact">
            <Text style={styles.selectorText}>{selectedContact ? selectedContact.full_name : "Choose contact"}</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          {selectedContact ? (
            <View style={styles.contactPreview}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
                {selectedContact.organisation_name || ""} · {selectedContact.mobile || ""}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Label>Invoice date</Label>
              <TextInput
                style={styles.input}
                value={invoiceDate}
                onChangeText={setInvoiceDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                testID="inv-date"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Due date</Label>
              <TextInput
                style={styles.input}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </View>

          <Label>Items</Label>
          <View style={{ gap: 10 }}>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemCard}>
                <View style={{ position: "relative" }}>
                  <TextInput
                    style={styles.input}
                    value={it.name}
                    onChangeText={(v) => onNameChange(idx, v)}
                    placeholder="Item name"
                    placeholderTextColor={COLORS.textMuted}
                    testID={`inv-item-name-${idx}`}
                  />
                  {prodSuggest?.idx === idx ? (
                    <View style={styles.suggest}>
                      {prodSuggest.matches.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={styles.suggestRow}
                          onPress={() => applyProduct(idx, p)}
                        >
                          <Text style={{ color: COLORS.textPrimary, fontWeight: "600" }}>{p.name}</Text>
                          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>₹ {p.unit_price}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <NumField label="Qty" value={it.qty} onChangeText={(v) => updateItem(idx, { qty: Number(v) || 0 })} testID={`inv-item-qty-${idx}`} />
                  <TextField label="Unit" value={it.unit} onChangeText={(v) => updateItem(idx, { unit: v })} />
                  <NumField label="Rate" value={it.unit_price} onChangeText={(v) => updateItem(idx, { unit_price: Number(v) || 0 })} testID={`inv-item-rate-${idx}`} />
                  <NumField label="Tax%" value={it.tax_percent} onChangeText={(v) => updateItem(idx, { tax_percent: Number(v) || 0 })} />
                </View>
                <View style={styles.itemFooter}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Row total</Text>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: "800" }}>₹ {it.row_total.toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeItem(idx)} testID={`inv-item-del-${idx}`}>
                    <Ionicons name="trash" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.addItemBtn} onPress={addItem} testID="inv-add-item">
              <Ionicons name="add" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: "700" }}>Add item</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.totalsCard}>
            <TotalRow label="Subtotal" value={subtotal} />
            <TotalRow label="Tax" value={taxTotal} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 6 }}>
              <Text style={{ color: COLORS.textSecondary }}>Discount</Text>
              <TextInput
                style={styles.discountInput}
                value={String(discount)}
                onChangeText={(v) => setDiscount(Number(v) || 0)}
                keyboardType="decimal-pad"
                testID="inv-discount"
              />
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>₹ {grandTotal.toFixed(2)}</Text>
            </View>
          </View>

          <Label>Notes</Label>
          <TextInput
            style={[styles.input, { minHeight: 76, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional notes"
            placeholderTextColor={COLORS.textMuted}
          />

          <Label>Terms</Label>
          <TextInput style={styles.input} value={terms} onChangeText={setTerms} placeholderTextColor={COLORS.textMuted} />

          <Label>Status</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {["draft", "sent", "paid", "cancelled"].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusChip, invStatus === s && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                onPress={() => setInvStatus(s)}
                testID={`inv-status-${s}`}
              >
                <Text style={[styles.statusChipText, invStatus === s && { color: COLORS.white }]}>
                  {s[0].toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
            onPress={submit}
            disabled={saving}
            testID="inv-form-submit"
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryBtnText}>{isNew ? "Create Invoice" : "Save Changes"}</Text>}
          </TouchableOpacity>

          {invoice ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => savePdfAndShare(false)} testID="inv-share-btn">
                <Ionicons name="share-outline" size={18} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Share PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => savePdfAndShare(true)} testID="inv-whatsapp-btn">
                <Ionicons name="logo-whatsapp" size={18} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={pickContact} transparent animationType="slide" onRequestClose={() => setPickContact(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickContact(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose contact</Text>
              <TouchableOpacity onPress={() => setPickContact(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={contactQ}
              onChangeText={setContactQ}
              onSubmitEditing={loadRefs}
              placeholder="Search contacts"
              placeholderTextColor={COLORS.textMuted}
            />
            <ScrollView style={{ maxHeight: 400 }}>
              {contacts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerRow}
                  onPress={() => {
                    setContactId(c.id);
                    setPickContact(false);
                  }}
                  testID={`inv-pick-contact-${c.id}`}
                >
                  <View>
                    <Text style={{ fontWeight: "600", color: COLORS.textPrimary }}>{c.full_name}</Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>{c.organisation_name || c.mobile}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 3 }}>
      <Text style={{ color: COLORS.textSecondary }}>{label}</Text>
      <Text style={{ color: COLORS.textPrimary, fontWeight: "600" }}>₹ {round2(value).toFixed(2)}</Text>
    </View>
  );
}
function NumField({
  label,
  value,
  onChangeText,
  testID,
}: {
  label: string;
  value: number;
  onChangeText: (v: string) => void;
  testID?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.smallLabel}>{label}</Text>
      <TextInput
        style={styles.numInput}
        value={String(value ?? 0)}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        testID={testID}
      />
    </View>
  );
}
function TextField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.smallLabel}>{label}</Text>
      <TextInput style={styles.numInput} value={value} onChangeText={onChangeText} />
    </View>
  );
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 },
  smallLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: "700", marginBottom: 2 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: COLORS.textPrimary, backgroundColor: COLORS.white, minHeight: 48, marginTop: 6,
  },
  numInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 8, paddingVertical: 8, fontSize: 13,
    color: COLORS.textPrimary, backgroundColor: COLORS.white, height: 40,
  },
  selector: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border, minHeight: 48, marginTop: 6,
  },
  selectorText: { flex: 1, color: COLORS.textPrimary, fontSize: 15 },
  contactPreview: { paddingHorizontal: 14, paddingVertical: 6 },
  itemCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: COLORS.border, gap: 8, ...SHADOW.card },
  itemFooter: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "flex-end" },
  addItemBtn: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    padding: 12, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.primary, borderStyle: "dashed",
    backgroundColor: COLORS.primarySoft,
  },
  totalsCard: { backgroundColor: COLORS.white, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 14, ...SHADOW.card },
  discountInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 8, paddingVertical: 6, width: 100, textAlign: "right", color: COLORS.textPrimary,
  },
  grandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 2, borderTopColor: COLORS.primary, marginTop: 8, paddingTop: 8 },
  grandLabel: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  grandValue: { fontSize: 20, fontWeight: "800", color: COLORS.primary },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  statusChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  primaryBtn: {
    marginTop: 24, backgroundColor: COLORS.primary, paddingVertical: 14,
    borderRadius: RADIUS.md, alignItems: "center", minHeight: 48, justifyContent: "center",
    ...SHADOW.card,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.white,
  },
  secondaryBtnText: { color: COLORS.primary, fontWeight: "700" },
  suggest: {
    position: "absolute", top: 54, left: 0, right: 0, backgroundColor: COLORS.white,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, zIndex: 10, ...SHADOW.raised,
  },
  suggestRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: "row", justifyContent: "space-between" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: "88%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
});
