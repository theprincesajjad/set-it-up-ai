import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { CircleAlert, CircleCheck, Info, WifiOff, type LucideIcon } from "./icons";
import { Text } from "./Text";

export type BannerVariant = "info" | "success" | "warning" | "danger" | "neutral";

export interface BannerProps {
  variant?: BannerVariant;
  children: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  /** Black strip (counter offline queue) instead of the grey block. */
  solid?: boolean;
  busy?: boolean;
  onPress?: () => void;
}

/**
 * A grey block with an icon and one sentence. No tinted fills (foundations § Colour):
 * the icon carries the status (red for danger, green for success); `solid` is black.
 */
export function Banner({ variant = "info", children, icon, actionLabel, onAction, solid, busy, onPress }: BannerProps) {
  const { c } = useTheme();
  const I = icon ?? (variant === "success" ? CircleCheck : variant === "danger" || variant === "warning" ? CircleAlert : Info);
  const bg = solid ? (variant === "danger" ? c.negative : c.fg) : c.bgSubtle;
  const fg = solid ? (variant === "danger" ? "#FFFFFF" : c.bg) : c.fg;
  const iconColor = solid ? (variant === "success" ? c.positive : fg) : variant === "danger" ? c.negative : variant === "success" ? c.positive : c.fg;
  const body = (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole={variant === "danger" ? "alert" : "summary"} accessibilityLiveRegion="polite">
      <I size={18} color={iconColor} strokeWidth={2} />
      <Text variant="meta" rawColor={fg} style={styles.text}>
        {children}
      </Text>
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={styles.action}>
          <Text variant="metaStrong" rawColor={fg} style={{ textDecorationLine: "underline" }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/**
 * Counter: black strip "Offline · 3 waiting to send" (+ spinner while
 * retrying); "Back online · 3 sent" with a green check; red when stale.
 * Customer: grey "You're offline. Your card still works."
 */
export function OfflineBanner({
  mode,
  online,
  pending,
  sentJustNow,
  stale,
  retrying,
  onPress,
}: {
  mode: "counter" | "customer";
  online: boolean;
  pending?: number;
  sentJustNow?: number;
  stale?: boolean;
  retrying?: boolean;
  onPress?: () => void;
}) {
  if (mode === "customer") {
    if (online) return null;
    return (
      <Banner variant="neutral" icon={WifiOff}>
        You're offline. Your card still works.
      </Banner>
    );
  }
  if (stale && (pending ?? 0) > 0) {
    return (
      <Banner variant="danger" solid icon={WifiOff} onPress={onPress}>
        {`${pending} ${pending === 1 ? "award hasn't" : "awards haven't"} sent for 24 h. Check the connection.`}
      </Banner>
    );
  }
  if (!online || (pending ?? 0) > 0) {
    const label = online ? `Sending · ${pending} waiting` : `Offline · ${pending ?? 0} waiting to send`;
    return (
      <Banner variant="warning" solid icon={WifiOff} busy={retrying} onPress={onPress}>
        {label}
      </Banner>
    );
  }
  if (sentJustNow) {
    return (
      <Banner variant="success" solid>
        {`Back online · ${sentJustNow} sent`}
      </Banner>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  text: { flex: 1, fontWeight: "500" },
  action: { minHeight: 32, justifyContent: "center" },
});
