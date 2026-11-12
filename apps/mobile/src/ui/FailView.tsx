import { StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { CircleAlert, CloudOff, type LucideIcon } from "./icons";
import { Text } from "./Text";
import { useTheme } from "../theme";

export interface FailViewProps {
  /** What happened, in plain words. */
  title: string;
  /** One line of why (when safe) and what is still fine. */
  body?: string | null;
  icon?: LucideIcon;
  primaryLabel?: string;
  onPrimary?: () => void;
  /** A way out, so nobody is stranded. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Who to ask, for example the shop's phone. */
  help?: string | null;
}

/**
 * The full-screen failure layout: title (the page heading), why, one primary action, a way out, who can help.
 * Presentational only: it needs no providers, so the root error boundary can use it too.
 */
export function FailView({ title, body, icon, primaryLabel, onPrimary, secondaryLabel, onSecondary, help }: FailViewProps) {
  const { c } = useTheme();
  const Icon = icon ?? CircleAlert;
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Icon size={28} color={icon === CloudOff ? c.fgMuted : c.negative} strokeWidth={1.75} />
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text color="fgMuted">{body}</Text> : null}
      <View style={styles.actions}>
        {primaryLabel && onPrimary ? (
          <Button size="lg" onPress={onPrimary}>
            {primaryLabel}
          </Button>
        ) : null}
        {secondaryLabel && onSecondary ? (
          <Button size="lg" variant={primaryLabel && onPrimary ? "ghost" : "secondary"} onPress={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
      </View>
      {help ? (
        <Text variant="bodySm" color="fgMuted">
          {help}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 12, paddingVertical: 32 },
  actions: { alignSelf: "stretch", gap: 8, marginTop: 8 },
});
