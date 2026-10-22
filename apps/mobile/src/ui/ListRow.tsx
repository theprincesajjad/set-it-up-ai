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
}

/** system.md § ListRow: >= 56 tall, leading 40, title bodyStrong, subtitle bodySm fgMuted. */
export function ListRow({ title, subtitle, leading, leadingIcon: Icon, trailing, chevron, onPress, divider = true, danger, minHeight, accessibilityLabel, selected }: ListRowProps) {
  const { c } = useTheme();
  const content = (
    <View style={[styles.row, { minHeight: minHeight ?? (subtitle ? 64 : 56) }, selected ? { backgroundColor: c.brandSubtle } : null]}>
      {leading ?? (Icon ? (
        <View style={[styles.iconCircle, { backgroundColor: danger ? c.dangerSubtle : c.brandSubtle }]}>
          <Icon size={22} color={danger ? c.danger : c.onBrandSubtle} strokeWidth={2} />
        </View>
      ) : null)}
      <View style={styles.text}>
        <Text variant="bodyStrong" color={danger ? "danger" : "fg"}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color="fgMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={20} color={c.fgMuted} /> : null}
      {divider ? <View style={[styles.divider, { left: leading || Icon ? 52 : 0, backgroundColor: c.border }]} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(", ")} onPress={onPress} android_ripple={{ color: c.overlay }} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  divider: { position: "absolute", right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
