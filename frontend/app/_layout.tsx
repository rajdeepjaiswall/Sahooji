import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AlarmTakeover } from "@/src/components/AlarmTakeover";
import { AuthProvider } from "@/src/auth-context";
import { ReminderAlarmProvider } from "@/src/reminder-alarm";
import { ToastProvider } from "@/src/toast";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { debugLog } from "@/src/debug-log";

// Silence noisy warnings in the preview.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

// Global error hook → ring buffer for /debug page.
if (typeof globalThis !== "undefined") {
  const g: any = globalThis as any;
  if (g.ErrorUtils?.getGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((err: any, isFatal: boolean) => {
      debugLog("error", "global", String(err?.message || err), { isFatal });
      prev?.(err, isFatal);
    });
  }
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ToastProvider>
          <AuthProvider>
            <ReminderAlarmProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: "slide_from_right",
                  contentStyle: { backgroundColor: "#F8FAFC" },
                }}
              />
              <AlarmTakeover />
            </ReminderAlarmProvider>
          </AuthProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
