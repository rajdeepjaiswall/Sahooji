/**
 * Native alarm bridge — resolves the Kotlin SahuAlarm module and exposes a
 * safe wrapper. On Expo Go / web the native module is absent; every helper
 * returns a sensible default so the JS layer can compile and run.
 */

import { Platform } from "react-native";

import type { AlarmItem, PendingAction, PermissionStatus } from "../modules/sahu-alarm";
import { getSahuAlarm } from "../modules/sahu-alarm";

export type { AlarmItem, PermissionStatus, PendingAction };

export function isNativeAlarmAvailable(): boolean {
  return Platform.OS === "android" && !!getSahuAlarm();
}

export async function scheduleAlarms(items: AlarmItem[]): Promise<number> {
  const m = getSahuAlarm();
  if (!m) return 0;
  try {
    const res = await m.scheduleAlarms(items);
    return res?.scheduled ?? 0;
  } catch {
    return 0;
  }
}

export async function cancelAlarm(id: string): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.cancelAlarm(id);
  } catch {
    /* ignore */
  }
}
export async function cancelAllAlarms(): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.cancelAllAlarms();
  } catch {
    /* ignore */
  }
}

export async function getNativePermissionStatus(): Promise<PermissionStatus | null> {
  const m = getSahuAlarm();
  if (!m) return null;
  try {
    return await m.getPermissionStatus();
  } catch {
    return null;
  }
}

export async function openSetting(key: keyof PermissionStatus): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    switch (key) {
      case "notifications":
        await m.openNotificationSettings();
        break;
      case "exact_alarms":
        await m.openExactAlarmSettings();
        break;
      case "full_screen":
        await m.openFullScreenIntentSettings();
        break;
      case "overlay":
        await m.openOverlaySettings();
        break;
      case "battery":
        await m.openBatteryOptimizationSettings();
        break;
      case "autostart":
        await m.openAutoStartSettings();
        break;
    }
  } catch {
    /* ignore */
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const m = getSahuAlarm();
  if (!m) return false;
  try {
    return await m.requestNotificationPermission();
  } catch {
    return false;
  }
}

export async function startKeepAlive(): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.startKeepAliveService();
  } catch {
    /* ignore */
  }
}
export async function stopKeepAlive(): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.stopKeepAliveService();
  } catch {
    /* ignore */
  }
}

export async function startFloatingBubble(): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.startFloatingBubble();
  } catch {
    /* ignore */
  }
}
export async function stopFloatingBubble(): Promise<void> {
  const m = getSahuAlarm();
  if (!m) return;
  try {
    await m.stopFloatingBubble();
  } catch {
    /* ignore */
  }
}

export async function drainPendingActions(): Promise<PendingAction[]> {
  const m = getSahuAlarm();
  if (!m) return [];
  try {
    return await m.drainPendingActions();
  } catch {
    return [];
  }
}
