import type { MessageKey } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { InfoRow, StatusBadge, useMoney } from "../../features/restaurant/components";
import { EVENT_TONE } from "../../features/restaurant/EventRows";
import { rk } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { canApproveQuote, cateringTimeline, dayToDate } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, ui, useTheme } from "../../theme";
import { Banner, Button, Card, Check, ErrorState, Screen, Section, SkeletonList, Text } from "../../ui";

const STEP_DONE: Record<string, MessageKey> = { inquiry: "rest.cat.step.inquiry", tasting: "rest.cat.step.tasting", quoted: "rest.cat.step.quoted", confirmed: "rest.cat.step.confirmed" };

/** Catering event: status timeline (inquiry, tasting, quoted, confirmed), the quote, and the web approval page when it is ready. */
export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t, date, time } = useLocale();
  const money = useMoney();
  const online = useOnline();
  const q = useQuery({ queryKey: rk.event(id ?? ""), queryFn: () => api.catering.event(id!), enabled: !!id, refetchInterval: 60_000 });
  if (q.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (!q.data) return <Screen back title={t("rest.events.title")}><ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => q.refetch()} /></Screen>;
  const e = q.data;
  const steps = cateringTimeline(e);
  const shop = e.merchantName ?? undefined;
  const day = date(dayToDate(e.eventDate), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const approve = canApproveQuote(e);
  const hasQuote = e.totalCents > 0 && ["quoted", "confirmed", "completed"].includes(e.status);
  // Opens the shop's web approval page (/e/<token>) in the browser: signature, deposit and receipt live there.
  const open = () => e.approvalUrl && void Linking.openURL(e.approvalUrl);
  const stepHint = (s: ReturnType<typeof cateringTimeline>[number]): string | null => {
    if (s.status === "tasting") return s.at ? `${date(s.at, { weekday: "short", day: "numeric", month: "short" })}, ${time(s.at)}` : t("rest.cat.step.tasting.opt");
    if (s.status === "quoted" && s.at) return date(s.at, { day: "numeric", month: "short" });
    if (s.status === "confirmed" && s.at) return date(s.at, { day: "numeric", month: "short" });
    if (s.status === "inquiry") return date(s.at!, { day: "numeric", month: "short" });
    return null;
  };

  return (
    <Screen
      back
      title={t("rest.events.title")}
      onRefresh={() => q.refetch()}
      refreshing={q.isRefetching}
      footer={
        approve ? (
          <Button size="lg" fullWidth onPress={open}>
            {t("rest.cat.review")}
          </Button>
        ) : undefined
      }
    >
      <View style={{ gap: 6 }}>
        <Text variant="meta" color="fgMuted">
          {[shop, `#${e.number}`].filter(Boolean).join(" · ")}
        </Text>
        <Text style={disp(26, 800, 30, -0.01)} accessibilityRole="header">
          {t(`event.${e.eventType}` as MessageKey)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <StatusBadge tone={EVENT_TONE[e.status]}>{e.status === "quoted" ? t("rest.cat.quoteReady") : t(`rest.cat.status.${e.status}` as const)}</StatusBadge>
          <Text variant="meta" color="fgMuted" style={{ flexShrink: 1 }}>{`${day} · ${t("rest.guests", { n: e.headcount })}`}</Text>
        </View>
      </View>

      {approve ? <Banner variant="warning" actionLabel={t("rest.cat.review")} onAction={open}>{t("rest.cat.quoteBanner")}</Banner> : null}
      {e.status === "cancelled" ? <Banner variant="neutral">{t("rest.cat.cancelledBanner")}</Banner> : null}
      {e.status === "cancelled" && e.depositPaidAt ? (
        e.depositRefundCents > 0 ? <Banner variant="success">{t("rest.cat.depositRefunded", { amount: money(e.depositRefundCents) })}</Banner> : <Banner variant="neutral">{t("rest.cat.depositKept")}</Banner>
      ) : null}

      {e.status !== "cancelled" ? (
        <Section title={t("rest.cat.where")}>
          <View style={{ paddingTop: 14 }}>
            {steps.map((s, i) => {
              const hint = stepHint(s);
              return (
                <View key={s.status} style={styles.step} accessible accessibilityLabel={`${t(STEP_DONE[s.status]!)}, ${s.state === "done" ? t("rest.cat.done") : s.state === "current" ? t("rest.cat.now") : t("rest.cat.next")}`}>
                  <View style={styles.rail}>
                    <View style={[styles.node, s.state === "done" ? { backgroundColor: c.fg } : s.state === "current" ? { borderWidth: 2, borderColor: c.fg, backgroundColor: c.bg } : { borderWidth: 1.5, borderColor: c.lineStrong, backgroundColor: c.bg }]}>
                      {s.state === "done" ? <Check size={12} color={c.bg} strokeWidth={3} /> : null}
                    </View>
                    {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: s.state === "done" ? c.fg : c.line }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 18 : 0, gap: 2 }}>
                    <Text style={ui(15, s.state === "todo" ? 400 : 600, 20)} color={s.state === "todo" ? "fgSubtle" : "fg"}>
                      {t(STEP_DONE[s.status]!)}
                    </Text>
                    <Text variant="meta" color="fgMuted">
                      {hint ?? t(`rest.cat.step.${s.status}.sub` as MessageKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}

      {hasQuote ? (
        <Section title={t("rest.cat.quote")}>
          <View style={{ paddingTop: 12, gap: 2 }}>
            {e.lineItems.map((l, i) => (
              <InfoRow key={i} label={l.quantity > 1 && !/[x×]\s*\d/.test(l.description) ? `${l.description} × ${l.quantity}` : l.description} value={money(l.totalCents)} />
            ))}
            <View style={{ height: 8 }} />
            <InfoRow label={t("cart.subtotal")} value={money(e.subtotalCents)} />
            <InfoRow label={t("rest.cat.tax")} value={money(e.taxCents)} />
            <InfoRow label={t("cart.total")} value={money(e.totalCents)} strong />
            <InfoRow label={e.depositPaidAt ? t("rest.cat.depositPaid") : t("menu.deposit")} value={money(e.depositCents)} />
            {e.referenceCode && !e.depositPaidAt ? <InfoRow label={t("tcb.q.reference")} value={e.referenceCode} /> : null}
            {e.depositRefundCents > 0 ? <InfoRow label={t("rest.cat.refunded")} value={money(e.depositRefundCents)} /> : null}
            <InfoRow label={t("rest.cat.balance")} value={money(e.balanceCents)} />
          </View>
        </Section>
      ) : null}

      <Card title={t("rest.cat.details")}>
        <InfoRow label={t("catering.eventDate")} value={day} />
        {e.startTime ? <InfoRow label={t("rest.cat.startTime")} value={e.startTime} /> : null}
        <InfoRow label={t("rest.cat.guests")} value={String(e.headcount)} />
        <InfoRow label={t("rest.cat.service")} value={t(`rest.cat.service.${e.service}` as MessageKey)} />
        {e.venueName || e.venueAddress ? <InfoRow label={t("catering.venue")} value={[e.venueName, e.venueAddress].filter(Boolean).join(", ")} /> : null}
        {e.dietaryNotes ? <InfoRow label={t("rest.cat.dietary")} value={e.dietaryNotes} /> : null}
        {e.notes ? <InfoRow label={t("catering.message")} value={e.notes} /> : null}
      </Card>
      {e.status === "confirmed" && e.approvalUrl ? <Button variant="secondary" onPress={open}>{t("rest.cat.openPage")}</Button> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", gap: 14 },
  rail: { width: 22, alignItems: "center" },
  node: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  line: { position: "absolute", top: 24, bottom: -2, width: 2, borderRadius: 1 },
});
