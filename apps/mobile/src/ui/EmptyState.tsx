import { StyleSheet, View } from "react-native";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { CircleAlert, CloudOff, type LucideIcon } from "./icons";
import { Text } from "./Text";

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Optional: most empty states are one sentence (`body`) + one action. */
  title?: string;
  body?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "brand" | "danger";
}

/**
 * One sentence + one action, on the left edge. No illustration of people, no icon-in-a-circle.
 * `secondaryLabel` exists for legacy callers; new screens pass one action only (polish-audit S10).
 */
export function EmptyState({ icon: Icon, title, body, actionLabel, onAction, secondaryLabel, onSecondary, tone = "brand" }: EmptyStateProps) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {Icon ? <Icon size={24} color={tone === "danger" ? c.negative : c.fgMuted} strokeWidth={1.75} /> : null}
      {title ? (
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {body ? (
        <Text variant="body" color={title ? "fgMuted" : "fg"}>
          {body}
        </Text>
      ) : null}
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <View style={styles.actions}>
          {actionLabel && onAction ? (
            <Button variant={tone === "danger" ? "secondary" : "primary"} size="sm" onPress={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Button variant="secondary" size="sm" onPress={onSecondary}>
              {secondaryLabel}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** One sentence + retry (polish-audit S9). The sentence says what failed in plain words. */
export function ErrorState({ message, onRetry, offline }: { message?: string; onRetry?: () => void; offline?: boolean }) {
  const { c } = useTheme();
  const { t } = useLocale();
  const Icon = offline ? CloudOff : CircleAlert;
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Icon size={22} color={offline ? c.fgMuted : c.negative} strokeWidth={1.75} />
      <Text variant="body">{message ?? (offline ? t("ui.offlineLoad") : t("ui.loadFail"))}</Text>
      {onRetry ? (
        <View style={styles.actions}>
          <Button variant="secondary" size="sm" onPress={onRetry}>
            {t("rc.tryAgain")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 6, paddingVertical: 24 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
});
