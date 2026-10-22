"use client";
import { CircleCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { restaurantApi } from "@ll/shared";
import { PaymentBox } from "@/components/pass/PaymentBox";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatNanp, normalizeDigits, toE164, validateNanp } from "@/lib/phone";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { addDays, dayDate, eventLabel, todayIso, torontoDay, torontoInstant } from "@/lib/restaurant/util";
import { BigNumber, FieldLabel, Heading, Pill, Section, ShopHead, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };
type Hall = restaurantApi.HallDto;
type Busy = restaurantApi.HallAvailabilityResponse["halls"][number]["busy"];
type DayState = "booked" | "hold";

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (y: number, m: number) => `${y}-${pad(m)}`;

function monthRange(y: number, m: number) {
  const first = `${monthKey(y, m)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const next = `${monthKey(ny, nm)}-01`;
  return { first, next, from: torontoInstant(first, "00:00"), to: torontoInstant(next, "00:00") };
}

/** Which Toronto days each busy window touches ("booked" beats "hold"). */
function dayStates(busy: Busy): Map<string, DayState> {
  const out = new Map<string, DayState>();
  for (const b of busy) {
    const state: DayState = b.status === "hold" ? "hold" : "booked";
    const end = new Date(new Date(b.endsAt).getTime() - 1);
    for (let d = torontoDay(b.startsAt), guard = 0; d <= torontoDay(end) && guard < 40; d = addDays(d, 1), guard++) {
      if (out.get(d) !== "booked") out.set(d, state);
    }
  }
  return out;
}

/** /shops/<slug>/banquet: halls, packages, a month availability view, and a booking request. */
export function BanquetView({ shop, halls, initialBusy, initialMonth, signedIn }: { shop: Shop; halls: Hall[]; initialBusy: Record<string, Busy> | null; initialMonth: { y: number; m: number }; signedIn: boolean }) {
  const { t, money, date, time, number, percent } = useFmt();
  const [hallId, setHallId] = useState(halls[0]?.id ?? "");
  const [month, setMonth] = useState(initialMonth);
  const [busyByHall, setBusyByHall] = useState<Record<string, Busy>>(initialBusy ?? {});
  const [loadedMonth, setLoadedMonth] = useState(initialBusy ? monthKey(initialMonth.y, initialMonth.m) : "");
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const hall = halls.find((h) => h.id === hallId) ?? halls[0];
  const today = todayIso();

  // Request form state
  const [eventType, setEventType] = useState<restaurantApi.CateringEventType>("wedding");
  const [pkg, setPkg] = useState("");
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("23:00");
  const [guests, setGuests] = useState("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"date" | "time" | "guests" | "name" | "phone", string>>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [done, setDone] = useState<null | { kind: "sent"; name: string; phone: string; date: string } | { kind: "hold"; booking: restaurantApi.HallBookingDto; payment: { paymentIntentId: string; clientSecret: string; amountCents: number } | null; paid: boolean }>(null);

  const key = monthKey(month.y, month.m);
  const fetchMonth = useCallback(
    async (y: number, m: number) => {
      setLoading(true);
      setLoadError(false);
      try {
        const r = await api.banquet.availability(shop.slug, { from: monthRange(y, m).from, to: monthRange(y, m).to });
        setBusyByHall(Object.fromEntries(r.halls.map((h) => [h.hall.id, h.busy])));
        setLoadedMonth(monthKey(y, m));
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    [shop.slug],
  );

  useEffect(() => {
    // Month changed: fetch that month's busy windows.
    if (key !== loadedMonth) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchMonth(month.y, month.m);
    }
  }, [key, loadedMonth, month.y, month.m, fetchMonth]);

  const states = useMemo(() => dayStates(busyByHall[hall?.id ?? ""] ?? []), [busyByHall, hall?.id]);
  const first = dayDate(`${key}-01`);
  const lead = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => `${key}-${pad(i + 1)}`)];
  const selectedWindows = selected ? (busyByHall[hall?.id ?? ""] ?? []).filter((b) => torontoDay(b.startsAt) <= selected && selected <= torontoDay(new Date(new Date(b.endsAt).getTime() - 1))) : [];
  const stepMonth = (d: number) => setMonth(({ y, m }) => (m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d }));
  const monthIsCurrent = key <= today.slice(0, 7);

  function pick(day: string) {
    setSelected(day);
    setErrors((e) => ({ ...e, date: undefined }));
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!hall) return;
    const e: typeof errors = {};
    if (!selected) e.date = t("rc.bq.errDate");
    if (end <= start) e.time = t("rc.bq.errTime");
    const n = Number(guests);
    if (!Number.isInteger(n) || n < 1) e.guests = t("rc.cq.errGuests");
    else if (n > hall.capacity) e.guests = t("rc.bq.errCapacity", { n: number(hall.capacity) });
    if (!signedIn) {
      if (name.trim().length < 2) e.name = t("rc.cq.errName");
      if (validateNanp(normalizeDigits(phone)) !== "ok") e.phone = t("rc.cq.errPhone");
    }
    setErrors(e);
    setBanner(null);
    if (Object.keys(e).length || !selected) return;
    setBusy(true);
    try {
      if (signedIn) {
        const r = await api.banquet.hold({ hallId: hall.id, eventType, startsAt: torontoInstant(selected, start), endsAt: torontoInstant(selected, end), headcount: n, packageName: pkg || null, notes: notes.trim() || null });
        setDone({ kind: "hold", booking: r.booking, payment: r.deposit?.clientSecret ? { paymentIntentId: r.deposit.paymentIntentId, clientSecret: r.deposit.clientSecret, amountCents: r.deposit.amountCents } : null, paid: false });
      } else {
        const detail = [pkg ? `${t("rc.bq.package")}: ${pkg}` : null, `${t("rc.bq.start")} ${start}, ${t("rc.bq.end")} ${end}`, notes.trim() || null].filter(Boolean).join("\n");
        await api.catering.inquire(shop.slug, { eventType, eventDate: selected, startTime: start, headcount: n, service: "banquet", venueName: hall.name, notes: detail, name: name.trim(), phone: toE164(phone) ?? phone, email: email.trim() || null });
        setDone({ kind: "sent", name: name.trim(), phone: formatNanp(normalizeDigits(phone)), date: date(dayDate(selected), { weekday: "long", month: "long", day: "numeric" }, "UTC") });
      }
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        setBanner({ tone: "danger", text: t("rc.bq.conflict") });
        void fetchMonth(month.y, month.m);
      } else if (isApiError(err) && err.status === 402) setBanner({ tone: "info", text: t("rc.cq.unavailable", { shop: shop.name }) });
      else setBanner({ tone: "danger", text: isApiError(err) && err.isNetwork ? t("rc.error.body") : errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function holdPaid() {
    if (done?.kind !== "hold") return;
    setDone({ ...done, payment: null, paid: true });
  }

  if (done?.kind === "sent")
    return (
      <div className="flex flex-col gap-6">
        <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
        <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("rc.bq.sentTitle")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("rc.bq.sentTitle")}</Heading>
          <p className="text-body text-fg-muted">{t("rc.bq.sentBody", { name: done.name, shop: shop.name, phone: done.phone, date: done.date })}</p>
        </section>
        <Button size="lg" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>
          {t("rc.backToShop", { shop: shop.name })}
        </Button>
      </div>
    );

  if (done?.kind === "hold") {
    const b = done.booking;
    const when = date(b.startsAt, { weekday: "long", month: "long", day: "numeric" });
    return (
      <div className="flex flex-col gap-6">
        <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
        <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("rc.bq.heldTitle")}>
          <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
          <Heading level={2}>{t("rc.bq.heldTitle")}</Heading>
          <p className="text-body text-fg-muted">{done.payment ? t("rc.bq.heldBody", { hall: b.hallName ?? hall?.name ?? "", date: when }) : t("rc.bq.heldNoPay", { hall: b.hallName ?? hall?.name ?? "", date: when })}</p>
          {b.holdExpiresAt ? <p className="text-meta text-fg-muted">{t("rc.bq.heldUntil", { when: date(b.holdExpiresAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}</p> : null}
          {b.depositCents > 0 ? <BigNumber tone="accent" className="text-[32px]">{money(b.depositCents)}</BigNumber> : null}
        </section>
        {done.paid ? <Banner tone="success">{t("rc.ca.confirmedPaid", { amount: money(b.depositCents) })}</Banner> : null}
        {done.payment ? (
          <PaymentBox paymentIntentId={done.payment.paymentIntentId} clientSecret={done.payment.clientSecret} amountCents={done.payment.amountCents} label={t("rc.bq.payDeposit", { amount: money(done.payment.amountCents) })} onPaid={holdPaid} />
        ) : null}
        <Button variant="secondary" size="lg" fullWidth href={`/shops/${encodeURIComponent(shop.slug)}`}>
          {t("rc.backToShop", { shop: shop.name })}
        </Button>
      </div>
    );
  }

  const weekdays = Array.from({ length: 7 }, (_, i) => ({ short: date(new Date(Date.UTC(2024, 0, 7 + i, 12)), { weekday: "narrow" }, "UTC"), long: date(new Date(Date.UTC(2024, 0, 7 + i, 12)), { weekday: "long" }, "UTC") }));

  return (
    <div className="flex flex-col gap-6">
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2">
        <Heading>{t("rc.bq.title")}</Heading>
        <p className="text-body text-fg-muted">{t("rc.bq.intro")}</p>
      </div>

      {halls.length === 0 || !hall ? (
        <EmptyState title={t("rc.bq.noHalls")} description={t("rc.bq.noHallsBody")} action={shop.phone ? <Button variant="secondary" href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shop.name })}</Button> : undefined} />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {halls.map((h) => (
              <li key={h.id} className={cn("rounded-card border p-4", h.id === hall.id && halls.length > 1 ? "border-fg" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <Heading level={2} className="min-w-0 break-words">
                    {h.name}
                  </Heading>
                  <Pill tone="ink">{t("rc.bq.capacity", { n: number(h.capacity) })}</Pill>
                </div>
                {h.description ? <p className="mt-1 text-body text-fg-muted">{h.description}</p> : null}
                <p className="mt-2 text-meta text-fg-muted">{[h.baseCents > 0 ? t("rc.bq.base", { price: money(h.baseCents) }) : null, h.depositBps > 0 ? t("rc.bq.deposit", { pct: percent(Math.round(h.depositBps / 100)) }) : null].filter(Boolean).join(" · ")}</p>
                {h.packages.length ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-meta-strong text-fg">{t("rc.bq.packages")}</p>
                    <ul>
                      {h.packages.map((p) => (
                        <li key={p.name} className="border-b border-line py-3 last:border-b-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 break-words text-body-strong text-fg">{p.name}</p>
                            <p className="shrink-0 text-body-strong tabular-nums text-fg">{t("rc.bq.perHead", { price: money(p.perHeadCents) })}</p>
                          </div>
                          {p.includes.length ? (
                            <p className="mt-1 text-meta text-fg-muted">
                              <span className="font-semibold">{t("rc.bq.includes")}:</span> {p.includes.join(", ")}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <Section title={t("rc.bq.calendar")}>
            {halls.length > 1 ? (
              <Select label={t("rc.bq.hall")} value={hall.id} onChange={(e) => { setHallId(e.target.value); setSelected(null); }} options={halls.map((h) => ({ value: h.id, label: h.name }))} />
            ) : null}
            <div className="flex items-center justify-between">
              <button type="button" aria-label={t("rc.bq.prev")} disabled={monthIsCurrent} onClick={() => stepMonth(-1)} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-fg hover:bg-bg-subtle focus-visible:focus-ring disabled:text-fg-subtle disabled:hover:bg-bg">
                <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
              </button>
              <p aria-live="polite" className="text-headline text-fg">
                {date(first, { month: "long", year: "numeric" }, "UTC")}
              </p>
              <button type="button" aria-label={t("rc.bq.next")} onClick={() => stepMonth(1)} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-fg hover:bg-bg-subtle focus-visible:focus-ring">
                <ChevronRight aria-hidden className="size-5 rtl:rotate-180" strokeWidth={1.75} />
              </button>
            </div>
            {loadError ? (
              <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void fetchMonth(month.y, month.m)}>{t("rc.tryAgain")}</Button>}>
                {t("rc.bq.availError")}
              </Banner>
            ) : null}
            <div role="group" aria-label={t("rc.bq.calendar")} aria-busy={loading} className={cn("grid grid-cols-7 gap-1", loading && "opacity-60")}>
              {weekdays.map((w) => (
                <div key={w.long} aria-hidden className="py-1 text-center text-caption font-semibold text-fg-muted">
                  {w.short}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} aria-hidden />;
                const st = states.get(d);
                const past = d < today;
                const label = date(dayDate(d), { weekday: "long", month: "long", day: "numeric" }, "UTC");
                const stateLabel = past ? t("rc.bq.past") : st === "booked" ? t("rc.bq.booked") : st === "hold" ? t("rc.bq.held") : t("rc.bq.free");
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={past}
                    aria-label={`${label}, ${stateLabel}`}
                    aria-pressed={selected === d}
                    onClick={() => pick(d)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-input text-meta-strong tabular-nums transition-colors focus-visible:focus-ring",
                      selected === d ? "bg-fg text-bg" : past ? "text-fg-subtle" : st === "booked" ? "bg-bg-muted text-fg-muted line-through" : st === "hold" ? "border border-dashed border-line-strong text-fg" : "border border-line text-fg hover:bg-bg-subtle",
                    )}
                  >
                    {number(Number(d.slice(8)))}
                  </button>
                );
              })}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm border border-line" />{t("rc.bq.free")}</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm border border-dashed border-line-strong" />{t("rc.bq.held")}</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm bg-bg-muted" />{t("rc.bq.booked")}</li>
            </ul>
            {selected ? (
              <div className="rounded-card bg-bg-subtle p-4" role="status">
                <p className="text-body-strong text-fg">{selectedWindows.length ? t("rc.bq.busyOn", { date: date(dayDate(selected), { weekday: "long", month: "long", day: "numeric" }, "UTC") }) : t("rc.bq.freeOn", { date: date(dayDate(selected), { weekday: "long", month: "long", day: "numeric" }, "UTC") })}</p>
                {selectedWindows.map((b) => (
                  <p key={b.bookingId} className="text-meta text-fg-muted">
                    {t("rc.bq.window", { from: time(b.startsAt), to: time(b.endsAt) })} · {b.status === "hold" ? t("rc.bq.held") : t("rc.bq.booked")}
                  </p>
                ))}
              </div>
            ) : null}
          </Section>

          <form ref={formRef} onSubmit={submit} noValidate className="flex scroll-mt-4 flex-col gap-5">
            <Heading level={2}>{selected ? t("rc.bq.requestFor", { date: date(dayDate(selected), { weekday: "short", month: "short", day: "numeric" }, "UTC") }) : t("rc.bq.request")}</Heading>
            {errors.date ? <Banner tone="danger">{errors.date}</Banner> : null}
            <div className="flex flex-col gap-2">
              <FieldLabel id="bq-type">{t("catering.eventType")}</FieldLabel>
              <div role="group" aria-labelledby="bq-type" className="flex flex-wrap gap-2">
                {restaurantApi.CATERING_EVENT_TYPES.map((k) => (
                  <Chip key={k} selected={eventType === k} onClick={() => setEventType(k)}>
                    {eventLabel(t, k)}
                  </Chip>
                ))}
              </div>
            </div>
            {hall.packages.length ? (
              <Select label={`${t("rc.bq.package")} (${t("rc.optional")})`} value={pkg} onChange={(e) => setPkg(e.target.value)} options={[{ value: "", label: t("rc.bq.noPackage") }, ...hall.packages.map((p) => ({ value: p.name, label: `${p.name} · ${t("rc.bq.perHead", { price: money(p.perHeadCents) })}` }))]} />
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <TextField type="time" label={t("rc.bq.start")} value={start} onChange={(e) => setStart(e.target.value)} required />
              <TextField type="time" label={t("rc.bq.end")} value={end} onChange={(e) => setEnd(e.target.value)} error={errors.time} required />
            </div>
            <TextField type="number" inputMode="numeric" min={1} max={hall.capacity} label={t("catering.guests")} hint={t("rc.bq.capacity", { n: number(hall.capacity) })} value={guests} onChange={(e) => setGuests(e.target.value)} error={errors.guests} required />
            <TextField type="textarea" label={`${t("catering.message")} (${t("rc.optional")})`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            {!signedIn ? (
              <>
                <TextField label={t("catering.name")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" maxLength={120} required />
                <TextField type="tel" inputMode="tel" dir="ltr" label={t("catering.phone")} value={phone} onChange={(e) => setPhone(formatNanp(normalizeDigits(e.target.value)))} error={errors.phone} autoComplete="tel-national" placeholder="(416) 555-0123" required />
                <TextField type="email" dir="ltr" label={`${t("catering.email")} (${t("rc.optional")})`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
              </>
            ) : null}
            {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
            <p className="text-meta text-fg-muted">{signedIn ? t("rc.bq.signedInNote") : t("rc.bq.signedOutNote")}</p>
            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg" fullWidth loading={busy}>
                {signedIn ? t("rc.bq.hold") : t("rc.bq.sendInquiry")}
              </Button>
              {!signedIn ? (
                <Button variant="secondary" fullWidth href={`/login?next=${encodeURIComponent(`/shops/${shop.slug}/banquet`)}`}>
                  {t("rc.signIn")}
                </Button>
              ) : null}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
