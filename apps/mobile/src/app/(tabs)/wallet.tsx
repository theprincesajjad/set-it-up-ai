import type { adsApi, customerApi, networkApi } from "@ll/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../copy/en-CA";
import { useDeviceLocation } from "../../features/customer/location";
import { useCampaigns, usePhase2, useWallet } from "../../features/customer/queries";
import { JoinSheet, PushPrompt, SponsoredWhySheet } from "../../features/customer/sheets";
import { capSponsored } from "../../lib/feed";
import { promoEnds, relativeTime, rewardInSentence } from "../../lib/format";
import { heroText, homeHero } from "../../lib/hero";
import { termWord } from "../../lib/award";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Button, CountUp, EmptyState, ErrorState, ListRow, OfflineBanner, ORDER_STATUS_LABELS, ProgressBar, PromoCard, Screen, Section, ShopTile, SkeletonRows, Store, Text, Ticket, TICKET_STATUS_LABELS, Trophy } from "../../ui";

type Membership = customerApi.WalletResponse["items"][number];

/** One line of progress: "3 more for a free drink" / "130 pts to Free tire rotation". */
function progressLine(m: customerApi.MembershipDto): string {
  if (m.rewardsAvailableCount > 0) return m.rewardsAvailableCount > 1 ? `${m.rewardsAvailableCount} rewards ready` : "reward ready";
  if (!m.nextReward) return m.expiryDisclosure;
  return m.program?.earnType === "stamps"
    ? t("misc.stampsToGo", { n: m.nextReward.pointsNeeded, reward: m.nextReward.name.toLowerCase() })
    : t("misc.ptsToGo", { n: m.nextReward.pointsNeeded, reward: rewardInSentence(m.nextReward.name) });
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
  const heroCopy = hero.kind === "empty" ? null : heroText(hero);

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

  const shopRow = (m: Membership, i: number, n: number) => (
    <ShopTile
      key={m.id}
      variant="list"
      shop={{ name: m.merchant.name, vertical: m.merchant.vertical, logoUrl: m.merchant.logoUrl, brandColor: m.merchant.brandColor }}
      balance={{ value: m.balance, terminology: m.terminology }}
      subtitle={progressLine(m)}
      rewardReady={m.rewardsAvailableCount > 0}
      muted={m.muted}
      divider={i < n - 1}
      onPress={() => router.push(`/shop/${m.merchant.slug}`)}
    />
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
        joinLabel={it.isMember ? undefined : "Join"}
        onJoin={it.isMember ? undefined : () => setJoining(it)}
      />
    );
  };

  return (
    <Screen
      title="Wallet"
      largeTitle
      tabBar
      banner={<OfflineBanner mode="customer" online={online} />}
      refreshing={wallet.isRefetching}
      onRefresh={() => Promise.all([wallet.refetch(), feed.refetch(), campaigns.refetch(), phase2.refetch()])}
      subtitle={
        heroCopy ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={heroCopy.label}
            disabled={hero.kind !== "ready" && hero.kind !== "progress"}
            onPress={() => (hero.kind === "ready" ? router.push("/rewards") : hero.kind === "progress" ? router.push(`/shop/${memberships.find((m) => m.id === hero.memberId)?.merchant.slug ?? ""}`) : undefined)}
            style={styles.hero}
          >
            {/^\d+$/.test(heroCopy.big) ? <CountUp value={Number(heroCopy.big)} variant="displayNumber" /> : <Text variant="displayNumber" tabular>{heroCopy.big}</Text>}
            <View style={{ flex: 1, paddingBottom: 6 }}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {heroCopy.line}
              </Text>
              <Text variant="meta" color="fgMuted" numberOfLines={1}>
                {heroCopy.chip.charAt(0).toLowerCase() + heroCopy.chip.slice(1)}
              </Text>
            </View>
          </Pressable>
        ) : null
      }
    >
      {hero.kind === "progress" ? <ProgressBar value={hero.value} max={hero.max} tone="accent" height={4} valueText={heroCopy?.label} /> : null}
      {wallet.isError && memberships.length > 0 ? <Banner variant="neutral" actionLabel="Try again" onAction={() => void wallet.refetch()}>{"Couldn't refresh. Showing your last balances."}</Banner> : null}
      {wallet.dataUpdatedAt && !online ? (
        <Text variant="caption" color="fgMuted">
          {t("misc.updatedAgo", { relativeTime: relativeTime(wallet.dataUpdatedAt) })}
        </Text>
      ) : null}

      {wallet.isLoading ? (
        <SkeletonRows rows={4} />
      ) : wallet.isError && memberships.length === 0 ? (
        <ErrorState offline={!online} message={online ? "Your wallet didn't load." : "You're offline. Your card still works at the counter."} onRetry={() => void wallet.refetch()} />
      ) : memberships.length === 0 ? (
        <EmptyState body={t("empty.wallet.body")} actionLabel={t("action.showCard")} onAction={() => router.push("/card")} />
      ) : (
        <>
          {ready.length > 0 ? <Section title="Rewards ready">{ready.map((m, i) => shopRow(m, i, ready.length))}</Section> : null}
          {rest.length > 0 ? <Section title={ready.length > 0 ? "Earning" : "Your shops"}>{rest.map((m, i) => shopRow(m, i, rest.length))}</Section> : null}
        </>
      )}

      {inProgress.length > 0 ? (
        <Section title="In progress">
          {inProgress.slice(0, 4).map((row, i, shown) =>
            row.kind === "ticket" ? (
              <ListRow
                key={row.x.id}
                divider={i < shown.length - 1}
                leadingIcon={Ticket}
                title={`${[row.x.itemDetails.make, row.x.itemDetails.model].filter(Boolean).join(" ") || row.x.issue}`}
                subtitle={`${row.x.merchantName} · ${row.x.status === "quote_sent" ? "needs your approval" : TICKET_STATUS_LABELS[row.x.status].toLowerCase()}`}
                chevron
                onPress={() => router.push(`/tickets/${row.x.id}`)}
              />
            ) : (
              <ListRow
                key={row.x.id}
                divider={i < shown.length - 1}
                leadingIcon={Store}
                title={`Pickup order #${row.x.number}`}
                subtitle={`${row.x.merchantName} · ${ORDER_STATUS_LABELS[row.x.status].toLowerCase()}`}
                chevron
                onPress={() => router.push(`/orders/${row.x.id}`)}
              />
            ),
          )}
        </Section>
      ) : null}

      {live[0] ? (
        <Section title={live[0].neighbourhood.name}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${live[0].name}. ${live[0].progress.visited} of ${live[0].progress.goal} shops.`} onPress={() => router.push(`/campaigns/${live[0]!.id}`)} style={{ paddingVertical: 14, gap: 8 }}>
            {/* Same columns as a shop row: 44 leading, text at 56 (polish-audit, wallet passport row). */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.lead}>
                <Trophy size={20} color={c.fg} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Text variant="placeName" style={{ flex: 1 }} numberOfLines={1}>
                    {live[0].name}
                  </Text>
                  <Text variant="bodyStrong" tabular>{`${live[0].progress.visited} / ${live[0].progress.goal}`}</Text>
                </View>
                <ProgressBar value={live[0].progress.visited} max={live[0].progress.goal} height={4} />
                <Text variant="meta" color="fgMuted">
                  {promoEnds(live[0].endsAt) ?? "Visit the shops on the list to finish it"}
                </Text>
              </View>
            </View>
          </Pressable>
        </Section>
      ) : null}

      {promosOn && feedItems.length > 0 ? (
        <Section title="Nearby offers" rule={false}>
          {feedItems.map(renderFeed)}
          {feed.hasNextPage && feedItems.length < 6 ? (
            <Button variant="secondary" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()}>
              Show more
            </Button>
          ) : null}
        </Section>
      ) : null}

      {joining ? (
        <JoinSheet
          visible
          onClose={() => setJoining(null)}
          shop={{ id: joining.merchant.id, name: joining.merchant.name, vertical: joining.merchant.vertical, logoUrl: joining.merchant.logoUrl, brandColor: joining.merchant.brandColor }}
          onJoined={() => feed.refetch()}
        />
      ) : null}
      <SponsoredWhySheet visible={!!why} onClose={() => setWhy(null)} shopName={why?.shop ?? ""} street={null} terminology={termWord(memberships[0]?.terminology)} />
      <PushPrompt visible={pushOpen} onClose={() => setPushOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingTop: 8 },
  lead: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
