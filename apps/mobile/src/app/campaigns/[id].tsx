import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Share, StyleSheet, View } from "react-native";
import { useCampaigns } from "../../features/customer/queries";
import { formatShortDate } from "../../lib/format";
import { api } from "../../state/api";
import { useTheme } from "../../theme";
import { Banner, Button, Card, ErrorState, ProgressBar, Screen, Section, ShopLogo, ShopTile, SkeletonList, Text, Trophy } from "../../ui";

/** 8. Campaign / passport detail: passport grid of participating shops + progress. */
export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
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
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  if (!cmp) {
    return (
      <Screen back>
        <ErrorState message="This campaign isn't running any more." />
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
    <Screen back title={cmp.name}>
      <View style={[styles.hero, { backgroundColor: c.accentSubtle }]}>
        <Trophy size={56} color={c.onAccentSubtle} />
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="h2" accessibilityRole="header">
          {cmp.name}
        </Text>
        <Text color="fgMuted">{`${cmp.neighbourhood.name} · ${formatShortDate(cmp.startsAt)} – ${formatShortDate(cmp.endsAt)}`}</Text>
        {cmp.prize ? <Text variant="bodyStrong">{cmp.prize}</Text> : null}
        {cmp.description ? <Text color="fgMuted">{cmp.description}</Text> : null}
      </View>

      {my?.progress.completedAt ? (
        <Card>
          <Banner variant="success">{ended ? `You visited ${done} shops.` : "You did it. You're entered in the draw."}</Banner>
          {!ended ? (
            <Button variant="tonal" onPress={() => Share.share({ message: `I finished the ${cmp.name}! Visit ${goal} shops on ${cmp.neighbourhood.name} to enter.` })} style={{ marginTop: 12 }}>
              Share
            </Button>
          ) : null}
        </Card>
      ) : ended ? (
        <Banner variant="neutral">{`This campaign has ended. You visited ${done} shops.`}</Banner>
      ) : (
        <ProgressBar value={done} max={goal} tone="accent" label="Your passport" valueLabel={`${done} of ${goal}`} valueText={`${done} of ${goal} shops visited`} />
      )}

      <Section title="Passport">
        <View style={styles.grid} accessible accessibilityLabel={`${done} of ${goal} shops visited · ${Math.max(0, goal - done)} to go`}>
          {cmp.merchants.map((m) => {
            const v = visited.has(m.id);
            return (
              <View key={m.id} style={styles.slot}>
                <View style={[styles.stamp, { borderColor: v ? c.accent : c.stampEmpty, borderStyle: v ? "solid" : "dashed", opacity: v ? 1 : 0.4 }]}>
                  <ShopLogo shop={brief(m)} size={52} round />
                </View>
                {v ? (
                  <View style={[styles.visited, { backgroundColor: c.accent }]}>
                    <Text variant="caption" rawColor={c.onAccent}>
                      visited
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text variant="bodySm" color="fgMuted">{`${done} of ${goal} shops visited · ${Math.max(0, goal - done)} to go`}</Text>
      </Section>

      <Section title="Participating shops">
        {merchants.map((m) => (
          <ShopTile
            key={m.id}
            variant="list"
            shop={{ ...brief(m), distanceM: byId.get(m.id)?.distanceMetres ?? null }}
            subtitle={[visited.has(m.id) ? "Visited" : "Not visited yet", byId.get(m.id)?.location?.address].filter(Boolean).join(" · ")}
            onPress={() => router.push(`/shop/${m.slug}`)}
          />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 140, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16 },
  slot: { width: "25%", alignItems: "center" },
  stamp: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  visited: { position: "absolute", bottom: -4, paddingHorizontal: 6, borderRadius: 6, transform: [{ rotate: "-8deg" }] },
});
