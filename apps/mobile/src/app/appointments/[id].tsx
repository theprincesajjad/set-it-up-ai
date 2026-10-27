import { bookingLogic, type appointmentsApi } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage as apiError, isApiError } from "../../api/client";
import { addAppointmentToCalendar } from "../../features/customer/addToCalendar";
import { InfoRow, useMoney } from "../../features/restaurant/components";
import { useLocale } from "../../lib/i18n";
import { dayToDate, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, useTheme } from "../../theme";
import { Badge, Banner, Button, Chip, ErrorState, Screen, SkeletonList, Text } from "../../ui";

/** One appointment: when, who, the cost and the policy in words, with change the time and cancel. */
const errorMessage = (e: unknown, t: (key: "auth.err.network" | "auth.err.server") => string) => apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") });

export default function Appointment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t, date, time } = useLocale();
  const money = useMoney();
  const online = useOnline();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["appointments", "one", id], queryFn: () => api.appointments.get(id!), enabled: !!id, retry: false });
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ variant: "success" | "danger" | "info"; text: string } | null>(null);
  const [day, setDay] = useState(torontoToday());
  const [slot, setSlot] = useState<string | null>(null);
  const a = q.data?.appointment;
  const days = bookingLogic.nextDays(torontoToday(), 14);
  const avail = useQuery({
    queryKey: ["appointments", "move", id, mode],
    queryFn: () => api.appointments.availability(a!.merchant.slug, { serviceIds: a!.items.map((i) => i.serviceId).filter((x): x is string => !!x), staffId: a!.staffId ?? "any", from: days[0]!, to: days[days.length - 1]! }),
    enabled: mode === "move" && !!a,
    retry: false,
  });

  if (q.isLoading) return <Screen back title={t("bk.manage.title")}><SkeletonList rows={3} rowHeight={72} /></Screen>;
  if (q.isError || !a) return <Screen back title={t("bk.manage.title")}><ErrorState offline={!online} message={t("bk.manage.notFound")} onRetry={() => q.refetch()} /></Screen>;

  const live = a.status === "booked" && !a.pending;
  const inside = new Date(a.freeChangeUntil).getTime() <= Date.now();
  const fee = Math.max(0, a.policy.noShowFeeCents - (a.depositPaidAt ? a.depositCents : 0));
  const when = (iso: string) => `${date(iso, { weekday: "long", day: "numeric", month: "long" })}, ${time(iso)}`;
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["appointments"] });
    await q.refetch();
  };
  const policy = !inside ? t("bk.manage.cancelFree", { when: when(a.freeChangeUntil).replace(/\.$/, "") }) : fee > 0 && a.hasCardOnFile ? t("bk.manage.cancelFee", { fee: money(fee) }) : t("bk.manage.cancelLate");

  async function addToCalendar() {
    const r = await addAppointmentToCalendar(a!, t("bk.done.calendar"), t("rx.ics.title"));
    if (r === "failed") setNote({ variant: "danger", text: t("bk.calendarFailed") });
  }

  async function cancel() {
    setBusy(true);
    try {
      const r = await api.appointments.cancel(a!.id);
      setMode("view");
      setNote({ variant: "success", text: [t("bk.manage.cancelled"), r.feeCharged ? t("bk.manage.feeCharged", { fee: money(r.feeCents) }) : null, !inside && a!.depositPaidAt ? t("bk.manage.refund") : null].filter(Boolean).join(" ") });
      await refresh();
    } catch (e) {
      setNote({ variant: "danger", text: errorMessage(e, t) });
    } finally {
      setBusy(false);
    }
  }
  async function move() {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await api.appointments.reschedule(a!.id, { startsAt: slot, staffId: a!.staffId });
      setMode("view");
      setSlot(null);
      setNote({ variant: "success", text: [t("bk.manage.rescheduled", { when: when(r.appointment.startsAt) }), r.feeCharged ? t("bk.manage.feeCharged", { fee: money(r.feeCents) }) : null].filter(Boolean).join(" ") });
      await refresh();
    } catch (e) {
      setNote({ variant: "danger", text: isApiError(e) && e.code === "slot_taken" ? t("bk.taken") : errorMessage(e, t) });
    } finally {
      setBusy(false);
    }
  }
  const times = bookingLogic.timesOn(avail.data ?? null, day);

  return (
    <Screen back title={t("bk.manage.title")} subtitle={a.merchant.name}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Badge>{t(`bk.status.${a.status}` as "bk.status.booked")}</Badge>
        <Text color="fgMuted">{when(a.startsAt)}</Text>
      </View>
      {note ? <Banner variant={note.variant}>{note.text}</Banner> : null}
      <View>
        {a.items.map((i, k) => (
          <InfoRow key={`${i.name}${k}`} label={`${i.name} · ${bookingLogic.durationText(t as never, i.durationMin)}${a.staffName ? ` · ${a.staffName}` : ""}`} value={a.reminderText ? "" : money(i.priceCents)} />
        ))}
        {a.reminderText ? null : <InfoRow strong label={a.tax.applies ? t("bk.totalLabel") : t("bk.totalPlain")} value={money(a.totalCents)} />}
      </View>
      {a.merchant.address ? <Text variant="meta" color="fgMuted">{a.merchant.address}</Text> : null}
      {live && a.reminderText ? (
        <View style={[styles.policy, { backgroundColor: c.bgSubtle, gap: 4 }]} testID="pharmacy-reminder" accessibilityLabel={t("rx.book.reminderTitle")}>
          <Text variant="caption" color="fgMuted" style={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" }}>{t("rx.book.reminderTitle")}</Text>
          <Text>{a.reminderText}</Text>
        </View>
      ) : null}
      {live ? <View style={[styles.policy, { backgroundColor: c.bgSubtle }]}><Text>{policy}</Text></View> : null}
      {mode === "move" ? (
        <View style={{ gap: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const n = bookingLogic.timesOn(avail.data ?? null, d).length;
              const on = d === day;
              return (
                <Pressable key={d} disabled={!avail.data || n === 0} onPress={() => { setDay(d); setSlot(null); }} style={[styles.day, { borderColor: on ? c.fg : c.line, backgroundColor: on ? c.fg : c.bg, opacity: avail.data && n === 0 ? 0.4 : 1 }]}>
                  <Text variant="caption" rawColor={on ? c.bg : c.fgMuted}>{date(dayToDate(d), { weekday: "short" })}</Text>
                  <Text style={disp(22, 800, 26)} rawColor={on ? c.bg : c.fg}>{date(dayToDate(d), { day: "numeric" })}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.wrap}>{times.map((x) => <Chip key={x.startsAt} large label={time(x.startsAt)} selected={slot === x.startsAt} onPress={() => setSlot(x.startsAt)} />)}</View>
          <Button size="lg" fullWidth loading={busy} disabled={!slot} onPress={move}>{t("bk.manage.reschedule")}</Button>
          <Button variant="ghost" fullWidth onPress={() => setMode("view")}>{t("bk.back")}</Button>
        </View>
      ) : mode === "cancel" ? (
        <View style={{ gap: 12 }}>
          <Button size="lg" variant="danger" fullWidth loading={busy} onPress={cancel}>{t("bk.manage.confirmCancel")}</Button>
          <Button size="lg" variant="secondary" fullWidth onPress={() => setMode("view")}>{t("bk.manage.keep")}</Button>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {a.status === "booked" ? <Button size="lg" fullWidth onPress={() => void addToCalendar()}>{t("bk.done.calendar")}</Button> : null}
          {live ? <Button size="lg" variant="secondary" fullWidth onPress={() => setMode("move")}>{t("bk.manage.reschedule")}</Button> : null}
          {live ? <Button size="lg" variant="ghost" fullWidth onPress={() => setMode("cancel")}>{t("bk.manage.cancel")}</Button> : null}
          <Button variant="ghost" fullWidth onPress={() => router.push(`/book/${a.merchant.slug}`)}>{t("bk.done.another")}</Button>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  policy: { borderRadius: 16, padding: 16 },
  day: { width: 62, height: 72, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
