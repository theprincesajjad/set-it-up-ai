import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StatusBadge } from "../../features/restaurant/components";
import { BookingRow, EVENT_TONE } from "../../features/restaurant/EventRows";
import { useRestaurantMine, useShopNames } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { dayToDate } from "../../lib/restaurant";
import { Card, EmptyState, ListRow, Screen, SegmentedControl, SkeletonList, Store, Users } from "../../ui";
import type { MessageKey } from "@ll/shared";

/** My events: catering inquiries and quotes, and hall bookings with their holds. */
export default function MyEvents() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { t, date } = useLocale();
  const mine = useRestaurantMine({ always: true });
  const names = useShopNames();
  const [tab, setTab] = useState<"catering" | "halls">(params.tab === "halls" ? "halls" : "catering");
  const events = [...mine.events].sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  const bookings = [...mine.bookings].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return (
    <Screen back title={t("rest.events.title")} onRefresh={mine.refetch} refreshing={false}>
      <SegmentedControl
        accessibilityLabel={t("rest.events.title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "catering", label: t("rest.events.catering") },
          { value: "halls", label: t("rest.events.halls") },
        ]}
      />
      {mine.loading ? (
        <SkeletonList rows={3} rowHeight={64} />
      ) : tab === "catering" ? (
        events.length === 0 ? (
          <EmptyState icon={Users} title={t("rest.events.empty.title")} body={t("rest.events.empty.body")} />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {events.map((e, i) => (
              <ListRow
                key={e.id}
                strong
                divider={i < events.length - 1}
                title={`${t(`event.${e.eventType}` as MessageKey)} · ${t("rest.guests", { n: e.headcount })}`}
                subtitle={[names.get(e.merchantId), date(dayToDate(e.eventDate), { weekday: "short", day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ")}
                trailing={<StatusBadge tone={EVENT_TONE[e.status]}>{e.status === "quoted" ? t("rest.cat.quoteReady") : t(`rest.cat.status.${e.status}` as const)}</StatusBadge>}
                onPress={() => router.push(`/events/${e.id}`)}
              />
            ))}
          </Card>
        )
      ) : bookings.length === 0 ? (
        <EmptyState icon={Store} title={t("rest.bk.empty.title")} body={t("rest.bk.empty.body")} />
      ) : (
        <Card padded={false} style={{ paddingHorizontal: 16 }}>
          {bookings.map((b, i) => (
            <BookingRow key={b.id} booking={b} shop={names.get(b.merchantId)} last={i === bookings.length - 1} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
