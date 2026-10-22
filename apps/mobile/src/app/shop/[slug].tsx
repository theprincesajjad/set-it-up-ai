import type { customerApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, Share, View } from "react-native";
import { t } from "../../copy/en-CA";
import { useMembershipDetail, useOrderAhead, usePhase2, useWallet } from "../../features/customer/queries";
import { JoinSheet, RedeemConfirmSheet } from "../../features/customer/sheets";
import { formatPts, termWord } from "../../lib/award";
import { formatDayTime, hoursRows, openStatus } from "../../lib/format";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import {
  Banner,
  BellOff,
  Button,
  Card,
  DiscountCard,
  ErrorState,
  Globe,
  IconButton,
  ListRow,
  Navigation,
  Phone,
  PointsRing,
  PromoCard,
  RewardCard,
  Screen,
  Section,
  Share2,
  ShopTile,
  SkeletonList,
  StampCard,
  Text,
  Ticket,
  useToast,
  ShoppingBag,
  UserPlus,
} from "../../ui";
import { activityTitle } from "../../lib/activity";

/** 3. Shop detail. */
export default function ShopDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const shop = useQuery({ queryKey: qk.shop(slug ?? ""), queryFn: () => api.network.shop(slug!), enabled: !!slug });
  const wallet = useWallet();
  const membership = wallet.data?.items.find((m) => m.merchant.slug === slug) ?? null;
  const detail = useMembershipDetail(membership?.id);
  const menu = useOrderAhead(slug);
  const phase2 = usePhase2();
  const [joining, setJoining] = useState(false);
  const [redeeming, setRedeeming] = useState<customerApi.MemberRewardDto | null>(null);
  const [muting, setMuting] = useState(false);

  if (shop.isLoading) {
    return (
      <Screen back>
        <SkeletonList rows={4} rowHeight={120} />
      </Screen>
    );
  }
  if (!shop.data) {
    return (
      <Screen back>
        <ErrorState offline={!online} message={online ? "This shop isn't on the network right now." : t("err.network")} onRetry={() => shop.refetch()} />
      </Screen>
    );
  }
  const s = shop.data;
  const m = detail.data?.membership ?? membership;
  const loc = s.locations[0] ?? null;
  const status = openStatus(loc?.hours ?? null, loc?.openNow);
  const program = m?.program ?? s.program;
  const term = m?.terminology ?? program?.terminology ?? "points";
  const paused = m && !m.program;
  const myTickets = phase2.tickets.filter((x) => x.merchantId === s.merchant.id);

  const directions = () => {
    if (!loc) return;
    const dest = loc.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : encodeURIComponent(`${loc.address}, ${loc.city}`);
    void Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };
  const toggleMute = async () => {
    if (!m) return;
    setMuting(true);
    try {
      await api.me.setMuted(m.id, !m.muted);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.wallet }), qc.invalidateQueries({ queryKey: qk.membership(m.id) })]);
      toast(m.muted ? t("ok.unmuted", { shop: s.merchant.name }) : t("ok.muted", { shop: s.merchant.name, terminology: termWord(term) }));
    } catch {
      toast({ tone: "error", message: t("err.network") });
    } finally {
      setMuting(false);
    }
  };
  const earnLine = program
    ? program.earnType === "per_dollar"
      ? `${program.pointsPerDollar} ${program.pointsPerDollar === 1 ? "point" : "points"} per $1`
      : program.earnType === "stamps"
        ? `1 ${termWord(term, 1)} per visit · ${program.stampGoal} for a reward`
        : `${formatPts(program.pointsPerVisit, term)} per visit`
    : null;
  const noEarn = s.merchant.vertical === "pharmacy" ? " · Prescriptions don't earn points" : "";

  return (
    <Screen back refreshing={shop.isRefetching} onRefresh={() => Promise.all([shop.refetch(), detail.refetch(), wallet.refetch()])} contentStyle={{ paddingHorizontal: 0 }}>
      <ShopTile variant="hero" shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, coverUrl: s.merchant.coverUrl }} muted={m?.muted} />
      <View style={{ paddingHorizontal: 16, gap: 24, marginTop: -16 }}>
        <View style={{ gap: 4 }}>
          <Text variant="bodySm" color="fgMuted">
            {[s.merchant.neighbourhood?.name, loc?.address].filter(Boolean).join(" · ")}
          </Text>
          {status ? <Text variant="bodySm" color={status.open ? "onSuccessSubtle" : "fgMuted"}>{status.label}</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 12 }}>
            {s.merchant.phone || loc?.phone ? <IconButton icon={Phone} label="Call" showLabel onPress={() => Linking.openURL(`tel:${s.merchant.phone ?? loc?.phone}`)} /> : null}
            {loc ? <IconButton icon={Navigation} label="Directions" showLabel onPress={directions} /> : null}
            {s.merchant.website ? <IconButton icon={Globe} label="Website" showLabel onPress={() => Linking.openURL(s.merchant.website!)} /> : null}
            <IconButton icon={Share2} label="Share" showLabel onPress={() => Share.share({ message: `${s.merchant.name} on the local loyalty network: https://local.example/s/${s.merchant.slug}` })} />
            {m ? <IconButton icon={BellOff} label={m.muted ? "Unmute" : "Mute"} showLabel onPress={toggleMute} disabled={muting} /> : null}
          </View>
        </View>

        {paused ? <Banner variant="neutral">{`This shop has paused its program. Your ${formatPts(m!.balance, term)} are safe.`}</Banner> : null}

        {m ? (
          <Card title="Your card here">
            <View style={{ alignItems: "center", gap: 12 }}>
              {program?.earnType === "stamps" ? (
                <StampCard count={m.balance} goal={program.stampGoal || 10} vertical={s.merchant.vertical} rewardName={m.nextReward?.name ?? null} />
              ) : (
                <PointsRing balance={m.balance} goal={m.nextReward?.pointsCost ?? null} terminology={term} rewardName={m.nextReward?.name} size={120} />
              )}
              {m.nextReward && program?.earnType !== "stamps" ? <Text variant="bodySm">{t("misc.ptsToGo", { n: m.nextReward.pointsNeeded, reward: m.nextReward.name })}</Text> : null}
            </View>
            <Text variant="bodySm" color="fgMuted" style={{ marginTop: 12 }}>
              {`How you earn here: ${earnLine ?? "Ask at the counter"}${noEarn}`}
            </Text>
            <Text variant="bodySm" color="fgMuted">
              {m.expiryDisclosure}
            </Text>
          </Card>
        ) : (
          <Card title="Earn here">
            <Text>{earnLine ?? "Show your card at the counter to earn."}</Text>
            {program?.welcomeBonus ? <Text color="fgMuted">{`Get ${formatPts(program.welcomeBonus, term)} when you join.`}</Text> : null}
            <Text variant="bodySm" color="fgMuted">
              {program?.expiryDisclosure ?? t("misc.pointsNeverExpire", { terminology: termWord(term) })}
            </Text>
            <Button fullWidth onPress={() => setJoining(true)} style={{ marginTop: 12 }}>
              {t("action.join", { shop: s.merchant.name })}
            </Button>
          </Card>
        )}

        {(detail.data?.openRedemptions ?? []).map((r) => (
          <Banner
            key={r.id}
            variant="warning"
            actionLabel="Show code"
            onAction={() =>
              router.push({
                pathname: "/redeem",
                params: { redemptionId: r.id, code: r.code, rewardName: r.rewardName, createdAt: r.createdAt, memberId: m!.id, shopName: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl ?? "", slug: s.merchant.slug },
              })
            }
          >
            {`${r.rewardName}: a code is waiting to be shown at the counter.`}
          </Banner>
        ))}

        {(detail.data?.rewards ?? s.rewards).length > 0 ? (
          <Section title="Rewards">
            {(detail.data?.rewards ?? s.rewards.map((r) => ({ ...r, affordable: false, pointsNeeded: r.pointsCost }))).map((r) => (
              <RewardCard
                key={r.id}
                reward={r}
                balance={m?.balance ?? 0}
                terminology={term}
                state={m && r.affordable ? "available" : "locked"}
                disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                onRedeem={() => setRedeeming(r)}
              />
            ))}
          </Section>
        ) : null}

        {s.promos.length > 0 || (detail.data?.discountCards ?? s.discountCards).length > 0 ? (
          <Section title="Offers">
            {s.promos.map((p) => (
              <PromoCard key={p.id} variant="compact" promo={p} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl }} />
            ))}
            {(detail.data?.discountCards ?? s.discountCards).map((dc) => (
              <Pressable key={dc.id} accessibilityRole="button" accessibilityLabel={`Open ${dc.name}`} onPress={() => router.push({ pathname: "/discount", params: { name: dc.name, percentOff: String(dc.percentOff), amountOffCents: String(dc.amountOffCents), terms: dc.terms ?? "", shopName: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl ?? "" } })}>
                <DiscountCard card={dc} shop={s.merchant} live={false} />
              </Pressable>
            ))}
          </Section>
        ) : null}

        {menu.data || myTickets.length > 0 ? (
          <Section title="Order and services">
            {menu.data ? (
              <Button iconStart={ShoppingBag} size="lg" fullWidth onPress={() => router.push(`/order-ahead/${s.merchant.slug}`)}>
                Order ahead
              </Button>
            ) : null}
            {myTickets.length > 0 ? <ListRow leadingIcon={Ticket} title="My tickets here" subtitle={`${myTickets.length} repair${myTickets.length === 1 ? "" : "s"}`} chevron onPress={() => router.push("/orders")} /> : null}
          </Section>
        ) : null}

        {m && (m.program?.referralBonus ?? 0) > 0 ? (
          <ListRow leadingIcon={UserPlus} title="Invite a friend" subtitle={`You both get ${formatPts(m.program!.referralBonus, term)}`} chevron onPress={() => router.push({ pathname: "/referrals", params: { memberId: m.id } })} />
        ) : null}

        {loc ? (
          <Section title="About">
            {hoursRows(loc.hours).map((h) => (
              <View key={h.day} style={{ flexDirection: "row" }}>
                <Text variant={h.today ? "bodyStrong" : "body"} style={{ flex: 1 }}>
                  {h.day}
                </Text>
                <Text variant={h.today ? "bodyStrong" : "body"}>{h.text}</Text>
              </View>
            ))}
            <Text>{`${loc.address}, ${loc.city}${loc.postalCode ? ` ${loc.postalCode}` : ""}`}</Text>
            {s.merchant.description ? <Text color="fgMuted">{s.merchant.description}</Text> : null}
          </Section>
        ) : null}

        {detail.data && detail.data.history.items.length > 0 ? (
          <Section title="Activity here" action={<Button variant="ghost" size="sm" onPress={() => router.push({ pathname: "/activity", params: { memberId: m!.id } })}>See all</Button>}>
            {detail.data.history.items.slice(0, 3).map((tx) => (
              <ListRow
                key={tx.id}
                title={activityTitle(tx, term)}
                subtitle={formatDayTime(tx.createdAt)}
                trailing={<Text variant="bodyStrong" color={tx.points > 0 ? "onSuccessSubtle" : "fg"} tabular>{`${tx.points > 0 ? "+" : ""}${tx.points}`}</Text>}
              />
            ))}
          </Section>
        ) : null}
      </View>
      {joining ? (
        <JoinSheet
          visible
          onClose={() => setJoining(false)}
          shop={{ id: s.merchant.id, name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, consentText: s.consentText }}
          welcomeBonus={program?.welcomeBonus}
          terminology={term}
        />
      ) : null}
      {redeeming && m ? <RedeemConfirmSheet visible onClose={() => setRedeeming(null)} membership={m} reward={redeeming} /> : null}
    </Screen>
  );
}
