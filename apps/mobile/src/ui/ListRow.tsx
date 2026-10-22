import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { ChevronRight, type LucideIcon } from "./icons";
import { Text } from "./Text";

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
}

/** iOS-style row: >= 52 tall, bare 22 pt icon (no coloured circle), hairline inset to the text. */
export function ListRow({ title, subtitle, leading, leadingIcon: Icon, trailing, chevron, onPress, divider = true, danger, minHeight, accessibilityLabel, selected, strong }: ListRowProps) {
  const { c } = useTheme();
  const hasLeading = !!(leading || Icon);
  const content = (pressed: boolean) => (
    <View style={[styles.row, { minHeight: minHeight ?? (subtitle ? 60 : 52) }, pressed || selected ? { backgroundColor: c.bgSubtle } : null]}>
      {leading ?? (Icon ? (
        <View style={styles.icon}>
          <Icon size={22} color={danger ? c.negative : c.fg} strokeWidth={1.75} />
        </View>
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
      {divider ? <View style={[styles.divider, { left: hasLeading ? (leading ? 56 : 40) : 0, backgroundColor: c.line }]} /> : null}
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
  divider: { position: "absolute", right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
