import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { CircleAlert, CloudOff, type LucideIcon } from "./icons";
import { Text } from "./Text";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "brand" | "danger";
}

/** One sentence + one action, on the left edge. No illustration of people, no icon-in-a-circle. */
export function EmptyState({ icon: Icon, title, body, actionLabel, onAction, secondaryLabel, onSecondary, tone = "brand" }: EmptyStateProps) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {Icon ? <Icon size={24} color={tone === "danger" ? c.negative : c.fgMuted} strokeWidth={1.75} /> : null}
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="fgMuted">
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

export function ErrorState({ message, onRetry, offline }: { message: string; onRetry?: () => void; offline?: boolean }) {
  return <EmptyState icon={offline ? CloudOff : CircleAlert} tone="danger" title={offline ? "You're offline" : "Couldn't load this"} body={message} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 6, paddingVertical: 24 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
});
