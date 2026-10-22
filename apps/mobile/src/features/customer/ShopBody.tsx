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
import { Linking, Platform, Pressable, Share, StyleSheet, View, useWindowDimensions } from "react-native";
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
import { disp, ui, useTheme } from "../../theme";
import {
  Banner,
  BellOff,
  Button,
  CallGlyph,
  CardQrIcon,
  DirectionsGlyph,
  DiscountCard,
  GiftGlyph,
  hairline,
  ListRow,
  PromoCard,
  Section,
  ShareGlyph,
  ShoppingBag,
  ShopLogo,
  Text,
  Ticket,
  UserPlus,
  useToast,
  WebsiteGlyph,
} from "../../ui";
import { useDeviceLocation } from "./location";
import { useMembershipDetail, usePhase2, useWallet } from "./queries";
import { JoinSheet, RedeemConfirmSheet } from "./sheets";

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

/** Quick action tile (canvas): grey 56 pt tile, 20 pt glyph over a lowercase 12 pt label; four always fit. */
function Action({ icon: Icon, label, onPress, disabled }: { icon: (p: { size?: number; color: string }) => React.ReactElement; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.charAt(0).toUpperCase() + label.slice(1)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? c.bgMuted : c.bgSubtle, opacity: disabled ? 0.45 : 1 }]}
    >
      <Icon size={20} color={c.fg} />
      <Text style={ui(12, 500, 15)} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Stamp grid (canvas): up to 10 columns of 26 pt dots, accent when earned, the last slot the black gift. */
export function StampGrid({ count, goal }: { count: number; goal: number }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const cols = Math.min(goal, 10);
  const inner = Math.min(width, 480) - 40 - 34;
  const slot = Math.max(18, Math.min(26, Math.floor((inner - (cols - 1) * 6) / cols)));
  const colW = (inner - (cols - 1) * 6) / cols;
  return (
    <View style={styles.grid} accessible accessibilityLabel={`${count} of ${goal} stamps`}>
      {Array.from({ length: goal }, (_, i) => {
        const last = i === goal - 1;
        const on = i < count;
        return (
          <View key={i} style={{ width: colW }}>
            <View
              style={[
                { width: slot, height: slot, borderRadius: slot / 2, alignItems: "center", justifyContent: "center" },
                last ? { backgroundColor: c.fg } : on ? { backgroundColor: c.accent } : { borderWidth: 1.5, borderColor: c.lineStrong },
              ]}
            >
              {last ? <GiftGlyph size={13} color={c.bg} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ShopBody({ model, variant = "page", peek = false }: { model: ShopModel; variant?: "page" | "sheet"; /** Sheet at its low detent: everything down to the rewards (the rest scrolls in at full height). */ peek?: boolean }) {
  const { c } = useTheme();
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
  const kind = [placeKind(s.merchant.vertical), (loc?.address ?? s.merchant.neighbourhood?.name)?.toLowerCase()].filter(Boolean).join(" · ");

  const ready = rewardsList.filter((r) => r.affordable);
  const goal = program?.stampGoal || 10;
  const filled = m ? Math.min(Math.max(0, m.balance), goal) : 0;
  const carry = m && isStamps && m.balance > goal ? m.balance - goal : 0;
  const nextName = m?.nextReward?.name ?? rewardsList.find((r) => !r.affordable)?.name ?? null;
  const readyName = ready[0]?.name ?? null;

  // Stamp card (canvas ShopSheet): "10 / 10 stamps" in accent, the reward state right, a 10-column stamp grid
  // whose last slot is the black gift. Points programs: the balance in accent and a thin bar to the next reward.
  const balance = m ? (
    <View style={[styles.stampCard, { borderColor: c.line }]}>
      <View style={styles.stampHead}>
        <Text style={disp(28, 800, 32, -0.01)} rawColor={c.accent} tabular>
          {isStamps ? String(filled) : formatNumber(m.balance)}
          <Text style={disp(15, 700, 18)} rawColor={c.fgMuted}>
            {isStamps ? ` / ${goal} ${termWord(term, 2)}` : ` ${unitLabel(term, m.balance)}`}
          </Text>
        </Text>
        <Text style={[ui(13, 600, 17), { flexShrink: 1, textAlign: "right" }]} rawColor={readyName ? c.accentText : c.fgMuted} numberOfLines={1}>
          {readyName ? `${rewardInSentence(readyName)} ready` : m.nextReward ? `${m.nextReward.pointsNeeded} to ${rewardInSentence(m.nextReward.name)}` : ""}
        </Text>
      </View>
      {isStamps ? (
        <StampGrid count={filled} goal={goal} />
      ) : m.nextReward ? (
        <View style={{ height: 4, borderRadius: 999, backgroundColor: c.bgMuted, marginTop: 14, overflow: "hidden" }}>
          <View style={{ height: 4, borderRadius: 999, backgroundColor: c.accent, width: `${Math.round((100 * (m.nextReward.pointsCost - m.nextReward.pointsNeeded)) / Math.max(1, m.nextReward.pointsCost))}%` }} />
        </View>
      ) : null}
      {carry > 0 ? (
        <Text style={[ui(12, 400, 16), { marginTop: 10 }]} rawColor={c.fgMuted}>{`+${carry} extra ${carry === 1 ? "stamp carries" : "stamps carry"} over to your next card`}</Text>
      ) : null}
    </View>
  ) : (
    <View style={[styles.stampCard, { borderColor: c.line, gap: 6 }]}>
      <Text style={ui(15, 600, 20)}>{earnLine ? `Earn ${earnLine}` : "Show your card at the counter to earn."}</Text>
      {program?.welcomeBonus ? <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>{`Get ${formatPts(program.welcomeBonus, term)} when you join.`}</Text> : null}
      <Button size="md" fullWidth onPress={() => setJoining(true)} style={{ marginTop: 8 }}>
        Join free
      </Button>
    </View>
  );

  const statusWord = status ? (status.open ? "open" : "closed") : null;
  const statusRest = [
    status ? status.label.replace(/^(Open|Closed)( · )?/, "").replace(/^closes /, "until ") : "hours not listed",
    dist != null ? formatDistance(dist) : null,
    neighbours,
  ].filter(Boolean);

  return (
    <View>
      <View style={styles.head}>
        <ShopLogo shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }} size={56} />
        <View style={{ flex: 1, minWidth: 0, paddingRight: variant === "sheet" ? 50 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[disp(22, 700, 26, -0.01), { flexShrink: 1 }]} accessibilityRole="header" numberOfLines={2}>
              {s.merchant.name}
            </Text>
            {m?.muted ? <BellOff size={16} color={c.fgMuted} accessibilityLabel="Muted" /> : null}
          </View>
          <Text style={[ui(13, 400, 17), { fontStyle: "italic", marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={1}>
            {kind}
          </Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        {status ? <View style={[styles.dot, { backgroundColor: status.open ? c.positive : c.fgSubtle }]} /> : null}
        {statusWord ? <Text style={ui(13, 500, 17)}>{statusWord}</Text> : null}
        <Text style={[ui(13, 400, 17), { flexShrink: 1 }]} rawColor={c.fgMuted}>
          {`${statusWord ? "· " : ""}${statusRest.join(" · ")}`}
        </Text>
      </View>

      {paused ? <View style={{ marginTop: 16 }}><Banner variant="neutral">{`This shop has paused its program. Your ${formatPts(m!.balance, term)} are safe.`}</Banner></View> : null}
      <View style={{ marginTop: 20 }}>{balance}</View>

      {(model.detail.data?.openRedemptions ?? []).map((r) => (
        <View key={r.id} style={{ marginTop: 12 }}>
          <Banner
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
        </View>
      ))}

      <View style={styles.actions}>
        <Action icon={DirectionsGlyph} label="directions" onPress={directions} disabled={!loc} />
        <Action icon={CallGlyph} label="call" onPress={() => Linking.openURL(`tel:${s.merchant.phone ?? loc?.phone}`)} disabled={!(s.merchant.phone || loc?.phone)} />
        <Action icon={WebsiteGlyph} label="website" onPress={() => Linking.openURL(s.merchant.website!)} disabled={!s.merchant.website} />
        <Action icon={ShareGlyph} label="share" onPress={() => Share.share({ message: `${s.merchant.name}: https://local.example/s/${s.merchant.slug}` })} />
      </View>

      <Text style={[disp(17, 800, 21), { marginTop: 24 }]} accessibilityRole="header">
        rewards
      </Text>
      {rewardsList.length === 0 ? (
        <Text style={[ui(15, 400, 20), { paddingVertical: 14 }]} rawColor={c.fgMuted}>
          This shop hasn't added rewards yet.
        </Text>
      ) : null}
      {[...rewardsList]
        .sort((a, b) => Number(b.affordable) - Number(a.affordable) || a.pointsCost - b.pointsCost)
        .map((r, i, all) => {
          const canRedeem = !!m && r.affordable;
          const toGo = Math.max(0, r.pointsCost - (m?.balance ?? 0));
          return (
            <Pressable
              key={r.id}
              accessibilityRole={canRedeem ? "button" : undefined}
              accessibilityLabel={canRedeem ? `Redeem ${r.name}` : `${r.name}, ${formatPts(r.pointsCost, term)}${m ? `, ${toGo} to go` : ""}`}
              disabled={!canRedeem || !online}
              onPress={() => setRedeeming(r)}
              style={({ pressed }) => [styles.rewardRow, { borderBottomColor: c.line, borderBottomWidth: i < all.length - 1 ? hairline : 0, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={ui(15, 500, 20)}>{r.name}</Text>
                <Text style={[ui(13, 400, 17), { marginTop: 2 }]} rawColor={c.fgMuted}>
                  {formatPts(r.pointsCost, term)}
                </Text>
              </View>
              {m ? (
                canRedeem ? (
                  <Text style={ui(13, 600, 17)} rawColor={c.accentText}>
                    ready
                  </Text>
                ) : (
                  <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>{`${toGo} to go`}</Text>
                )
              ) : null}
            </Pressable>
          );
        })}
      {!online && ready.length > 0 ? (
        <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>
          {t("err.redeem.offlineCustomer")}
        </Text>
      ) : null}

      {peek ? null : (
        <View style={{ gap: 18, marginTop: 24 }}>
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
                <Button variant="ghost" size="sm" style={{ marginRight: -4 }} onPress={() => router.push({ pathname: "/history", params: { memberId: m!.id } })}>
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
              <Text variant="meta" color="fgMuted">
                {`${earnLine ?? "Ask at the counter"}${noEarn}${m ? ` · ${m.expiryDisclosure.charAt(0).toLowerCase()}${m.expiryDisclosure.slice(1).replace(/\.$/, "")}` : ""}`}
              </Text>
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
        </View>
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
  head: { flexDirection: "row", alignItems: "center", gap: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stampCard: { padding: 16, borderWidth: hairline, borderRadius: 16 },
  stampHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6, columnGap: 6, marginTop: 14 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 },
  action: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, height: 56, paddingHorizontal: 4, borderRadius: 14 },
  rewardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, gap: 12 },
});

/** The pinned black capsule under the shop (canvas): members open My card to redeem at the counter. */
export function ShopCardCta({ model }: { model: ShopModel }) {
  const { c } = useTheme();
  if (!model.shop.data || !model.membership) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Show my card to redeem"
      onPress={() => router.push("/card")}
      style={({ pressed }) => [ctaStyles.cta, { backgroundColor: c.fg, opacity: pressed ? 0.88 : 1 }]}
    >
      <CardQrIcon size={20} color={c.bg} />
      <Text style={ui(16, 600, 20)} rawColor={c.bg}>
        show my card to redeem
      </Text>
    </Pressable>
  );
}

const ctaStyles = StyleSheet.create({
  cta: { height: 54, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
});
