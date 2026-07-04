/**
 * JS surface for the SahuAlarm native module.
 * On Expo Go / web the module is unavailable — we export null and callers fall back.
 */

import { NativeModule, requireNativeModule } from "expo-modules-core";

export type AlarmItem = {
  id: string;
  remind_at: string; // ISO
  title: string;
  body: string;
  contact_name?: string | null;
  organisation?: string | null;
  mobile?: string | null;
  tag_name?: string | null;
  tag_color?: string | null;
  vibrate?: boolean;
};

export type PermissionStatus = {
  notifications: boolean;
  exact_alarms: boolean;
  full_screen: boolean;
  overlay: boolean;
  battery: boolean;
  autostart: boolean;
  manufacturer: string;
};

export type PendingAction = {
  id: string;
  reminder_id: string;
  action: "snoozed" | "ended";
  ts: number;
  snooze_minutes?: number;
};

export interface SahuAlarmNative extends NativeModule {
  scheduleAlarms(list: AlarmItem[]): Promise<{ scheduled: number }>;
  cancelAlarm(id: string): Promise<void>;
  cancelAllAlarms(): Promise<void>;
  getPermissionStatus(): Promise<PermissionStatus>;
  openExactAlarmSettings(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  openBatteryOptimizationSettings(): Promise<void>;
  openAutoStartSettings(): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;
  startKeepAliveService(): Promise<void>;
  stopKeepAliveService(): Promise<void>;
  startFloatingBubble(): Promise<void>;
  stopFloatingBubble(): Promise<void>;
  drainPendingActions(): Promise<PendingAction[]>;
}

let cached: SahuAlarmNative | null | undefined;

export function getSahuAlarm(): SahuAlarmNative | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<SahuAlarmNative>("SahuAlarm");
  } catch {
    cached = null;
  }
  return cached;
}
