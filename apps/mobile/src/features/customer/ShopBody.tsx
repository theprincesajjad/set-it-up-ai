/**
 * The shop, as one column (foundations § Shop sheet): avatar + name + italic
 * kind of place, open dot, quick actions, the stamp row or points bar,
 * rewards, then about. Used by the Explore sheet (peek + full height) and the
 * shop page, so both read the same.
 *
 * Paid features (promos, discount cards, referrals) only appear when the API
 * returns them / the shop's `features` flags say so. No upgrade nags.
 */
import { distanceMetres, type customerApi, type networkApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { radii } from "@ll/design-tokens";
import { Linking, Platform, Pressable, Share, StyleSheet, View } from "react-native";
import { t } from "../../copy/en-CA";
import { activityTitle } from "../../lib/activity";
import { formatNumber, formatPts, termWord, unitLabel } from "../../lib/award";
import { placeKind } from "../../lib/explore";
import { formatDayTime, formatDistance, hoursRows, openStatus, rewardInSentence, signed } from "../../lib/format";
import { displayPhone } from "../../lib/phone";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import {
  Banner,
  BellOff,
  Button,
  CountUp,
  DiscountCard,
  Globe,
  ListRow,
  Navigation,
  Phone,
  ProgressBar,
  PromoCard,
  RewardCard,
  Section,
  Share2,
  ShoppingBag,
  ShopTile,
  StampCard,
  StatusDot,
  Text,
  Ticket,
  UserPlus,
  useToast,
  type LucideIcon,
} from "../../ui";
import { useDeviceLocation } from "./location";
import { useMembershipDetail, usePhase2, useWallet } from "./queries";
import { JoinSheet, RedeemConfirmSheet } from "./sheets";
import { WalletPassButton } from "./WalletPassButton";

export function useShopModel(slug: string | null | undefined) {
  const shop = useQuery({ queryKey: qk.shop(slug ?? ""), queryFn: () => api.network.shop(slug!), enabled: !!slug });
  const wallet = useWallet();
  const membership = wallet.data?.items.find((m) => m.merchant.slug === slug) ?? null;
  const detail = useMembershipDetail(membership?.id);
  return {
    shop,
    wallet,
    membership,
    detail,
    refetch: () => Promise.all([shop.refetch(), detail.refetch(), wallet.refetch()]),
  };
}
export type ShopModel = ReturnType<typeof useShopModel>;

/** Quick action tile: icon over a short label, equal widths so four always fit (same as the web pass). */
function Action({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: pressed ? c.bgMuted : c.bgSubtle, transform: pressed ? [{ scale: 0.98 }] : undefined }]}>
      <Icon size={20} color={c.fg} strokeWidth={1.75} />
      <Text variant="metaStrong" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ShopBody({ model, variant = "page", peek = false }: { model: ShopModel; variant?: "page" | "sheet"; /** Sheet at its low detent: header, status and balance only. */ peek?: boolean }) {
  const online = useOnline();
  const toast = useToast();
  const qc = useQueryClient();
  const phase2 = usePhase2();
  const { prefs } = useSession();
  const locState = useDeviceLocation(prefs.locationPrompted);
  const [joining, setJoining] = useState(false);
  const [redeeming, setRedeeming] = useState<customerApi.MemberRewardDto | null>(null);
  const [muting, setMuting] = useState(false);
  const s = model.shop.data as networkApi.PublicShopResponse | undefined;
  if (!s) return null;

  const m = model.detail.data?.membership ?? model.membership;
  const walletItem = model.membership as (customerApi.MembershipDto & { features?: customerApi.CustomerFeaturesDto }) | null;
  const features = s.features ?? walletItem?.features;
  const loc = s.locations[0] ?? null;
  const status = openStatus(loc?.hours ?? null, loc?.openNow);
  const program = m?.program ?? s.program;
  const term = m?.terminology ?? program?.terminology ?? "points";
  const paused = m && !m.program;
  const myTickets = phase2.tickets.filter((x) => x.merchantId === s.merchant.id);
  const orderAhead = !!features?.orderAhead;
  const ticketsOn = !!features?.serviceTickets || myTickets.length > 0;
  const referralsOn = features?.referrals !== false && (m?.program?.referralBonus ?? 0) > 0;
  const neighbours = s.memberCount != null ? `${s.memberCount.toLocaleString("en-CA")} neighbours are members` : null;
  const dist = locState.coords && loc?.lat != null && loc.lng != null ? distanceMetres(locState.coords, { lat: loc.lat, lng: loc.lng }) : null;
  const rewardsList = model.detail.data?.rewards ?? s.rewards.map((r) => ({ ...r, affordable: false, pointsNeeded: r.pointsCost }));
  const discountCards = model.detail.data?.discountCards ?? s.discountCards;
  const isStamps = program?.earnType === "stamps";

  const directions = () => {
    if (!loc) return;
    const dest = loc.lat != null && loc.lng != null ? `${loc.lat},${loc.lng}` : encodeURIComponent(`${loc.address}, ${loc.city}`);
    void Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };
  const toggleMute = async () => {
    if (!m || muting) return;
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
      ? `${program.pointsPerDollar} ${program.pointsPerDollar === 1 ? "pt" : "pts"} per $1`
      : program.earnType === "stamps"
        ? `1 ${termWord(term, 1)} per visit · ${program.stampGoal} for a reward`
        : `${formatPts(program.pointsPerVisit, term)} per visit`
    : null;
  const noEarn = s.merchant.vertical === "pharmacy" ? " · Prescriptions don't earn points" : "";
  const kind = [placeKind(s.merchant.vertical), s.merchant.neighbourhood?.name.toLowerCase()].filter(Boolean).join(" · ");
  const statusLine = [status ? null : "hours not listed", dist != null ? formatDistance(dist) : null].filter(Boolean).join(" · ");

  const balance = m ? (
    <View style={{ gap: 12 }}>
      {isStamps ? (
        <StampCard count={m.balance} goal={program?.stampGoal || 10} rewardName={m.nextReward?.name ?? rewardsList.find((r) => r.affordable)?.name ?? null} />
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <CountUp value={m.balance} format={formatNumber} variant="displayNumber" color="accent" />
            <Text variant="bodyStrong" color="fgMuted">
              {unitLabel(term, m.balance)}
            </Text>
          </View>
          {m.nextReward ? (
            <ProgressBar
              tone="accent"
              value={m.nextReward.pointsCost - m.nextReward.pointsNeeded}
              max={m.nextReward.pointsCost}
              label={t("misc.ptsToGo", { n: m.nextReward.pointsNeeded, reward: rewardInSentence(m.nextReward.name) })}
              valueText={`${m.balance} of ${m.nextReward.pointsCost}`}
            />
          ) : null}
        </View>
      )}
      <Text variant="meta" color="fgMuted">
        {`${earnLine ?? "Ask at the counter"}${noEarn} · ${m.expiryDisclosure.charAt(0).toLowerCase()}${m.expiryDisclosure.slice(1).replace(/\.$/, "")}`}
      </Text>
      {/* Members on the shop page: the network pass carries this balance too. */}
      {variant === "page" ? <WalletPassButton size="md" /> : null}
    </View>
  ) : (
    <View style={{ gap: 10 }}>
      <Text variant="bodyStrong">{earnLine ? `Earn ${earnLine}` : "Show your card at the counter to earn."}</Text>
      {program?.welcomeBonus ? <Text color="fgMuted">{`Get ${formatPts(program.welcomeBonus, term)} when you join.`}</Text> : null}
      {neighbours ? (
        <Text variant="meta" color="fgMuted">
          {neighbours}
        </Text>
      ) : null}
      <Button size={variant === "sheet" ? "md" : "lg"} fullWidth onPress={() => setJoining(true)}>
        Join free
      </Button>
    </View>
  );

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <ShopTile variant="hero" shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} subtitle={kind} muted={m?.muted} />
        <View style={styles.statusRow}>
          {status ? <StatusDot open={status.open} label={status.label.toLowerCase()} /> : null}
          {statusLine ? (
            <Text variant="meta" color="fgMuted">
              {`${status ? "· " : ""}${statusLine}`}
            </Text>
          ) : null}
        </View>
      </View>

      {paused ? <Banner variant="neutral">{`This shop has paused its program. Your ${formatPts(m!.balance, term)} are safe.`}</Banner> : null}
      {balance}

      {(model.detail.data?.openRedemptions ?? []).map((r) => (
        <Banner
          key={r.id}
          variant="neutral"
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

      {peek ? null : (
        <>
          <View style={styles.actions}>
            {loc ? <Action icon={Navigation} label="Directions" onPress={directions} /> : null}
            {s.merchant.phone || loc?.phone ? <Action icon={Phone} label="Call" onPress={() => Linking.openURL(`tel:${s.merchant.phone ?? loc?.phone}`)} /> : null}
            {s.merchant.website ? <Action icon={Globe} label="Website" onPress={() => Linking.openURL(s.merchant.website!)} /> : null}
            <Action icon={Share2} label="Share" onPress={() => Share.share({ message: `${s.merchant.name}: https://local.example/s/${s.merchant.slug}` })} />
          </View>

          <Section title="Rewards">
            {rewardsList.length === 0 ? (
              <Text color="fgMuted" style={{ paddingVertical: 12 }}>
                This shop hasn't added rewards yet.
              </Text>
            ) : null}
            {[...rewardsList]
              .sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.pointsCost - b.pointsCost)
              .map((r, i, all) => (
                <RewardCard
                  key={r.id}
                  reward={r}
                  balance={m?.balance ?? 0}
                  terminology={term}
                  state={!m ? "info" : r.affordable ? "available" : "locked"}
                  disabledReason={online ? null : t("err.redeem.offlineCustomer")}
                  onRedeem={() => setRedeeming(r)}
                  divider={i < all.length - 1}
                />
              ))}
          </Section>

          {orderAhead || ticketsOn ? (
            <Section title="Order and services">
              {orderAhead ? <ListRow leadingIcon={ShoppingBag} title="Order ahead" subtitle="Pick up at the counter, pay there" chevron onPress={() => router.push(`/order-ahead/${s.merchant.slug}`)} divider={ticketsOn} /> : null}
              {ticketsOn ? (
                <ListRow
                  leadingIcon={Ticket}
                  title="My tickets here"
                  subtitle={myTickets.length > 0 ? `${myTickets.length} repair${myTickets.length === 1 ? "" : "s"}` : "Drop off at the counter, then track it here"}
                  chevron
                  divider={false}
                  onPress={() => router.push("/orders")}
                />
              ) : null}
            </Section>
          ) : null}

          {s.promos.length > 0 || discountCards.length > 0 ? (
            <Section title="Offers" rule={false}>
              {s.promos.map((p) => (
                <PromoCard key={p.id} variant="compact" hideShop terminology={term} promo={p} shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} />
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
            </Section>
          ) : null}

          {m && referralsOn ? (
            <ListRow leadingIcon={UserPlus} title="Invite a friend" subtitle={`You both get ${formatPts(m.program!.referralBonus, term)}`} chevron divider={false} onPress={() => router.push({ pathname: "/referrals", params: { memberId: m.id } })} />
          ) : null}

          {m ? (
            <ListRow
              leadingIcon={BellOff}
              title={m.muted ? "Unmute this shop" : "Mute this shop"}
              subtitle={m.muted ? "Offers from this shop are off" : `No offers from this shop. Your ${termWord(term)} keep working.`}
              divider={false}
              onPress={toggleMute}
            />
          ) : null}

          {model.detail.data && model.detail.data.history.items.length > 0 ? (
            <Section
              title="Your visits"
              action={
                <Button variant="ghost" size="sm" style={{ marginRight: -4 }} onPress={() => router.push({ pathname: "/activity", params: { memberId: m!.id } })}>
                  See all
                </Button>
              }
            >
              {model.detail.data.history.items.slice(0, 3).map((tx, i, all) => (
                <ListRow
                  key={tx.id}
                  divider={i < all.length - 1}
                  title={activityTitle(tx, term)}
                  subtitle={formatDayTime(tx.createdAt)}
                  trailing={
                    <Text variant="bodyStrong" color={tx.points > 0 ? "accentText" : "fgMuted"} tabular>
                      {signed(tx.points)}
                    </Text>
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section title="About">
            <View style={{ gap: 14, paddingTop: 12 }}>
              {s.merchant.description ? <Text>{s.merchant.description}</Text> : null}
              {loc ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${loc.address}. Get directions`} onPress={directions} style={{ gap: 2 }}>
                  <Text variant="bodyStrong">{loc.address}</Text>
                  <Text variant="meta" color="fgMuted">{`${loc.city}${loc.postalCode ? ` ${loc.postalCode}` : ""}${dist != null ? ` · ${formatDistance(dist, true)}` : ""}`}</Text>
                </Pressable>
              ) : null}
              {loc ? (
                <View style={{ gap: 4 }}>
                  {hoursRows(loc.hours).map((h) => (
                    <View key={h.day} style={{ flexDirection: "row" }}>
                      <Text variant={h.today ? "bodyStrong" : "body"} color={h.today ? "fg" : "fgMuted"} style={{ flex: 1 }}>
                        {h.day}
                      </Text>
                      <Text variant={h.today ? "bodyStrong" : "body"} color={h.today ? "fg" : "fgMuted"} tabular>
                        {h.text}
                      </Text>
                    </View>
                  ))}
                  {!loc.hours ? <Text color="fgMuted">Hours not listed. Call ahead.</Text> : null}
                </View>
              ) : null}
              {s.merchant.instagram || s.merchant.phone || neighbours ? (
                <View>
                  {s.merchant.instagram ? (
                    <ListRow
                      title="Instagram"
                      subtitle={s.merchant.instagram}
                      chevron
                      onPress={() => Linking.openURL(s.merchant.instagram!.startsWith("http") ? s.merchant.instagram! : `https://instagram.com/${s.merchant.instagram!.replace(/^@/, "")}`)}
                    />
                  ) : null}
                  {s.merchant.phone ? <ListRow title="Phone" subtitle={displayPhone(s.merchant.phone)} chevron onPress={() => Linking.openURL(`tel:${s.merchant.phone}`)} divider={!!neighbours} /> : null}
                  {neighbours ? <ListRow title={neighbours} divider={false} /> : null}
                </View>
              ) : null}
            </View>
          </Section>
        </>
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, height: 64, paddingHorizontal: 4, borderRadius: radii.card },
});
