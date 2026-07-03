/**
 * Route gate — /
 * Redirects to /(tabs) if logged in, else /login.
 */

import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/src/auth-context";
import { COLORS } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.wrap} testID="root-loader">
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
});
