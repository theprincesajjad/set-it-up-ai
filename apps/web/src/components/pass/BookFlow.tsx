"use client";
import { useHydratedValue } from "@/lib/useHydratedValue";
import { ChevronLeft, ChevronRight, CircleCheck, CreditCard, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appointmentsApi as apptApi, serviceFitsSize, unitWord, type appointmentsApi, type petApi } from "@ll/shared";
import { ShopWalletCard } from "./ShopWalletCard";
import { Reveal } from "./Reveal";
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
import { StepProgress } from "@/components/ui/StepProgress";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { formatE164 } from "@/lib/phone";
import { isApiError } from "@/lib/api/errors";
import { useErrorText } from "@/lib/api/useErrorText";
import { buildIcs, dayPart, DAY_PARTS, durationText, groupServices, nextDays, serviceFor, staffDoes, summarize, timesOn, totalText } from "@/lib/booking";
import { cn } from "@/lib/cn";
import { addOnPriceTime } from "@/lib/dashboard/add-ons"; // phase-pro: P5
import { addDays, dayDate, todayIso } from "@/lib/restaurant/util";
import { DateStrip } from "./DateStrip";
import { queryOf, readBookChoice, writeBookChoice, type BookQuery } from "./bookState";

type Data = appointmentsApi.PublicServicesResponse;
type Slot = { startsAt: string; staffId: string };
type Booked = appointmentsApi.CreateMyAppointmentResponse;

const DAYS = 14;
type Step = "services" | "addons" | "time" | "details" | "pay" | "done";
/** What is typed on the details step, kept for this tab so a refresh does not lose it (never in the address). */
type Draft = { notes?: string; firstName?: string; intake?: string };

/** How many steps back this history entry has that the flow itself pushed (0: the entry the page was opened or reloaded on). */
const pushedDepth = () => Number((window.history.state as { llBook?: number } | null)?.llBook) || 0;

/** The offered time this customer is already holding, if the times in hand include it. */
function heldIn(av: appointmentsApi.AvailabilityResponse | null) {
  for (const h of av?.held ?? [])
    for (const d of av!.days) {
      const x = d.times.find((x) => x.startsAt === h.startsAt);
      if (x) return { ...x, date: d.date, appointmentId: h.appointmentId, holdExpiresAt: h.holdExpiresAt };
    }
  return null;
}

/**
 * /shops/<slug>/book: pick a stylist and services (Figma M1), pick a time with the policy in plain words and the
 * card or deposit row (M2), pay the deposit or save a card, then a confirmation with a calendar file.
 * The bridal row is a quote, not a slot.
 */
export function BookFlow({ shop, data, signedIn, devAutofill, initial, meName }: { shop: { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null; terminology?: string }; data: Data; signedIn: boolean; devAutofill?: boolean; initial?: BookQuery & { pet?: string; rebook?: string }; meName?: string | null }) {
  const errText = useErrorText();
  const f = useFmt();
  const { t, money, date, time, pick } = f;
  const dur = (min: number) => durationText(t as never, min);
  // wave-p: "details" is its own step (who is coming, the note, the policy and sign-in), so the time step is only the time.
  // The address carries the step and the choices (bookState.ts): a refresh or the device Back button lands where they were.
  const [boot] = useState(() => readBookChoice(initial ?? {}, data));
  const [step, setStep] = useState<Step>(boot.step); // phase-pro: P5 "addons"
  // A one-person shop (a solo nail tech) has nobody to choose between: book with her, and skip the "Anyone" picker.
  const solo = data.staff.length === 1;
  const soloId = solo ? data.staff[0]!.id : null;
  const [staffId, setStaffId] = useState<string | null>(boot.staffId ?? soloId);
  const [category, setCategory] = useState<string>("all");
  const [ids, setIds] = useState<string[]>(boot.ids);
  const [day, setDay] = useState<string>(() => (boot.day && boot.day >= todayIso() ? boot.day : todayIso()));
  const [slot, setSlot] = useState<Slot | null>(boot.slot);
  // The unpaid booking the card step is for (in the address, so a refresh on that step finds it again).
  const [holdId, setHoldId] = useState<string | null>(boot.hold);
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
  // After booking: is this customer in the shop's rewards yet? (A first booking makes a customer, not a member.) null = not known yet.
  const [member, setMember] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const bookedRef = useRef<HTMLElement>(null);
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const pending = useRef(false);
  // A second tap in the same frame lands before `busy` has rendered: this stops it there.
  const submitting = useRef(false);
  const signInRef = useRef<HTMLDivElement>(null);
  // wave-p: the sign-in box replaces the button, so bring it into view (the phone field takes focus by itself).
  useEffect(() => {
    if (wantsSignIn) signInRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [wantsSignIn]);
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
  const [addOnIds, setAddOnIds] = useState<string[]>(boot.addOnIds);
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
  // wave-q: the strip shows two weeks from today; "More dates" (DateStrip's calendar) moves the window to a later day.
  const [fromDay, setFromDay] = useState<string>(() => (boot.day && boot.day > addDays(todayIso(), DAYS - 1) ? boot.day : todayIso()));
  const days = useMemo(() => nextDays(fromDay, DAYS), [fromDay]);

  const servicesKey = data.services.map((s) => s.id).join(",");
  const choiceKey = `${staffId}|${servicesKey}|${pickedPet?.sizeBand ?? ""}|${ids.join(",")}|${addOnIds.join(",")}`;
  const lastChoiceKey = useRef(choiceKey);
  // Drop chosen services the newly picked stylist doesn't do.
  useEffect(() => {
    // Keep the selection valid when the stylist changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds((cur) => (cur.every((id) => data.services.some((s) => s.id === id && staffDoes(s, staffId) && serviceFitsSize(s.name, pickedPet?.sizeBand))) ? cur : cur.filter((id) => data.services.some((s) => s.id === id && staffDoes(s, staffId) && serviceFitsSize(s.name, pickedPet?.sizeBand)))));
    // Only a real change drops the chosen time: on the first run the time is the one the address restored.
    if (lastChoiceKey.current === choiceKey) return;
    lastChoiceKey.current = choiceKey;
    setSlot(null);
    // wave-p: keyed on the service ids, not the array: signing in refreshes the page props, and a new array must not drop the chosen time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey]);

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

  // The time they are already holding (they left the card step, refreshed, or picked up another phone): shown as theirs, never hidden.
  const held = heldIn(av);
  const heldShown = useRef<string | null>(null);
  useEffect(() => {
    const h = heldIn(av);
    if (!h || heldShown.current === h.appointmentId) return;
    heldShown.current = h.appointmentId;
    // With no time chosen yet, it comes back chosen, on its day.
    if (slot) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(h.date);
    setSlot({ startsAt: h.startsAt, staffId: h.staffId });
  }, [av, slot]);

  // A restored time that is no longer offered (someone took it) is dropped as soon as the times are in, not at the last tap.
  useEffect(() => {
    if (step !== "time" || !av || avLoading || !slot) return;
    const d = av.days.find((x) => x.date === day);
    if (!d) return;
    const x = d.times.find((x) => x.startsAt === slot.startsAt);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!x) setSlot(null);
    else if (x.staffId !== slot.staffId) setSlot(x);
  }, [step, av, avLoading, slot, day]);

  // ---- the address follows the step and the choices; Back and Forward put them back.
  const nav = useRef<"push" | "replace">("replace");
  /** Once booked: the confirmation's own address. */
  const doneRef = useRef<string | null>(null);
  /** A step the customer moved forward to gets its own history entry, so the device Back button returns to the step before. */
  const forward = (to: Step) => {
    nav.current = "push";
    setBanner(null);
    setStep(to);
    window.scrollTo?.({ top: 0 });
  };
  /** Somewhere the flow sends them (a taken time, a hold that ended): the same history entry, never a new one. */
  const send = (to: Step) => {
    nav.current = "replace";
    setStep(to);
  };
  /** The on-page back arrow: the history entry we pushed for this step if there is one, else the same entry one step earlier. */
  const goBack = (to: Step) => {
    setBanner(null);
    if (pushedDepth()) window.history.back();
    else send(to);
  };
  /** Put the choices an address carries on screen (Back, Forward, or an address that moved before the page could hear it). */
  const follow = (c: ReturnType<typeof readBookChoice>) => {
    nav.current = "replace";
    setBanner(null);
    setWantsSignIn(false);
    setIds(c.ids);
    setStaffId(c.staffId ?? soloId);
    setAddOnIds(c.addOnIds);
    if (c.day) setDay(c.day);
    setSlot(c.slot);
    if (c.hold) setHoldId(c.hold);
    setStep(c.step);
  };
  const heardAddress = useRef(false);
  const staleChoice = useRef<string | null>(null);
  useEffect(() => {
    if (step === "done") return; // the confirmation has its own address (rememberBooked)
    const mode = nav.current;
    nav.current = "replace";
    try {
      const mine = { step, ids, staffId, addOnIds, day, slot, hold: holdId };
      if (!heardAddress.current) {
        heardAddress.current = true;
        // Back or Forward pressed before the page was interactive: the address moved and nothing heard it. Follow it, never overwrite it.
        const there = readBookChoice(queryOf(window.location.search), data);
        // (Compared by step and time only: a book-again link preselects a service the address does not carry.)
        if (JSON.stringify([there.step, there.slot, there.hold]) !== JSON.stringify([boot.step, boot.slot, boot.hold])) {
          staleChoice.current = JSON.stringify(mine);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          follow(there);
          return;
        }
      }
      // Until the choices from that address are on screen, the ones from the first render are not written back.
      if (staleChoice.current) {
        if (staleChoice.current === JSON.stringify(mine)) return;
        staleChoice.current = null;
      }
      const search = writeBookChoice(window.location.search, mine, { solo });
      if (search === window.location.search) return;
      const url = `${window.location.pathname}${search}`;
      // Only our own key goes in: handing Next its own history state back makes it treat the call as its own and keep the old address,
      // which the next router.refresh() (signing in) would then put back.
      const depth = pushedDepth();
      if (mode === "push") window.history.pushState({ llBook: depth + 1 }, "", url);
      else window.history.replaceState(depth ? { llBook: depth } : null, "", url);
    } catch {
      /* no history API: the flow still works, it just cannot be restored */
    }
    // `follow`, `boot` and `data` do not change what is written; the choices do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ids, staffId, addOnIds, day, slot, holdId, solo]);
  useEffect(() => {
    const onPop = () => {
      const inFlow = /\/book\/?$/.test(window.location.pathname);
      if (doneRef.current) {
        // Booked: the steps behind the confirmation are over. Each one becomes the booking's own address and Back carries on, out of the
        // flow, instead of offering the same booking again. With nothing further back, the confirmation stays up.
        if (!inFlow) return;
        window.history.replaceState(null, "", doneRef.current);
        window.history.back();
        return;
      }
      if (!inFlow) return;
      follow(readBookChoice(queryOf(window.location.search), data));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // data and soloId are the page's own props: they do not change while the flow is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- what they typed on the details step survives a refresh (this tab only, cleared once booked).
  const draftKey = `ll.book.${shop.slug}`;
  const [draftRead, setDraftRead] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(window.sessionStorage.getItem(draftKey) ?? "null") as Draft | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (d?.notes) setNotes((cur) => cur || d.notes!);
      if (d?.firstName) setFirstName((cur) => cur || d.firstName!);
      if (d?.intake) setIntake((cur) => cur || d.intake!);
    } catch {
      /* private mode or blocked storage: nothing to restore */
    }
    setDraftRead(true);
  }, [draftKey]);
  useEffect(() => {
    if (!draftRead || step === "done") return;
    try {
      const d: Draft = { notes: notes || undefined, firstName: firstName || undefined, intake: intake || undefined };
      if (d.notes || d.firstName || d.intake) window.sessionStorage.setItem(draftKey, JSON.stringify(d));
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      /* storage blocked */
    }
  }, [draftRead, draftKey, step, notes, firstName, intake]);

  const times = timesOn(av, day);
  const heldText = held ? t("bk.holding", { time: time(held.holdExpiresAt).replace(/\.$/, "") }) : "";
  const anyCount = staffId ? timesOn(anyAv, day).length : 0;
  const when = (iso: string) => date(iso, { weekday: "short", month: "short", day: "numeric" }) + ", " + time(iso);
  const endsAtOf = (s: Slot) => new Date(new Date(s.startsAt).getTime() + (av?.blockMin ?? sel.durationMin) * 60_000).toISOString();
  const shownStaff = slot ? (data.staff.find((s) => s.id === slot.staffId)?.name ?? staffName) : staffName;
  const servicesText = [...picked, ...pickedAddOns].map((s) => pick(s).name).join(", "); // phase-pro: P5 names the add-ons

  /** The confirmation lives at the booking's own address: a refresh (or Back) lands on it, never on a blank "Step 1 of 3" that invites a second booking. */
  function rememberBooked(id: string) {
    try {
      window.sessionStorage.removeItem(draftKey);
    } catch {
      /* storage blocked */
    }
    try {
      const lang = new URLSearchParams(window.location.search).get("lang");
      const url = `/shops/${encodeURIComponent(shop.slug)}/book/${encodeURIComponent(id)}?booked=1${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`;
      doneRef.current = url;
      window.history.replaceState(null, "", url);
    } catch {
      /* no history API: the confirmation still shows */
    }
  }

  // The confirmation is announced and focused when it opens (the page had no heading to land on).
  useEffect(() => {
    if (step !== "done") return;
    bookedRef.current?.focus({ preventScroll: true });
    if (!finished) return;
    let alive = true;
    browserApi.me
      .memberships()
      .then((r) => alive && setMember(r.items.some((m) => m.merchant.id === finished.merchant.id)))
      .catch(() => alive && setMember(null));
    return () => {
      alive = false;
    };
  }, [step, finished]);

  async function joinShop(merchantId: string) {
    setJoining(true);
    setJoinError(null);
    try {
      await browserApi.me.join({ merchantId });
      setMember(true);
    } catch (e) {
      setJoinError(errText(e));
    } finally {
      setJoining(false);
    }
  }

  async function afterPay(id: string) {
    for (let i = 0; i < 12; i++) {
      try {
        const r = await browserApi.me.appointment(id);
        if (!r.appointment.pending) {
          setFinished(r.appointment);
          send("done");
          rememberBooked(r.appointment.id);
          return;
        }
      } catch {
        // keep trying
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    setBanner({ tone: "info", text: t("bk.done.pending") });
  }

  /** The hold is gone (ten minutes passed, or it was replaced on another phone): back to the times, with their choices kept. */
  const holdEnded = useCallback(() => {
    setBooked(null);
    setHoldId(null);
    setBanner({ tone: "info", text: t("cust.bk.holdEnded") });
    nav.current = "replace";
    setStep("time");
  }, [t]);
  /** Where a held booking stands now: still waiting on the card, confirmed, or gone. */
  const checkHold = useCallback(
    async (id: string) => {
      try {
        const r = await browserApi.me.appointment(id);
        const a = r.appointment;
        if (a.status === "booked" && !a.pending) {
          setFinished(a);
          nav.current = "replace";
          setStep("done");
          rememberBooked(a.id);
        } else if (a.status === "booked" && a.pending && (r.deposit || r.setup)) setBooked({ appointment: a, deposit: r.deposit, setup: r.setup, confirmed: false });
        else holdEnded();
      } catch (e) {
        // No signal: keep the step and say so. Anything else (not theirs, not found, signed out): the hold is not there to pay.
        if (isApiError(e) && e.isNetwork) setBanner({ tone: "danger", text: t("rc.error.body") });
        else holdEnded();
      }
    },
    // rememberBooked only reads the shop and the address
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holdEnded, t],
  );
  // A refresh (or Forward) on the card step: fetch the hold again instead of starting over.
  const bookedId = booked?.appointment.id ?? null;
  useEffect(() => {
    if (step !== "pay" || !holdId || bookedId === holdId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkHold(holdId);
  }, [step, holdId, bookedId, checkHold]);
  // The ten minutes ran out while the card step was open.
  const holdUntil = step === "pay" ? (booked?.appointment.holdExpiresAt ?? null) : null;
  useEffect(() => {
    if (!holdUntil || !bookedId) return;
    const id = window.setTimeout(() => void checkHold(bookedId), Math.max(0, new Date(holdUntil).getTime() - Date.now()) + 1500);
    return () => window.clearTimeout(id);
  }, [holdUntil, bookedId, checkHold]);

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
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setBanner(null);
    try {
      const r = await browserApi.me.bookAppointment({ serviceIds: ids, staffId, startsAt: slot.startsAt, notes: pharmacy ? null : notes.trim() || null, customerName: needsName ? firstName.trim() || null : null, petId: petId || null, addOnIds /* phase-pro: P5 */, intakeAnswer: !pharmacy && intakeQuestion ? intake.trim() || null : null, rebook: initial?.rebook ?? null /* phase-pro: p3 */, replaces: booked?.appointment.id ?? holdId ?? held?.appointmentId ?? null /* the hold this choice takes the place of */ });
      setBooked(r);
      if (r.confirmed) {
        setFinished(r.appointment);
        send("done");
        rememberBooked(r.appointment.id);
        window.scrollTo?.({ top: 0 });
      } else {
        setHoldId(r.appointment.id);
        forward("pay");
      }
    } catch (e) {
      if (isApiError(e) && e.status === 409) {
        setBanner({ tone: "danger", text: t("bk.taken") });
        setSlot(null);
        send("time");
        void loadTimes();
      } else if (isApiError(e) && e.status === 402) setBanner({ tone: "info", text: t("bk.unavailable") });
      else setBanner({ tone: "danger", text: isApiError(e) && e.isNetwork ? t("rc.error.body") : errText(e) });
    } finally {
      submitting.current = false;
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
  // wave-q: where you are in the booking, in the shop's colour (services, add-ons when offered, time, check and book).
  const totalSteps = offeredAddOns.length ? 4 : 3;
  const progress = (n: number) => (
    <div className="flex items-center gap-3">
      <StepProgress step={n} total={totalSteps} label={t("cust.join.step", { n, total: totalSteps })} className="min-w-0 flex-1" />
      <span aria-hidden className="shrink-0 text-caption tabular-nums text-fg-muted">{t("cust.join.step", { n, total: totalSteps })}</span>
    </div>
  );
  const back = (to: "services" | "addons" | "time" | "details", label = t("bk.back")) => (
    <button type="button" onClick={() => goBack(to)} aria-label={label} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-fg hover:bg-bg-subtle focus-visible:focus-ring press">
      <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
    </button>
  );

  if (!data.services.length)
    return (
      <div className="flex flex-col gap-6">
        {head}
        <h1 className="text-title text-fg">{t("bk.noOnline", { shop: shop.name })}</h1>
        {shop.phone ? <p className="text-body text-fg">{t("bk.noOnlineCall", { shop: shop.name, phone: formatE164(shop.phone) || shop.phone })}</p> : null}
        <div className="flex flex-col gap-2">
          {shop.phone ? <Button variant="primary" fullWidth href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shop.name })}</Button> : null}
          <Button variant="secondary" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>
        </div>
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
        {/* The confirmation in the shop's colour (lib/shopColor.ts): text on it is the computed --trade-pass-text. */}
        <section ref={bookedRef} tabIndex={-1} data-testid="booked-card" data-brand-card="" className="flex flex-col gap-3 rounded-[28px] bg-trade p-5 text-trade-pass-text shadow-card outline-none clear:rounded-r8 [&_h1]:!text-current" aria-label={t("bk.done.title")}>
          <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-trade-pass-text text-trade-pass-from motion-safe:animate-stamp-pop">
            <CircleCheck className="size-6" strokeWidth={2} />
          </span>
          <Heading level={1}>{t("bk.done.title")}</Heading>
          {/* wave-p: one sentence; the when, where and with whom are on the next-visit card right under this (never twice). */}
          <p className="text-body">{t("cust.bk.done.sub")}</p>
          {finished.depositCents > 0 && finished.depositPaidAt ? <p className="text-meta-strong">{t("bk.card.deposit", { amount: money(finished.depositCents) })}</p> : null}
          {/* The confirmation is where a home studio's address is first shown (it arrives only once the booking is confirmed). */}
          {finished.merchant.addressPrivate && finished.merchant.address ? (
            <p className="text-body" data-testid="booked-address">
              <span className="text-meta-strong">{t("bk.done.address")}: </span>
              <bdi>{finished.merchant.address}</bdi>
            </p>
          ) : null}
        </section>
        {/* wave-q: what follows rises in under the confirmation, one card after the other (kit BlurFade, lazy; static under reduced motion). */}
        {!pharmacy ? <Reveal delay={0.1}><NextVisitCard appt={finished} showManage={false} /></Reveal> : null}
        {/* The shop's wallet card, with this visit on it (pharmacies keep visits off the card). */}
        {member === false && !pharmacy ? (
          <Reveal delay={0.2}>
            <section aria-label={t("auth.join.joinShop", { shop: shop.name })} data-testid="join-after-booking" className="flex flex-col gap-3 rounded-sheet bg-trade-soft p-5">
              <h2 className="text-body-strong text-fg">{t("auth.join.joinShop", { shop: shop.name })}</h2>
              <p className="text-meta text-fg-muted">{t("cust.bk.joinBody", { unit: unitWord(f.locale, shop.terminology ?? "points") })}</p>
              {joinError ? <Banner tone="danger">{joinError}</Banner> : null}
              <Button size="lg" variant="shop" fullWidth loading={joining} onClick={() => void joinShop(finished.merchant.id)}>{t("auth.join.joinShop", { shop: shop.name })}</Button>
            </section>
          </Reveal>
        ) : (
          <Reveal delay={0.2}><ShopWalletCard merchantId={finished.merchant.id} shopName={shop.name} slug={shop.slug} terminology={shop.terminology} className="rounded-sheet bg-trade-soft p-5" /></Reveal>
        )}
        <ReminderCard text={finished.reminderText} />
        {/* phase-solo D: the free reminder channel for a client who booked on the web. */}
        <NotifyPrompt />
        <div className="flex flex-col gap-3">
          <Button size="lg" variant="shop" fullWidth onClick={download}>{t("bk.done.calendar")}</Button>
          <Button size="lg" variant="secondary" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}/book/${finished.id}`}>{t("bk.done.manage")}</Button>
          <Button size="lg" variant="ghost" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>{t("rc.backToShop", { shop: shop.name })}</Button>
        </div>
      </div>
    );
  }

  // ---- pay (the 10-minute hold)
  if (step === "pay" && !booked) {
    // A refresh on the card step: the hold is being fetched (checkHold).
    return (
      <div className="flex flex-col gap-6" aria-busy data-testid="book-pay-loading">
        {head}
        <div className="flex flex-col gap-3">
          {back("details")}
          <Heading>{t("bk.card.title")}</Heading>
          <Skeleton className="h-5 w-48" />
        </div>
        {banner ? <Banner tone={banner.tone} action={holdId ? <Button size="sm" variant="secondary" onClick={() => { setBanner(null); void checkHold(holdId); }}>{t("rc.tryAgain")}</Button> : undefined}>{banner.text}</Banner> : <Skeleton className="h-40 w-full rounded-card" />}
      </div>
    );
  }
  if (step === "pay" && booked) {
    const a = booked.appointment;
    return (
      <div className="flex flex-col gap-6">
        {head}
        <div className="flex flex-col gap-3">
          {back("details")}
          <Heading>{t("bk.card.title")}</Heading>
          <p className="text-body text-fg-muted">{when(a.startsAt)}{a.staffName ? ` · ${a.staffName}` : ""}</p>
          {a.holdExpiresAt ? <p className="text-meta text-fg-muted" data-testid="book-holding">{t("bk.holding", { time: time(a.holdExpiresAt).replace(/\.$/, "") })}</p> : null}
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
        {progress(2)}
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
                <button type="button" role="switch" aria-checked={on} onClick={() => setAddOnIds((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))} className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:focus-ring press-soft">
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
          <Button size="lg" variant="shop" fullWidth onClick={() => forward("time")}>{t("bk.chooseTime")}</Button>
        </div>
      </div>
    );
  }
  // ---- end phase-pro: P5 ----

  // ---- time
  if (step === "time" || (step === "details" && !slot)) {
    // wave-p: 40-odd times in one grid is a wall; split by part of the day like Fresha and Booksy do.
    const parts = DAY_PARTS.map((part) => ({ part, items: times.filter((x) => dayPart(x.startsAt) === part) })).filter((g) => g.items.length);
    return (
      <div className="flex flex-col gap-5 pb-28">
        {head}
        {progress(offeredAddOns.length ? 3 : 2)}
        <div className="flex flex-col gap-3">
          {back(offeredAddOns.length ? "addons" : "services") /* phase-pro: P5 */}
          <Heading>{t("bk.time.title")}</Heading>
          <p className="text-body text-fg-muted">{t("bk.time.sub", { services: servicesText, staff: staffName || t("bk.anyStaffWith"), duration: dur(av?.blockMin ?? sel.durationMin) })}</p>
        </div>
        <DateStrip
          days={days}
          day={day}
          label={t("bk.time.title")}
          onSelect={(d) => { setDay(d); setSlot(null); }}
          // phase-pro: p2: a full working day stays tappable (it opens the waitlist)
          state={(d) => { const n = timesOn(av, d).length; const full = !!av && n === 0 && !!workDays?.has(d); return { count: av ? n : null, full, disabled: avLoading || (!!av && n === 0 && !full) }; }}
          onPickLater={(d) => { const inWindow = d >= todayIso() && d <= addDays(todayIso(), DAYS - 1); setFromDay(inWindow ? todayIso() : d); setWorkDays(null); setDay(d); setSlot(null); }}
        />
        {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
        {avError ? <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void loadTimes()}>{t("rc.tryAgain")}</Button>}>{t("rc.error.body")}</Banner> : null}
        {avLoading && !av ? (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-input" />)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4" aria-live="polite" aria-busy={avLoading}>
            <p className="text-meta-strong text-fg">{times.length ? t("bk.time.count", { day: date(dayDate(day), { weekday: "long" }, "UTC"), n: times.length, staff: staffName || t("bk.anyStaffWith") }) : t("bk.time.none", { day: date(dayDate(day), { weekday: "long" }, "UTC") })}</p>
            {parts.map(({ part, items }) => (
              <div key={part} className="flex flex-col gap-2" data-testid={`times-${part}`}>
                <p className="text-caption uppercase tracking-[0.06em] text-fg-muted">{t(`cust.bk.part.${part}`)}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((x) => {
                    const on = slot?.startsAt === x.startsAt;
                    const theirs = held?.startsAt === x.startsAt;
                    return (
                      <button key={x.startsAt} type="button" aria-pressed={on} data-held={theirs || undefined} aria-label={theirs ? `${time(x.startsAt)}, ${heldText}` : undefined} disabled={avLoading} onClick={() => setSlot(x)} className={cn("relative h-11 whitespace-nowrap rounded-input border px-1 text-body tabular-nums transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:focus-ring motion-safe:active:scale-95", on ? "border-trade bg-trade font-semibold text-trade-foreground shadow-card" : theirs ? "border-trade bg-trade-soft text-fg" : "border-line bg-card text-fg hover:border-trade/50 hover:bg-trade-soft")}>
                        {time(x.startsAt)}
                        {/* The time this customer is holding: a dot in the corner, and the "holding until" line under the grid. */}
                        {theirs ? <span aria-hidden className={cn("absolute end-1.5 top-1.5 size-1.5 rounded-full", on ? "bg-trade-foreground" : "bg-trade")} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* ---- phase-pro: p2 ---- "Full. Tell me if a spot opens" */}
            {workDays?.size && !pharmacy && ids.length ? (
              times.length === 0 && workDays.has(day) ? (
                <div className="flex flex-col items-start gap-3 rounded-card bg-bg-subtle p-4" data-testid="wl-full">
                  <p className="text-body-strong text-fg">{t("wl.book.full", { day: date(dayDate(day), { weekday: "long" }, "UTC") })}</p>
                  <Button variant="secondary" onClick={() => setWaitSheet(true)}>{t("wl.book.cta")}</Button>
                </div>
              ) : times.length > 0 ? (
                <button type="button" onClick={() => setWaitSheet(true)} className="min-h-11 self-start text-start text-meta text-fg underline underline-offset-2 focus-visible:focus-ring press">{t("wl.book.other")}</button>
              ) : null
            ) : null}
            {waitSheet ? <WaitlistSheet open onClose={() => setWaitSheet(false)} shop={{ slug: shop.slug, name: shop.name }} serviceId={ids[0]!} serviceName={picked[0] ? pick(picked[0]).name : ""} staffId={staffId} day={day} full={times.length === 0} signedIn={signedIn} needsName={needsName} /> : null}
            {/* ---- end phase-pro: p2 ---- */}
            {staffId && anyCount > 0 ? (
              <p className="text-meta text-fg-muted">
                {t("bk.time.anyHas", { n: anyCount, day: date(dayDate(day), { weekday: "long" }, "UTC") })}{" "}
                <button type="button" className="text-fg underline underline-offset-2 active:opacity-60" onClick={() => { setStaffId(null); }}>{t("bk.time.seeThem")}</button>
              </p>
            ) : null}
          </div>
        )}
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
          <p className="text-meta text-fg-muted">{slot ? `${when(slot.startsAt)} – ${time(endsAtOf(slot))}${shownStaff ? ` · ${shownStaff}` : ""}` : t("cust.bk.pickOne")}</p>
          {held && slot?.startsAt === held.startsAt ? <p className="text-meta-strong text-fg" data-testid="book-held">{heldText}</p> : null}
          <Button size="lg" variant="shop" fullWidth disabled={!slot} onClick={() => forward("details")}>{t("cust.bk.continue")}</Button>
        </div>
      </div>
    );
  }

  // ---- details (wave-p): what you are booking, who is coming, the policy, then sign in and book. One action at a time.
  if (step === "details" && slot) {
    const label = deposit > 0 ? t("bk.cta.deposit", { amount: money(deposit) }) : needsCard ? t("bk.cta.card") : t("bk.cta.free");
    const signingIn = wantsSignIn && !signedIn;
    return (
      <div className="flex flex-col gap-5 pb-28">
        {head}
        {progress(totalSteps)}
        <div className="flex flex-col gap-3">
          {back("time")}
          <Heading>{t("cust.bk.details.title")}</Heading>
        </div>
        <section aria-label={t("cust.bk.details.summary")} data-testid="book-summary" className="flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-headline text-fg">{date(slot.startsAt, { weekday: "long", month: "long", day: "numeric" })}</p>
              <p className="text-body text-fg">{time(slot.startsAt)} – {time(endsAtOf(slot))}</p>
            </div>
            <button type="button" onClick={() => goBack("time")} className="min-h-11 shrink-0 px-1 text-meta-strong text-fg underline underline-offset-2 focus-visible:focus-ring press">{t("cust.bk.details.change")}</button>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0">
              <p className="text-body-strong text-fg">{servicesText}</p>
              <p className="text-meta text-fg-muted">{[dur(av?.blockMin ?? sel.durationMin), shownStaff].filter(Boolean).join(" · ")}</p>
            </div>
            {pharmacy ? null : <p className="shrink-0 text-headline tabular-nums text-fg">{totalText(t as never, data, sel, money)}</p>}
          </div>
        </section>
        {policy}
        {needsCard ? (
          <div className="flex items-center gap-3 rounded-card border border-line p-4">
            <CreditCard aria-hidden className="size-5 shrink-0 text-fg" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-body-strong text-fg">{t("bk.card.title")}</p>
              <p className="text-meta text-fg-muted">{deposit > 0 ? t("bk.card.deposit", { amount: money(deposit) }) : t("bk.card.setup")}</p>
            </div>
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
        {signingIn ? (
          <div ref={signInRef} className="scroll-mt-4 rounded-card border border-line bg-card p-4">
            <PhoneSignIn heading="h2" tone="trade" devAutofill={devAutofill} title={t("cust.bk.signIn.title")} intro={t("cust.bk.signIn.intro", { shop: shop.name })} />
          </div>
        ) : (
          <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
            {signedIn ? null : <p className="text-meta text-fg-muted">{t("cust.bk.signIn.why")}</p>}
            <Button size="lg" variant="shop" fullWidth loading={busy} onClick={submit}>{signedIn ? label : t("bk.cta.signIn")}</Button>
          </div>
        )}
      </div>
    );
  }

  // ---- services
  return (
    <div className="flex flex-col gap-5 pb-28">
      {head}
      {progress(1)}
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
      {solo ? null : <p className="-mb-3 text-meta-strong text-fg">{t("cust.bk.who")}</p>}
      {solo ? null : <div role="radiogroup" aria-label={t("bk.anyone")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ id: null as string | null, name: t("bk.anyone"), initials: null as string | null }, ...data.staff].map((s) => {
          const on = s.id === staffId;
          return (
            <button key={s.id ?? "any"} type="button" role="radio" aria-checked={on} onClick={() => setStaffId(s.id)} className={cn("flex h-11 shrink-0 items-center gap-2 rounded-full border ps-1.5 pe-4 text-body focus-visible:focus-ring press", on ? "border-trade bg-trade text-trade-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
              <span aria-hidden className={cn("flex size-8 items-center justify-center rounded-full text-[11px] font-semibold", on ? "bg-bg text-fg" : "bg-bg-muted text-fg")}>{s.initials ?? <Users aria-hidden className="size-4" strokeWidth={1.75} />}</span>
              <bdi>{s.name}</bdi>
            </button>
          );
        })}
      </div>}
      {petShop && signedIn ? (
        <div className="flex flex-col gap-2">
          <p className="text-meta-strong text-fg">{t("bk.pet.title")}</p>
          <div role="radiogroup" aria-label={t("bk.pet.title")} className="flex flex-wrap gap-2">
            {myPets.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={petId === p.id} onClick={() => setPetId(p.id)} className={cn("h-11 rounded-full border px-4 text-body focus-visible:focus-ring press", petId === p.id ? "border-trade bg-trade text-trade-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
                <bdi>{p.name}</bdi>
              </button>
            ))}
            <a href={`/me/pets?next=${encodeURIComponent(`/shops/${shop.slug}/book`)}`} className="inline-flex h-11 items-center rounded-full border border-dashed border-line-strong px-4 text-body text-fg focus-visible:focus-ring press">+ {t("bk.pet.add")}</a>
          </div>
          {pickedPet ? <p className="text-meta text-fg-muted">{t("bk.pet.sizeNote", { pet: pickedPet.name })}</p> : null}
        </div>
      ) : null}
      {categories.length > 1 ? (
        <div role="radiogroup" aria-label={t("bk.all")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {["all", ...categories].map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={cn("h-11 shrink-0 rounded-full border px-4 text-meta-strong focus-visible:focus-ring press", category === c ? "border-trade bg-trade text-trade-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
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
              <button type="button" role="checkbox" aria-checked={on} onClick={() => setIds((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))} className="flex min-h-[64px] w-full items-center gap-3 py-3 text-start focus-visible:focus-ring press-soft">
                <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border", on ? "border-trade bg-trade text-trade-foreground" : "border-line-strong")}>{on ? <CircleCheck className="size-5" strokeWidth={2} /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-fg">{p.name}</span>
                  <span className="block text-meta text-fg-muted">{staffName && !solo ? t("bk.withStaff", { duration: dur(v.durationMin), staff: staffName }) : dur(v.durationMin)}{s.depositCents > 0 && takesCards ? ` · ${t("bk.depositHold", { amount: money(s.depositCents) })}` : ""}</span>
                </span>
                <span className="shrink-0 text-headline tabular-nums text-fg">{pharmacy ? <span className="text-meta font-normal text-fg-muted">{t("rx.book.noCharge")}</span> : s.priceFrom ? <span className="text-body font-normal">{t("bk.from", { price: money(v.priceCents) })}</span> : money(v.priceCents)}</span>
              </button>
            </li>
          );
        })}
        {pharmacy || (data.shop.vertical && data.shop.vertical !== "salon") ? null : <li>
          <a href={shop.phone ? `tel:${shop.phone}` : `/shops/${encodeURIComponent(shop.slug)}`} className="flex min-h-[64px] items-center gap-3 py-3 focus-visible:focus-ring press-soft">
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
        <Button size="lg" variant="shop" fullWidth disabled={!ids.length} onClick={() => forward(offeredAddOns.length ? "addons" : "time")}>{t(offeredAddOns.length ? "addon.book.next" : "bk.chooseTime") /* phase-pro: P5 */}</Button>
      </div>
    </div>
  );
}
