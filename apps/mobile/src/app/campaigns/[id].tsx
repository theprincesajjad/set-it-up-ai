import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Share, StyleSheet, View } from "react-native";
import { useCampaigns } from "../../features/customer/queries";
import { formatShortDateL } from "../../lib/formatL";
import { useLocale } from "../../lib/i18n";
import { api } from "../../state/api";
import { useTheme } from "../../theme";
import { Banner, Button, Check, ErrorState, Screen, Section, ShopLogo, ShopTile, SkeletonRows, SkeletonShop, Text } from "../../ui";

/** 8. Campaign / passport detail: passport grid of participating shops + progress. */
export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const L = useLocale();
  const { t } = L;
  const mine = useCampaigns();
  const my = mine.data?.items.find((x) => x.id === id) ?? null;
  const pub = useQuery({ queryKey: ["campaign", id], queryFn: () => api.network.campaign(id!), enabled: !!id && !my });
  const cmp = my ?? pub.data;
  // Campaign merchants carry only name + logo; the strip's shop list adds vertical, brand colour and distance.
  const hoodSlug = cmp?.neighbourhood.slug;
  const strip = useQuery({ queryKey: ["campaign-shops", hoodSlug ?? ""], queryFn: () => api.network.shops({ neighbourhood: hoodSlug!, limit: 100 }), enabled: !!hoodSlug, staleTime: 10 * 60_000 });
  const byId = new Map((strip.data?.items ?? []).map((x) => [x.merchant.id, x]));
  if (mine.isLoading || pub.isLoading) {
    return (
      <Screen back>
        <SkeletonShop />
        <SkeletonRows rows={5} trailing={false} />
      </Screen>
    );
  }
  if (!cmp) {
    return (
      <Screen back>
        <ErrorState message={t("ms.camp.gone")} />
      </Screen>
    );
  }
  const visited = new Set(my?.progress.visitedMerchantIds ?? []);
  const goal = my?.progress.goal ?? cmp.goalVisits;
  const done = my?.progress.visited ?? 0;
  const ended = cmp.status === "ended";
  const brief = (m: (typeof cmp.merchants)[number]) => ({ name: m.name, logoUrl: m.logoUrl, vertical: byId.get(m.id)?.merchant.vertical ?? "other", brandColor: byId.get(m.id)?.merchant.brandColor ?? null });
  const dist = (id: string) => byId.get(id)?.distanceMetres ?? Number.POSITIVE_INFINITY;
  // Unvisited first, nearest first (customer-mobile.md § 8).
  const merchants = [...cmp.merchants].sort((a, b) => Number(visited.has(a.id)) - Number(visited.has(b.id)) || dist(a.id) - dist(b.id) || a.name.localeCompare(b.name));

  return (
    <Screen back collapseTitle title={cmp.name} titleCase="as-is" contentStyle={{ paddingTop: 8 }}>
      <View style={{ gap: 6 }}>
        <Text variant="largeTitle" accessibilityRole="header" style={{ textTransform: "none" }}>
          {cmp.name}
        </Text>
        <Text variant="meta" color="fgMuted">{`${cmp.neighbourhood.name.toLowerCase()} · ${formatShortDateL(L, cmp.startsAt)}–${formatShortDateL(L, cmp.endsAt)}`}</Text>
        {cmp.prize ? (
          <Text variant="bodyStrong" style={{ marginTop: 6 }}>
            {cmp.prize}
          </Text>
        ) : null}
        {cmp.description ? <Text color="fgMuted">{cmp.description}</Text> : null}
      </View>

      {my?.progress.completedAt ? (
        <View style={{ gap: 12 }}>
          <Banner variant="success">{ended ? t("ms.camp.visitedN", { n: done }) : t("ms.camp.didIt")}</Banner>
          {!ended ? (
            <Button variant="secondary" onPress={() => Share.share({ message: t("ms.camp.share", { name: cmp.name, goal, hood: cmp.neighbourhood.name }) })} style={{ alignSelf: "flex-start" }}>
              {t("ms.share")}
            </Button>
          ) : null}
        </View>
      ) : ended ? (
        <Banner variant="neutral">{t("ms.camp.ended", { n: done })}</Banner>
      ) : null}

      <Section title={t("ms.camp.yourPassport")}>
        <View style={{ gap: 14, paddingTop: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text variant="displayNumber" tabular>{`${done} / ${goal}`}</Text>
            <Text variant="meta" color="fgMuted">{t("ms.camp.visitedToGo", { n: Math.max(0, goal - done) })}</Text>
          </View>
          <View style={styles.grid} accessible accessibilityLabel={t("ms.camp.gridA11y", { done, goal, n: Math.max(0, goal - done) })}>
            {cmp.merchants.map((m) => {
              const v = visited.has(m.id);
              return (
                <View key={m.id} style={[styles.stamp, { borderColor: v ? c.accent : c.line }]}>
                  <View style={{ opacity: v ? 1 : 0.35 }}>
                    <ShopLogo shop={brief(m)} size={44} />
                  </View>
                  {v ? (
                    <View style={[styles.check, { backgroundColor: c.accent, borderColor: c.bg }]}>
                      <Check size={11} color={c.onAccent} strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </Section>

      <Section title={t("ms.camp.shopsHead")}>
        {merchants.map((m, i) => (
          <ShopTile
            key={m.id}
            variant="list"
            shop={{ ...brief(m), distanceM: byId.get(m.id)?.distanceMetres ?? null }}
            subtitle={[visited.has(m.id) ? t("ms.camp.shopVisited") : t("ms.camp.shopNotYet"), byId.get(m.id)?.location?.address].filter(Boolean).join(" · ")}
            divider={i < merchants.length - 1}
            onPress={() => router.push(`/shop/${m.slug}`)}
          />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stamp: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  check: { position: "absolute", end: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
