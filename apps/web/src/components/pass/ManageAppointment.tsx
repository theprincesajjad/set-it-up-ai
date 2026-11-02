"use client";
import { CalendarPlus, ChevronLeft, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { Heading, Pill, ShopHead, useFmt } from "@/components/restaurant/ui";
import { PaymentBox } from "@/components/pass/PaymentBox";
import { ReminderCard } from "@/components/pass/ReminderCard";
import { SetupBox } from "@/components/pass/SetupBox";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { buildIcs, dayPart, DAY_PARTS, durationText, nextDays, timesOn } from "@/lib/booking";
import { shopColorProps } from "@/lib/shopColor";
import { cn } from "@/lib/cn";
import { addDays, todayIso } from "@/lib/restaurant/util";
import { Skeleton } from "@/components/ui/Skeleton";
import { DateStrip } from "./DateStrip";

type Appt = appointmentsApi.MyAppointmentDto;

/** One appointment: when, who, what it costs, the policy in words, add to calendar, change the time, cancel. */
export function ManageAppointment({ initial, slug, pay }: { initial: Appt; slug: string; /** What a held booking still needs: the deposit to pay or the card to save. */ pay?: { deposit: { paymentIntentId: string; clientSecret: string; amountCents: number } | null; setup: { setupIntentId: string; clientSecret: string } | null } }) {
  const { t, money, date, time } = useFmt();
  const [appt, setAppt] = useState(initial);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [av, setAv] = useState<appointmentsApi.AvailabilityResponse | null>(null);
  const [day, setDay] = useState(todayIso());
  const [slot, setSlot] = useState<string | null>(null);
  const live = appt.status === "booked" && !appt.pending;
  const [now] = useState(() => Date.now());
  const inside = new Date(appt.freeChangeUntil).getTime() <= now;
  const feeCents = Math.max(0, appt.policy.noShowFeeCents - (appt.depositPaidAt ? appt.depositCents : 0));
  const when = (iso: string) => `${date(iso, { weekday: "long", month: "long", day: "numeric" })}, ${time(iso)}`;
  const serviceIds = appt.items.map((i) => i.serviceId).filter((s): s is string => !!s);
  // wave-q: two weeks from today, or from a later day picked in the strip's calendar.
  const [fromDay, setFromDay] = useState(todayIso());
  const days = nextDays(fromDay, 14);

  useEffect(() => {
    if (mode !== "move" || !serviceIds.length) return;
    let cancelled = false;
    browserApi.public
      .bookingAvailability(slug, { serviceIds, addOnIds: appt.items.flatMap((i) => (i.kind === "add_on" && i.addOnId ? [i.addOnId] : [])) /* phase-pro: P5 */, staffId: appt.staffId ?? "any", from: days[0]!, to: days[days.length - 1]! })
      .then((r) => {
        if (cancelled) return;
        setAv(r);
        const first = r.days.find((d) => d.times.length);
        if (first) setDay((cur) => (r.days.find((d) => d.date === cur)?.times.length ? cur : first.date));
      })
      .catch(() => !cancelled && setNote({ tone: "danger", text: t("rc.error.body") }));
    return () => {
      cancelled = true;
    };
    // days and serviceIds derive from the appointment; reload when entering the mode or moving the two-week window
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fromDay]);

  async function cancel() {
    setBusy(true);
    setNote(null);
    try {
      const r = await browserApi.me.cancelAppointment(appt.id);
      setAppt(r.appointment);
      setMode("view");
      setNote({ tone: "success", text: [t("bk.manage.cancelled"), r.feeCharged ? t("bk.manage.feeCharged", { fee: money(r.feeCents) }) : null, !inside && appt.depositPaidAt ? t("bk.manage.refund") : null].filter(Boolean).join(" ") });
    } catch (e) {
      setNote({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function move() {
    if (!slot) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await browserApi.me.rescheduleAppointment(appt.id, { startsAt: slot, staffId: appt.staffId });
      setAppt(r.appointment);
      setMode("view");
      setSlot(null);
      setNote({ tone: "success", text: [t("bk.manage.rescheduled", { when: when(r.appointment.startsAt) }), r.feeCharged ? t("bk.manage.feeCharged", { fee: money(r.feeCents) }) : null].filter(Boolean).join(" ") });
    } catch (e) {
      setNote({ tone: "danger", text: isApiError(e) && e.status === 409 && e.code === "slot_taken" ? t("bk.taken") : errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  async function refreshAfterPay() {
    // The webhook confirms the booking a moment after the payment; look again until it has.
    for (let i = 0; i < 10; i++) {
      const r = await browserApi.me.appointment(appt.id).catch(() => null);
      if (r && !r.appointment.pending) {
        setAppt(r.appointment);
        return;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  function download() {
    const url = `${window.location.origin}/shops/${slug}/book/${appt.id}`;
    // A pharmacy visit goes into the calendar as a bare "Appointment": no service, shop, address or link (calendars sync and share).
    const rx = Boolean(appt.reminderText);
    const ics = rx
      ? buildIcs({ uid: appt.id, title: t("rx.ics.title"), startsAt: appt.startsAt, endsAt: appt.endsAt })
      : buildIcs({ uid: appt.id, title: `${appt.items.map((i) => i.name).join(", ")} · ${appt.merchant.name}`, startsAt: appt.startsAt, endsAt: appt.endsAt, location: appt.merchant.address, description: url, url });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "appointment.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const m = appt.merchant;
  // A pharmacy visit is free and shows no price (the reminder text is only set for pharmacies).
  const rx = !!appt.reminderText;
  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={m} href={`/shops/${encodeURIComponent(m.slug)}`} />
      {/* wave-p: one ticket in the shop's colour: when (the thing people come here to check), what, with whom, where. */}
      <Heading>{t("bk.manage.title")}</Heading>
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <section aria-label={t("bk.manage.title")} data-testid="appt-ticket" {...(m.brandColor ? shopColorProps({ brandColor: m.brandColor, vertical: null }) : {})} className="flex flex-col gap-4 rounded-card border border-line bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={appt.status === "booked" && !appt.pending ? "ink" : "neutral"}>{appt.status === "booked" && appt.pending ? (pay?.deposit ? t("bk.depositHold", { amount: money(pay.deposit.amountCents) }) : t("bk.card.title")) : t(`bk.status.${appt.status}` as "bk.status.booked")}</Pill>
          </div>
          <p className={cn("text-[22px] font-semibold leading-7 text-fg", appt.status === "cancelled" && "text-fg-muted line-through")}>{date(appt.startsAt, { weekday: "long", month: "long", day: "numeric" })}</p>
          <p className="text-body text-fg tabular-nums">{time(appt.startsAt)} – {time(appt.endsAt)}</p>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {appt.items.map((i, idx) => (
            <li key={`${i.name}${idx}`} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-body-strong text-fg">{i.name}</p>
                <p className="text-meta text-fg-muted">{i.kind === "add_on" ? `${t("addon.sheet.tag")} · ` : "" /* phase-pro: P5 */}{durationText(t as never, i.durationMin)}{appt.staffName ? ` · ${appt.staffName}` : ""}{appt.petName ? ` · ${t("bk.next.for", { pet: appt.petName })}` : ""}</p>
              </div>
              {rx ? null : <p className="shrink-0 text-body tabular-nums text-fg">{money(i.priceCents)}</p>}
            </li>
          ))}
          {rx || (appt.items.length < 2 && !appt.tax.applies) ? null : <li className="flex items-center justify-between py-3">
            <span className="text-body-strong text-fg">{appt.tax.applies ? t("bk.totalLabel") : t("bk.totalPlain")}</span>
            <span className="text-headline tabular-nums text-fg">{money(appt.totalCents)}</span>
          </li>}
        </ul>
        {m.address ? (
          <div className="flex items-start gap-3 border-t border-line pt-3">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-fg" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-body text-fg"><bdi>{m.address}</bdi></p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${m.name} ${m.address}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-meta-strong text-fg underline underline-offset-2">{t("bk.next.directions")}</a>
            </div>
          </div>
        ) : null}
      </section>
      {live ? <ReminderCard text={appt.reminderText} /> : null}

      {/* A held booking (deposit or card not done yet) is not confirmed: say so and let the customer finish it from here, as at the end of the booking flow. */}
      {appt.status === "booked" && appt.pending ? (
        <section aria-label={t("bk.card.title")} className="flex flex-col gap-3 rounded-card bg-bg-subtle p-4">
          {appt.holdExpiresAt ? <p className="text-meta text-fg-muted">{t("bk.holding", { time: time(appt.holdExpiresAt).replace(/\.$/, "") })}</p> : null}
          {pay?.deposit ? (
            <PaymentBox paymentIntentId={pay.deposit.paymentIntentId} clientSecret={pay.deposit.clientSecret} amountCents={pay.deposit.amountCents} label={t("bk.cta.deposit", { amount: money(pay.deposit.amountCents) })} onPaid={refreshAfterPay} />
          ) : pay?.setup ? (
            <SetupBox setupIntentId={pay.setup.setupIntentId} clientSecret={pay.setup.clientSecret} label={t("bk.cta.card")} onSaved={refreshAfterPay} />
          ) : null}
        </section>
      ) : null}

      {live && mode === "view" ? (
        <p className="rounded-card bg-bg-subtle p-4 text-body text-fg">{!inside ? t("bk.manage.cancelFree", { when: when(appt.freeChangeUntil).replace(/\.$/, "") }) : feeCents > 0 && appt.hasCardOnFile ? t("bk.manage.cancelFee", { fee: money(feeCents) }) : t("bk.manage.cancelLate")}</p>
      ) : null}

      {mode === "move" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMode("view")} aria-label={t("bk.back")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line focus-visible:focus-ring"><ChevronLeft aria-hidden className="size-5 rtl:rotate-180" /></button>
            <h2 className="text-headline text-fg">{t("cust.manage.pickNew")}</h2>
          </div>
          <DateStrip
            days={days}
            day={day}
            label={t("bk.time.title")}
            onSelect={(d) => { setDay(d); setSlot(null); }}
            state={(d) => { const n = timesOn(av, d).length; return { count: av ? n : null, disabled: !av || n === 0 }; }}
            onPickLater={(d) => { const inWindow = d >= todayIso() && d <= addDays(todayIso(), 13); const next = inWindow ? todayIso() : d; if (next !== fromDay) { setAv(null); setFromDay(next); } setDay(d); setSlot(null); }}
          />
          <div className="flex flex-col gap-4" aria-live="polite">
            {!av ? (
              <div className="flex flex-col gap-3" aria-busy>
                <span className="sr-only">{t("bk.time.loading")}</span>
                <Skeleton className="h-4 w-32" />
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-input" />)}</div>
              </div>
            ) : null}
            {DAY_PARTS.map((part) => {
              const items = timesOn(av, day).filter((x) => dayPart(x.startsAt) === part);
              return items.length ? (
                <div key={part} className="flex flex-col gap-2">
                  <p className="text-caption uppercase tracking-[0.06em] text-fg-muted">{t(`cust.bk.part.${part}`)}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {items.map((x) => (
                      <button key={x.startsAt} type="button" aria-pressed={slot === x.startsAt} onClick={() => setSlot(x.startsAt)} className={cn("h-11 whitespace-nowrap rounded-input border px-1 tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:focus-ring motion-safe:active:scale-95", slot === x.startsAt ? "border-trade bg-trade font-semibold text-trade-foreground shadow-card" : "border-line bg-card text-fg hover:border-trade/50 hover:bg-trade-soft")}>{time(x.startsAt)}</button>
                    ))}
                  </div>
                </div>
              ) : null;
            })}
          </div>
          <Button size="lg" variant="shop" fullWidth loading={busy} disabled={!slot} onClick={move}>{t("bk.manage.reschedule")}</Button>
        </div>
      ) : mode === "cancel" ? (
        <div className="flex flex-col gap-3">
          <Banner tone="info">{!inside ? t("bk.manage.cancelFree", { when: when(appt.freeChangeUntil).replace(/\.$/, "") }) : feeCents > 0 && appt.hasCardOnFile ? t("bk.manage.cancelFee", { fee: money(feeCents) }) : t("bk.manage.cancelLate")}</Banner>
          <Button size="lg" variant="danger" fullWidth loading={busy} onClick={cancel}>{t("bk.manage.confirmCancel")}</Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => setMode("view")}>{t("bk.manage.keep")}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {appt.status === "booked" ? <Button size="lg" variant="shop" fullWidth iconStart={CalendarPlus} onClick={download}>{t("bk.done.calendar")}</Button> : null}
          {live ? <Button size="lg" variant="secondary" fullWidth onClick={() => setMode("move")}>{t("bk.manage.reschedule")}</Button> : null}
          {live ? <Button size="lg" variant="ghost" fullWidth onClick={() => setMode("cancel")}>{t("bk.manage.cancel")}</Button> : null}
          <Button size="lg" variant="ghost" fullWidth href={`/shops/${encodeURIComponent(m.slug)}/book`}>{t("bk.done.another")}</Button>
        </div>
      )}
    </div>
  );
}
