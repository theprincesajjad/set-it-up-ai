import { Image, StyleSheet, View } from "react-native";
import { initials } from "../lib/award";
import { typo, useTheme } from "../theme";
import { Text } from "./Text";

/** A person: photo, or initials on grey. Colour belongs to shops' avatars only. */
export function Avatar({ name, size = 40, imageUrl }: { name: string | null | undefined; id?: string; size?: 24 | 28 | 32 | 40 | 56 | 64 | 80 | 88; imageUrl?: string | null }) {
  const { c } = useTheme();
  if (imageUrl) return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.bgMuted }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text
        rawColor={c.fg}
        allowFontScaling={false}
        style={[typo("displayNumber"), { fontSize: Math.round(size * 0.4), lineHeight: Math.round(size * 0.5), letterSpacing: 0 }]}
      >
        {initials(name).toLowerCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: "center", justifyContent: "center" } });
