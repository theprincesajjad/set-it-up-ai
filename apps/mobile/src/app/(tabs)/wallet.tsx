import type { adsApi, customerApi, networkApi } from "@ll/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDeviceLocation } from "../../features/customer/location";
import { useCampaigns, useMembershipDetails, usePhase2, useWallet } from "../../features/customer/queries";
import { JoinSheet, PushPrompt, SponsoredWhySheet } from "../../features/customer/sheets";
import { capSponsored } from "../../lib/feed";
import { promoEndsL, relativeTimeL } from "../../lib/formatL";
import { heroText, homeHero } from "../../lib/hero";
import { shortHood } from "../../lib/discover";
import { formatNumber } from "../../lib/award";
import { walletRow } from "../../lib/walletRow";
import { api } from "../../state/api";
import { useLocale } from "../../lib/i18n";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { disp, ui, useTheme } from "../../theme";
import { Banner, BellOff, Button, categorySource, ChevronRightGlyph, CountUp, EmptyState, ErrorState, hairline, ListRow, OfflineBanner, ORDER_STATUS_KEYS, PromoCard, SearchGlyph, ShopLogo, SkeletonRows, Store, Text, Ticket, TICKET_STATUS_KEYS, useTabBarSpace } from "../../ui";
import { readableOn, shopInitials } from "../../ui/ShopTile";

type Membership = customerApi.WalletResponse["items"][number];

const HEX = /^#[0-9a-f]{6}$/i;

/** 44 pt shop avatar: initials in Bricolage 800 15 on the shop's colour (canvas), logo, or the object on grey. */
function WalletAvatar({ shop, image }: { shop?: { name: string; logoUrl?: string | null; brandColor?: string | null; vertical: string }; image?: "all" }) {
  const { c } = useTheme();
  if (image || !shop) {
    return (
      <View style={[styles.av, { backgroundColor: c.bgSubtle }]}>
        <Image source={categorySource("all")} style={{ width: 26, height: 26 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  if (shop.logoUrl || !shop.brandColor || !HEX.test(shop.brandColor)) return <ShopLogo shop={shop} size={44} />;
  return (
    <View style={[styles.av, { backgroundColor: shop.brandColor }]}>
      <Text style={disp(15, 800, 18)} rawColor={readableOn(shop.brandColor)} allowFontScaling={false}>
        {shopInitials(shop.name).toLowerCase()}
      </Text>
    </View>
  );
}

const seenPromos = new Set<string>();
const seenAds = new Set<string>();

/**
 * Wallet (foundations § Customer app): iOS large title "wallet" that
 * collapses on scroll, one honest summary line (never points + stamps added
 * together), then a list of shops: rewards ready first under a hairline
 * header, the balance right-aligned in accent. Optional blocks only appear
 * when the API returns them (passport, order-ahead, promos are paid features).
 */
export default function Wallet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const L = useLocale();
  const { t: tr, locale } = L;
  const i18n = { locale, t: tr };
  const { prefs } = useSession();
  const online = useOnline();
  const wallet = useWallet();
  const phase2 = usePhase2();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [why, setWhy] = useState<{ shop: string } | null>(null);
  const [joining, setJoining] = useState<networkApi.FeedItemDto | null>(null);
  const [pushOpen, setPushOpen] = useState(false);

  const memberships: Membership[] = wallet.data?.items ?? [];
  const campaigns = useCampaigns(loc.coords?.lat, loc.coords?.lng);
  const live = (campaigns.data?.items ?? []).filter((x) => x.status === "live");
  const hero = homeHero(memberships);
  const heroCopy = hero.kind === "empty" ? null : heroText(hero, i18n);

  const sorted = useMemo(() => [...memberships].sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? "")), [memberships]);
  const ready = sorted.filter((m) => m.rewardsAvailableCount > 0);
  const rest = sorted.filter((m) => m.rewardsAvailableCount === 0);

  // Promos are a paid feature: the feed only has items for shops that have them on, and the block hides when empty.
  const promosOn = memberships.length === 0 || memberships.some((m) => m.features?.promos);
  const feedKey = loc.coords ? `${loc.coords.lat.toFixed(3)},${loc.coords.lng.toFixed(3)}` : (prefs.neighbourhoodSlug ?? "all");
  const feed = useInfiniteQuery({
    queryKey: qk.feed(feedKey),
    initialPageParam: undefined as string | undefined,
    enabled: promosOn,
    queryFn: ({ pageParam }) =>
      api.network.feed({ ...(loc.coords ? { lat: loc.coords.lat, lng: loc.coords.lng } : prefs.neighbourhoodSlug ? { neighbourhood: prefs.neighbourhoodSlug } : {}), limit: 6, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const feedItems = capSponsored((feed.data?.pages ?? []).flatMap((p) => p.items)).slice(0, 6);

  useEffect(() => {
    for (const it of feedItems) {
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

  const inProgress = [
    ...phase2.tickets.filter((x) => !["picked_up", "cancelled", "declined"].includes(x.status)).map((x) => ({ kind: "ticket" as const, x })),
    ...phase2.orders.filter((x) => ["pending", "accepted", "preparing", "ready"].includes(x.status)).map((x) => ({ kind: "order" as const, x })),
  ];

  const readyNames = useMembershipDetails(ready.map((m) => m.id));
  const readyNameOf = (m: Membership) => readyNames.find((d) => d.data?.membership.id === m.id)?.data?.rewards.find((r) => r.affordable)?.name ?? null;

  const shopRow = (m: Membership, i: number, n: number) => {
    const row = walletRow(m, readyNameOf(m), i18n);
    return (
      <Pressable
        key={m.id}
        accessibilityRole="button"
        accessibilityLabel={`${m.merchant.name}. ${row.subtitle}`}
        onPress={() => router.push(`/shop/${m.merchant.slug}`)}
        style={({ pressed }) => [styles.row, { borderBottomColor: c.line, borderBottomWidth: i < n - 1 ? hairline : 0 }, pressed ? { opacity: 0.7 } : null]}
      >
        <WalletAvatar shop={m.merchant} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[ui(16, 500, 21), { flexShrink: 1 }]} numberOfLines={1}>
              {m.merchant.name}
            </Text>
            {m.muted ? <BellOff size={13} color={c.fgMuted} /> : null}
          </View>
          <Text style={[ui(13, 400, 17), { marginTop: 2, fontStyle: "italic" }]} rawColor={row.accent ? c.accentText : c.fgMuted} numberOfLines={1}>
            {row.subtitle}
          </Text>
          {row.progress != null ? (
            <View style={[styles.bar, { backgroundColor: c.bgMuted }]}>
              <View style={{ width: `${Math.round(row.progress * 100)}%`, height: 3, borderRadius: 999, backgroundColor: c.fg }} />
            </View>
          ) : null}
        </View>
        {row.trailing.kind === "showCard" ? (
          <Text style={ui(14, 600, 18)} rawColor={c.accentText}>
            {tr("sh.hero.showCard")}
          </Text>
        ) : row.trailing.kind === "fraction" ? (
          <Text style={ui(14, 600, 18)} rawColor={c.accentText}>
            {row.trailing.text}
          </Text>
        ) : (
          <View style={styles.bal}>
            <CountUp value={row.trailing.value} format={formatNumber} style={disp(20, 800, 24)} color="fg" />
            <Text style={ui(12, 400, 15)} rawColor={c.fgMuted}>
              {row.trailing.unit}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const section = (title: string) => (
    <Text style={[disp(13, 700, 16), styles.sec, { borderBottomColor: c.line }]} rawColor={c.fgMuted} accessibilityRole="header">
      {title}
    </Text>
  );

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
        joinLabel={it.isMember ? undefined : tr("sh.wallet.join")}
        onJoin={it.isMember ? undefined : () => setJoining(it)}
      />
    );
  };

  const camp = live[0] ?? null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top > 0 ? insets.top + 13 : 60, paddingHorizontal: 20, paddingBottom: tabSpace + 24 }}
        refreshControl={<RefreshControl refreshing={wallet.isRefetching} onRefresh={() => void Promise.all([wallet.refetch(), feed.refetch(), campaigns.refetch(), phase2.refetch()])} />}
      >
        <View style={styles.titleRow}>
          <Text style={disp(34, 800, 40, -0.01)} accessibilityRole="header">
            {tr("sh.wallet.title")}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={tr("sh.wallet.search")} onPress={() => router.navigate({ pathname: "/map", params: { search: "1" } })} style={[styles.circle, { backgroundColor: c.bgSubtle }]}>
            <SearchGlyph size={18} color={c.fg} strokeWidth={2} />
          </Pressable>
        </View>
        <OfflineBanner mode="customer" online={online} />
        {/* With a reward ready, the first section below says it already (Figma wallet): the big number would repeat it. */}
        {heroCopy && hero.kind !== "ready" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={heroCopy.label}
            disabled={hero.kind !== "progress"}
            onPress={() => (hero.kind === "progress" ? router.push(`/shop/${memberships.find((m) => m.id === hero.memberId)?.merchant.slug ?? ""}`) : undefined)}
            style={styles.hero}
          >
            {/^\d+$/.test(heroCopy.big) ? <CountUp value={Number(heroCopy.big)} style={disp(44, 800, 44)} /> : <Text style={disp(44, 800, 44)} tabular>{heroCopy.big}</Text>}
            <Text style={[ui(15, 500, 20), { flexShrink: 1 }]} numberOfLines={2}>
              {heroCopy.line}
              <Text style={ui(15, 400, 20)} rawColor={c.fgMuted}>{` · ${heroCopy.chip.charAt(0).toLowerCase()}${heroCopy.chip.slice(1)}`}</Text>
            </Text>
          </Pressable>
        ) : null}
        {hero.kind === "progress" ? (
          <View style={[styles.heroBar, { backgroundColor: c.bgMuted }]}>
            <View style={{ width: `${Math.round((100 * hero.value) / Math.max(1, hero.max))}%`, height: 3, borderRadius: 999, backgroundColor: c.accent }} />
          </View>
        ) : null}
        {wallet.isError && memberships.length > 0 ? <View style={{ marginTop: 16 }}><Banner variant="neutral" actionLabel={tr("sh.act.tryAgain")} onAction={() => void wallet.refetch()}>{tr("sh.wallet.staleBanner")}</Banner></View> : null}
        {wallet.dataUpdatedAt && !online ? (
          <Text variant="caption" color="fgMuted" style={{ marginTop: 8 }}>
            {tr("cp.misc.updatedAgo", { relativeTime: relativeTimeL(L, wallet.dataUpdatedAt) })}
          </Text>
        ) : null}

        {wallet.isLoading ? (
          <View style={{ marginTop: 28 }}>
            <SkeletonRows rows={4} />
          </View>
        ) : wallet.isError && memberships.length === 0 ? (
          <ErrorState offline={!online} message={online ? tr("sh.wallet.loadFail") : tr("sh.wallet.offline")} onRetry={() => void wallet.refetch()} />
        ) : memberships.length === 0 ? (
          <EmptyState body={tr("cp.empty.walletBody")} actionLabel={tr("sh.nav.myCard")} onAction={() => router.push("/card")} />
        ) : (
          <>
            {ready.length > 0 ? (
              <View>
                {section(tr("sh.wallet.readyNow"))}
                {ready.map((m, i) => shopRow(m, i, ready.length))}
              </View>
            ) : null}
            {rest.length > 0 ? (
              <View>
                {section(ready.length > 0 ? tr("sh.wallet.earning") : tr("sh.wallet.yourShops"))}
                {rest.map((m, i) => shopRow(m, i, rest.length))}
              </View>
            ) : null}
          </>
        )}

        {inProgress.length > 0 ? (
          <View>
            {section(tr("sh.wallet.inProgress"))}
            {inProgress.slice(0, 4).map((row, i, shown) =>
              row.kind === "ticket" ? (
                <ListRow
                  key={row.x.id}
                  divider={i < shown.length - 1}
                  leadingIcon={Ticket}
                  title={`${[row.x.itemDetails.make, row.x.itemDetails.model].filter(Boolean).join(" ") || row.x.issue}`}
                  subtitle={`${row.x.merchantName} · ${row.x.status === "quote_sent" ? tr("sh.wallet.needsApproval") : tr(TICKET_STATUS_KEYS[row.x.status]).toLowerCase()}`}
                  chevron
                  onPress={() => router.push(`/tickets/${row.x.id}`)}
                />
              ) : (
                <ListRow
                  key={row.x.id}
                  divider={i < shown.length - 1}
                  leadingIcon={Store}
                  title={tr("sh.wallet.pickupOrder", { n: row.x.number })}
                  subtitle={`${row.x.merchantName} · ${tr(ORDER_STATUS_KEYS[row.x.status]).toLowerCase()}`}
                  chevron
                  onPress={() => router.push(`/orders/${row.x.id}`)}
                />
              ),
            )}
          </View>
        ) : null}

        {camp ? (
          <View>
            {section(locale === "en" ? shortHood(camp.neighbourhood.name) : tr("sh.wallet.street"))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("ms.camp.a11yShops", { name: camp.name, visited: camp.progress.visited, goal: camp.progress.goal })}
              onPress={() => router.push(`/campaigns/${camp.id}`)}
              style={({ pressed }) => [styles.row, pressed ? { opacity: 0.7 } : null]}
            >
              <WalletAvatar image="all" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={ui(16, 500, 21)} numberOfLines={1}>
                  {camp.name}
                </Text>
                <Text style={[ui(13, 400, 17), { marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={1}>
                  {[tr("ms.camp.ofShops", { visited: camp.progress.visited, goal: camp.progress.goal }), promoEndsL(L, camp.endsAt)?.replace(/^E/, "e")].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <ChevronRightGlyph size={16} color={c.fgSubtle} />
            </Pressable>
          </View>
        ) : null}

        {promosOn && feedItems.length > 0 ? (
          <View style={{ gap: 12 }}>
            {section(tr("sh.wallet.nearbyOffers"))}
            {feedItems.map(renderFeed)}
            {feed.hasNextPage && feedItems.length < 6 ? (
              <Button variant="secondary" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()}>
                {tr("sh.wallet.showMore")}
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {joining ? (
        <JoinSheet
          visible
          onClose={() => setJoining(null)}
          shop={{ id: joining.merchant.id, name: joining.merchant.name, vertical: joining.merchant.vertical, logoUrl: joining.merchant.logoUrl, brandColor: joining.merchant.brandColor }}
          onJoined={() => feed.refetch()}
        />
      ) : null}
      <SponsoredWhySheet visible={!!why} onClose={() => setWhy(null)} shopName={why?.shop ?? ""} street={null} terminology={memberships[0]?.terminology} />
      <PushPrompt visible={pushOpen} onClose={() => setPushOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 14 },
  heroBar: { height: 3, borderRadius: 999, marginTop: 12, overflow: "hidden" },
  sec: { paddingBottom: 8, borderBottomWidth: hairline, marginTop: 28 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  av: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  bar: { height: 3, borderRadius: 999, marginTop: 8, width: 150, overflow: "hidden" },
  bal: { marginStart: "auto", alignItems: "flex-end" },
});
