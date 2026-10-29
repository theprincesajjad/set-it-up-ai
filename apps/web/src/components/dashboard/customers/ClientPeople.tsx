"use client";
/**
 * The appointment-led part of a customer's profile (docs/business/people-side.md gaps 1, 5, 7, 13): the next visit with
 * Reschedule and Message, the visits timeline (appointments merged with stamps and rewards, with the visit note, the photo and the
 * intake answer), Book again, and how the shop reaches them (channel and language). Shown when the shop takes appointments.
 */
import Link from "next/link";
import { CalendarClock, MessageCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { inboxApi } from "@ll/shared";
import { Section } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { useMessageCustomer } from "@/components/dashboard/inbox/useMessageCustomer";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useApi } from "@/lib/dashboard/useApi";

const STATUS_KEY = {
  booked: "people.status.booked",
  completed: "people.status.completed",
  no_show: "people.status.no_show",
  cancelled: "people.status.cancelled",
  arrived: "people.status.arrived",
  in_service: "people.status.in_service",
} as const;
const LANGS = { en: "English", hi: "हिन्दी", ur: "اردو", pa: "ਪੰਜਾਬੀ" } as const;

export function ClientPeople({ memberId, layout }: { memberId: string; layout: "panel" | "page" }) {
  const { api, base } = useMerchant();
  const { t, date, time } = useLocaleOrEnglish();
  const toast = useToast();
  const message = useMessageCustomer();
  const state = useApi(() => api.people.profile(memberId), [api, memberId]);
  const [saving, setSaving] = useState(false);
  const p = state.data;
  if (state.error) return <p className="text-meta text-negative">{state.error}</p>;
  if (!p) return <div className="h-28 animate-pulse rounded-r4 bg-bg-subtle" aria-hidden />;

  const when = (iso: string) => `${date(iso, { weekday: "short", month: "short", day: "numeric" })}, ${time(iso)}`;
  const visits = p.timeline.filter((x) => x.kind === "appointment" || layout === "page").slice(0, layout === "panel" ? 3 : 30);

  async function savePref(body: inboxApi.UpdateClientPreferencesBody) {
    setSaving(true);
    try {
      await api.people.setPreferences(memberId, body);
      await state.reload();
      toast({ message: t("people.pref.saved"), tone: "success" });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const reach = [p.reachable.push && t("people.reach.push"), p.reachable.webPush && t("people.reach.webPush"), p.reachable.email && t("people.reach.email"), p.reachable.text && t("people.reach.text")].filter(Boolean).join(", ") || t("people.reach.none");

  return (
    <div className="flex flex-col gap-6" data-testid="client-people">
      <Section title={t("people.nextVisit")}>
        {p.nextVisit ? (
          <div className="rounded-r4 bg-bg-subtle px-4 py-3" data-testid="next-visit">
            <p className="text-body-strong text-fg">{p.nextVisit.title}</p>
            <p className="text-meta text-fg-muted">
              {when(p.nextVisit.at)}
              {p.nextVisit.staffName ? ` · ${t("people.with", { name: p.nextVisit.staffName })}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`${base}/calendar?date=${p.nextVisit.at.slice(0, 10)}&appt=${p.nextVisit.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-meta font-medium text-link underline-offset-4 hover:underline">
                <CalendarClock aria-hidden className="size-4" />
                {t("people.reschedule")}
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-meta text-fg-muted">{t("people.noNextVisit")}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="h-10 rounded-full px-4" loading={message.busy} onClick={() => message.open({ memberId })} data-testid="profile-message">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle aria-hidden className="size-4" />
              {t("people.message")}
              {p.unread ? <span className="ms-1 rounded-r2 bg-primary px-1.5 text-caption text-primary-foreground tabular">{p.unread}</span> : null}
            </span>
          </Button>
          {p.bookAgain ? (
            <Button variant="secondary" size="sm" className="h-10 rounded-full px-4" onClick={async () => { await navigator.clipboard?.writeText(p.bookAgain!.link).catch(() => undefined); toast({ message: t("people.linkCopied"), tone: "success" }); }} title={p.bookAgain.label}>
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw aria-hidden className="size-4" />
                {t("people.bookAgain")}
              </span>
            </Button>
          ) : null}
        </div>
        {p.bookAgain ? <p className="mt-1 text-caption text-fg-muted">{t("people.bookAgainLast", { service: p.bookAgain.label })}</p> : null}
      </Section>

      <Section title={t("people.visits")} description={p.visits12m || p.noShows12m ? [t("people.visits12m", { n: p.visits12m }), p.noShows12m ? t("people.noShows", { n: p.noShows12m }) : ""].filter(Boolean).join(" · ") : undefined}>
        {visits.length ? (
          <ol aria-label={t("people.visits")} className="divide-y divide-line border-y border-line" data-testid="visits-timeline">
            {visits.map((v) => (
              <li key={`${v.kind}-${v.id}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-meta font-medium text-fg">{v.kind === "stamp" ? `${t("people.stamp")} ${v.title}` : v.kind === "redemption" ? `${t("people.redeemed")}: ${v.title}` : v.title}</p>
                  {v.priceCents != null && v.kind === "appointment" ? <span className="shrink-0 text-meta tabular text-fg">{formatMoney(v.priceCents)}</span> : null}
                </div>
                <p className="text-caption text-fg-muted">
                  {when(v.at)}
                  {v.staffName ? ` · ${t("people.with", { name: v.staffName })}` : ""}
                  {v.status && v.kind === "appointment" && v.status in STATUS_KEY ? ` · ${t(STATUS_KEY[v.status as keyof typeof STATUS_KEY])}` : ""}
                  {v.depositCents ? ` · ${t("people.deposit", { amount: formatMoney(v.depositCents) })}` : ""}
                </p>
                {v.visitNote ? <p className="mt-1 text-meta text-fg"><span className="text-fg-muted">{t("people.visitNote")}: </span>{v.visitNote}</p> : null}
                {v.intakeAnswer ? <p className="mt-1 text-meta text-fg"><span className="text-fg-muted">{t("people.intake")}: </span>{v.intakeAnswer}</p> : null}
                {v.clientNote ? <p className="mt-1 text-meta text-fg"><span className="text-fg-muted">{t("people.clientNote")}: </span>{v.clientNote}</p> : null}
                {v.visitPhotoUrl ? <a className="mt-1 inline-flex min-h-11 items-center text-meta text-link underline underline-offset-4" href={v.visitPhotoUrl} target="_blank" rel="noreferrer">{t("people.photo")}</a> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-y border-line py-3 text-meta text-fg-muted">{t("people.visitsEmpty")}</p>
        )}
      </Section>

      <Section title={t("people.settings.title")} description={`${t("people.channel")}: ${reach}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t("people.channel")}
            value={p.channelPref}
            disabled={saving}
            onChange={(e) => savePref({ channelPref: e.target.value as inboxApi.ChannelPref })}
            options={inboxApi.CHANNEL_PREFS.map((c) => ({ value: c, label: t(`people.pref.${c}` as const) }))}
          />
          <Select
            label={t("people.language")}
            value={p.locale ?? ""}
            disabled={saving}
            onChange={(e) => savePref({ locale: (e.target.value || null) as inboxApi.UpdateClientPreferencesBody["locale"] })}
            options={[{ value: "", label: t("people.languageDefault") }, ...Object.entries(LANGS).map(([value, label]) => ({ value, label }))]}
          />
        </div>
      </Section>
    </div>
  );
}
