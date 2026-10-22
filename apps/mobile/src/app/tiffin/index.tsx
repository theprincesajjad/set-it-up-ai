import { router } from "expo-router";
import { useRestaurantMine } from "../../features/restaurant/queries";
import { StatusBadge, subTone, useMoney } from "../../features/restaurant/components";
import { useLocale } from "../../lib/i18n";
import { dayToDate } from "../../lib/restaurant";
import { Card, EmptyState, ListRow, Screen, Section, SkeletonList, UtensilsCrossed } from "../../ui";

/** My tiffin: every subscription I have, live ones first. */
export default function MyTiffin() {
  const { t, date } = useLocale();
  const money = useMoney();
  const mine = useRestaurantMine({ always: true });
  const live = mine.subs.filter((s) => s.status !== "cancelled");
  const ended = mine.subs.filter((s) => s.status === "cancelled");
  const row = (s: (typeof mine.subs)[number], last: boolean) => (
    <ListRow
      key={s.id}
      strong
      divider={!last}
      title={s.plan.name}
      subtitle={[s.merchant.name, s.nextDelivery ? t("tiffin.nextDelivery", { date: date(dayToDate(s.nextDelivery.date)) }) : money(s.priceCents)].join(" · ")}
      trailing={<StatusBadge tone={subTone(s.status)}>{t(`rest.sub.${s.status}` as const)}</StatusBadge>}
      onPress={() => router.push(`/tiffin/${s.id}`)}
    />
  );
  return (
    <Screen back title={t("rest.tiffin.mine")} onRefresh={mine.refetch} refreshing={false}>
      {mine.loading ? (
        <SkeletonList rows={2} rowHeight={64} />
      ) : mine.subs.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title={t("rest.tiffin.mine.empty.title")} body={t("rest.tiffin.mine.empty.body")} />
      ) : (
        <>
          {live.length > 0 ? (
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {live.map((s, i) => row(s, i === live.length - 1))}
            </Card>
          ) : null}
          {ended.length > 0 ? (
            <Section title={t("rest.tiffin.ended")}>
              {ended.map((s, i) => row(s, i === ended.length - 1))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
