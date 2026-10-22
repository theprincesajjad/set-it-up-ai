import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { CircleAlert, CloudOff, type LucideIcon } from "./icons";
import { Text } from "./Text";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "brand" | "danger";
}

/** Centred stack: 48 icon in 96 circle → h3 → body → one action. Never a dead end. */
export function EmptyState({ icon: Icon, title, body, actionLabel, onAction, secondaryLabel, onSecondary, tone = "brand" }: EmptyStateProps) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.circle, { backgroundColor: tone === "danger" ? c.dangerSubtle : c.brandSubtle }]}>
        <Icon size={48} color={tone === "danger" ? c.danger : c.onBrandSubtle} strokeWidth={1.75} />
      </View>
      <Text variant="h3" center accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="fgMuted" center>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant={tone === "danger" ? "secondary" : "primary"} onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button variant="ghost" onPress={onSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, offline }: { message: string; onRetry?: () => void; offline?: boolean }) {
  return <EmptyState icon={offline ? CloudOff : CircleAlert} tone="danger" title={offline ? "You're offline" : "Couldn't load this"} body={message} actionLabel={onRetry ? "Try again" : undefined} onAction={onRetry} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", alignSelf: "center", maxWidth: 360, gap: 12, paddingVertical: 32, paddingHorizontal: 16 },
  circle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
