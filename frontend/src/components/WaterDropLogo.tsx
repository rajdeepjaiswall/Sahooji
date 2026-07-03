/**
 * Water-drop logo component (Sahu brand).
 * Uses Ionicons "water" glyph in brand blue with an optional 7-tap hidden gesture.
 */

import React, { useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/theme";

type Props = {
  size?: number;
  onSecretUnlock?: () => void;
  testID?: string;
};

export function WaterDropLogo({ size = 56, onSecretUnlock, testID }: Props) {
  const taps = useRef(0);
  const lastTapAt = useRef(0);

  const onPress = () => {
    const now = Date.now();
    if (now - lastTapAt.current > 1200) taps.current = 0;
    taps.current += 1;
    lastTapAt.current = now;
    if (taps.current >= 7 && onSecretUnlock) {
      taps.current = 0;
      onSecretUnlock();
    }
  };

  const iconSize = Math.round(size * 0.62);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      testID={testID || "app-logo"}
      accessibilityRole="button"
      accessibilityLabel="Sahu logo"
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Ionicons name="water" size={iconSize} color={COLORS.white} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});
