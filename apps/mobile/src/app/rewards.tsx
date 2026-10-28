import type { customerApi } from "@ll/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useCampaigns, useMembershipDetails, useWallet } from "../features/customer/queries";
import { RedeemConfirmSheet } from "../features/customer/sheets";
import { promoEndsL } from "../lib/formatL";
import { useLocale } from "../lib/i18n";
import { useOnline } from "../state/network";
import { Badge, Card, EmptyState, Gift, ProgressBar, RewardCard, Screen, SegmentedControl, ShopTile, SkeletonRows, Text, Trophy, WarmCard } from "../ui";

/** 6.1 Rewards: Ready / All shops / Passport. */
export default function Rewards() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const L = useLocale();
  const { t } = L;
  const [tab, setTab] = useState<"ready" | "all" | "passport">(params.tab === "passport" ? "passport" : "ready");
  const online = useOnline();
  const wallet = useWallet();
  const memberships = wallet.data?.items ?? [];
  const details = useMembershipDetails(memberships.map((m) => m.id));
  const loaded = details.filter((d) => d.data).map((d) => d.data!);
  const campaigns = useCampaigns();
  const [redeeming, setRedeeming] = useState<{ m: customerApi.MembershipDto; r: customerApi.MemberRewardDto } | null>(null);
  const ready = loaded.filter((d) => d.rewards.some((r) => r.affordable));

  return (
    <Screen back largeTitle title={t("sh.tab.rewards")} refreshing={wallet.isRefetching} onRefresh={() => Promise.all([wallet.refetch(), campaigns.refetch(), ...details.map((d) => d.refetch())])}>
      <SegmentedControl
        options={[
          { value: "ready", label: t("sh.rc.ready") },
          { value: "all", label: t("ms.allShops") },
          { value: "passport", label: t("sh.camp.passport") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {wallet.isLoading ? <SkeletonRows rows={4} /> : null}

      {tab === "ready" && !wallet.isLoading ? (
        ready.length === 0 ? (
          <EmptyState icon={Gift} title={t("sh.rewards.emptyTitle")} body={t("sh.rewards.emptyBody")} actionLabel={t("sh.rewards.seeShops")} onAction={() => setTab("all")} />
        ) : (
          ready.map((d) => {
            const rs = d.rewards.filter((r) => r.affordable);
            return (
              <WarmCard key={d.membership.id}>
                <ShopTile variant="compact" shop={d.membership.merchant} divider={false} onPress={() => router.push(`/shop/${d.membership.merchant.slug}`)} />
                {rs.map((r, i) => (
                  <RewardCard
                    key={r.id}
                    reward={r}
                    balance={d.membership.balance}
                    terminology={d.membership.terminology}
                    state="available"
                    divider={i < rs.length - 1}
                    disabledReason={online ? null : t("cp.err.offlineRedeem")}
                    onRedeem={() => setRedeeming({ m: d.membership, r })}
                  />
                ))}
              </WarmCard>
            );
          })
        )
      ) : null}

      {tab === "all"
        ? loaded.map((d) => {
            const rs = [...d.rewards].sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.pointsCost - b.pointsCost);
            return (
              <WarmCard key={d.membership.id}>
                <ShopTile
                  variant="compact"
                  shop={d.membership.merchant}
                  balance={{ value: d.membership.balance, terminology: d.membership.terminology }}
                  subtitle={d.membership.expiryDisclosure}
                  divider={false}
                  onPress={() => router.push(`/shop/${d.membership.merchant.slug}`)}
                />
                {rs.length === 0 ? <Text color="fgMuted">{t("ms.noRewardsYet")}</Text> : null}
                {rs.map((r, i) => (
                  <RewardCard
                    key={r.id}
                    reward={r}
                    balance={d.membership.balance}
                    terminology={d.membership.terminology}
                    state={r.affordable ? "available" : "locked"}
                    divider={i < rs.length - 1}
                    disabledReason={online ? null : t("cp.err.offlineRedeem")}
                    onRedeem={() => setRedeeming({ m: d.membership, r })}
                  />
                ))}
              </WarmCard>
            );
          })
        : null}

      {tab === "passport" ? (
        (campaigns.data?.items ?? []).length === 0 ? (
          <EmptyState icon={Trophy} title={t("cp.empty.campaignsTitle")} body={t("cp.empty.campaignsBody")} />
        ) : (
          (campaigns.data?.items ?? []).map((cmp) => (
            <Card key={cmp.id} onPress={() => router.push(`/campaigns/${cmp.id}`)} accessibilityLabel={t("ms.camp.a11y", { name: cmp.name, visited: cmp.progress.visited, goal: cmp.progress.goal })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="headline" style={{ flex: 1 }}>
                  {cmp.name}
                </Text>
                <Badge tone={cmp.status === "live" ? "success" : "neutral"}>{cmp.status === "live" ? t("ms.camp.badgeLive") : cmp.status === "scheduled" ? t("ms.camp.badgeSoon") : t("ms.camp.badgeEnded")}</Badge>
              </View>
              <Text variant="meta" color="fgMuted">
                {[cmp.neighbourhood.name, promoEndsL(L, cmp.endsAt)].filter(Boolean).join(" · ")}
              </Text>
              <View style={{ marginTop: 8 }}>
                <ProgressBar value={cmp.progress.visited} max={cmp.progress.goal} height={4} valueLabel={`${cmp.progress.visited} / ${cmp.progress.goal}`} />
              </View>
            </Card>
          ))
        )
      ) : null}
      {redeeming ? <RedeemConfirmSheet visible onClose={() => setRedeeming(null)} membership={redeeming.m} reward={redeeming.r} /> : null}
    </Screen>
  );
}
