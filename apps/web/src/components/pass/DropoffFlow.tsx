"use client";
import { useHydratedValue } from "@/lib/useHydratedValue";
import { CalendarPlus, CircleCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { commerceApi } from "@ll/shared";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { browserApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { buildIcs } from "@/lib/booking";
import { cn } from "@/lib/cn";

const DAYS = 14;
const ymd = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

/**
 * /shops/<slug>/dropoff: pick a day and a time to bring an item in, say what it is, and book. No service step and no deposit:
 * the shop checks the item in and texts a quote. Signing in with a phone happens inline, after the time is chosen.
 */
export function DropoffFlow({ shop, signedIn, devAutofill, tz, address }: { shop: { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null }; signedIn: boolean; devAutofill?: boolean; tz: string; address: string | null }) {
  const { t, number, date, time } = useFmt();
  const [slots, setSlots] = useState<commerceApi.SlotDto[] | null>(null);
  const [error, setError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<commerceApi.SlotDto | null>(null);
  const [notes, setNotes] = useState("");
  const notesRef = useHydratedValue<HTMLTextAreaElement>(notes, setNotes);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [booked, setBooked] = useState<commerceApi.BookingDto | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [wantsSignIn, setWantsSignIn] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const to = new Date(Date.now() + DAYS * 86_400_000).toISOString();
      const r = await browserApi.public.dropoffSlots(shop.slug, { to });
      setSlots(r.items);
      setDay((cur) => cur ?? (r.items[0] ? ymd(r.items[0].startsAt, tz) : null));
    } catch {
      setError(true);
    }
  }, [shop.slug, tz]);
  useEffect(() => {
    // Load once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const days = useMemo(() => {
    const m = new Map<string, commerceApi.SlotDto[]>();
    for (const s of slots ?? []) m.set(ymd(s.startsAt, tz), [...(m.get(ymd(s.startsAt, tz)) ?? []), s]);
    return m;
  }, [slots, tz]);
  const dayLabel = (d: string) => date(new Date(`${d}T12:00:00Z`), { weekday: "short", month: "short", day: "numeric" }, "UTC");
  const when = (iso: string) => `${date(iso, { weekday: "long", month: "long", day: "numeric" }, tz)}, ${time(iso, tz)}`;

  async function submit() {
    if (!slot) return;
    if (!signedIn) {
      setWantsSignIn(true);
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      setBooked(await browserApi.me.book({ slotId: slot.id, notes: notes.trim() || null }));
    } catch (e) {
      if (isApiError(e) && (e.status === 409 || e.code === "slot_full")) {
        setBanner({ tone: "info", text: t("sv.d.taken") });
        setSlot(null);
        await load();
      } else setBanner({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!booked) return;
    setBusy(true);
    try {
      await browserApi.me.cancelBooking(booked.id);
      setCancelled(true);
      setBooked(null);
      setSlot(null);
      await load();
    } catch (e) {
      setBanner({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!booked) return;
    const ics = buildIcs({ uid: booked.id, title: t("wp.cal.dropoff", { shop: shop.name }), startsAt: booked.startsAt, endsAt: booked.endsAt, location: address, description: notes || null });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "drop-off.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  const head = <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />;
  if (booked) {
    return (
      <div className="flex flex-col gap-5">
        {head}
        <section className="flex flex-col gap-2 rounded-sheet bg-bg-subtle p-5" aria-label={t("sv.d.doneTitle")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("sv.d.doneTitle")}</Heading>
          <p className="text-body text-fg">{t("sv.d.doneBody", { shop: shop.name, when: when(booked.startsAt) })}</p>
          {address ? <p className="text-meta text-fg-muted">{t("sv.d.where")}: {address}</p> : null}
        </section>
        {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
        <Button variant="secondary" size="lg" fullWidth iconStart={CalendarPlus} onClick={download}>{t("sv.d.addCalendar")}</Button>
        <Button variant="ghost" size="lg" fullWidth loading={busy} onClick={cancel}>{t("sv.d.cancel")}</Button>
      </div>
    );
  }

  const times = day ? (days.get(day) ?? []) : [];
  return (
    <div className="flex flex-col gap-5 pb-28">
      {head}
      <div className="flex flex-col gap-2">
        <Heading>{t("sv.d.title")}</Heading>
        <p className="text-body text-fg-muted">{t("sv.d.intro")}</p>
        {address ? <p className="text-meta text-fg-muted">{t("sv.d.where")}: {address}</p> : null}
      </div>
      {cancelled ? <Banner tone="success">{t("sv.d.cancelled")}</Banner> : null}
      {error ? (
        <Banner tone="danger">{t("rc.error.body")}</Banner>
      ) : !slots ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : !days.size ? (
        <Banner tone="info">{t("sv.d.none", { shop: shop.name })}</Banner>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("sv.d.day")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {[...days.keys()].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={d === day} onClick={() => { setDay(d); setSlot(null); }} className={cn("flex h-14 min-w-[64px] shrink-0 flex-col items-center justify-center rounded-card border text-meta-strong focus-visible:focus-ring", d === day ? "border-trade bg-trade text-trade-foreground" : "border-line bg-card text-fg hover:bg-bg-subtle")}>
                {dayLabel(d)}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label={t("sv.d.times")} className="grid grid-cols-3 gap-2">
            {times.map((s) => {
              const on = slot?.id === s.id;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setSlot(s)} className={cn("flex h-14 flex-col items-center justify-center rounded-card border focus-visible:focus-ring", on ? "border-trade bg-trade text-trade-foreground" : "border-line bg-card text-fg hover:bg-bg-subtle")}>
                  <span className="text-body-strong tabular-nums">{time(s.startsAt, tz)}</span>
                  {s.remaining <= 2 ? <span className={cn("text-caption", on ? "text-trade-foreground/90" : "text-fg-muted")}>{t("sv.d.left", { n: number(s.remaining) })}</span> : null}
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-meta-strong text-fg">{t("sv.d.notes")}</span>
            <textarea ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={400} placeholder={t("sv.d.notesHint")} className="rounded-input border border-line bg-bg px-3 py-2 text-body text-fg focus-visible:focus-ring" />
          </label>
          <p className="text-meta text-fg-muted">{t("sv.d.policy")}</p>
        </>
      )}
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {wantsSignIn && !signedIn ? <PhoneSignIn heading="h2" devAutofill={devAutofill} title={t("rc.signIn")} intro={t("sv.d.signIn")} /> : null}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-4 pt-3">
        <p className="text-meta text-fg-muted">{slot ? when(slot.startsAt) : t("sv.d.pickTime")}</p>
        <Button size="lg" fullWidth loading={busy} disabled={!slot} onClick={submit}>{slot ? t("sv.d.book", { time: time(slot.startsAt, tz) }) : t("sv.d.pickTime")}</Button>
      </div>
    </div>
  );
}
