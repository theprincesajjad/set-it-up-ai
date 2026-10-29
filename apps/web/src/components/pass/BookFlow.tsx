"use client";
import { useHydratedValue } from "@/lib/useHydratedValue";
import { ChevronLeft, ChevronRight, CircleCheck, CreditCard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appointmentsApi as apptApi, serviceFitsSize, type appointmentsApi, type petApi } from "@ll/shared";
import { NextVisitCard } from "@/components/pass/NextVisitCard";
import { PaymentBox } from "@/components/pass/PaymentBox";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { ReminderCard } from "@/components/pass/ReminderCard";
import { NotifyPrompt } from "@/components/pass/NotifyPrompt";
import { SetupBox } from "@/components/pass/SetupBox";
import { WaitlistSheet } from "@/components/pass/WaitlistSheet"; // phase-pro: p2
import { browserClient } from "@/lib/api/browser"; // phase-pro: p2
import { publicWaitlistEndpoints } from "@/lib/api/waitlist"; // phase-pro: p2
import { BigNumber, Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { buildIcs, durationText, groupServices, nextDays, serviceFor, staffDoes, summarize, timesOn, totalText } from "@/lib/booking";
import { cn } from "@/lib/cn";
import { addOnPriceTime } from "@/lib/dashboard/add-ons"; // phase-pro: P5
import { dayDate, todayIso } from "@/lib/restaurant/util";

type Data = appointmentsApi.PublicServicesResponse;
type Slot = { startsAt: string; staffId: string };
type Booked = appointmentsApi.CreateMyAppointmentResponse;

const DAYS = 14;

/**
 * /shops/<slug>/book: pick a stylist and services (Figma M1), pick a time with the policy in plain words and the
 * card or deposit row (M2), pay the deposit or save a card, then a confirmation with a calendar file.
 * The bridal row is a quote, not a slot.
 */
export function BookFlow({ shop, data, signedIn, devAutofill, initial, meName }: { shop: { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null }; data: Data; signedIn: boolean; devAutofill?: boolean; initial?: { service?: string; staff?: string; pet?: string; rebook?: string }; meName?: string | null }) {
  const f = useFmt();
  const { t, money, date, time, pick } = f;
  const dur = (min: number) => durationText(t as never, min);
  const [step, setStep] = useState<"services" | "addons" | "time" | "pay" | "done">("services"); // phase-pro: P5 "addons"
  const [staffId, setStaffId] = useState<string | null>(initial?.staff && data.staff.some((s) => s.id === initial.staff) ? initial.staff : null);
  const [category, setCategory] = useState<string>("all");
  const [ids, setIds] = useState<string[]>(initial?.service && data.services.some((s) => s.id === initial.service) ? [initial.service] : []);
  const [day, setDay] = useState<string>(() => todayIso());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [av, setAv] = useState<appointmentsApi.AvailabilityResponse | null>(null);
  const [anyAv, setAnyAv] = useState<appointmentsApi.AvailabilityResponse | null>(null);
  const [avLoading, setAvLoading] = useState(false);
  const [avError, setAvError] = useState(false);
  const [notes, setNotes] = useState("");
  // phase-solo D: the shop's one question for this service (the first picked service that has one).
  const [intake, setIntake] = useState("");
  const notesRef = useHydratedValue<HTMLTextAreaElement>(notes, setNotes);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [finished, setFinished] = useState<appointmentsApi.MyAppointmentDto | null>(null);
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const pending = useRef(false);
  // Who is coming: the shop sees a name on the calendar, never "Walk-in". Asked once, when the account has no name yet.
  const [firstName, setFirstName] = useState("");
  const [nameTried, setNameTried] = useState(false);
  // A pharmacy never asks for a name or a note (the privacy card says so): the booking goes through without one.
  const needsName = !meName?.trim() && !data.shop.pharmacy;
  // A pet shop books a dog: pick which one (its size picks the price).
  const petShop = data.shop.vertical === "pet";
  const [myPets, setMyPets] = useState<petApi.PetDto[]>([]);
  const [petId, setPetId] = useState<string>(initial?.pet ?? "");
  useEffect(() => {
    if (!signedIn || !petShop) return;
    void browserApi.me.myPets().then((r) => { setMyPets(r.items); setPetId((cur) => cur || (r.items.length === 1 ? r.items[0]!.id : "")); }).catch(() => undefined);
  }, [signedIn, petShop]);
  const pickedPet = myPets.find((p) => p.id === petId) ?? null;
  // ---- phase-pro: p2 ---- the waitlist: which days the shop works (a working day with no times is "Full"), and the sheet.
  const [workDays, setWorkDays] = useState<Set<string> | null>(null);
  const [waitSheet, setWaitSheet] = useState(false);
  // ---- end phase-pro: p2 ----

  const staffName = staffId ? (data.staff.find((s) => s.id === staffId)?.name ?? "") : "";
  const baseSel = useMemo(() => summarize(data.services, ids, staffId), [data.services, ids, staffId]);
  const picked = data.services.filter((s) => ids.includes(s.id));
  const intakeQuestion = picked.find((s) => s.intakeQuestion)?.intakeQuestion ?? null;
  // ---- phase-pro: P5 ---- add-ons offered with the picked services (only a Pro shop's payload carries them)
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const offeredAddOns = useMemo(() => {
    const seen = new Map<string, appointmentsApi.PublicAddOnDto>();
    for (const s of data.services) if (ids.includes(s.id)) for (const a of s.addOns ?? []) if (!seen.has(a.id)) seen.set(a.id, a);
    return [...seen.values()];
  }, [data.services, ids]);
  const pickedAddOns = offeredAddOns.filter((a) => addOnIds.includes(a.id));
  const extra = apptApi.addOnTotals(pickedAddOns);
  useEffect(() => {
    // Drop add-ons the new service choice no longer offers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddOnIds((cur) => (cur.every((id) => offeredAddOns.some((a) => a.id === id)) ? cur : cur.filter((id) => offeredAddOns.some((a) => a.id === id))));
  }, [offeredAddOns]);
  // Add-ons count in the length and the total, never in the deposit.
  const sel = { ...baseSel, durationMin: baseSel.durationMin + extra.durationMin, priceCents: baseSel.priceCents + extra.priceCents };
  // ---- end phase-pro: P5 ----
  // Pharmacy: free to book, no card, no notes, no price shown (docs/research/pharmacies-wellness.md).
  const pharmacy = !!data.shop.pharmacy;
  const privateAddress = !!data.shop.addressVisibility && data.shop.addressVisibility !== "exact";
  const takesCards = data.policy.takesCards;
  const deposit = takesCards ? sel.depositCents : 0;
  const fee = takesCards ? data.policy.noShowFeeCents : 0;
  const needsCard = takesCards && (deposit > 0 || fee > 0);
  const categories = useMemo(() => [...new Set(data.services.map((s) => s.categoryName).filter((c): c is string => !!c))], [data.services]);
  const visible = useMemo(() => data.services.filter((s) => (category === "all" || s.categoryName === category) && staffDoes(s, staffId) && serviceFitsSize(s.name, pickedPet?.sizeBand)), [data.services, category, staffId, pickedPet?.sizeBand]);
  const days = useMemo(() => nextDays(todayIso(), DAYS), []);

  // Drop chosen services the newly picked stylist doesn't do.
  useEffect(() => {
    // Keep the selection valid when the stylist changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds((cur) => cur.filter((id) => data.services.some((s) => s.id === id && staffDoes(s, staffId) && serviceFitsSize(s.name, pickedPet?.sizeBand))));
    setSlot(null);
  }, [staffId, data.services, pickedPet?.sizeBand]);

  const loadTimes = useCallback(async () => {
    if (!ids.length) return;
    setAvLoading(true);
    setAvError(false);
    try {
      const q = { serviceIds: ids, addOnIds, from: days[0]!, to: days[days.length - 1]! }; // phase-pro: P5 addOnIds
      const [mine, any] = await Promise.all([browserApi.public.bookingAvailability(shop.slug, { ...q, staffId: staffId ?? "any" }), staffId ? browserApi.public.bookingAvailability(shop.slug, { ...q, staffId: "any" }) : Promise.resolve(null)]);
      setAv(mine);
      setAnyAv(any);
      // Open on the first day that has a time.
      const first = mine.days.find((d) => d.times.length);
      if (first) setDay((cur) => (mine.days.find((d) => d.date === cur)?.times.length ? cur : first.date));
    } catch {
      setAvError(true);
    } finally {
      setAvLoading(false);
    }
  }, [ids, addOnIds, staffId, shop.slug, days]);

  useEffect(() => {
    if (step !== "time") return;
    // Fetch the times whenever the chosen services or stylist change while on this step.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTimes();
  }, [step, loadTimes]);

  // phase-pro: p2: the shop's working days in the strip, once per visit to this step (no waitlist: nothing changes).
  useEffect(() => {
    if (step !== "time" || workDays) return;
    void publicWaitlistEndpoints(browserClient).info(shop.slug, { from: days[0]!, to: days[days.length - 1]! }).then((r) => setWorkDays(r.open ? new Set(r.workDays) : new Set())).catch(() => setWorkDays(new Set()));
  }, [step, workDays, shop.slug, days]);

  const times = timesOn(av, day);
  const anyCount = staffId ? timesOn(anyAv, day).length : 0;
  const when = (iso: string) => date(iso, { weekday: "short", month: "short", day: "numeric" }) + ", " + time(iso);
  const endsAtOf = (s: Slot) => new Date(new Date(s.startsAt).getTime() + (av?.blockMin ?? sel.durationMin) * 60_000).toISOString();
  const shownStaff = slot ? (data.staff.find((s) => s.id === slot.staffId)?.name ?? staffName) : staffName;
  const servicesText = [...picked, ...pickedAddOns].map((s) => pick(s).name).join(", "); // phase-pro: P5 names the add-ons

  async function afterPay(id: string) {
    for (let i = 0; i < 12; i++) {
      try {
        const r = await browserApi.me.appointment(id);
        if (!r.appointment.pending) {
          setFinished(r.appointment);
          setStep("done");
          return;
        }
      } catch {
        // keep trying
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    setBanner({ tone: "info", text: t("bk.done.pending") });
  }

  async function submit() {
    if (!slot) return;
    // Signed in with no name on the account: ask for it now. A signed-out visitor may type it ahead of signing in; if they do not, we ask again once we know who they are.
    if (signedIn && needsName && !firstName.trim()) {
      setNameTried(true);
      return;
    }
    if (!signedIn) {
      pending.current = true;
      setWantsSignIn(true);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const r = await browserApi.me.bookAppointment({ serviceIds: ids, staffId, startsAt: slot.startsAt, notes: pharmacy ? null : notes.trim() || null, customerName: needsName ? firstName.trim() || null : null, petId: petId || null, addOnIds /* phase-pro: P5 */, intakeAnswer: !pharmacy && intakeQuestion ? intake.trim() || null : null, rebook: initial?.rebook ?? null /* phase-pro: p3 */ });
      setBooked(r);
      if (r.confirmed) {
        setFinished(r.appointment);
        setStep("done");
      } else setStep("pay");
      window.scrollTo?.({ top: 0 });
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        setBanner({ tone: "danger", text: t("bk.taken") });
        setSlot(null);
        void loadTimes();
      } else if (isApiError(e) && e.status === 402) setBanner({ tone: "info", text: t("bk.unavailable") });
      else setBanner({ tone: "danger", text: isApiError(e) && e.isNetwork ? t("rc.error.body") : errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  // Signed in just now: carry on with the booking they asked for.
  useEffect(() => {
    if (signedIn && pending.current) {
      pending.current = false;
      setWantsSignIn(false);
      void submit();
    }
    // submit is stable enough for this one-shot continuation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const policy = (
    <p className="rounded-card bg-bg-subtle p-4 text-body text-fg">
      {fee > 0 ? t("bk.policy.fee", { hours: data.policy.cancelWindowHours, fee: money(fee) }) : t("bk.policy.nofee", { hours: data.policy.cancelWindowHours })}
    </p>
  );
  const head = <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />;
  const back = (to: "services" | "addons" | "time", label = t("bk.back")) => (
    <button type="button" onClick={() => { setStep(to); setBanner(null); }} aria-label={label} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-fg hover:bg-bg-subtle focus-visible:focus-ring">
      <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
    </button>
  );

  if (!data.services.length)
    return (
      <div className="flex flex-col gap-6">
        {head}
        <Banner tone="info">{t("bk.noServices")}</Banner>
      </div>
    );

  // ---- done
  if (step === "done" && finished) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/shops/${shop.slug}/book/${finished.id}` : undefined;
    const download = () => {
      // A pharmacy visit goes into the calendar as a bare "Appointment": no service, shop, address or link (calendars sync and share).
      const ics = pharmacy
        ? buildIcs({ uid: finished.id, title: t("rx.ics.title"), startsAt: finished.startsAt, endsAt: finished.endsAt })
        : buildIcs({ uid: finished.id, title: `${finished.items.map((i) => i.name).join(", ")} · ${shop.name}`, startsAt: finished.startsAt, endsAt: finished.endsAt, location: finished.merchant.address, description: url, url });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      a.download = "appointment.ics";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    return (
      <div className="flex flex-col gap-6">
        {head}
        <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("bk.done.title")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("bk.done.title")}</Heading>
          <p className="text-body text-fg-muted">{t("bk.done.body", { services: finished.items.map((i) => i.name).join(", "), shop: shop.name, when: when(finished.startsAt).replace(/\s([ap])\.m\.$/i, (_, x: string) => ` ${x.toUpperCase()}M`) })}</p>
          {finished.staffName ? <p className="text-meta text-fg-muted">{finished.staffName}</p> : null}
          {finished.depositCents > 0 && finished.depositPaidAt ? <p className="text-meta text-positive-text">{t("bk.card.deposit", { amount: money(finished.depositCents) })}</p> : null}
          {/* The confirmation is where a home studio's address is first shown (it arrives only once the booking is confirmed). */}
          {finished.merchant.addressPrivate && finished.merchant.address ? (
            <p className="text-body text-fg" data-testid="booked-address">
              <span className="text-meta-strong">{t("bk.done.address")}: </span>
              <bdi>{finished.merchant.address}</bdi>
            </p>
          ) : null}
        </section>
        {!pharmacy ? <NextVisitCard appt={finished} showManage={false} /> : null}
        <ReminderCard text={finished.reminderText} />
        {/* phase-solo D: the free reminder channel for a client who booked on the web. */}
        <NotifyPrompt />
        <div className="flex flex-col gap-3">
          <Button size="lg" fullWidth onClick={download}>{t("bk.done.calendar")}</Button>
          <Button size="lg" variant="secondary" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}/book/${finished.id}`}>{t("bk.done.manage")}</Button>
          <Button size="lg" variant="ghost" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>
        </div>
      </div>
    );
  }

  // ---- pay (the 10-minute hold)
  if (step === "pay" && booked) {
    const a = booked.appointment;
    return (
      <div className="flex flex-col gap-6">
        {head}
        <div className="flex flex-col gap-2">
          <Heading>{t("bk.card.title")}</Heading>
          <p className="text-body text-fg-muted">{when(a.startsAt)}{a.staffName ? ` · ${a.staffName}` : ""}</p>
          {a.holdExpiresAt ? <p className="text-meta text-fg-muted">{t("bk.holding", { time: time(a.holdExpiresAt).replace(/\.$/, "") })}</p> : null}
        </div>
        {booked.deposit ? <BigNumber tone="accent" className="text-[32px]">{money(booked.deposit.amountCents)}</BigNumber> : null}
        {policy}
        {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
        {booked.deposit ? (
          <PaymentBox paymentIntentId={booked.deposit.paymentIntentId} clientSecret={booked.deposit.clientSecret} amountCents={booked.deposit.amountCents} label={t("bk.cta.deposit", { amount: money(booked.deposit.amountCents) })} onPaid={() => afterPay(a.id)} />
        ) : booked.setup ? (
          <SetupBox setupIntentId={booked.setup.setupIntentId} clientSecret={booked.setup.clientSecret} label={t("bk.cta.card")} onSaved={() => afterPay(a.id)} />
        ) : null}
      </div>
    );
  }

  // ---- phase-pro: P5 ---- "Add anything?": the add-ons as toggles, "+$10 · +15 min"
  if (step === "addons") {
    return (
      <div className="flex flex-col gap-5 pb-28">
        {head}
        <div className="flex flex-col gap-3">
          {back("services")}
          <Heading>{t("addon.book.title")}</Heading>
          <p className="text-body text-fg-muted">{t("addon.book.sub")}</p>
        </div>
        <ul className="divide-y divide-line border-y border-line" aria-label={t("addon.book.title")} data-testid="book-add-ons">
          {offeredAddOns.map((a) => {
            const on = addOnIds.includes(a.id);
            const p = pick(a);
            return (
              <li key={a.id}>
                <button type="button" role="switch" aria-checked={on} onClick={() => setAddOnIds((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))} className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:focus-ring">
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-fg">{p.name}</span>
                    {p.description ? <span className="block text-meta text-fg-muted">{p.description}</span> : null}
                    <span className="block text-meta tabular-nums text-fg-muted">{addOnPriceTime(t as never, money, dur, a)}</span>
                  </span>
                  <span aria-hidden className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-trade clear:bg-primary" : "bg-bg-muted")}>
                    <span className={cn("absolute top-0.5 size-6 rounded-full bg-bg shadow-card transition-all", on ? "start-5.5" : "start-0.5")} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-meta text-fg-muted">{t("bk.summary", { n: sel.count, duration: dur(sel.durationMin) })}{pickedAddOns.length ? ` · ${t("addon.book.count", { n: pickedAddOns.length })}` : ""}</p>
              {pharmacy ? null : <p className="text-title tabular-nums text-fg">{totalText(t as never, data, sel, money)}</p>}
            </div>
            {deposit > 0 ? <p className="text-meta text-fg-muted">{t("bk.depositHold", { amount: money(deposit) })}</p> : null}
          </div>
          <Button size="lg" fullWidth onClick={() => { setSlot(null); setStep("time"); window.scrollTo?.({ top: 0 }); }}>{t("bk.chooseTime")}</Button>
        </div>
      </div>
    );
  }
  // ---- end phase-pro: P5 ----

  // ---- time
  if (step === "time") {
    const label = deposit > 0 ? t("bk.cta.deposit", { amount: money(deposit) }) : needsCard ? t("bk.cta.card") : t("bk.cta.free");
    return (
      <div className="flex flex-col gap-5 pb-28">
        {head}
        <div className="flex flex-col gap-3">
          {back(offeredAddOns.length ? "addons" : "services") /* phase-pro: P5 */}
          <Heading>{t("bk.time.title")}</Heading>
          <p className="text-body text-fg-muted">{t("bk.time.sub", { services: servicesText, staff: staffName || t("bk.anyone").toLowerCase(), duration: dur(av?.blockMin ?? sel.durationMin) })}</p>
        </div>
        <div role="group" aria-label={t("bk.time.title")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const n = timesOn(av, d).length;
            const on = d === day;
            const full = !!av && n === 0 && !!workDays?.has(d); // phase-pro: p2: a full working day stays tappable (it opens the waitlist)
            return (
              <button key={d} type="button" aria-pressed={on} disabled={avLoading || (!!av && n === 0 && !full)} onClick={() => { setDay(d); setSlot(null); }} className={cn("flex h-[72px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-card border focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-card text-fg hover:bg-bg-subtle", !on && av && n === 0 && "text-fg-subtle")}>
                <span className="text-caption">{date(dayDate(d), { weekday: "short" }, "UTC")}</span>
                <span className="text-title tabular-nums">{date(dayDate(d), { day: "numeric" }, "UTC")}</span>
                {full ? <span className="text-caption leading-none">{t("wl.full")}</span> : null}
              </button>
            );
          })}
        </div>
        {avError ? <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void loadTimes()}>{t("rc.tryAgain")}</Button>}>{t("rc.error.body")}</Banner> : null}
        {avLoading && !av ? (
          <div className="flex flex-wrap gap-2" aria-busy>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-24 rounded-input" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3" aria-live="polite" aria-busy={avLoading}>
            <p className="text-meta-strong text-fg">{times.length ? t("bk.time.count", { day: date(dayDate(day), { weekday: "long" }, "UTC"), n: times.length, staff: staffName || t("bk.anyone") }) : t("bk.time.none", { day: date(dayDate(day), { weekday: "long" }, "UTC") })}</p>
            <div className="flex flex-wrap gap-2">
              {times.map((x) => (
                <button key={x.startsAt} type="button" aria-pressed={slot?.startsAt === x.startsAt} disabled={avLoading} onClick={() => setSlot(x)} className={cn("h-11 min-w-[88px] rounded-input border px-4 text-body tabular-nums focus-visible:focus-ring", slot?.startsAt === x.startsAt ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
                  {time(x.startsAt)}
                </button>
              ))}
            </div>
            {/* ---- phase-pro: p2 ---- "Full. Tell me if a spot opens" */}
            {workDays?.size && !pharmacy && ids.length ? (
              times.length === 0 && workDays.has(day) ? (
                <div className="flex flex-col items-start gap-3 rounded-card bg-bg-subtle p-4" data-testid="wl-full">
                  <p className="text-body-strong text-fg">{t("wl.book.full", { day: date(dayDate(day), { weekday: "long" }, "UTC") })}</p>
                  <Button variant="secondary" onClick={() => setWaitSheet(true)}>{t("wl.book.cta")}</Button>
                </div>
              ) : times.length > 0 ? (
                <button type="button" onClick={() => setWaitSheet(true)} className="min-h-11 self-start text-start text-meta text-fg underline underline-offset-2 focus-visible:focus-ring">{t("wl.book.other")}</button>
              ) : null
            ) : null}
            {waitSheet ? <WaitlistSheet open onClose={() => setWaitSheet(false)} shop={{ slug: shop.slug, name: shop.name }} serviceId={ids[0]!} serviceName={picked[0] ? pick(picked[0]).name : ""} staffId={staffId} day={day} full={times.length === 0} signedIn={signedIn} needsName={needsName} /> : null}
            {/* ---- end phase-pro: p2 ---- */}
            {staffId && anyCount > 0 ? (
              <p className="text-meta text-fg-muted">
                {t("bk.time.anyHas", { n: anyCount, day: date(dayDate(day), { weekday: "long" }, "UTC") })}{" "}
                <button type="button" className="text-fg underline underline-offset-2" onClick={() => { setStaffId(null); }}>{t("bk.time.seeThem")}</button>
              </p>
            ) : null}
          </div>
        )}
        {policy}
        {needsCard ? (
          <div className="flex items-center gap-3 rounded-card border border-line p-4">
            <CreditCard aria-hidden className="size-5 shrink-0 text-fg" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-fg">{t("bk.card.title")}</p>
              <p className="text-meta text-fg-muted">{deposit > 0 ? t("bk.card.deposit", { amount: money(deposit) }) : t("bk.card.setup")}</p>
            </div>
            <button type="button" disabled={!slot || busy} onClick={submit} className="text-body-strong text-fg focus-visible:focus-ring disabled:text-fg-subtle">{t("bk.card.add")}</button>
          </div>
        ) : null}
        {needsName && !pharmacy ? (
          <TextField label={t("bk.name")} hint={t("bk.nameHint", { shop: shop.name })} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" error={nameTried && signedIn && !firstName.trim() ? t("bk.nameRequired") : undefined} />
        ) : null}
        {pharmacy ? (
          <div className="rounded-card bg-bg-subtle p-4" data-testid="pharmacy-privacy">
            <p className="text-body-strong text-fg">{t("rx.book.privacyTitle")}</p>
            <p className="mt-1 text-meta text-fg-muted">{t("rx.book.privacyBody")}</p>
          </div>
        ) : (
          <>
          {intakeQuestion ? (
            <label className="flex flex-col gap-1.5" data-testid="intake">
              <span className="text-meta-strong text-fg">{t("bk.intake.label", { shop: shop.name })}</span>
              <span className="text-meta text-fg-muted">{intakeQuestion}</span>
              <textarea value={intake} onChange={(e) => setIntake(e.target.value)} rows={2} maxLength={500} placeholder={t("bk.intake.placeholder")} className="rounded-input border border-line bg-bg px-3 py-2 text-body text-fg focus-visible:focus-ring" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-meta-strong text-fg">{t("bk.notes")}</span>
            <textarea ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={400} className="rounded-input border border-line bg-bg px-3 py-2 text-body text-fg focus-visible:focus-ring" />
          </label>
          </>
        )}
        {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
        {wantsSignIn && !signedIn ? <PhoneSignIn heading="h2" devAutofill={devAutofill} title={t("bk.cta.signIn")} intro={t("bk.signIn.hint")} /> : null}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
          <p className="text-meta text-fg-muted">{slot ? `${when(slot.startsAt)} – ${time(endsAtOf(slot))}${shownStaff ? ` · ${shownStaff}` : ""}` : t("bk.chooseTime")}</p>
          <Button size="lg" fullWidth loading={busy} disabled={!slot} onClick={submit}>{signedIn || !slot ? label : t("bk.cta.signIn")}</Button>
        </div>
      </div>
    );
  }

  // ---- services
  return (
    <div className="flex flex-col gap-5 pb-28">
      {head}
      <div className="flex flex-col gap-2">
        <Heading>{t(pharmacy ? "rx.book.title" : "bk.title")}</Heading>
        <p className="text-body text-fg-muted">{data.shop.addressVisibility && data.shop.addressVisibility !== "exact" ? t("bk.introPrivate", { shop: shop.name }) : t("bk.intro", { shop: [shop.name, data.shop.address].filter(Boolean).join(", ") })}</p>
        {/* A home studio or a pro who travels: the area, never the street, until the booking is confirmed (phase-solo B). */}
        {privateAddress ? (
          <p className="text-meta text-fg-muted" data-testid="booking-privacy">
            {data.shop.areaLabel ? t("bk.privacy.home", { area: data.shop.areaLabel }) : t("bk.privacy.city", { city: data.shop.city ?? data.shop.placeLine ?? "" })}
          </p>
        ) : null}
      </div>
      <div role="radiogroup" aria-label={t("bk.anyone")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ id: null as string | null, name: t("bk.anyone"), initials: "Any" }, ...data.staff].map((s) => {
          const on = s.id === staffId;
          return (
            <button key={s.id ?? "any"} type="button" role="radio" aria-checked={on} onClick={() => setStaffId(s.id)} className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border ps-1.5 pe-4 text-body focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
              <span aria-hidden className={cn("flex size-8 items-center justify-center rounded-full text-[11px] font-semibold", on ? "bg-bg text-fg" : "bg-bg-muted text-fg")}>{s.initials}</span>
              <bdi>{s.name}</bdi>
            </button>
          );
        })}
      </div>
      {petShop && signedIn ? (
        <div className="flex flex-col gap-2">
          <p className="text-meta-strong text-fg">{t("bk.pet.title")}</p>
          <div role="radiogroup" aria-label={t("bk.pet.title")} className="flex flex-wrap gap-2">
            {myPets.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={petId === p.id} onClick={() => setPetId(p.id)} className={cn("h-10 rounded-full border px-4 text-body focus-visible:focus-ring", petId === p.id ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
                <bdi>{p.name}</bdi>
              </button>
            ))}
            <a href={`/me/pets?next=${encodeURIComponent(`/shops/${shop.slug}/book`)}`} className="inline-flex h-10 items-center rounded-full border border-dashed border-line-strong px-4 text-body text-fg focus-visible:focus-ring">+ {t("bk.pet.add")}</a>
          </div>
          {pickedPet ? <p className="text-meta text-fg-muted">{t("bk.pet.sizeNote", { pet: pickedPet.name })}</p> : null}
        </div>
      ) : null}
      {categories.length > 1 ? (
        <div role="radiogroup" aria-label={t("bk.all")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["all", ...categories].map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={cn("h-9 shrink-0 rounded-full border px-4 text-meta-strong focus-visible:focus-ring", category === c ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
              {c === "all" ? t("bk.all") : c}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-line border-y border-line" aria-label={t("bk.title")}>
        {groupServices(visible).flatMap((g) => g.items).map((s) => {
          const on = ids.includes(s.id);
          const v = serviceFor(s, staffId);
          const p = pick(s);
          return (
            <li key={s.id}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => setIds((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} className="flex min-h-[64px] w-full items-center gap-3 py-3 text-start focus-visible:focus-ring">
                <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border", on ? "border-trade bg-trade text-trade-foreground clear:border-primary clear:bg-primary clear:text-primary-foreground" : "border-line-strong")}>{on ? <CircleCheck className="size-5" strokeWidth={2} /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-fg">{p.name}</span>
                  <span className="block text-meta text-fg-muted">{staffName ? t("bk.withStaff", { duration: dur(v.durationMin), staff: staffName }) : dur(v.durationMin)}{s.depositCents > 0 && takesCards ? ` · ${t("bk.depositHold", { amount: money(s.depositCents) })}` : ""}</span>
                </span>
                <span className="shrink-0 text-headline tabular-nums text-fg">{pharmacy ? <span className="text-meta font-normal text-fg-muted">{t("rx.book.noCharge")}</span> : s.priceFrom ? <span className="text-body font-normal">{t("bk.from", { price: money(v.priceCents) })}</span> : money(v.priceCents)}</span>
              </button>
            </li>
          );
        })}
        {pharmacy || (data.shop.vertical && data.shop.vertical !== "salon") ? null : <li>
          <a href={shop.phone ? `tel:${shop.phone}` : `/shops/${encodeURIComponent(shop.slug)}`} className="flex min-h-[64px] items-center gap-3 py-3 focus-visible:focus-ring">
            <span aria-hidden className="size-7 shrink-0 rounded-full border border-line-strong" />
            <span className="min-w-0 flex-1">
              <span className="block text-body-strong text-fg">{t("bk.bridal.title")}</span>
              <span className="block text-meta text-fg-muted">{t("bk.bridal.body")}</span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted rtl:rotate-180" strokeWidth={1.75} />
          </a>
        </li>}
      </ul>
      {!visible.length ? <Banner tone="info">{t("bk.noServices")}</Banner> : null}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
        {ids.length ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-meta text-fg-muted">{t("bk.summary", { n: sel.count, duration: dur(sel.durationMin) })}</p>
              {pharmacy ? null : <p className="text-title tabular-nums text-fg">{totalText(t as never, data, sel, money)}</p>}
            </div>
            {deposit > 0 ? <p className="text-meta text-fg-muted">{t("bk.depositHold", { amount: money(deposit) })}</p> : null}
          </div>
        ) : null}
        <Button size="lg" fullWidth disabled={!ids.length} onClick={() => { setStep(offeredAddOns.length ? "addons" : "time"); window.scrollTo?.({ top: 0 }); }}>{t(offeredAddOns.length ? "addon.book.next" : "bk.chooseTime") /* phase-pro: P5 */}</Button>
      </div>
    </div>
  );
}
