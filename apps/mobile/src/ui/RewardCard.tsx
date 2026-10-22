import { StyleSheet, View } from "react-native";
import { formatPts, lockedRewardCopy } from "../lib/award";
import { formatShortDate } from "../lib/format";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";
import { BadgePercent, Coffee, Gift, verticalIcon } from "./icons";
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
  /** Shop vertical: a free item shows the shop's own icon (croissant, scissors…) instead of a generic cup. */
  vertical?: string;
}

/** system.md § RewardCard. */
export function RewardCard({ reward, balance, terminology, state, onRedeem, redeemedAt, disabledReason, shopName, vertical }: RewardCardProps) {
  const { c, vertical: vfn } = useTheme();
  const Icon =
    reward.rewardType === "percent_off" || reward.rewardType === "amount_off"
      ? BadgePercent
      : reward.rewardType === "free_item"
        ? vertical
          ? verticalIcon(vfn(vertical).icon)
          : Coffee
        : Gift;
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <Card accentEdge={state === "available"}>
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: c.accentSubtle }]}>
          <Icon size={28} color={c.onAccentSubtle} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{reward.name}</Text>
          <Text variant="bodySm" color="fgMuted">
            {[shopName, formatPts(reward.pointsCost, terminology)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {state === "available" && onRedeem ? (
          <Button variant="accent" size="sm" onPress={onRedeem} disabled={!!disabledReason} accessibilityLabel={`Redeem ${reward.name}`}>
            Redeem
          </Button>
        ) : null}
        {state === "redeemed" ? <Badge tone="success">{redeemedAt ? `Redeemed ${formatShortDate(redeemedAt)}` : "Redeemed"}</Badge> : null}
      </View>
      {state === "locked" ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          <ProgressBar value={balance} max={reward.pointsCost} tone="accent" valueText={`${balance} of ${reward.pointsCost} ${terminology}`} />
          <Text variant="bodySm" color="fgMuted">{lockedRewardCopy(toGo, terminology)}</Text>
        </View>
      ) : null}
      {disabledReason && state === "available" ? (
        <Text variant="bodySm" color="fgMuted" style={{ marginTop: 8 }}>
          {disabledReason}
        </Text>
      ) : null}
      {reward.terms ? (
        <Text variant="caption" color="fgMuted" style={{ marginTop: 8 }}>
          {reward.terms}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  tile: { width: 56, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
