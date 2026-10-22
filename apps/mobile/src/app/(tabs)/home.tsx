import type { adsApi, customerApi, networkApi } from "@ll/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { t } from "../../copy/en-CA";
import { useCampaigns, useMembershipDetails, usePhase2, useProfile, useWallet } from "../../features/customer/queries";
import { useDeviceLocation } from "../../features/customer/location";
import { JoinSheet, PushPrompt, RedeemConfirmSheet, SponsoredWhySheet } from "../../features/customer/sheets";
import { firstName, formatNumber, formatPts, termWord } from "../../lib/award";
import { perkHeadline, perkProgress } from "../../lib/perks";
import { capSponsored } from "../../lib/feed";
import { promoEnds, relativeTime } from "../../lib/format";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ListRow,
  MapPin,
  Gift,
  PerkCard,
  QrCodeIcon,
  Trophy,
  UserPlus,
  OfflineBanner,
  ProgressBar,
  PromoCard,
  RewardCard,
  Screen,
  Section,
  Sheet,
  ShopLogo,
  ShopTile,
  SkeletonList,
  Store,
  Text,
  Ticket,
} from "../../ui";
import { ORDER_STATUS_LABELS, TICKET_STATUS_LABELS } from "../../ui";

/** Feed filter chips → verticals (customer-mobile.md § 2). */
const FILTERS: { key: string; label: string; verticals: string[] | null }[] = [
  { key: "all", label: "All", verticals: null },
  { key: "food", label: "Food & drink", verticals: ["cafe", "restaurant", "bakery", "bar", "grocery"] },
  { key: "services", label: "Services", verticals: ["salon", "barber", "spa", "repair_electronics", "repair_auto", "alterations", "dry_cleaning", "print_shop"] },
  { key: "health", label: "Health", verticals: ["pharmacy", "fitness"] },
  { key: "shops", label: "Shops", verticals: ["retail", "bookstore", "florist", "pet", "other"] },
];

/** One-line progress: "2 more for a free drink" / "130 pts to Free tire rotation" / reward ready. */
function progressLine(m: customerApi.MembershipDto): string {
  if (m.rewardsAvailableCount > 0) return "Reward ready";
  if (!m.nextReward) return m.expiryDisclosure;
  return m.program?.earnType === "stamps"
    ? t("misc.stampsToGo", { n: m.nextReward.pointsNeeded, reward: m.nextReward.name.toLowerCase() })
    : t("misc.ptsToGo", { n: m.nextReward.pointsNeeded, reward: m.nextReward.name });
}

const seenPromos = new Set<string>();
const seenAds = new Set<string>();

export default function Home() {
  const { c } = useTheme();
  const { user, prefs, updatePrefs } = useSession();
  const online = useOnline();
  const wallet = useWallet();
  const profile = useProfile();
  const phase2 = usePhase2();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [why, setWhy] = useState<{ shop: string } | null>(null);
  const [joining, setJoining] = useState<networkApi.FeedItemDto | null>(null);
  const [redeeming, setRedeeming] = useState<{ m: customerApi.MembershipDto; r: customerApi.MemberRewardDto } | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);

  const memberships = wallet.data?.items ?? [];
  const neighbourhoodSlug = prefs.neighbourhoodSlug ?? profile.data?.homeNeighbourhood?.slug ?? null;
  const hoods = useQuery({ queryKey: qk.neighbourhoods, queryFn: api.network.neighbourhoods, staleTime: 60 * 60_000 });
  const hoodName = hoods.data?.items.find((h) => h.slug === neighbourhoodSlug)?.name ?? profile.data?.homeNeighbourhood?.name ?? null;
  const campaigns = useCampaigns(loc.coords?.lat, loc.coords?.lng);
  const live = (campaigns.data?.items ?? []).filter((x) => x.status === "live");

  const hoodDetail = useQuery({ queryKey: ["hood", neighbourhoodSlug ?? ""], queryFn: () => api.network.neighbourhood(neighbourhoodSlug!), enabled: !!neighbourhoodSlug, staleTime: 30 * 60_000 });
  const perk = hoodDetail.data?.perks[0] ?? null;
  const perkState = perk ? perkProgress(perk, memberships, hoodDetail.data?.neighbourhood.id ?? null) : null;
  const total = memberships.reduce((sum, m) => sum + m.balance, 0);
  const referralShop = memberships.find((m) => (m.program?.referralBonus ?? 0) > 0);

  const readyIds = memberships.filter((m) => m.rewardsAvailableCount > 0).map((m) => m.id);
  const details = useMembershipDetails(readyIds);
  const ready = details.flatMap((d) => (d.data ? d.data.rewards.filter((r) => r.affordable).map((r) => ({ m: d.data!.membership, r })) : []));

  const sorted = useMemo(
    () =>
      [...memberships].sort((a, b) => {
        if ((b.rewardsAvailableCount > 0 ? 1 : 0) !== (a.rewardsAvailableCount > 0 ? 1 : 0)) return b.rewardsAvailableCount > 0 ? 1 : -1;
        return (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? "");
      }),
    [memberships],
  );

  const feedKey = `${loc.coords ? `${loc.coords.lat.toFixed(3)},${loc.coords.lng.toFixed(3)}` : neighbourhoodSlug ?? "all"}`;
  const feed = useInfiniteQuery({
    queryKey: qk.feed(feedKey),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.network.feed({ ...(loc.coords ? { lat: loc.coords.lat, lng: loc.coords.lng } : neighbourhoodSlug ? { neighbourhood: neighbourhoodSlug } : {}), limit: 10, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const feedItems = capSponsored((feed.data?.pages ?? []).flatMap((p) => p.items)).filter((it) => {
    const f = FILTERS.find((x) => x.key === filter);
    if (!f?.verticals) return true;
    const v = it.sponsored ? null : it.merchant.vertical;
    return it.sponsored || (v !== null && f.verticals.includes(v));
  });

  // One view/impression per promo per session.
  useEffect(() => {
    for (const it of feedItems.slice(0, 10)) {
      if (it.sponsored) {
        if (!seenAds.has(it.adCampaignId)) {
          seenAds.add(it.adCampaignId);
          void api.ads.impression(it.adCampaignId).catch(() => undefined);
        }
      } else if (!seenPromos.has(it.promo.id)) {
        seenPromos.add(it.promo.id);
        void api.network.promoView(it.promo.id).catch(() => undefined);
      }
    }
  }, [feedItems]);

  // Push pre-prompt after the first earn (never during onboarding).
  const prompted = useRef(false);
  useEffect(() => {
    if (!prompted.current && !prefs.pushPrompted && memberships.some((m) => m.lifetimePoints > 0)) {
      prompted.current = true;
      setPushOpen(true);
    }
  }, [memberships, prefs.pushPrompted]);

  const refresh = () => Promise.all([wallet.refetch(), feed.refetch(), campaigns.refetch(), phase2.refetch()]);
  const inProgress = [
    ...phase2.tickets.filter((x) => !["picked_up", "cancelled", "declined"].includes(x.status)).map((x) => ({ kind: "ticket" as const, x })),
    ...phase2.orders.filter((x) => ["pending", "accepted", "preparing", "ready"].includes(x.status)).map((x) => ({ kind: "order" as const, x })),
  ].sort((a, b) => (a.kind === "ticket" && a.x.status === "quote_sent" ? -1 : b.kind === "ticket" && b.x.status === "quote_sent" ? 1 : 0));

  const renderFeed = (it: networkApi.FeedEntry) => {
    if (it.sponsored) {
      const s = it as adsApi.SponsoredItem;
      return (
        <PromoCard
          key={`ad-${s.adCampaignId}`}
          sponsored
          onSponsoredInfo={() => setWhy({ shop: s.merchant.name })}
          promo={{ title: s.promo?.title ?? s.headline, kind: "offer", endsAt: s.promo?.endsAt ?? null, imageUrl: s.imageUrl ?? s.promo?.imageUrl }}
          shop={{ name: s.merchant.name, vertical: "other", logoUrl: s.merchant.logoUrl, distanceM: s.distanceMetres }}
          onPress={() => {
            void api.ads.click(s.adCampaignId).catch(() => undefined);
            router.push(`/shop/${s.merchant.slug}`);
          }}
        />
      );
    }
    return (
      <PromoCard
        key={`p-${it.promo.id}`}
        promo={it.promo}
        shop={{ name: it.merchant.name, vertical: it.merchant.vertical, logoUrl: it.merchant.logoUrl, brandColor: it.merchant.brandColor, distanceM: it.distanceMetres }}
        onPress={() => router.push(`/shop/${it.merchant.slug}`)}
        joinLabel={it.isMember ? undefined : "Join"}
        onJoin={it.isMember ? undefined : () => setJoining(it)}
      />
    );
  };

  return (
    <Screen
      largeTitle
      title={`Hi ${firstName(user?.name) ?? "there"}`}
      subtitle={
        <Button variant="ghost" size="sm" iconStart={MapPin} onPress={() => setHoodOpen(true)} accessibilityLabel={`Neighbourhood: ${hoodName ?? "not set"}. Change`} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}>
          {hoodName ?? "Pick your neighbourhood"}
        </Button>
      }
      banner={<OfflineBanner mode="customer" online={online} />}
      refreshing={wallet.isRefetching}
      onRefresh={refresh}
    >
      {wallet.isError && memberships.length > 0 ? <Banner variant="danger">Couldn't refresh. Pull to try again.</Banner> : null}
      {wallet.dataUpdatedAt && !online ? (
        <Text variant="caption" color="fgMuted">
          {t("misc.updatedAgo", { relativeTime: relativeTime(wallet.dataUpdatedAt) })}
        </Text>
      ) : null}

      {memberships.length > 0 ? (
        <View style={styles.hero} accessible accessibilityLabel={`${formatNumber(total)} points and stamps across ${memberships.length} shops`}>
          <Text variant="points" tabular center style={{ fontSize: 64, lineHeight: 68 }}>
            {formatNumber(total)}
          </Text>
          <View style={[styles.pill, { backgroundColor: c.brandSubtle }]}>
            <Text variant="label" rawColor={c.onBrandSubtle}>{`across ${memberships.length} ${memberships.length === 1 ? "shop" : "shops"}`}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.shortcuts}>
        {[
          { label: "My card", icon: QrCodeIcon, go: () => router.push("/card") },
          { label: "Rewards", icon: Gift, go: () => router.push("/rewards") },
          { label: "Passport", icon: Trophy, go: () => (live[0] ? router.push(`/campaigns/${live[0].id}`) : router.push({ pathname: "/rewards", params: { tab: "passport" } })) },
          { label: "Invite", icon: UserPlus, go: () => router.push(referralShop ? { pathname: "/referrals", params: { memberId: referralShop.id } } : "/referrals") },
        ].map((x) => (
          <Pressable key={x.label} accessibilityRole="button" accessibilityLabel={x.label} onPress={x.go} style={styles.shortcut}>
            <View style={[styles.shortcutIcon, { backgroundColor: c.surface, borderColor: c.border }]}>
              <x.icon size={24} color={c.fgBrand} />
            </View>
            <Text variant="caption">{x.label}</Text>
          </Pressable>
        ))}
      </View>

      {ready.length > 0 ? (
        <Section title="Rewards ready" action={<Badge tone="accent">{String(ready.length)}</Badge>}>
          <FlatList
            horizontal
            style={styles.bleed}
            contentContainerStyle={styles.bleedContent}
            data={ready}
            keyExtractor={(x) => `${x.m.id}-${x.r.id}`}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => (
              <View style={{ width: 296 }}>
                <RewardCard reward={item.r} balance={item.m.balance} terminology={item.m.terminology} vertical={item.m.merchant.vertical} state="available" shopName={item.m.merchant.name} onRedeem={() => setRedeeming({ m: item.m, r: item.r })} />
              </View>
            )}
          />
        </Section>
      ) : null}

      {inProgress.length > 0 ? (
        <Section title="In progress">
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {inProgress.slice(0, 4).map((row, i, shown) =>
              row.kind === "ticket" ? (
                <ListRow
                  key={row.x.id}
                  divider={i < shown.length - 1}
                  leadingIcon={Ticket}
                  title={`${[row.x.itemDetails.make, row.x.itemDetails.model].filter(Boolean).join(" ") || row.x.issue}`}
                  subtitle={row.x.merchantName}
                  trailing={<Badge tone={row.x.status === "quote_sent" ? "warning" : row.x.status === "ready" ? "success" : "info"}>{row.x.status === "quote_sent" ? "Needs your approval" : TICKET_STATUS_LABELS[row.x.status]}</Badge>}
                  onPress={() => router.push(`/tickets/${row.x.id}`)}
                />
              ) : (
                <ListRow
                  key={row.x.id}
                  divider={i < shown.length - 1}
                  leadingIcon={Store}
                  title={`Pickup order #${row.x.number}`}
                  subtitle={row.x.merchantName}
                  trailing={<Badge tone={row.x.status === "ready" ? "success" : row.x.status === "pending" ? "warning" : "info"}>{ORDER_STATUS_LABELS[row.x.status]}</Badge>}
                  onPress={() => router.push(`/orders/${row.x.id}`)}
                />
              ),
            )}
          </Card>
        </Section>
      ) : null}

      <Section
        title="My shops"
        action={sorted.length > 0 ? <Button variant="ghost" size="sm" onPress={() => setShowAll((v) => !v)}>{showAll ? "Show less" : `See all ${sorted.length}`}</Button> : undefined}
      >
        {wallet.isLoading ? (
          <SkeletonList rows={1} rowHeight={148} />
        ) : memberships.length === 0 ? (
          <EmptyState
            icon={Store}
            title={t("empty.wallet.title")}
            body={t("empty.wallet.body")}
            actionLabel={t("action.showCard")}
            onAction={() => router.push("/card")}
            secondaryLabel="Find shops nearby"
            onSecondary={() => router.push("/map")}
          />
        ) : showAll ? (
          sorted.map((m) => (
            <ShopTile
              key={m.id}
              variant="wallet"
              shop={{ name: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl, brandColor: m.merchant.brandColor }}
              balance={{ value: m.balance, terminology: m.terminology }}
              subtitle={progressLine(m)}
              rewardReady={m.rewardsAvailableCount > 0}
              muted={m.muted}
              onPress={() => router.push(`/shop/${m.merchant.slug}`)}
            />
          ))
        ) : (
          <FlatList
            horizontal
            style={styles.bleed}
            contentContainerStyle={styles.bleedContent}
            data={sorted}
            keyExtractor={(m) => m.id}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item: m }) => (
              <Card accentEdge={m.rewardsAvailableCount > 0} onPress={() => router.push(`/shop/${m.merchant.slug}`)} accessibilityLabel={`${m.merchant.name}. ${m.balance} ${m.terminology}. ${progressLine(m)}`} style={{ width: 228, minHeight: 172 }}>
                <View style={{ gap: 10, flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ShopLogo shop={m.merchant} size={40} />
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {m.merchant.name}
                    </Text>
                  </View>
                  <Text variant="h2" color="fgBrand" tabular>
                    {formatPts(m.balance, m.terminology)}
                  </Text>
                  {m.nextReward ? <ProgressBar value={m.nextReward.pointsCost - m.nextReward.pointsNeeded} max={m.nextReward.pointsCost} tone="accent" /> : null}
                  <Text variant="bodySm" color="fgMuted" numberOfLines={1}>
                    {progressLine(m)}
                  </Text>
                </View>
              </Card>
            )}
          />
        )}
      </Section>

      {live[0] ? (
        <Card onPress={() => router.push(`/campaigns/${live[0]!.id}`)} accessibilityLabel={`${live[0].name}. ${live[0].progress.visited} of ${live[0].progress.goal} shops.`}>
          <Text variant="overline" color="fgMuted">
            {live[0].neighbourhood.name}
          </Text>
          <Text variant="title">{`${live[0].name} · ${live[0].progress.visited} of ${live[0].progress.goal} shops`}</Text>
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={live[0].progress.visited} max={live[0].progress.goal} tone="accent" />
          </View>
          <Text variant="bodySm" color="fgMuted" style={{ marginTop: 6 }}>
            {promoEnds(live[0].endsAt) ?? ""}
          </Text>
        </Card>
      ) : null}

      {perk && perkState ? <PerkCard headline={perkHeadline(perk, hoodName)} {...perkState} /> : null}

      <Section title="Nearby promos">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={[styles.bleedContent, { gap: 8 }]}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
        {feed.isLoading ? (
          <SkeletonList rows={2} rowHeight={140} />
        ) : feed.isError && feedItems.length === 0 ? (
          <Banner variant="danger" actionLabel="Try again" onAction={() => feed.refetch()}>
            {t("err.network")}
          </Banner>
        ) : feedItems.length === 0 ? (
          <EmptyState icon={MapPin} title={t("empty.noNeighbourhood.title")} body={t("empty.noNeighbourhood.body")} actionLabel="Suggest my street" onAction={() => router.push("/settings/suggest")} secondaryLabel="See where we are" onSecondary={() => router.push("/map")} />
        ) : (
          <>
            {feedItems.map(renderFeed)}
            {feed.hasNextPage ? (
              <Button variant="secondary" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()}>
                Show more
              </Button>
            ) : null}
          </>
        )}
      </Section>

      {joining ? (
        <JoinSheet
          visible
          onClose={() => setJoining(null)}
          shop={{ id: joining.merchant.id, name: joining.merchant.name, vertical: joining.merchant.vertical, logoUrl: joining.merchant.logoUrl, brandColor: joining.merchant.brandColor }}
          onJoined={() => feed.refetch()}
        />
      ) : null}
      {redeeming ? <RedeemConfirmSheet visible onClose={() => setRedeeming(null)} membership={redeeming.m} reward={redeeming.r} /> : null}
      <SponsoredWhySheet visible={!!why} onClose={() => setWhy(null)} shopName={why?.shop ?? ""} street={hoodName} terminology={termWord(memberships[0]?.terminology)} />
      <PushPrompt visible={pushOpen} onClose={() => setPushOpen(false)} />
      <Sheet visible={hoodOpen} onClose={() => setHoodOpen(false)} title="Your neighbourhood">
        {(hoods.data?.items ?? []).map((h) => (
          <ListRow
            key={h.id}
            leading={<ShopLogo shop={{ name: h.name, vertical: "other" }} size={40} />}
            title={h.name}
            subtitle={`${h.shopCount} shops`}
            selected={h.slug === neighbourhoodSlug}
            onPress={() => {
              updatePrefs({ neighbourhoodSlug: h.slug });
              void api.me.updateProfile({ homeNeighbourhoodId: h.id }).catch(() => undefined);
              setHoodOpen(false);
            }}
          />
        ))}
        {hoods.data?.items.length === 0 ? <Text color="fgMuted">{t("empty.noNeighbourhood.body")}</Text> : null}
        {!prefs.locationPrompted ? (
          <Button
            variant="tonal"
            iconStart={MapPin}
            onPress={async () => {
              updatePrefs({ locationPrompted: true });
              await loc.request();
              setHoodOpen(false);
            }}
          >
            Use my location
          </Button>
        ) : null}
      </Sheet>
      <View style={{ height: 8, backgroundColor: c.canvas }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingTop: 4, paddingBottom: 4 },
  bleed: { marginHorizontal: -16 },
  bleedContent: { paddingHorizontal: 16 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  shortcuts: { flexDirection: "row", justifyContent: "space-between" },
  shortcut: { flex: 1, alignItems: "center", gap: 6, minHeight: 72 },
  shortcutIcon: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
