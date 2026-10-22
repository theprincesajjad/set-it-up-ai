import type { customerApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Pressable, Share, View } from "react-native";
import { t } from "../../copy/en-CA";
import { useMembershipDetail, usePhase2, useWallet } from "../../features/customer/queries";
import { JoinSheet, RedeemConfirmSheet } from "../../features/customer/sheets";
import { formatPts, termWord } from "../../lib/award";
import { formatDayTime, formatDistance, hoursRows, openStatus } from "../../lib/format";
import { distanceMetres } from "@ll/shared";
import { useDeviceLocation } from "../../features/customer/location";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import {
  Badge,
  Banner,
  SegmentedControl,
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
  Users,
} from "../../ui";
import { activityTitle } from "../../lib/activity";
import { displayPhone } from "../../lib/phone";

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
  const phase2 = usePhase2();
  const [joining, setJoining] = useState(false);
  const [redeeming, setRedeeming] = useState<customerApi.MemberRewardDto | null>(null);
  const [muting, setMuting] = useState(false);
  const [tab, setTab] = useState<"rewards" | "promos" | "about">("rewards");
  const { c, vertical } = useTheme();
  const { prefs } = useSession();
  const locState = useDeviceLocation(prefs.locationPrompted);

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
  // Entry points come from the shop's feature flags (GET /v1/public/shops/:slug → features).
  const orderAhead = !!s.features?.orderAhead;
  const ticketsOn = !!s.features?.serviceTickets || myTickets.length > 0;
  const neighbours = s.memberCount != null ? `${s.memberCount.toLocaleString("en-CA")} neighbours are members` : null;

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

  const vis = vertical(s.merchant.vertical);
  const dist = locState.coords && loc?.lat != null && loc.lng != null ? distanceMetres(locState.coords, { lat: loc.lat, lng: loc.lng }) : null;
  const rewardsList = detail.data?.rewards ?? s.rewards.map((r) => ({ ...r, affordable: false, pointsNeeded: r.pointsCost }));
  const discountCards = detail.data?.discountCards ?? s.discountCards;

  return (
    <Screen
      back
      floatingBack
      refreshing={shop.isRefetching}
      onRefresh={() => Promise.all([shop.refetch(), detail.refetch(), wallet.refetch()])}
      contentStyle={{ paddingHorizontal: 0 }}
      footer={
        !m ? (
          <Button size="lg" fullWidth onPress={() => setJoining(true)}>
            Join — free
          </Button>
        ) : undefined
      }
    >
      <ShopTile variant="hero" shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor, coverUrl: s.merchant.coverUrl }} muted={m?.muted} />
      <View style={{ paddingHorizontal: 16, gap: 20, marginTop: -16 }}>
        <View style={{ gap: 8 }}>
          <Text variant="bodySm" color="fgMuted">
            {[vis.label, loc?.address, dist != null ? formatDistance(dist) : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {status ? <Badge tone={status.open ? "success" : "neutral"}>{status.label}</Badge> : null}
            {s.merchant.neighbourhood ? <Badge tone="neutral">{s.merchant.neighbourhood.name}</Badge> : null}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 4 }}>
            {s.merchant.phone || loc?.phone ? <IconButton icon={Phone} label="Call" showLabel onPress={() => Linking.openURL(`tel:${s.merchant.phone ?? loc?.phone}`)} /> : null}
            {loc ? <IconButton icon={Navigation} label="Directions" showLabel onPress={directions} /> : null}
            {s.merchant.website ? <IconButton icon={Globe} label="Website" showLabel onPress={() => Linking.openURL(s.merchant.website!)} /> : null}
            <IconButton icon={Share2} label="Share" showLabel onPress={() => Share.share({ message: `${s.merchant.name}: https://local.example/s/${s.merchant.slug}` })} />
            {m ? <IconButton icon={BellOff} label={m.muted ? "Unmute" : "Mute"} showLabel onPress={toggleMute} disabled={muting} /> : null}
          </View>
        </View>

        {paused ? <Banner variant="neutral">{`This shop has paused its program. Your ${formatPts(m!.balance, term)} are safe.`}</Banner> : null}

        {m ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="fgMuted">
                  Your balance
                </Text>
                <Text variant="h1" color="fgBrand" tabular>
                  {formatPts(m.balance, term)}
                </Text>
              </View>
              {program?.earnType !== "stamps" ? <PointsRing balance={m.balance} goal={m.nextReward?.pointsCost ?? null} terminology={term} rewardName={m.nextReward?.name} size={64} /> : null}
            </View>
            {program?.earnType === "stamps" ? (
              <View style={{ marginTop: 12 }}>
                <StampCard count={m.balance} goal={program.stampGoal || 10} vertical={s.merchant.vertical} logoUrl={s.merchant.logoUrl} rewardName={m.nextReward?.name ?? rewardsList.find((r) => r.affordable)?.name ?? null} />
              </View>
            ) : m.nextReward ? (
              <Text variant="bodySm" style={{ marginTop: 8 }}>
                {t("misc.ptsToGo", { n: m.nextReward.pointsNeeded, reward: m.nextReward.name })}
              </Text>
            ) : null}
            <Text variant="bodySm" color="fgMuted" style={{ marginTop: 8 }}>
              {`How you earn here: ${earnLine ?? "Ask at the counter"}${noEarn}`}
            </Text>
            <Text variant="bodySm" color="fgMuted">
              {m.expiryDisclosure}
            </Text>
          </Card>
        ) : (
          <Card tone="sunken">
            <Text variant="title">Earn here</Text>
            <Text>{earnLine ?? "Show your card at the counter to earn."}</Text>
            {program?.welcomeBonus ? <Text color="fgMuted">{`Get ${formatPts(program.welcomeBonus, term)} when you join.`}</Text> : null}
            {neighbours ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Users size={16} color={c.fgMuted} />
                <Text variant="bodySm" color="fgMuted">
                  {neighbours}
                </Text>
              </View>
            ) : null}
            <Text variant="bodySm" color="fgMuted">
              {program?.expiryDisclosure ?? t("misc.pointsNeverExpire", { terminology: termWord(term) })}
            </Text>
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
                params: { redemptionId: r.id, code: r.code, rewardName: r.rewardName, createdAt: r.createdAt, expiresAt: r.expiresAt ?? "none", memberId: m!.id, shopName: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl ?? "", brandColor: s.merchant.brandColor ?? "", slug: s.merchant.slug },
              })
            }
          >
            {`${r.rewardName}: a code is waiting to be shown at the counter.`}
          </Banner>
        ))}

        <SegmentedControl
          accessibilityLabel="Shop sections"
          options={[
            { value: "rewards", label: "Rewards" },
            { value: "promos", label: "Promos" },
            { value: "about", label: "About" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "rewards" ? (
          <View style={{ gap: 16 }}>
            {rewardsList.length === 0 ? <Text color="fgMuted">This shop hasn't added rewards yet.</Text> : null}
            {[...rewardsList]
              .sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.pointsCost - b.pointsCost)
              .map((r) => (
                <RewardCard
                  key={r.id}
                  reward={r}
                  balance={m?.balance ?? 0}
                  terminology={term}
                  vertical={s.merchant.vertical}
                  state={m && r.affordable ? "available" : "locked"}
                  disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                  onRedeem={() => setRedeeming(r)}
                />
              ))}
            {orderAhead || ticketsOn ? (
              <Section title="Order and services">
                {orderAhead ? (
                  <Button iconStart={ShoppingBag} size="lg" fullWidth onPress={() => router.push(`/order-ahead/${s.merchant.slug}`)}>
                    Order ahead
                  </Button>
                ) : null}
                {ticketsOn ? (
                  <ListRow
                    leadingIcon={Ticket}
                    title="My tickets here"
                    subtitle={myTickets.length > 0 ? `${myTickets.length} repair${myTickets.length === 1 ? "" : "s"}` : "Drop off at the counter, then track it here"}
                    chevron
                    onPress={() => router.push("/orders")}
                  />
                ) : null}
              </Section>
            ) : null}
            {m && (m.program?.referralBonus ?? 0) > 0 ? (
              <ListRow leadingIcon={UserPlus} title="Invite a friend" subtitle={`You both get ${formatPts(m.program!.referralBonus, term)}`} chevron onPress={() => router.push({ pathname: "/referrals", params: { memberId: m.id } })} />
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
        ) : null}

        {tab === "promos" ? (
          <View style={{ gap: 12 }}>
            {s.promos.length === 0 && discountCards.length === 0 ? <Text color="fgMuted">No offers right now.</Text> : null}
            {s.promos.map((p) => (
              <PromoCard key={p.id} variant="compact" promo={p} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} />
            ))}
            {discountCards.map((dc) => (
              <Pressable
                key={dc.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${dc.name}`}
                onPress={() => router.push({ pathname: "/discount", params: { name: dc.name, percentOff: String(dc.percentOff), amountOffCents: String(dc.amountOffCents), terms: dc.terms ?? "", shopName: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl ?? "" } })}
              >
                <DiscountCard card={dc} shop={s.merchant} live={false} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {tab === "about" ? (
          <View style={{ gap: 16 }}>
            {s.merchant.description ? <Text>{s.merchant.description}</Text> : null}
            {loc ? (
              <Section title="Hours">
                {hoursRows(loc.hours).map((h) => (
                  <View key={h.day} style={{ flexDirection: "row" }}>
                    <Text variant={h.today ? "bodyStrong" : "body"} style={{ flex: 1 }}>
                      {h.day}
                    </Text>
                    <Text variant={h.today ? "bodyStrong" : "body"}>{h.text}</Text>
                  </View>
                ))}
                {!loc.hours ? <Text color="fgMuted">Hours not listed. Call ahead.</Text> : null}
              </Section>
            ) : null}
            {loc ? (
              <Section title="Location">
                <Card onPress={directions} accessibilityLabel={`${loc.address}. Get directions`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: vis.tint, alignItems: "center", justifyContent: "center" }}>
                      <Navigation size={22} color={vis.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{loc.address}</Text>
                      <Text variant="bodySm" color="fgMuted">{`${loc.city}${loc.postalCode ? ` ${loc.postalCode}` : ""}${dist != null ? ` · ${formatDistance(dist, true)}` : ""}`}</Text>
                    </View>
                  </View>
                </Card>
              </Section>
            ) : null}
            {s.merchant.instagram ? <ListRow title="Instagram" subtitle={s.merchant.instagram} chevron onPress={() => Linking.openURL(s.merchant.instagram!.startsWith("http") ? s.merchant.instagram! : `https://instagram.com/${s.merchant.instagram!.replace(/^@/, "")}`)} /> : null}
            {s.merchant.phone ? <ListRow title="Phone" subtitle={displayPhone(s.merchant.phone)} chevron onPress={() => Linking.openURL(`tel:${s.merchant.phone}`)} /> : null}
            {neighbours ? <ListRow leadingIcon={Users} title={neighbours} /> : null}
          </View>
        ) : null}
      </View>
      {joining ? (
        <JoinSheet
          visible
          onClose={() => setJoining(false)}
          shop={{ id: s.merchant.id, name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor, consentText: s.consentText }}
          welcomeBonus={program?.welcomeBonus}
          terminology={term}
        />
      ) : null}
      {redeeming && m ? <RedeemConfirmSheet visible onClose={() => setRedeeming(null)} membership={m} reward={redeeming} /> : null}
    </Screen>
  );
}
