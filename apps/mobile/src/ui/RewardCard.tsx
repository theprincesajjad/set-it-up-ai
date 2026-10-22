import { StyleSheet, View } from "react-native";
import { formatPts, lockedRewardCopy } from "../lib/award";
import { formatShortDate } from "../lib/format";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { Text } from "./Text";

export interface RewardCardProps {
  reward: { name: string; pointsCost: number; rewardType: string; value?: number; terms?: string | null };
  balance: number;
  terminology: string;
  state: "available" | "locked" | "redeemed";
  onRedeem?: () => void;
  redeemedAt?: string | null;
  disabledReason?: string | null;
  shopName?: string;
  /** v1 prop, ignored. */
  vertical?: string;
  /** Hairline under the row (lists). */
  divider?: boolean;
}

/**
 * A reward as a row, not a box: name, cost (and shop), and either a black
 * "redeem" capsule, a thin accent progress bar with what's left, or "redeemed".
 */
export function RewardCard({ reward, balance, terminology, state, onRedeem, redeemedAt, disabledReason, shopName, divider = true }: RewardCardProps) {
  const { c } = useTheme();
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <View style={[styles.wrap, divider ? { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{reward.name}</Text>
          <Text variant="meta" color="fgMuted">
            {[shopName, formatPts(reward.pointsCost, terminology)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {state === "available" && onRedeem ? (
          <Button size="sm" onPress={onRedeem} disabled={!!disabledReason} accessibilityLabel={`Redeem ${reward.name}`}>
            Redeem
          </Button>
        ) : null}
        {state === "available" && !onRedeem ? <Badge tone="accent">Ready</Badge> : null}
        {state === "redeemed" ? <Badge tone="success">{redeemedAt ? `Redeemed ${formatShortDate(redeemedAt)}` : "Redeemed"}</Badge> : null}
      </View>
      {state === "locked" ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          <ProgressBar value={balance} max={reward.pointsCost} tone="accent" height={4} valueText={`${balance} of ${reward.pointsCost} ${terminology}`} />
          <Text variant="meta" color="fgMuted">
            {lockedRewardCopy(toGo, terminology)}
          </Text>
        </View>
      ) : null}
      {disabledReason && state === "available" ? (
        <Text variant="meta" color="fgMuted" style={{ marginTop: 6 }}>
          {disabledReason}
        </Text>
      ) : null}
      {reward.terms ? (
        <Text variant="caption" color="fgMuted" style={{ marginTop: 6 }}>
          {reward.terms}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
