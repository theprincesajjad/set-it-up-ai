import { verticalVisuals } from "@ll/design-tokens";
import { Image, StyleSheet, View } from "react-native";
import { initials } from "../lib/award";
import { useTheme } from "../theme";
import { Text } from "./Text";

const TINT_KEYS = ["cafe", "pharmacy", "bookstore", "salon", "pet", "fitness"] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Circle; image or initials on a tint picked deterministically from the id. */
export function Avatar({ name, id, size = 40, imageUrl }: { name: string | null | undefined; id?: string; size?: 24 | 32 | 40 | 56 | 80 | 88; imageUrl?: string | null }) {
  const { scheme } = useTheme();
  const key = TINT_KEYS[hash(id ?? name ?? "") % TINT_KEYS.length] ?? "cafe";
  const v = verticalVisuals[key][scheme];
  if (imageUrl) return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: v.tint }]} accessibilityElementsHidden>
      <Text variant={size >= 56 ? "h3" : "label"} rawColor={v.ink} style={size >= 80 ? { fontSize: 28, lineHeight: 32 } : null}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: "center", justifyContent: "center" } });
