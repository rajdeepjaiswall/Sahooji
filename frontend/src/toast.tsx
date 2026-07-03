/**
 * Lightweight toast provider — mounted at root, above nav.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, RADIUS, SHADOW, SPACING } from "@/src/theme";

type ToastKind = "info" | "success" | "error";
type Toast = { id: number; kind: ToastKind; message: string };

const Ctx = createContext<{ show: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </View>
    </Ctx.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
  }, [opacity]);
  const bg =
    toast.kind === "error"
      ? "#7F1D1D"
      : toast.kind === "success"
      ? "#065F46"
      : "#0F172A";
  return (
    <Animated.View style={[styles.toast, { backgroundColor: bg, opacity }]} testID="toast">
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    maxWidth: "92%",
    ...SHADOW.raised,
  },
  text: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
});
