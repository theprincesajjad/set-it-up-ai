import { useLocalSearchParams, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { classesApi } from "@ll/shared";
import { errorMessage as apiError, isApiError } from "../../api/client";
import { StudioTabs } from "../../features/classes/StudioTabs";
import { useMyClasses, useRefreshClasses, useStudio } from "../../features/classes/queries";
import { usePayment, useMoney } from "../../features/restaurant/components";
import { featureOff } from "../../features/restaurant/queries";
import { bookErrorKey, cardAction, cardState, durationMin, endsSentence, firstDay, freeCancelUntil, groupByDay, offerDropIn, payChoice, scheduleDays } from "../../lib/classes";
import { useLocale } from "../../lib/i18n";
import { dayToDate, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { useSession } from "../../state/session";
import { useTheme } from "../../theme";
import { Banner, Button, EmptyState, ErrorState, hairline, LockedFeature, Screen, Sheet, SkeletonList, Store, Text, useToast } from "../../ui";

type Sess = classesApi.ClassSessionDto;
type Product = classesApi.ProductDto;

/**
 * A studio's class schedule (Figma frames 05 and 06): the person's pass, a strip of days, each class with its spots and one button
 * (Book, Join waitlist, Cancel), and a booking sheet that says what pays for the class and the cancel rule before the tap. Packs and
 * memberships are listed below; a membership opens the agreement screen, a pack is paid on the web page like every card payment.
 */
export default function Classes() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useTheme();
  const { t, date, time } = useLocale();
  const money = useMoney();
  const toast = useToast();
  const online = useOnline();
  const { status } = useSession();
  const studio = useStudio(slug);
  const mine = useMyClasses();
  const refresh = useRefreshClasses();
  const data = studio.data;
  const [day, setDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sess | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pay = usePayment(() => void refresh());

  const today = torontoToday();
  const days = useMemo(() => scheduleDays(today), [today]);
  const byDay = useMemo(() => (data ? groupByDay(data.sessions, data.shop.timezone) : new Map<string, Sess[]>()), [data]);

  if (studio.isLoading) return <Screen back><SkeletonList rows={4} rowHeight={96} /></Screen>;
  if (studio.isError || !data) {
    return (
      <Screen back title={t("cl.ui.title")}>
        {featureOff(studio.error) ? <LockedFeature icon={Store} title={t("cl.ui.title")} body={t("cl.ui.unavailable")} /> : <ErrorState offline={!online} message={t("cl.app.loadError")} onRetry={() => studio.refetch()} />}
      </Screen>
    );
  }

  const shop = data.shop;
  const selected = day ?? firstDay(data.sessions, today, shop.timezone);
  const classes = byDay.get(selected) ?? [];
  const dropIn = data.products.find((p) => p.kind === "drop_in") ?? null;
  const choice = payChoice(mine.data, shop.id, dropIn);
  const passLine = (): string => {
    const mem = mine.data?.memberships.find((m) => m.merchant.id === shop.id && m.status === "active");
    if (mem) return mem.nextBillingDate ? `${mem.name}, ${t("cl.app.renews", { date: date(dayToDate(mem.nextBillingDate), { month: "short", day: "numeric" }) })}` : mem.name;
    if (choice.kind === "pack") return `${choice.name}, ${t("cl.ui.passes.left", { left: choice.left, total: choice.total })}`;
    return t("cl.ui.noPass");
  };
  const when = (iso: string) => `${date(iso, { weekday: "short", month: "short", day: "numeric" }, shop.timezone)}, ${time(iso, shop.timezone)}`;
  const until = (s: Sess) => endsSentence(when(freeCancelUntil(s.startsAt, data.policy.cancelWindowHours)));
  const fail = (e: unknown) => {
    const key = bookErrorKey(isApiError(e) ? e.code : undefined);
    setError(key ? t(key) : apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
  };

  async function book(s: Sess, use: "auto" | "drop_in") {
    if (busy) return;
    setBusy(s.id);
    setError(null);
    try {
      const r = await api.classes.book({ sessionId: s.id, use });
      if (r.outcome === "needs_payment" && r.payment) {
        setSheet(null);
        if (!(await pay(r.payment))) toast(t("rc.error.body"));
        return;
      }
      setSheet(null);
      await refresh();
      toast({ message: r.outcome === "waitlisted" ? t("cl.ui.done.waitlisted", { n: r.booking.waitlistPosition ?? 1 }) : t("cl.ui.done.booked"), tone: "success" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function cancel(bookingId: string, sessionId: string) {
    if (busy) return;
    setBusy(sessionId);
    setError(null);
    try {
      const r = await api.classes.cancelBooking(bookingId);
      await refresh();
      toast(r.late ? t("cl.ui.done.cancelledLate", { hours: data!.policy.cancelWindowHours }) + (r.feeChargedCents ? ` ${t("cl.ui.done.fee", { fee: money(r.feeChargedCents) })}` : "") : t("cl.ui.done.cancelled"));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function buyPack(p: Product) {
    if (busy) return;
    setBusy(p.id);
    setError(null);
    try {
      const r = await api.classes.buyPack(p.id);
      if (r.payment) {
        if (!(await pay(r.payment))) toast(t("rc.error.body"));
      } else {
        await refresh();
        toast({ message: t("cl.ui.done.pack"), tone: "success" });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const rule = (p: Product): string => {
    if (p.kind === "drop_in") return t("cl.ui.rule.dropIn");
    if (p.kind === "pack") return `${t("cl.ui.rule.pack", { n: p.credits ?? 1, days: p.validDays ?? 90 })}${p.introOnly ? `. ${t("cl.ui.intro")}` : ""}`;
    return `${p.classesPerMonth ? t("cl.ui.nClassesMonth", { n: p.classesPerMonth }) : t("cl.ui.unlimited")}. ${p.termMonths ? t("cl.ui.termMonths", { n: p.termMonths }) : t("cl.ui.monthToMonth")}`;
  };

  return (
    <Screen
      back
      largeTitle
      titleCase="as-is"
      title={shop.name}
      subtitle={
        <Text color="fgMuted" style={{ marginTop: 4 }}>
          {[shop.address, data.hasWomenOnly ? t("cl.ui.womenOnlyNote") : null].filter(Boolean).join(". ")}
        </Text>
      }
      refreshing={studio.isRefetching}
      onRefresh={() => void refresh()}
      footer={<StudioTabs slug={shop.slug} current="schedule" />}
    >
      {status === "signedIn" ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/classes/passes", params: { slug: shop.slug } })} style={[styles.pass, { backgroundColor: c.bgSubtle }]} testID="classes-pass">
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="fgMuted">{t("cl.ui.yourPass")}</Text>
            <Text variant="bodyStrong" numberOfLines={1}>{passLine()}</Text>
          </View>
          <Text variant="metaStrong" color="fgMuted">{t("cl.ui.manage")}</Text>
        </Pressable>
      ) : null}
      {error && !sheet ? <Banner variant="danger">{error}</Banner> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} accessibilityRole="tablist">
        {days.map((d) => {
          const on = d === selected;
          const n = byDay.get(d)?.length ?? 0;
          return (
            <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setDay(d)} style={[styles.chip, { borderColor: on ? c.fg : c.line, backgroundColor: on ? c.fg : c.bg }]} testID={`classes-day-${d}`}>
              <Text variant="metaStrong" rawColor={on ? c.bg : n ? c.fg : c.fgSubtle}>
                {`${date(dayToDate(d), { weekday: "short" })} ${date(dayToDate(d), { day: "numeric" })}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {classes.length === 0 ? <Text color="fgMuted" style={[styles.none, { borderColor: c.line }]}>{t("cl.ui.noClasses")}</Text> : null}
      {classes.map((s) => {
        const st = cardState(s);
        const act = cardAction(s);
        return (
          <View key={s.id} style={[styles.card, { borderColor: c.line }]} testID={`class-${s.id}`}>
            <View style={styles.row}>
              <Text variant="metaStrong" rawColor={c.accentText}>{time(s.startsAt, shop.timezone)}</Text>
              {s.womenOnly ? (
                <View style={[styles.tag, { backgroundColor: c.bgSubtle }]}>
                  <Text variant="caption" color="fgMuted">{t("cl.ui.womenOnly")}</Text>
                </View>
              ) : null}
            </View>
            <Text variant="headline">{s.name}</Text>
            {s.instructorName ? <Text variant="meta" color="fgMuted">{`${s.instructorName} · ${t("cl.app.minutes", { n: durationMin(s) })}`}</Text> : null}
            <View style={[styles.row, { justifyContent: "space-between", marginTop: 4 }]}>
              <Text variant="metaStrong" rawColor={st.kind === "booked" ? c.positive : c.fg} style={{ flex: 1 }}>
                {st.kind === "booked" ? t("cl.ui.booked") : st.kind === "waitlisted" ? t("cl.ui.onWaitlist", { n: st.position }) : st.kind === "held" ? t("cl.ui.holding") : st.kind === "full" ? (st.waitlisted ? t("cl.ui.fullWaitlist", { n: st.waitlisted }) : t("cl.ui.full")) : t("cl.ui.spotsLeft", { n: st.spotsLeft })}
              </Text>
              {act.kind === "book" || act.kind === "join_waitlist" ? (
                <Button size="sm" variant={act.kind === "book" ? "primary" : "secondary"} onPress={() => { setError(null); setSheet(s); }}>
                  {act.kind === "book" ? t("cl.ui.book") : t("cl.ui.joinWaitlist")}
                </Button>
              ) : act.kind === "cancel" || act.kind === "leave_waitlist" ? (
                <Button size="sm" variant="secondary" loading={busy === s.id} onPress={() => void cancel(act.bookingId, s.id)}>
                  {act.kind === "cancel" ? t("cl.ui.cancel") : t("cl.ui.leaveWaitlist")}
                </Button>
              ) : null}
            </View>
          </View>
        );
      })}

      {data.products.length ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Text variant="headline" accessibilityRole="header">{t("cl.ui.offers")}</Text>
          <View style={[styles.offers, { borderColor: c.line }]}>
            {data.products.map((p, i) => (
              <View key={p.id} style={[styles.offer, i > 0 ? { borderTopColor: c.line, borderTopWidth: hairline } : null]}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{p.name}</Text>
                  <Text variant="meta" color="fgMuted">{rule(p)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text variant="bodyStrong" tabular>{p.kind === "membership" ? t("cl.ui.perMonth", { amount: money(p.priceCents) }) : money(p.priceCents)}</Text>
                  {p.kind === "membership" ? (
                    <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: "/classes/join/[productId]", params: { productId: p.id, slug: shop.slug } })}>{t("cl.ui.join")}</Button>
                  ) : p.kind === "pack" ? (
                    <Button size="sm" variant="secondary" loading={busy === p.id} onPress={() => void buyPack(p)}>{t("cl.ui.buy")}</Button>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          {data.tax.applies ? <Text variant="caption" color="fgMuted">{t("cl.ui.plusTax", { tax: data.tax.name })}</Text> : null}
        </View>
      ) : null}

      <Sheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet?.name}
        footer={
          sheet ? (
            <>
              <Button size="lg" fullWidth loading={busy === sheet.id} onPress={() => void book(sheet, "auto")} testID="classes-book-go">
                {sheet.booked >= sheet.capacity ? t("cl.ui.joinWaitlist") : t("cl.ui.bookClass")}
              </Button>
              {offerDropIn(choice) && sheet.booked < sheet.capacity && dropIn ? (
                <Button size="lg" fullWidth variant="secondary" loading={busy === sheet.id} onPress={() => void book(sheet, "drop_in")}>
                  {t("cl.ui.payDropIn", { amount: money(dropIn.priceCents) })}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {sheet ? (
          <View style={{ gap: 12 }}>
            <Text color="fgMuted">{[when(sheet.startsAt), sheet.instructorName].filter(Boolean).join(" · ")}</Text>
            {sheet.womenOnly ? (
              <View style={[styles.note, { backgroundColor: c.bgSubtle }]}>
                <Text variant="metaStrong">{t("cl.ui.womenOnly")}</Text>
                <Text variant="meta" color="fgMuted">{t("cl.ui.womenOnlyDetail")}</Text>
              </View>
            ) : null}
            {error ? <Banner variant="danger">{error}</Banner> : null}
            {sheet.booked >= sheet.capacity ? (
              <Text variant="meta" color="fgMuted">{t("cl.ui.waitlistRule")}</Text>
            ) : (
              <View style={[styles.use, { borderColor: c.line }]}>
                <Text variant="caption" color="fgMuted">{t("cl.ui.willUse")}</Text>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                    {choice.kind === "membership" ? choice.name : choice.kind === "pack" ? `${choice.name}, ${t("cl.ui.passes.left", { left: choice.left, total: choice.total })}` : choice.kind === "drop_in" ? t("cl.ui.dropIn") : t("cl.ui.noPass")}
                  </Text>
                  <Text variant="bodyStrong" tabular>{choice.kind === "drop_in" ? money(choice.priceCents) : choice.kind === "none" ? "" : t("cl.app.zeroToday", { amount: money(0) })}</Text>
                </View>
              </View>
            )}
            <View style={[styles.note, { backgroundColor: c.bgSubtle }]}>
              <Text variant="metaStrong">{t("cl.ui.cancel")}</Text>
              <Text variant="meta" color="fgMuted">{`${t("cl.ui.cancelRule", { until: until(sheet) })}${data.policy.lateFeeCents ? ` ${t("cl.ui.cancelFee", { fee: money(data.policy.lateFeeCents) })}` : ""}`}</Text>
            </View>
            {data.policy.termsNote ? <Text variant="meta" color="fgMuted">{data.policy.termsNote}</Text> : null}
            {sheet.booked < sheet.capacity ? <Text variant="meta" color="fgMuted">{t("cl.ui.waitlistRule")}</Text> : null}
          </View>
        ) : null}
      </Sheet>
      {classes.length === 0 && !data.products.length && !studio.isFetching ? <EmptyState icon={Store} title={t("cl.ui.noClasses")} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pass: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  strip: { gap: 8, paddingVertical: 4 },
  chip: { minHeight: 40, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: hairline, borderRadius: 16, padding: 16, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  none: { borderWidth: hairline, borderRadius: 16, padding: 16 },
  offers: { borderWidth: hairline, borderRadius: 16 },
  offer: { flexDirection: "row", gap: 12, padding: 16, alignItems: "center" },
  note: { borderRadius: 14, padding: 14, gap: 2 },
  use: { borderWidth: hairline, borderRadius: 14, padding: 14, gap: 2 },
});
