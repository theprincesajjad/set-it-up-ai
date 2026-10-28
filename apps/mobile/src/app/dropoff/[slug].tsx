import type { commerceApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage, isApiError } from "../../api/client";
import { featureOff } from "../../features/restaurant/queries";
import { useLocale } from "../../lib/i18n";
import { addDays, torontoToday } from "../../lib/restaurant";
import { api } from "../../state/api";
import { useOnline } from "../../state/network";
import { disp, useTheme } from "../../theme";
import { Banner, Button, Chip, EmptyState, ErrorState, LockedFeature, Screen, SkeletonList, Store, Text, TextField } from "../../ui";

const DAYS = 14;
const TZ = "America/Toronto";
const dayToDate = (d: string) => new Date(`${d}T12:00:00`);
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

/**
 * Book a drop-off: pick a day and a time to bring an item in, say what it is, and book. No deposit and no service step.
 * Same steps as /shops/<slug>/dropoff on the web.
 */
export default function Dropoff() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c, r } = useTheme();
  const { t, date, time, number } = useLocale();
  const online = useOnline();
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<commerceApi.SlotDto | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<commerceApi.BookingDto | null>(null);
  const to = useMemo(() => addDays(torontoToday(), DAYS), []);
  const q = useQuery({ queryKey: ["dropoff", slug], queryFn: () => api.commerce.slots(slug!, { kind: "dropoff", to: new Date(`${to}T23:59:59Z`).toISOString() }), enabled: !!slug, retry: false });
  const byDay = useMemo(() => {
    const m = new Map<string, commerceApi.SlotDto[]>();
    for (const s of q.data?.items ?? []) m.set(dayOf(s.startsAt), [...(m.get(dayOf(s.startsAt)) ?? []), s]);
    return m;
  }, [q.data]);
  const current = day && byDay.has(day) ? day : ([...byDay.keys()][0] ?? null);
  const when = (iso: string) => `${date(iso, { weekday: "long", month: "long", day: "numeric" })}, ${time(iso)}`;

  if (q.isLoading) return <Screen back title={t("sv.d.title")}><SkeletonList rows={4} rowHeight={72} /></Screen>;
  if (q.isError)
    return (
      <Screen back title={t("sv.d.title")}>
        {featureOff(q.error) ? <LockedFeature icon={Store} title={t("sv.d.title")} body={t("sv.d.unavailable")} /> : <ErrorState offline={!online} message={t("rc.error.body")} onRetry={() => q.refetch()} />}
      </Screen>
    );
  if (booked)
    return (
      <Screen back title={t("sv.d.doneTitle")}>
        <View style={[styles.card, { backgroundColor: c.bgSubtle }]}>
          <Text style={disp(26, 800, 30)}>{t("sv.d.doneTitle")}</Text>
          <Text>{t("sv.d.doneBody", { shop: "", when: when(booked.startsAt) }).replace(/\s{2,}/g, " ").trim()}</Text>
        </View>
        {error ? <Banner variant="danger">{error}</Banner> : null}
        <Button
          variant="ghost"
          fullWidth
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api.commerce.cancelBooking(booked.id);
              setBooked(null);
              setSlot(null);
              void q.refetch();
            } catch (e) {
              setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("sv.d.cancel")}
        </Button>
        <Button variant="secondary" fullWidth onPress={() => router.back()}>{t("rc.backToShop", { shop: "" }).trim()}</Button>
      </Screen>
    );
  if (!byDay.size) return <Screen back title={t("sv.d.title")}><EmptyState icon={Store} title={t("sv.d.none", { shop: "" }).replace(/\s{2,}/g, " ")} /></Screen>;

  const times = current ? (byDay.get(current) ?? []) : [];
  async function submit() {
    if (!slot || busy) return;
    setBusy(true);
    setError(null);
    try {
      setBooked(await api.commerce.bookSlot({ slotId: slot.id, notes: notes.trim() || null }));
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        setError(t("sv.d.taken"));
        setSlot(null);
        void q.refetch();
      } else setError(errorMessage(e, { network: t("auth.err.network"), server: t("auth.err.server") }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      back
      title={t("sv.d.title")}
      subtitle={t("sv.d.intro")}
      footer={
        <View style={{ gap: 8 }}>
          <Text variant="meta" color="fgMuted">{slot ? when(slot.startsAt) : t("sv.d.pickTime")}</Text>
          <Button size="lg" fullWidth loading={busy} disabled={!slot} onPress={submit}>{slot ? t("sv.d.book", { time: time(slot.startsAt) }) : t("sv.d.pickTime")}</Button>
        </View>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
        {[...byDay.keys()].map((d) => {
          const on = d === current;
          return (
            <Pressable key={d} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setDay(d); setSlot(null); }} style={[styles.day, { borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : r.card }]}>
              <Text variant="caption" rawColor={on ? c.onBrand : c.fgMuted}>{date(dayToDate(d), { weekday: "short" })}</Text>
              <Text style={disp(22, 800, 26)} rawColor={on ? c.onBrand : c.fg}>{date(dayToDate(d), { day: "numeric" })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text variant="metaStrong">{t("sv.d.times")}</Text>
      <View style={styles.wrap}>
        {times.map((s) => (
          <Chip key={s.id} large label={s.remaining <= 2 ? `${time(s.startsAt)} · ${t("sv.d.left", { n: number(s.remaining) })}` : time(s.startsAt)} selected={slot?.id === s.id} onPress={() => setSlot(s)} />
        ))}
      </View>
      <TextField label={t("sv.d.notes")} placeholder={t("sv.d.notesHint")} value={notes} onChangeText={setNotes} multiline maxLength={400} />
      <View style={[styles.card, { backgroundColor: c.bgSubtle }]}><Text>{t("sv.d.policy")}</Text></View>
      {error ? <Banner variant="danger">{error}</Banner> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  day: { width: 62, height: 72, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { borderRadius: 16, padding: 16, gap: 6 },
});
