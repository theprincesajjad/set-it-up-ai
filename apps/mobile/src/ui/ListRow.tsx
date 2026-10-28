import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { ChevronRight, type LucideIcon } from "./icons";
import { Text } from "./Text";
import { IconTile, type TileTone } from "./Warm";

const TONES: TileTone[] = ["peach", "mint", "butter", "lilac", "sky", "rose"];
/** A stable pastel per title, so a list of settings reads colourful without any one row meaning anything. */
const toneFor = (s: string): TileTone => TONES[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONES.length]!;

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  leadingIcon?: LucideIcon;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  divider?: boolean;
  danger?: boolean;
  /** Counter mode rows are 64 tall. */
  minHeight?: number;
  accessibilityLabel?: string;
  selected?: boolean;
  /** Semibold title (place names, shop rows). Settings rows stay regular. */
  strong?: boolean;
  /** Pastel for the icon tile (default: stable per title). */
  tone?: TileTone;
}

/** Row: >= 52 tall, a pastel IconTile (Lucide glyph, never emoji), hairline inset to the text. */
export function ListRow({ title, subtitle, leading, leadingIcon: Icon, trailing, chevron, onPress, divider = true, danger, minHeight, accessibilityLabel, selected, strong, tone }: ListRowProps) {
  const { c, isClear } = useTheme();
  const hasLeading = !!(leading || Icon);
  const content = (pressed: boolean) => (
    <View style={[styles.row, { minHeight: minHeight ?? (isClear ? (subtitle ? 64 : 44) : subtitle ? 60 : 52) }, pressed || selected ? { backgroundColor: c.bgSubtle } : null]}>
      {leading ?? (Icon ? (
        <IconTile icon={Icon} tone={danger ? "rose" : (tone ?? toneFor(title))} size={isClear ? 36 : 38} />
      ) : null)}
      <View style={styles.text}>
        <Text variant={strong ? "bodyStrong" : "body"} color={danger ? "negative" : "fg"}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" color="fgMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color={c.fgSubtle} strokeWidth={2} /> : null}
      {divider ? <View style={[styles.divider, { start: hasLeading ? (leading ? 56 : isClear ? 48 : 50) : 0, backgroundColor: c.line }]} /> : null}
    </View>
  );
  if (!onPress) return content(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(", ")} onPress={onPress}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  icon: { width: 28, alignItems: "flex-start", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  divider: { position: "absolute", end: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
