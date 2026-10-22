import type { customerApi } from "@ll/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { t } from "../copy/en-CA";
import { useCampaigns, useMembershipDetails, useWallet } from "../features/customer/queries";
import { RedeemConfirmSheet } from "../features/customer/sheets";
import { promoEnds } from "../lib/format";
import { useOnline } from "../state/network";
import { Badge, Card, EmptyState, Gift, ProgressBar, RewardCard, Screen, SegmentedControl, ShopTile, SkeletonList, Text, Trophy } from "../ui";

/** 6.1 Rewards: Ready / All shops / Passport. */
export default function Rewards() {
  const params = useLocalSearchParams<{ tab?: string }>();
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
    <Screen back title="Rewards" refreshing={wallet.isRefetching} onRefresh={() => Promise.all([wallet.refetch(), campaigns.refetch(), ...details.map((d) => d.refetch())])}>
      <SegmentedControl
        options={[
          { value: "ready", label: "Ready" },
          { value: "all", label: "All shops" },
          { value: "passport", label: "Passport" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {wallet.isLoading ? <SkeletonList rows={3} /> : null}

      {tab === "ready" && !wallet.isLoading ? (
        ready.length === 0 ? (
          <EmptyState icon={Gift} title={t("empty.rewardsReady.title")} body={t("empty.rewardsReady.body")} actionLabel={t("empty.rewardsReady.action")} onAction={() => setTab("all")} />
        ) : (
          ready.map((d) => (
            <View key={d.membership.id} style={{ gap: 8 }}>
              <ShopTile variant="compact" shop={d.membership.merchant} onPress={() => router.push(`/shop/${d.membership.merchant.slug}`)} />
              {d.rewards
                .filter((r) => r.affordable)
                .map((r) => (
                  <RewardCard
                    key={r.id}
                    reward={r}
                    balance={d.membership.balance}
                    terminology={d.membership.terminology}
                    vertical={d.membership.merchant.vertical}
                    state="available"
                    disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                    onRedeem={() => setRedeeming({ m: d.membership, r })}
                  />
                ))}
            </View>
          ))
        )
      ) : null}

      {tab === "all"
        ? loaded.map((d) => (
            <View key={d.membership.id} style={{ gap: 8 }}>
              <ShopTile
                variant="compact"
                shop={d.membership.merchant}
                balance={{ value: d.membership.balance, terminology: d.membership.terminology }}
                subtitle={d.membership.expiryDisclosure}
                onPress={() => router.push(`/shop/${d.membership.merchant.slug}`)}
              />
              {d.rewards.length <= 1 ? (
                d.rewards[0] ? (
                  <RewardCard
                    reward={d.rewards[0]}
                    balance={d.membership.balance}
                    terminology={d.membership.terminology}
                    vertical={d.membership.merchant.vertical}
                    state={d.rewards[0].affordable ? "available" : "locked"}
                    disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                    onRedeem={() => setRedeeming({ m: d.membership, r: d.rewards[0]! })}
                  />
                ) : (
                  <Text color="fgMuted">This shop hasn't added rewards yet.</Text>
                )
              ) : (
                // Affordable first (references.md § 3); the row bleeds to the screen edge so the next card peeks.
                <FlatList
                  horizontal
                  style={{ marginHorizontal: -16 }}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                  data={[...d.rewards].sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.pointsCost - b.pointsCost)}
                  keyExtractor={(r) => r.id}
                  showsHorizontalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
                  renderItem={({ item: r }) => (
                    <View style={{ width: 300 }}>
                      <RewardCard
                        reward={r}
                        balance={d.membership.balance}
                        terminology={d.membership.terminology}
                        vertical={d.membership.merchant.vertical}
                        state={r.affordable ? "available" : "locked"}
                        disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                        onRedeem={() => setRedeeming({ m: d.membership, r })}
                      />
                    </View>
                  )}
                />
              )}
            </View>
          ))
        : null}

      {tab === "passport" ? (
        (campaigns.data?.items ?? []).length === 0 ? (
          <EmptyState icon={Trophy} title={t("empty.campaigns.title")} body={t("empty.campaigns.body")} />
        ) : (
          (campaigns.data?.items ?? []).map((cmp) => (
            <Card key={cmp.id} onPress={() => router.push(`/campaigns/${cmp.id}`)} accessibilityLabel={`${cmp.name}. ${cmp.progress.visited} of ${cmp.progress.goal} shops visited.`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="title" style={{ flex: 1 }}>
                  {cmp.name}
                </Text>
                <Badge tone={cmp.status === "live" ? "success" : cmp.status === "scheduled" ? "info" : "neutral"}>{cmp.status === "live" ? "Live" : cmp.status === "scheduled" ? "Starts soon" : "Ended"}</Badge>
              </View>
              <Text variant="bodySm" color="fgMuted">
                {[cmp.neighbourhood.name, promoEnds(cmp.endsAt)].filter(Boolean).join(" · ")}
              </Text>
              <View style={{ marginTop: 8 }}>
                <ProgressBar value={cmp.progress.visited} max={cmp.progress.goal} tone="accent" valueLabel={`${cmp.progress.visited} of ${cmp.progress.goal}`} />
              </View>
            </Card>
          ))
        )
      ) : null}
      {redeeming ? <RedeemConfirmSheet visible onClose={() => setRedeeming(null)} membership={redeeming.m} reward={redeeming.r} /> : null}
    </Screen>
  );
}
