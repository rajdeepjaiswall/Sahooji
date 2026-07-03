/**
 * Sahu design tokens — single source of truth for colors, typography, spacing.
 * Mobile-first, light theme only, brand #1565C0.
 */

export const COLORS = {
  primary: "#1565C0",
  primaryDark: "#0D47A1",
  primarySoft: "#E3F0FC",
  background: "#FFFFFF",
  surface: "#F8FAFC",
  surfaceMuted: "#F1F5F9",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  danger: "#EF4444",
  warning: "#EAB308",
  success: "#22C55E",
  info: "#3B82F6",
  black: "#000000",
  white: "#FFFFFF",
};

export const TAG_COLORS: Record<string, string> = {
  Call: "#F97316",
  "Demo Call": "#3B82F6",
  "Payment Collection": "#22C55E",
  "Payment Request": "#EAB308",
  "AMC Renewal": "#EF4444",
  "Follow Up": "#8B5CF6",
  Installation: "#10B981",
  Meeting: "#EC4899",
};

export const REMINDER_BORDERS: Record<string, string> = {
  upcoming: "#22C55E",
  snoozed: "#EAB308",
  overdue: "#EF4444",
  archived: "#94A3B8",
  pending: "#22C55E",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 9999,
};

export const FONT = {
  regular: "System",
  semibold: "System",
  bold: "System",
};

export const SHADOW = {
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
