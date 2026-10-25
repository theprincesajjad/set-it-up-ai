import { type VerticalCategory } from "@ll/design-tokens";
import { Image, Platform, StyleSheet, View, type TextStyle } from "react-native";
import { useLocale } from "../lib/i18n";
import { disp, ui, useTheme } from "../theme";
import { CategoryIcon } from "./CategoryIcon";
import { shadow } from "./shadow";
import { Text } from "./Text";

export interface PlaceBubbleProps {
  name: string;
  /** The ONE italic grey line under the name. */
  subtitle?: string | null;
  /** Subtitle means points ("reward ready"): accent text, upright, semibold. */
  accent?: boolean;
  vertical?: string | null;
  category?: VerticalCategory;
  photoUrl?: string | null;
  selected?: boolean;
  /** Hide the name/subtitle (dense map, far zoom). */
  bare?: boolean;
  /** Bubble diameter (canvas: 36; selected 46). */
  size?: number;
  /** Label to the right of the bubble (default) or to its left, right-aligned. */
  side?: "right" | "left";
}

/**
 * A place, Corner-style (canvas Main.dc.html): a 36 pt white bubble holding the shop's 24 pt object
 * (cup, croissant…) or its photo, the name lowercase in Bricolage 700 13 and one italic 11 pt grey
 * line; "reward ready" is accentText, upright, semibold. Labels get a white halo instead of a box.
 * Selected: 46 pt with a 2.5 pt black ring and a 30 pt object (ShopSheet artboard).
 */
export function PlaceBubble({ name, subtitle, accent, vertical, category, photoUrl, selected, bare, size = 36, side = "right" }: PlaceBubbleProps) {
  const { c, isDark } = useTheme();
  const { isRtl } = useLocale();
  const s = selected ? 46 : size;
  // The pin sits on a geographic point: the bubble/label geometry never mirrors, only the label text runs in the reader's direction.
  const run: TextStyle = { writingDirection: isRtl ? "rtl" : "ltr", ...({ direction: isRtl ? "rtl" : "ltr" } as object) };
  const img = selected ? 30 : Math.round(size * (24 / 36));
  // Halo so road labels never read through the name; the web preview stacks it in CSS (theme/webStyles.web.ts).
  const halo: TextStyle = { textShadowColor: c.bg, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } };
  return (
    <View {...({ dir: "ltr" } as object)} style={[styles.row, { direction: "ltr" }, side === "left" ? { flexDirection: "row-reverse" } : null]} pointerEvents="none">
      <View
        style={[
          styles.bubble,
          { width: s, height: s, borderRadius: s / 2, backgroundColor: c.bg },
          // Dark mode: a hairline ring, or the bubble melts into the dark map.
          isDark && !selected ? { borderWidth: 1, borderColor: c.lineStrong } : null,
          selected
            ? shadow(`0 0 0 2.5px ${c.fg}, 0 4px 14px rgba(0,0,0,.18)`, { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 6 })
            : shadow("0 1px 2px rgba(0,0,0,.08), 0 3px 10px rgba(0,0,0,.10)", { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3 }),
          // Native has no spread ring: draw it as a border.
          selected && !isWebRing ? { borderWidth: 2.5, borderColor: c.fg } : null,
        ]}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: s - 4, height: s - 4, borderRadius: (s - 4) / 2 }} accessibilityIgnoresInvertColors />
        ) : (
          <CategoryIcon category={category} vertical={vertical} size={img} />
        )}
      </View>
      {bare ? null : (
        <View style={[styles.label, side === "left" ? { alignItems: "flex-end" } : null]}>
          <Text style={[disp(13, 700, 15), halo, run, { textAlign: side === "left" ? "right" : "left" }]} numberOfLines={2}>
            {name.toLowerCase()}
          </Text>
          {subtitle ? (
            <Text
              style={[ui(11, accent ? 600 : 400, 14), halo, run, accent ? null : { fontStyle: "italic" }, { textAlign: side === "left" ? "right" : "left" }]}
              rawColor={accent ? c.accentText : c.fgMuted}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Web draws the selected ring as a box-shadow spread (canvas CSS); native has no spread, so a border. */
const isWebRing = Platform.OS === "web";

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  bubble: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
  label: { maxWidth: 150 },
});
