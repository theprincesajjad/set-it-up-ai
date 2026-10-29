import type { waitlistApi } from "@ll/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { errorMessage as apiError, isApiError } from "../../api/client";
import { WAITLIST_KEY, useMyWaitlist, waitlist } from "../../features/customer/waitlist";
import { useLocale } from "../../lib/i18n";
import { dayToDate } from "../../lib/restaurant";
import { useOnline } from "../../state/network";
import { Banner, Button, Card, Clock, EmptyState, ErrorState, Screen, SkeletonList, Text } from "../../ui";

/** Waiting for a spot (phase-pro P2): each shop's ask with Remove, and an open offer with "Take it", which books it in one tap. */
export default function WaitingForASpot() {
  const { t, date, time } = useLocale();
  const online = useOnline();
  const qc = useQueryClient();
  const q = useMyWaitlist();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ variant: "success" | "danger" | "info"; text: string } | null>(null);
  const day = (d: string) => date(dayToDate(d), { weekday: "short", month: "short", day: "numeric" });
  const span = (e: waitlistApi.MyWaitlistEntryDto) => (e.windowStart === e.windowEnd ? day(e.windowStart) : t("wl.mine.window", { from: day(e.windowStart), to: day(e.windowEnd) }));

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setNote(null);
    try {
      return await fn();
    } catch (e) {
      setNote({ variant: "danger", text: isApiError(e) && e.status === 410 ? t("wl.take.gone") : apiError(e, { network: t("auth.err.network"), server: t("auth.err.server") }) });
      return undefined;
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: WAITLIST_KEY });
    }
  }

  if (q.isLoading) return <Screen back title={t("wl.mine.title")}><SkeletonList rows={3} rowHeight={88} /></Screen>;
  if (q.isError) return <Screen back title={t("wl.mine.title")}><ErrorState offline={!online} onRetry={() => q.refetch()} /></Screen>;
  const items = q.data?.items ?? [];

  return (
    <Screen back title={t("wl.mine.title")}>
      {note ? <Banner variant={note.variant}>{note.text}</Banner> : null}
      {!items.length ? <EmptyState icon={Clock} title={t("wl.mine.empty")} /> : null}
      {items.map((e) => (
        <Card key={e.id}>
          <View style={{ gap: 4 }}>
            <Text variant="bodyStrong">{e.merchant.name}</Text>
            <Text variant="meta" color="fgMuted">{[e.serviceName, e.staffName, span(e), t(`wl.pref.${e.timePref}`)].filter(Boolean).join(" · ")}</Text>
            {e.offer ? <Text variant="meta">{t("wl.mine.offer", { when: `${date(e.offer.startsAt, { weekday: "short", month: "short", day: "numeric" })}, ${time(e.offer.startsAt)}`, time: time(e.offer.expiresAt) })}</Text> : null}
          </View>
          <View style={{ gap: 8, paddingTop: 12 }}>
            {e.offer ? (
              <Button
                size="lg"
                fullWidth
                loading={busy === e.id}
                onPress={async () => {
                  const r = (await run(e.id, () => waitlist.take(e.id))) as waitlistApi.TakeOfferResponse | undefined;
                  if (r) router.replace(`/appointments/${r.appointmentId}` as never);
                }}
              >
                {t("wl.take.cta")}
              </Button>
            ) : null}
            <Button variant="ghost" fullWidth loading={busy === `rm:${e.id}`} onPress={() => void run(`rm:${e.id}`, () => waitlist.remove(e.id))}>{t("wl.mine.remove")}</Button>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
