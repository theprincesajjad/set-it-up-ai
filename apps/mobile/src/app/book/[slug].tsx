import { bookingLogic, type appointmentsApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Check, CreditCard } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage as apiError, isApiError } from "../../api/client";
import { ChipGroup, useMoney, usePayment, useSetup } from "../../features/restaurant/components";
import { featureOff } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { dayToDate, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, useTheme } from "../../theme";
import { Banner, Button, Chip, EmptyState, ErrorState, hairline, LockedFeature, Screen, SkeletonList, Store, Text, TextField, useToast, WarmCard } from "../../ui";

type Slot = { startsAt: string; staffId: string };
const DAYS = 14;

/**
 * Book a visit (Figma M1 and M2): pick a stylist and services, pick a time, read the policy, then pay the deposit
 * or save a card on the shop's web page, and land on the appointment. Same steps as /shops/<slug>/book.
 */
const errorMessage = (e: unknown, t: (key: "auth.err.network" | "auth.err.server") => string) => apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") });

export default function Book() {
  const { slug, service, staff } = useLocalSearchParams<{ slug: string; service?: string; staff?: string }>();
  const { c, r } = useTheme();
  const { t } = useLocale();
  const money = useMoney();
  const { date, time, pick } = useLocale();
  const toast = useToast();
  const online = useOnline();
  const q = useQuery({ queryKey: ["appointments", "services", slug], queryFn: () => api.appointments.services(slug!), enabled: !!slug, retry: false, staleTime: 60_000 });
  const data = q.data;
  const [step, setStep] = useState<"services" | "time" | "pay">("services");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [ids, setIds] = useState<string[]>([]);
  const [day, setDay] = useState(torontoToday());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [av, setAv] = useState<appointmentsApi.AvailabilityResponse | null>(null);
  const [anyAv, setAnyAv] = useState<appointmentsApi.AvailabilityResponse | null>(null);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<appointmentsApi.CreateMyAppointmentResponse | null>(null);

  const dur = (min: number) => bookingLogic.durationText(t as never, min);
  const days = useMemo(() => bookingLogic.nextDays(torontoToday(), DAYS), []);

  // Deep link from a rebooking nudge: ?service=&staff=
  useEffect(() => {
    if (!data) return;
    if (service && data.services.some((s) => s.id === service)) setIds([service]);
    if (staff && data.staff.some((s) => s.id === staff)) setStaffId(staff);
  }, [data, service, staff]);

  useEffect(() => {
    if (!data) return;
    setIds((cur) => cur.filter((id) => data.services.some((s) => s.id === id && bookingLogic.staffDoes(s, staffId))));
    setSlot(null);
  }, [staffId, data]);

  const loadTimes = async () => {
    if (!slug || !ids.length) return;
    setLoadingTimes(true);
    setError(null);
    try {
      const base = { serviceIds: ids, from: days[0]!, to: days[days.length - 1]! };
      const [mine, any] = await Promise.all([api.appointments.availability(slug, { ...base, staffId: staffId ?? "any" }), staffId ? api.appointments.availability(slug, { ...base, staffId: "any" }) : Promise.resolve(null)]);
      setAv(mine);
      setAnyAv(any);
      const first = mine.days.find((d) => d.times.length);
      if (first && !mine.days.find((d) => d.date === day)?.times.length) setDay(first.date);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setLoadingTimes(false);
    }
  };
  useEffect(() => {
    if (step === "time") void loadTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ids.join(","), staffId]);

  const afterReturn = async () => {
    if (!booked) return;
    for (let i = 0; i < 12; i++) {
      try {
        const r = await api.appointments.get(booked.appointment.id);
        if (!r.appointment.pending) {
          router.replace(`/appointments/${booked.appointment.id}`);
          return;
        }
      } catch {
        // keep trying
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    setError(t("bk.done.pending"));
  };
  const pay = usePayment(() => void afterReturn());
  const saveCard = useSetup(() => void afterReturn());

  if (q.isLoading) return <Screen back title={t("bk.title")}><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (q.isError || !data) {
    return (
      <Screen back title={t("bk.title")}>
        {featureOff(q.error) ? <LockedFeature icon={Store} title={t("bk.title")} body={t("bk.unavailable")} /> : <ErrorState offline={!online} message={t("rc.error.body")} onRetry={() => q.refetch()} />}
      </Screen>
    );
  }
  if (!data.services.length) return <Screen back title={t("bk.title")}><EmptyState icon={Store} title={t("bk.noServices")} /></Screen>;

  const staffName = staffId ? (data.staff.find((s) => s.id === staffId)?.name ?? "") : "";
  const sel = bookingLogic.summarize(data.services, ids, staffId);
  const takesCards = data.policy.takesCards;
  const deposit = takesCards ? sel.depositCents : 0;
  const fee = takesCards ? data.policy.noShowFeeCents : 0;
  const needsCard = takesCards && (deposit > 0 || fee > 0);
  const categories = [...new Set(data.services.map((s) => s.categoryName).filter((x): x is string => !!x))];
  const visible = data.services.filter((s) => (category === "all" || s.categoryName === category) && bookingLogic.staffDoes(s, staffId));
  const times = bookingLogic.timesOn(av, day);
  const anyCount = staffId ? bookingLogic.timesOn(anyAv, day).length : 0;
  const when = (iso: string) => `${date(iso, { weekday: "short", day: "numeric", month: "short" })}, ${time(iso)}`;
  const endsAt = (s: Slot) => new Date(new Date(s.startsAt).getTime() + (av?.blockMin ?? sel.durationMin) * 60_000).toISOString();
  const policy = fee > 0 ? t("bk.policy.fee", { hours: data.policy.cancelWindowHours, fee: money(fee) }) : t("bk.policy.nofee", { hours: data.policy.cancelWindowHours });

  async function submit() {
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.appointments.book({ serviceIds: ids, staffId, startsAt: slot.startsAt, notes: data?.shop.pharmacy ? null : notes.trim() || null });
      setBooked(r);
      if (r.confirmed) router.replace(`/appointments/${r.appointment.id}`);
      else setStep("pay");
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        setError(t("bk.taken"));
        setSlot(null);
        void loadTimes();
      } else setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  }

  // ---- pay: the 10-minute hold
  if (step === "pay" && booked) {
    const a = booked.appointment;
    return (
      <Screen back onBack={() => setStep("time")} title={t("bk.card.title")}>
        <Text color="fgMuted">{when(a.startsAt)}{a.staffName ? ` · ${a.staffName}` : ""}</Text>
        {a.holdExpiresAt ? <Text variant="meta" color="fgMuted">{t("bk.holding", { time: time(a.holdExpiresAt) })}</Text> : null}
        {booked.deposit ? <Text style={disp(32, 800, 36)} rawColor={c.accentText}>{money(booked.deposit.amountCents)}</Text> : null}
        <View style={[styles.policy, { backgroundColor: r.tileButter }]}><Text>{policy}</Text></View>
        {error ? <Banner variant="danger">{error}</Banner> : null}
        {booked.deposit ? (
          <Button size="lg" fullWidth onPress={async () => { if (!(await pay(booked.deposit!))) toast(t("rc.error.body")); }}>{t("bk.cta.deposit", { amount: money(booked.deposit.amountCents) })}</Button>
        ) : booked.setup ? (
          <Button size="lg" fullWidth onPress={async () => { if (!(await saveCard(booked.setup!))) toast(t("rc.error.body")); }}>{t("bk.cta.card")}</Button>
        ) : null}
      </Screen>
    );
  }

  // ---- time
  if (step === "time") {
    const cta = deposit > 0 ? t("bk.cta.deposit", { amount: money(deposit) }) : needsCard ? t("bk.cta.card") : t("bk.cta.free");
    return (
      <Screen
        back
        onBack={() => setStep("services")}
        title={t("bk.time.title")}
        subtitle={t("bk.time.sub", { services: data.services.filter((s) => ids.includes(s.id)).map((s) => pick(s).name).join(", "), staff: staffName || t("bk.anyone").toLowerCase(), duration: dur(av?.blockMin ?? sel.durationMin) })}
        footer={
          <View style={{ gap: 8 }}>
            <Text variant="meta" color="fgMuted">{slot ? `${when(slot.startsAt)} – ${time(endsAt(slot))}${slot.staffId ? ` · ${data.staff.find((s) => s.id === slot.staffId)?.name ?? staffName}` : ""}` : t("bk.chooseTime")}</Text>
            <Button size="lg" fullWidth loading={busy} disabled={!slot} onPress={submit}>{cta}</Button>
          </View>
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
          {days.map((d) => {
            const n = bookingLogic.timesOn(av, d).length;
            const on = d === day;
            return (
              <Pressable key={d} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: !!av && n === 0 }} disabled={loadingTimes || (!!av && n === 0)} onPress={() => { setDay(d); setSlot(null); }} style={[styles.day, { borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : r.card, opacity: av && n === 0 ? 0.4 : 1 }]}>
                <Text variant="caption" rawColor={on ? c.onBrand : c.fgMuted}>{date(dayToDate(d), { weekday: "short" })}</Text>
                <Text style={disp(22, 800, 26)} rawColor={on ? c.onBrand : c.fg}>{date(dayToDate(d), { day: "numeric" })}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {loadingTimes && !av ? <SkeletonList rows={2} rowHeight={44} /> : (
          <View style={{ gap: 10 }}>
            <Text variant="metaStrong">{times.length ? t("bk.time.count", { day: date(dayToDate(day), { weekday: "long" }), n: times.length, staff: staffName || t("bk.anyone") }) : t("bk.time.none", { day: date(dayToDate(day), { weekday: "long" }) })}</Text>
            <View style={styles.wrap}>
              {times.map((x) => <Chip key={x.startsAt} large label={time(x.startsAt)} selected={slot?.startsAt === x.startsAt} onPress={() => setSlot(x)} />)}
            </View>
            {staffId && anyCount > 0 ? (
              <Text variant="meta" color="fgMuted">{t("bk.time.anyHas", { n: anyCount, day: date(dayToDate(day), { weekday: "long" }) })}{" "}<Text variant="meta" onPress={() => setStaffId(null)} style={{ textDecorationLine: "underline" }}>{t("bk.time.seeThem")}</Text></Text>
            ) : null}
          </View>
        )}
        <View style={[styles.policy, { backgroundColor: r.tileButter }]}><Text>{policy}</Text></View>
        {needsCard ? (
          <View style={[styles.cardRow, { borderColor: c.line }]}>
            <CreditCard size={20} color={c.fg} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t("bk.card.title")}</Text>
              <Text variant="meta" color="fgMuted">{deposit > 0 ? t("bk.card.deposit", { amount: money(deposit) }) : t("bk.card.setup")}</Text>
            </View>
          </View>
        ) : null}
        {data.shop.pharmacy ? (
          <View style={[styles.policy, { backgroundColor: r.tileButter }]}>
            <Text variant="bodyStrong">{t("rx.book.privacyTitle")}</Text>
            <Text variant="meta" color="fgMuted">{t("rx.book.privacyBody")}</Text>
          </View>
        ) : (
          <TextField label={t("bk.notes")} value={notes} onChangeText={setNotes} multiline maxLength={400} />
        )}
        {error ? <Banner variant="danger">{error}</Banner> : null}
      </Screen>
    );
  }

  // ---- services
  return (
    <Screen
      back
      title={t("bk.title")}
      subtitle={data.shop.addressVisibility && data.shop.addressVisibility !== "exact" ? t("bk.introPrivate", { shop: data.shop.name }) : t("bk.intro", { shop: [data.shop.name, data.shop.address].filter(Boolean).join(", ") })}
      footer={
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <View>
              <Text variant="meta" color="fgMuted">{ids.length ? t("bk.summary", { n: sel.count, duration: dur(sel.durationMin) }) : t("bk.chooseTime")}</Text>
              {ids.length && !(data.shop.pharmacy && sel.priceCents <= 0) ? <Text style={disp(22, 800, 26)}>{bookingLogic.totalText(t as never, data, sel, money)}</Text> : null}
            </View>
            {ids.length && deposit > 0 ? <Text variant="meta" color="fgMuted">{t("bk.depositHold", { amount: money(deposit) })}</Text> : null}
          </View>
          <Button size="lg" fullWidth disabled={!ids.length} onPress={() => setStep("time")}>{t("bk.chooseTime")}</Button>
        </View>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[{ id: null as string | null, name: t("bk.anyone") }, ...data.staff].map((s) => <Chip key={s.id ?? "any"} large label={s.name} selected={s.id === staffId} onPress={() => setStaffId(s.id)} />)}
      </ScrollView>
      {categories.length > 1 ? (
        <ChipGroup value={category} onChange={setCategory} options={[{ value: "all", label: t("bk.all") }, ...categories.map((x) => ({ value: x, label: x }))]} />
      ) : null}
      <WarmCard>
        {visible.map((s, i) => {
          const on = ids.includes(s.id);
          const v = bookingLogic.serviceFor(s, staffId);
          return (
            <Pressable key={s.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setIds((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} style={[styles.row, { borderBottomColor: c.line, borderBottomWidth: hairline }]}>
              <View style={[styles.check, { borderColor: on ? c.brand : c.lineStrong, backgroundColor: on ? c.brand : "transparent" }]}>{on ? <Check size={16} color={c.onBrand} strokeWidth={3} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{pick(s).name}</Text>
                <Text variant="meta" color="fgMuted">{staffName ? t("bk.withStaff", { duration: dur(v.durationMin), staff: staffName }) : dur(v.durationMin)}</Text>
              </View>
              {data.shop.pharmacy && v.priceCents <= 0 ? <Text variant="meta" color="fgMuted">{t("rx.book.noCharge")}</Text> : <Text variant="headline" tabular>{s.priceFrom ? t("bk.from", { price: money(v.priceCents) }) : money(v.priceCents)}</Text>}
            </Pressable>
          );
        })}
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={[styles.check, { borderColor: c.lineStrong }]} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{t("bk.bridal.title")}</Text>
            <Text variant="meta" color="fgMuted">{t("bk.bridal.body")}</Text>
          </View>
        </View>
      </WarmCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, minHeight: 64 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  day: { width: 62, height: 72, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  policy: { borderRadius: 16, padding: 16 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 16 },
});
