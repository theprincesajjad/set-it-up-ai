import { StyleSheet, View } from "react-native";
import { formatPtsL, formatShortDateL, unitLabelL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { Text } from "./Text";

export interface RewardCardProps {
  reward: { name: string; pointsCost: number; rewardType: string; value?: number; terms?: string | null };
  balance: number;
  terminology: string;
  /** info = not a member yet: just the reward and its cost. */
  state: "available" | "locked" | "redeemed" | "info";
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
  const L = useLocale();
  const { t } = L;
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <View style={[styles.wrap, divider ? { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{reward.name}</Text>
          <Text variant="meta" color="fgMuted">
            {[shopName, formatPtsL(L, reward.pointsCost, terminology)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {state === "available" && onRedeem ? (
          <Button size="sm" onPress={onRedeem} disabled={!!disabledReason} accessibilityLabel={t("ui.redeemReward", { reward: reward.name })}>
            {t("sh.rc.redeem")}
          </Button>
        ) : null}
        {state === "available" && !onRedeem ? <Badge tone="accent">{t("sh.rc.ready")}</Badge> : null}
        {state === "redeemed" ? <Badge tone="success">{redeemedAt ? t("ui.redeemedOn", { date: formatShortDateL(L, redeemedAt) }) : t("sh.wallet.redeemed")}</Badge> : null}
      </View>
      {state === "locked" ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          <ProgressBar value={balance} max={reward.pointsCost} tone="accent" height={4} valueText={`${t("ui.progressOf", { value: L.number(balance), max: L.number(reward.pointsCost) })} ${unitLabelL(L, terminology, reward.pointsCost)}`} />
          <Text variant="meta" color="fgMuted">
            {t("sh.wallet.toGo", { amount: formatPtsL(L, toGo, terminology) })}
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
