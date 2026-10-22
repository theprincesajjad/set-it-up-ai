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
  /** Full-colour fill (counter mode / OfflineBanner) instead of the subtle tint. */
  solid?: boolean;
  busy?: boolean;
  onPress?: () => void;
}

/** Full-width strip, xSubtle bg + onXSubtle text + leading icon (system.md § Banner). */
export function Banner({ variant = "info", children, icon, actionLabel, onAction, solid, busy, onPress }: BannerProps) {
  const { c } = useTheme();
  const map = {
    info: { bg: c.infoSubtle, fg: c.onInfoSubtle, icon: c.info, sBg: c.info, sFg: c.onInfo, I: Info },
    success: { bg: c.successSubtle, fg: c.onSuccessSubtle, icon: c.success, sBg: c.success, sFg: c.onSuccess, I: CircleCheck },
    warning: { bg: c.warningSubtle, fg: c.onWarningSubtle, icon: c.onWarningSubtle, sBg: c.warning, sFg: c.onWarning, I: CircleAlert },
    danger: { bg: c.dangerSubtle, fg: c.onDangerSubtle, icon: c.danger, sBg: c.danger, sFg: c.onDanger, I: CircleAlert },
    neutral: { bg: c.neutralSubtle, fg: c.onNeutralSubtle, icon: c.onNeutralSubtle, sBg: c.surfaceInverse, sFg: c.fgInverse, I: Info },
  }[variant];
  const Icon = icon ?? map.I;
  const bg = solid ? map.sBg : map.bg;
  const fg = solid ? map.sFg : map.fg;
  const body = (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole={variant === "danger" ? "alert" : "summary"} accessibilityLiveRegion="polite">
      <Icon size={20} color={solid ? fg : map.icon} />
      <Text variant="bodySm" rawColor={fg} style={styles.text}>
        {children}
      </Text>
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={styles.action}>
          <Text variant="label" rawColor={fg} style={{ textDecorationLine: "underline" }}>
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
 * Counter: warning fill "Offline · 3 waiting to send" (+ spinner while
 * retrying); success "Back online · 3 sent"; danger when stale.
 * Customer: neutral "You're offline. Your card still works."
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
  banner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16 },
  text: { flex: 1, fontFamily: "Figtree_500Medium" },
  action: { minHeight: 32, justifyContent: "center" },
});
