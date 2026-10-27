import { useLocalSearchParams, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { classesApi } from "@ll/shared";
import { errorMessage as apiError } from "../../api/client";
import { StudioTabs } from "../../features/classes/StudioTabs";
import { useMyClasses, useRefreshClasses } from "../../features/classes/queries";
import { useMoney, usePayment, useSetup } from "../../features/restaurant/components";
import { cancelEndsOn, FREEZE_CHOICES, lastDayBefore, membershipActions } from "../../lib/classes";
import { useLocale } from "../../lib/i18n";
import { cardLabel, dayToDate } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { useTheme } from "../../theme";
import { Banner, Button, Chip, ConfirmDialog, EmptyState, ErrorState, hairline, Screen, Sheet, SkeletonList, Store, Text, useToast } from "../../ui";

type Membership = classesApi.MyMembershipDto;

/**
 * Passes and membership (Figma frame 07): every membership with its price, the next payment, the contract and, inside the first 10
 * days, the full-refund right; packs with credits left; the classes the person is booked into. Freeze, Change card and Cancel
 * are one tap each; cancelling is plain red text, not a hidden menu.
 */
export default function Passes() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { c } = useTheme();
  const { t, date, time } = useLocale();
  const money = useMoney();
  const toast = useToast();
  const online = useOnline();
  const q = useMyClasses();
  const refresh = useRefreshClasses();
  const [busy, setBusy] = useState<string | null>(null);
  const [freezing, setFreezing] = useState<Membership | null>(null);
  const [days, setDays] = useState<number>(14);
  const [cancelling, setCancelling] = useState<Membership | null>(null);
  const [reading, setReading] = useState<Membership | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pay = usePayment(() => void refresh());
  const setup = useSetup(() => {
    void refresh();
    toast(t("cl.ui.cardSaved"));
  });

  const fail = (e: unknown) => setError(apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      if (ok) toast(ok);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const day = (d: string | null) => (d ? date(dayToDate(d), { month: "short", day: "numeric" }) : "");
  const when = (iso: string, tz: string) => `${date(iso, { weekday: "short", month: "short", day: "numeric" }, tz)}, ${time(iso, tz)}`;
  const tabs = slug ? <StudioTabs slug={slug} current="passes" /> : undefined;

  if (q.isLoading) return <Screen back largeTitle title={t("cl.ui.passes.title")}><SkeletonList rows={3} rowHeight={140} /></Screen>;
  if (q.isError || !q.data) return <Screen back title={t("cl.ui.passes.title")}><ErrorState offline={!online} message={t("cl.app.loadError")} onRetry={() => q.refetch()} /></Screen>;

  const all = q.data;
  const mine = <T extends { merchant: { slug: string } }>(xs: T[]) => (slug ? xs.filter((x) => x.merchant.slug === slug) : xs);
  const memberships = mine(all.memberships);
  const passes = mine(all.passes).filter((p) => p.status === "active");
  const bookings = mine(all.bookings);
  const studioName = (memberships[0] ?? passes[0] ?? bookings[0])?.merchant.name;

  const payNow = async (m: Membership) => {
    await run(`pay-${m.id}`, async () => {
      const r = await api.classes.payMembership(m.id);
      if (r.payment && !(await pay(r.payment))) toast(t("rc.error.body"));
    });
  };
  const changeCard = async (m: Membership) => {
    await run(`card-${m.id}`, async () => {
      const s = await api.classes.cardSetup(m.id);
      if (!(await setup(s))) toast(t("rc.error.body"));
    });
  };

  return (
    <Screen
      back
      largeTitle
      title={t("cl.ui.passes.title")}
      subtitle={studioName ? <Text color="fgMuted" style={{ marginTop: 4 }}>{studioName}</Text> : undefined}
      refreshing={q.isRefetching}
      onRefresh={() => void refresh()}
      footer={tabs}
    >
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {!memberships.length && !passes.length && !bookings.length ? <EmptyState icon={Store} title={t("cl.ui.passes.none")} /> : null}

      {memberships.map((m) => {
        const a = membershipActions(m);
        return (
          <View key={m.id} style={[styles.card, { borderColor: c.fg, borderWidth: 1 }]} testID={`membership-${m.id}`}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">{m.name}</Text>
                <Text variant="meta" color="fgMuted">{m.merchant.name}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: c.bgSubtle }]}>
                <Text variant="caption" rawColor={m.status === "active" ? c.positive : m.status === "past_due" ? c.negative : c.fg}>{t(`cl.ui.m.status.${m.status}` as "cl.ui.m.status.active")}</Text>
              </View>
            </View>
            <Field label={t("cl.ui.m.price")} value={`${t("cl.ui.perMonth", { amount: money(m.totalCents) })}${m.taxCents ? ` (${t("cl.ui.m.withTax")})` : ""}`} />
            {m.nextBillingDate ? <Field label={t("cl.ui.m.next")} value={`${day(m.nextBillingDate)}${m.card ? `, ${cardLabel(m.card)}` : ""}`} /> : null}
            <Field label={t("cl.ui.m.contract")} value={m.termMonths ? t("cl.ui.m.fixed", { n: m.termMonths, date: day(m.termEndsOn) }) : t("cl.ui.m.monthly")} />
            {m.classesPerMonth ? <Text>{t("cl.ui.m.used", { used: m.usedThisPeriod, n: m.classesPerMonth })}</Text> : null}
            {a.payNow ? (
              <Banner variant="danger" actionLabel={t("cl.ui.m.payNow", { amount: money(m.amountDueCents ?? m.totalCents) })} onAction={() => void payNow(m)}>{t("cl.ui.m.pastDue")}</Banner>
            ) : null}
            {m.status === "frozen" && m.frozenUntil ? <Banner variant="neutral">{t("cl.ui.m.frozenUntil", { date: day(m.frozenUntil) })}</Banner> : null}
            {m.inCoolingOff && m.coolingOffEndsOn ? <Banner variant="warning">{t("cl.ui.m.cooling", { date: day(m.coolingOffEndsOn) })}</Banner> : null}
            {m.cancelEffectiveOn ? <Banner variant="neutral">{t("cl.ui.m.ending", { date: day(lastDayBefore(m.cancelEffectiveOn)) })}</Banner> : null}
            {m.renewalNoticeSentAt && m.termEndsOn && !m.declineRenewal && (m.status === "active" || m.status === "frozen") ? <Banner variant="neutral">{t("cl.ui.m.renewalNotice", { date: day(m.termEndsOn) })}</Banner> : null}
            <View style={styles.actions}>
              {a.freeze ? <Button size="sm" variant="secondary" onPress={() => { setDays(14); setFreezing(m); }}>{t("cl.ui.m.freeze")}</Button> : null}
              {a.changeCard ? <Button size="sm" variant="secondary" loading={busy === `card-${m.id}`} onPress={() => void changeCard(m)}>{t("cl.ui.m.changeCard")}</Button> : null}
              {a.agreement ? <Button size="sm" variant="ghost" onPress={() => setReading(m)}>{t("cl.ui.m.agreement")}</Button> : null}
              {a.declineRenewal ? <Button size="sm" variant="ghost" loading={busy === `decline-${m.id}`} onPress={() => void run(`decline-${m.id}`, () => api.classes.declineRenewal(m.id), t("cl.ui.m.declined"))}>{t("cl.ui.m.declineRenewal")}</Button> : null}
              {a.keep ? <Button size="sm" variant="secondary" loading={busy === `keep-${m.id}`} onPress={() => void run(`keep-${m.id}`, () => api.classes.keepMembership(m.id))}>{t("cl.ui.m.keep")}</Button> : null}
            </View>
            {a.cancel ? (
              <Pressable accessibilityRole="button" onPress={() => setCancelling(m)} style={styles.cancel} testID={`cancel-membership-${m.id}`}>
                <Text variant="bodyStrong" rawColor={c.negative}>{t("cl.ui.m.cancel")}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {passes.map((p) => (
        <View key={p.id} style={[styles.card, { borderColor: c.line, borderWidth: hairline }]}>
          <View style={styles.head}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>{p.name}</Text>
            <Text variant="bodyStrong" tabular rawColor={c.accentText}>{t("cl.ui.passes.left", { left: p.creditsLeft, total: p.creditsTotal })}</Text>
          </View>
          <Text variant="meta" color="fgMuted">{`${t("cl.ui.passes.useBy", { date: date(p.expiresAt, { month: "short", day: "numeric" }) })}. ${t("cl.app.anyClass")}`}</Text>
        </View>
      ))}

      {bookings.length ? (
        <View style={{ gap: 8 }}>
          <Text variant="headline" accessibilityRole="header">{t("cl.ui.passes.booked")}</Text>
          <View style={[styles.list, { borderColor: c.line }]}>
            {bookings.map((b, i) => (
              <View key={b.id} style={[styles.booking, i > 0 ? { borderTopColor: c.line, borderTopWidth: hairline } : null]}>
                <Text variant="metaStrong" rawColor={c.accentText}>{when(b.session.startsAt, b.merchant.timezone)}</Text>
                <Text variant="bodyStrong">{b.session.name}</Text>
                <Text variant="meta" color="fgMuted">{b.status === "waitlisted" ? t("cl.ui.onWaitlist", { n: b.waitlistPosition ?? 1 }) : t("cl.ui.freeUntil", { when: when(b.freeCancelUntil, b.merchant.timezone) })}</Text>
              </View>
            ))}
          </View>
          <Button variant="ghost" onPress={() => router.replace(`/classes/${slug ?? bookings[0]!.merchant.slug}`)}>{t("cl.ui.seeSchedule")}</Button>
        </View>
      ) : null}

      <Sheet
        visible={!!freezing}
        onClose={() => setFreezing(null)}
        title={t("cl.ui.m.freezeDays")}
        footer={
          <Button size="lg" fullWidth loading={!!freezing && busy === `freeze-${freezing.id}`} onPress={() => { const m = freezing!; void run(`freeze-${m.id}`, async () => { await api.classes.freeze(m.id, days); setFreezing(null); }, t("cl.ui.m.freezeDone")); }}>
            {t("cl.ui.m.freezeGo")}
          </Button>
        }
      >
        <View style={styles.chips}>
          {FREEZE_CHOICES.map((d) => (
            <Chip key={d} large label={t("cl.ui.m.nDays", { n: d })} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!cancelling}
        title={t("cl.ui.m.cancelConfirm")}
        body={cancelling ? (cancelling.inCoolingOff ? t("cl.ui.m.cancelInside") : t("cl.ui.m.cancelAfter", { date: day(cancelEndsOn(cancelling)) })) : ""}
        confirmLabel={t("cl.ui.m.cancelGo")}
        cancelLabel={t("cl.ui.m.back")}
        loading={!!cancelling && busy === `cancel-${cancelling.id}`}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const m = cancelling!;
          void run(`cancel-${m.id}`, async () => {
            const r = await api.classes.cancelMembership(m.id);
            setCancelling(null);
            if (r.refundedCents) toast(t("cl.ui.m.refunded", { amount: money(r.refundedCents) }));
          });
        }}
      />

      <Sheet visible={!!reading} onClose={() => setReading(null)} title={reading?.name}>
        <Text variant="meta">{reading?.agreementText ?? ""}</Text>
      </Sheet>
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Text variant="meta" color="fgMuted">{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cancel: { minHeight: 36, justifyContent: "center", alignSelf: "flex-start" },
  list: { borderWidth: hairline, borderRadius: 16 },
  booking: { padding: 16, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
