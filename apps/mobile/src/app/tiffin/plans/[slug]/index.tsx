import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { DietBadges, useDaysLabel } from "../../../../features/restaurant/components";
import { featureOff, rk, useTiffinPlans } from "../../../../features/restaurant/queries";
import { useLocale } from "../../../../lib/i18n";
import { LanguageSwitcher } from "../../../../lib/i18n/LanguageSwitcher";
import { api } from "../../../../state/api";
import { useOnline } from "../../../../state/network";
import { disp, ui, useTheme } from "../../../../theme";
import { EmptyState, ErrorState, hairline, ListRow, LockedFeature, Screen, Section, SkeletonList, Store, Text, UtensilsCrossed } from "../../../../ui";

/** Tiffin plans a shop offers (GET /v1/public/shops/:slug/tiffin/plans): name, days, price per period, dietary claims. */
export default function TiffinPlans() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useTheme();
  const { t, money, pick } = useLocale();
  const online = useOnline();
  const q = useTiffinPlans(slug);
  const subs = useQuery({ queryKey: rk.subs, queryFn: () => api.tiffin.subscriptions(), retry: false });
  const daysLabel = useDaysLabel();
  const mySubs = (subs.data?.items ?? []).filter((s) => s.merchant.slug === slug && s.status !== "cancelled");

  if (q.isLoading) return <Screen back title={t("rest.tiffin.plans")}><SkeletonList rows={3} rowHeight={96} /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen back title={t("rest.tiffin.plans")}>
        {featureOff(q.error) ? <LockedFeature icon={Store} title={t("rest.tiffin.plans")} body={t("rest.tiffin.notOffered")} /> : <ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => q.refetch()} />}
      </Screen>
    );
  }
  const { shop, plans } = q.data;
  return (
    <Screen back title={t("rest.tiffin.plans")} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Text color="fgMuted">{t("rest.tiffin.intro", { shop: shop.name })}</Text>
      <LanguageSwitcher />
      {mySubs.length > 0 ? (
        <Section title={t("rest.tiffin.mine")}>
          {mySubs.map((s, i) => (
            <ListRow key={s.id} leadingIcon={UtensilsCrossed} title={s.plan.name} subtitle={t(`rest.sub.${s.status}` as const)} chevron divider={i < mySubs.length - 1} onPress={() => router.push(`/tiffin/${s.id}`)} />
          ))}
        </Section>
      ) : null}
      {plans.length === 0 ? <EmptyState icon={Store} title={t("rest.tiffin.none.title")} body={t("rest.tiffin.none.body")} /> : null}
      <View>
        {plans.map((p, i) => {
          const tr = pick(p);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${tr.name}, ${money(p.priceCents)} ${t(p.cadence === "weekly" ? "rest.perWeek" : "rest.perMonth")}`}
              onPress={() => router.push(`/tiffin/plans/${slug}/${p.id}`)}
              style={({ pressed }) => [styles.row, { borderBottomColor: c.line, borderBottomWidth: i < plans.length - 1 ? hairline : 0, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={disp(18, 800, 22)}>{tr.name}</Text>
                <Text variant="meta" color="fgMuted">
                  {`${daysLabel(p.daysOfWeek)} · ${t("rest.tiffin.mealsPerDay", { n: p.mealsPerDay })}`}
                </Text>
                {tr.description ? (
                  <Text variant="body" color="fgMuted" numberOfLines={2}>
                    {tr.description}
                  </Text>
                ) : null}
                <DietBadges dietary={p.dietary} style={{ marginTop: 4 }} />
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={disp(20, 800, 24)} tabular>
                  {money(p.priceCents)}
                </Text>
                <Text style={ui(12, 400, 16)} color="fgMuted">
                  {t(p.cadence === "weekly" ? "rest.perWeek" : "rest.perMonth")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {plans.length > 0 ? (
        <Text variant="caption" color="fgMuted">
          {t("diet.shopClaim")}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingVertical: 16 },
});
