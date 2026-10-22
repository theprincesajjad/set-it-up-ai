import { shadows, type VerticalCategory } from "@ll/design-tokens";
import { Image, Platform, StyleSheet, View, type TextStyle } from "react-native";
import { useTheme } from "../theme";
import { CategoryIcon } from "./CategoryIcon";
import { Text } from "./Text";

export interface PlaceBubbleProps {
  name: string;
  /** The ONE italic grey line under the name. */
  subtitle?: string | null;
  /** Subtitle means points ("reward ready"): accent text. */
  accent?: boolean;
  vertical?: string | null;
  category?: VerticalCategory;
  photoUrl?: string | null;
  selected?: boolean;
  /** Hide the name/subtitle (dense map, far zoom). */
  bare?: boolean;
  size?: number;
}

/**
 * A place, Corner-style: a round white bubble holding the shop's object (cup,
 * croissant…) or its photo, the name in bold black and one italic grey line.
 * Labels get a halo so they read on the map without a box.
 */
export function PlaceBubble({ name, subtitle, accent, vertical, category, photoUrl, selected, bare, size = 40 }: PlaceBubbleProps) {
  const { c, isDark } = useTheme();
  const s = selected ? size + 8 : size;
  // A real halo (stacked on web, where one text-shadow is too faint) so road labels never read through
  // the name (polish-audit M10).
  const halo: TextStyle =
    Platform.OS === "web"
      ? ({ textShadow: `0 0 2px ${c.bg}, 0 0 3px ${c.bg}, 0 0 6px ${c.bg}, 0 0 10px ${c.bg}` } as TextStyle)
      : { textShadowColor: c.bg, textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } };
  return (
    <View style={styles.row} pointerEvents="none">
      <View
        style={[
          styles.bubble,
          // Dark mode: a hairline ring, or the bubble melts into the dark map (polish-audit M39).
          { width: s, height: s, borderRadius: s / 2, backgroundColor: c.bg, borderColor: selected ? c.fg : isDark ? c.lineStrong : c.bg, borderWidth: selected ? 2 : isDark ? 1 : 0 },
          shadows.float.native,
        ]}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: s - 4, height: s - 4, borderRadius: (s - 4) / 2 }} accessibilityIgnoresInvertColors />
        ) : (
          <CategoryIcon category={category} vertical={vertical} size={Math.round(s * 0.66)} />
        )}
      </View>
      {bare ? null : (
        <View style={styles.label}>
          <Text variant="placeName" numberOfLines={2} style={[halo, { fontSize: 14, lineHeight: 17, fontWeight: "700" }]}>
            {name}
          </Text>
          {subtitle ? (
            <Text variant="placeSubtitle" color={accent ? "accentText" : "fgMuted"} numberOfLines={1} style={[halo, { fontSize: 12, lineHeight: 15 }, accent ? { fontWeight: "600" } : null]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  bubble: { alignItems: "center", justifyContent: "center" },
  label: { maxWidth: 160 },
});
