import { restaurantApi, type MessageKey } from "@ll/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { t as copy } from "../../copy/en-CA";
import { ChipGroup, DateField, InfoRow, useMoney } from "../../features/restaurant/components";
import { featureOff, rk, useHalls } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { addDays, busyOnDay, dayToDate, fromPerHeadCents, HALL_HOURS, HALL_START_TIMES, holdWindow, overlapsBusy, torontoInstant, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, useTheme } from "../../theme";
import { Banner, Button, EmptyState, ErrorState, hairline, LockedFeature, Screen, Sheet, SkeletonList, Store, Text, TextField, useToast } from "../../ui";

type Hall = restaurantApi.HallDto;

/** Banquet halls: capacity and packages, an availability day picker, and a 72-hour hold request. */
export default function Banquet() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useTheme();
  const { t, number } = useLocale();
  const money = useMoney();
  const online = useOnline();
  const q = useHalls(slug);
  const [hall, setHall] = useState<Hall | null>(null);
  const [opened, setOpened] = useState(0);

  if (q.isLoading) return <Screen back title={t("rest.bk.title")}><SkeletonList rows={3} rowHeight={120} /></Screen>;
  if (q.isError || !q.data) {
    return (
      <Screen back title={t("rest.bk.title")}>
        {featureOff(q.error) ? <LockedFeature icon={Store} title={t("rest.bk.title")} body={t("rest.bk.notOffered")} /> : <ErrorState offline={!online} message={t("rest.err.load")} onRetry={() => q.refetch()} />}
      </Screen>
    );
  }
  const halls = q.data.items;
  return (
    <Screen back title={t("rest.bk.title")} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Text color="fgMuted">{t("rest.bk.intro")}</Text>
      {halls.length === 0 ? <EmptyState icon={Store} title={t("rest.bk.none.title")} body={t("rest.bk.none.body")} /> : null}
      <View>
        {halls.map((h, i) => {
          const from = fromPerHeadCents(h);
          return (
            <View key={h.id} style={[styles.hall, { borderBottomColor: c.line, borderBottomWidth: i < halls.length - 1 ? hairline : 0 }]}>
              <View style={{ gap: 4 }}>
                <Text style={disp(20, 800, 24)}>{h.name}</Text>
                <Text variant="meta" color="fgMuted">
                  {[t("rest.bk.capacity", { n: number(h.capacity) }), from !== null ? t("rest.bk.fromPerHead", { price: money(from) }) : null, h.baseCents > 0 ? t("rest.bk.hallFee", { price: money(h.baseCents) }) : null].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {h.description ? <Text color="fgMuted">{h.description}</Text> : null}
              {h.packages.map((p) => (
                <View key={p.name} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {p.name}
                    </Text>
                    <Text variant="bodyStrong" tabular>
                      {t("rest.bk.perHead", { price: money(p.perHeadCents) })}
                    </Text>
                  </View>
                  {p.includes.length > 0 ? (
                    <Text variant="meta" color="fgMuted">
                      {p.includes.join(", ")}
                    </Text>
                  ) : null}
                </View>
              ))}
              <Button variant="secondary" onPress={() => {
                  setOpened((n) => n + 1);
                  setHall(h);
                }}>
                {t("rest.bk.checkDates")}
              </Button>
            </View>
          );
        })}
      </View>
      <HoldSheet key={opened} slug={slug} hall={hall} onClose={() => setHall(null)} />
    </Screen>
  );
}

/** The day picker (busy days marked), start time, length, package and headcount, then "request hold". */
function HoldSheet({ slug, hall, onClose }: { slug: string | undefined; hall: Hall | null; onClose: () => void }) {
  const { t, time, date } = useLocale();
  const money = useMoney();
  const toast = useToast();
  const qc = useQueryClient();
  const today = torontoToday();
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<string>("18:00");
  const [hours, setHours] = useState<number>(5);
  const [pkg, setPkg] = useState<string | null>(null);
  const [type, setType] = useState<restaurantApi.CateringEventType>("wedding");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => ({ from: torontoInstant(today, "00:00").toISOString(), to: torontoInstant(addDays(today, 180), "00:00").toISOString() }), [today]);
  const avail = useQuery({
    queryKey: rk.availability(slug ?? "", hall?.id ?? "", range.from, range.to),
    queryFn: () => api.banquet.availability(slug!, { ...range, hallId: hall!.id }),
    enabled: !!slug && !!hall,
    retry: false,
    staleTime: 30_000,
  });
  const busyList = avail.data?.halls.find((x) => x.hall.id === hall?.id)?.busy ?? [];
  const dayBusy = day ? busyOnDay(busyList, day) : [];
  const win = day ? holdWindow(day, start, hours) : null;
  const clash = win ? overlapsBusy(busyList, win.startsAt, win.endsAt) : false;
  const count = Number.parseInt(guests, 10);
  const guestsOk = Number.isInteger(count) && count >= 1 && !!hall && count <= hall.capacity;
  const chosen = hall?.packages.find((p) => p.name === pkg) ?? null;
  const estimate = hall ? hall.baseCents + (chosen && guestsOk ? chosen.perHeadCents * count : 0) : 0;
  const deposit = hall ? Math.round((estimate * hall.depositBps) / 10_000) : 0;

  const submit = async () => {
    setTouched(true);
    if (!hall || !day || !win || !guestsOk || clash) return;
    setBusy(true);
    setError(null);
    try {
      await api.banquet.hold({ hallId: hall.id, eventType: type, startsAt: win.startsAt, endsAt: win.endsAt, headcount: count, packageName: pkg, notes: notes.trim() || null });
      void qc.invalidateQueries({ queryKey: rk.bookings });
      void qc.invalidateQueries({ queryKey: ["banquet", "availability"] });
      onClose();
      toast({ tone: "success", message: t("rest.bk.held") });
      router.push("/events?tab=halls");
    } catch (e) {
      setError(isApiError(e) && e.status === 409 ? t("rest.bk.taken") : featureOff(e) ? t("rest.bk.notOffered") : errorMessage(e, { network: copy("err.network"), server: copy("err.server") }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!hall}
      onClose={onClose}
      title={hall?.name}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={!day} onPress={submit}>
          {t("rest.bk.requestHold")}
        </Button>
      }
    >
      <DateField
        label={t("rest.bk.day")}
        placeholder={t("rest.pickDate")}
        value={day}
        onChange={setDay}
        min={addDays(today, 1)}
        max={addDays(today, 180)}
        busy={(d) => busyOnDay(busyList, d).length > 0}
        hint={avail.isLoading ? t("rest.bk.loadingDays") : t("rest.bk.dayHint")}
      />
      {day && dayBusy.length > 0 ? (
        <Banner variant="neutral">{t("rest.bk.busyToday", { windows: dayBusy.map((b) => `${time(b.startsAt)} – ${time(b.endsAt)}`).join(", ") })}</Banner>
      ) : null}
      {day ? (
        <>
          <ChipGroup label={t("rest.bk.start")} value={start} onChange={setStart} options={HALL_START_TIMES.map((h) => ({ value: h as string, label: time(torontoInstant(day, h)) }))} />
          <ChipGroup label={t("rest.bk.length")} value={hours} onChange={setHours} options={HALL_HOURS.map((h) => ({ value: h as number, label: t("rest.bk.hours", { n: h }) }))} />
          {clash ? <Banner variant="danger">{t("rest.bk.clash")}</Banner> : null}
        </>
      ) : null}
      <TextField
        label={t("catering.guests")}
        value={guests}
        onChangeText={(v) => setGuests(v.replace(/\D/g, "").slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        hint={hall ? t("rest.bk.capacity", { n: hall.capacity }) : null}
        error={touched && !guestsOk ? t("rest.err.hallGuests", { n: hall?.capacity ?? 0 }) : null}
      />
      {hall && hall.packages.length > 0 ? (
        <ChipGroup
          label={t("rest.bk.package")}
          optionalLabel={t("rest.optional")}
          value={pkg}
          onChange={(v) => setPkg(pkg === v ? null : v)}
          options={hall.packages.map((p) => ({ value: p.name, label: `${p.name} · ${money(p.perHeadCents)}` }))}
        />
      ) : null}
      <ChipGroup label={t("catering.eventType")} value={type} onChange={setType} options={restaurantApi.CATERING_EVENT_TYPES.map((v) => ({ value: v, label: t(`event.${v}` as MessageKey) }))} />
      <TextField label={t("catering.message")} optionalLabel value={notes} onChangeText={setNotes} multiline maxLength={4000} />
      {hall ? (
        <View style={{ gap: 2 }}>
          {estimate > 0 ? <InfoRow label={t("rest.bk.estimate")} value={money(estimate)} /> : null}
          {deposit > 0 ? <InfoRow label={t("rest.bk.depositPct", { n: Math.round(hall.depositBps / 100) })} value={money(deposit)} /> : null}
          <Text variant="meta" color="fgMuted" style={{ marginTop: 4 }}>
            {day && win ? `${date(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })}, ${time(win.startsAt)} – ${time(win.endsAt)}. ` : ""}
            {t("rest.bk.holdNote")}
          </Text>
        </View>
      ) : null}
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hall: { paddingVertical: 20, gap: 12 },
});
