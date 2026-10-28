"use client";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { isQurbaniName, restaurantWebApi, type commerceApi, type restaurantApi } from "@ll/shared";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { browserApi, browserClient } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { defaultOptionIds, idempotencyKeyFor, preorderBill, priceDish, summaryLine, type Item } from "@/lib/restaurant/order";
import { TZ, dayDate, todayIso, torontoInstant } from "@/lib/restaurant/util";
import { isWeighedLine, noticeDays, portionLabel } from "@/lib/restaurant/weighed";
import { DietaryPills } from "./dietary";
import { OptionGroups } from "./OptionGroups";
import { PayPanel } from "./PayPanel";
import { Heading, Pill, Stepper, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null; vertical?: string };
type Day = restaurantApi.PreorderAvailabilityDay;

/**
 * /shops/<slug>/preorder/<itemId> (frames 12a and 12b): size, spice and add-ons, a day with pots left, a pickup window,
 * the bill with the deposit and the cancel rule, then the phone number as the account and the deposit by card or Apple Pay.
 */
export function PreorderView({ shop, menu, item, availability, restaurant, signedIn, userName, devAutofill }: { shop: Shop; menu: commerceApi.PublicMenuResponse; item: Item; availability: restaurantApi.PreorderAvailabilityResponse; restaurant: restaurantWebApi.PublicRestaurantResponse | null; signedIn: boolean; userName: string; devAutofill?: boolean }) {
  const { t, money, moneyExact, number, date, pick, locale } = useFmt();
  const router = useRouter();
  const p = pick(item);
  const [ids, setIds] = useState<string[]>(() => defaultOptionIds(item));
  const [dayKey, setDayKey] = useState<string>("");
  const [win, setWin] = useState<string>("");
  const [step, setStep] = useState<"choose" | "pay">("choose");
  const [name, setName] = useState(userName);
  const [whatsapp, setWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<commerceApi.PlaceOrderResponse | null>(null);
  const [days, setDays] = useState<Day[]>(availability.days);
  const [today] = useState(() => todayIso());
  const [qty, setQty] = useState(1);
  const [behalf, setBehalf] = useState("");

  const day = days.find((d) => d.date === dayKey) ?? null;
  const slot = day?.windows.find((w) => w.start === win) ?? null;
  const { unitCents } = priceDish(item, ids);
  const grocer = shop.vertical === "grocery";
  const qurbani = isQurbaniName(item.name);
  const cutToOrder = isWeighedLine(item);
  // A family books 2 or 7 shares; a cut is booked by how many portions of its estimate weight.
  const askQty = grocer && (qurbani || cutToOrder);
  const maxQty = qurbani ? (/share/i.test(item.name) ? 7 : 5) : 20;
  const room = qurbani && day?.potsLeft != null ? Math.max(1, Math.min(maxQty, day.potsLeft)) : maxQty;
  const qtyNow = askQty ? Math.min(qty, room) : 1;
  const bill = preorderBill(unitCents, qtyNow, item.depositBps ?? 0, item.taxable === false ? 0 : menu.tax.ratePpm);
  const opensOn = availability.plan?.bookingsOpen && availability.plan.bookingsOpen > today ? availability.plan.bookingsOpen : null;
  const days_ = noticeDays(availability.leadHours);
  const pickupAt = day && slot ? torontoInstant(day.date, slot.start) : null;
  const cutoffHours = restaurant?.cancelCutoffHours ?? availability.leadHours;
  const cutoff = pickupAt ? new Date(new Date(pickupAt).getTime() - cutoffHours * 3_600_000) : null;
  const orderBy = pickupAt ? new Date(new Date(pickupAt).getTime() - availability.leadHours * 3_600_000) : null;
  /** "11 am", "12 pm": a pickup hour with its am or pm, so "11 to 12" is never ambiguous. */
  const hourLabel = (d: string, hhmm: string) => {
    const label = date(torontoInstant(d, hhmm), { hour: "numeric" }, TZ);
    return locale === "en" ? label.replace(/\./g, "").replace(/[\u202f\u00a0]/g, " ").toLowerCase() : label;
  };
  const dayLabel = (d: string, o: Intl.DateTimeFormatOptions) => date(dayDate(d), o, "UTC");
  /** No trailing full stop ("2:00 p.m."): the sentence adds its own. */
  const stamp = (d: Date) => date(d, { weekday: "short", hour: "numeric", minute: "2-digit" }, TZ).replace(/\.$/, "");
  const ready = !opensOn && !!day && !!slot && !slot.full && (!item.preorderOnly || !day.full);
  const base = `/shops/${encodeURIComponent(shop.slug)}`;
  const location = menu.locations[0];

  const summaryTitle = `${askQty && qtyNow > 1 ? `${number(qtyNow)} × ` : ""}${summaryLine(item, p.name, ids, (name, n) => t("rs.pre.sizeServes", { name, n: number(n) }))}`;
  const accentLeft = (n: number | null) => n !== null && n > 0 && n <= 3;

  // Refresh pots after "full" or a cap change under us.
  async function refresh() {
    try {
      const fresh = await api.availability(shop.slug, { itemId: item.id, from: availability.days[0]?.date, to: availability.days[availability.days.length - 1]?.date });
      setDays(fresh.days);
    } catch {
      // keep what we have
    }
  }

  async function place() {
    if (!ready || !pickupAt || !location || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() && name.trim() !== userName.trim()) await browserApi.me.updateProfile({ name: name.trim() });
      const method = bill.deposit > 0 ? "in_app" : "at_pickup";
      // l10n-ok: the note is for the shop's staff, who read English
      const ownerNote = askQty && behalf.trim() ? `${qurbani ? "Qurbani on behalf of" : "Note"}: ${behalf.trim().replace(/\s*\n+\s*/g, ", ")}`.slice(0, 500) : null;
      const res = await api.placeOrder(
        { merchantId: menu.merchant.id, locationId: location.id, items: [{ catalogItemId: item.id, quantity: qtyNow, modifiers: [], optionIds: ids }], pickupAt, paymentMethod: method, kind: "preorder", channel: "web", tipCents: 0, ...(ownerNote ? { notes: ownerNote } : {}) },
        idempotencyKeyFor(shop.slug, JSON.stringify([item.id, [...ids].sort(), pickupAt, method, qtyNow, behalf.trim()])),
      );
      if (whatsapp && restaurant?.whatsappNumber) void api.whatsappConsent(menu.merchant.id, true, locale).catch(() => undefined);
      if (res.payment && res.order.paymentStatus !== "authorized" && res.order.paymentStatus !== "paid") setPlaced(res);
      else router.push(`/o/${res.order.id}`);
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e) && e.code === "preorder_full") {
        setStep("choose");
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const deposit = money(bill.deposit);
  const hero = (
    item.imageUrl ? (
      <div className="-mx-4 -mt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt="" width={480} height={190} decoding="async" className="aspect-[480/190] w-full bg-bg-subtle object-cover" />
      </div>
    ) : null
  );

  if (step === "pay") {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep("choose"); setPlaced(null); }} aria-label={t("rc.back")} className="-ms-2 inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-bg-subtle focus-visible:focus-ring">
            <ChevronLeft aria-hidden className="size-6 rtl:rotate-180" strokeWidth={1.75} />
          </button>
          <Heading>{grocer ? t(qurbani ? "gr.pre.reserveTitle" : "gr.pre.reserveTitleCut") : t("rs.pre.reserveTitle")}</Heading>
        </header>

        <section aria-label={t("rs.pre.summary")} className="rounded-card border border-line px-4 py-3">
          <p className="break-words text-body-strong text-fg">{summaryTitle}</p>
          {day && slot ? (
            <p className="text-meta text-fg-muted">
              {dayLabel(day.date, { weekday: "short", month: "short", day: "numeric" })} · {t("rs.pre.pickupAt", { from: hourLabel(day.date, slot.start), to: hourLabel(day.date, slot.end) })} · <bdi>{shop.name}</bdi>
            </p>
          ) : null}
        </section>

        {placed?.payment ? (
          <section aria-label={t("rs.pre.payTitle")} className="flex flex-col gap-4">
            <Heading level={2}>{t("rs.pre.payTitle")}</Heading>
            <PayPanel
              orderId={placed.order.id}
              payment={placed.payment}
              label={t("rs.pre.payDeposit", { price: money(placed.payment.amountCents) })}
              done={(o) => o.paymentStatus === "authorized" || o.paymentStatus === "paid"}
              onDone={() => router.push(`/o/${placed.order.id}`)}
              orderHref={`/o/${placed.order.id}`}
            />
            {placed.order.customerFeeCents > 0 ? <p className="text-meta text-fg-muted">{t("rs.pre.feeNote", { fee: money(placed.order.customerFeeCents) })}</p> : null}
          </section>
        ) : (
          <>
            <section aria-labelledby="pre-you" className="flex flex-col gap-3">
              {/* The sign-in block says "no app, no password, we text a code" itself; repeating it under the heading was the same sentence twice. */}
              <Heading level={2}>
                <span id="pre-you">{t("rs.pre.details")}</span>
              </Heading>
              {signedIn ? (
                <>
                  <TextField label={t("rs.pre.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                  {restaurant?.whatsappNumber ? <Checkbox checked={whatsapp} onChange={setWhatsapp} size="sm" label={t("rs.consent.whatsapp", { shop: shop.name })} caption={t("rs.consent.hint")} /> : null}
                </>
              ) : (
                <PhoneSignIn heading="h3" title={t("rs.order.signInTitle")} intro={t("rs.order.signInIntro")} devAutofill={devAutofill} />
              )}
            </section>
            {signedIn ? (
              <section aria-labelledby="pre-pay" className="flex flex-col gap-3 border-t border-line pt-6">
                <Heading level={2}>
                  <span id="pre-pay">{bill.deposit > 0 ? t("rs.pre.payHeading") : t("rs.pre.noDepositHeading")}</span>
                </Heading>
                <p className="text-meta text-fg-muted">{bill.deposit > 0 ? t("rs.pre.walletNote") : t("rs.pre.noDepositNote")}</p>
                <p className="text-meta text-fg-muted">{t("rs.pre.interacNote")}</p>
              </section>
            ) : null}
            <div className="flex flex-col gap-1 border-t border-line pt-4 text-body">
              <div className="flex justify-between text-body-strong text-fg">
                <span>{t("rs.pre.depositToday")}</span>
                <span className="tabular-nums">{deposit}</span>
              </div>
              <div className="flex justify-between text-fg-muted">
                <span>{t("rs.pre.balance")}</span>
                <span className="tabular-nums">{money(bill.balance)}</span>
              </div>
            </div>
            {error ? <Banner tone="danger">{error}</Banner> : null}
            {signedIn ? (
              <Button size="lg" fullWidth loading={busy} onClick={() => void place()}>
                {bill.deposit > 0 ? t("rs.pre.continuePay") : t("rs.pre.reserve")}
              </Button>
            ) : (
              <p className="text-center text-meta text-fg-muted">{t("rs.order.signInFirst")}</p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {hero}
      <div className="flex flex-col gap-2 pt-2">
        <Heading className="break-words">{p.name}</Heading>
        <p className="text-meta italic text-fg-muted">{[item.serves ? t("menu.serves", { n: number(item.serves) }) : null, item.weightUnit ? null : t(grocer ? "gr.pre.meta" : "rs.pre.meta")].filter(Boolean).join(" · ")}</p>
        {item.weightUnit && item.unitPriceCents ? (
          <>
            <p className="text-body-strong text-fg">{t("gr.butcher.estimate", { price: money(item.priceCents) })} · {t("gr.butcher.perUnit", { price: moneyExact(item.unitPriceCents), unit: item.weightUnit })}</p>
            <p className="text-meta text-fg-muted">{t("gr.butcher.scaleNote")}</p>
          </>
        ) : null}
        {opensOn ? <Banner tone="info">{t("gr.qurbani.opensBody", { date: dayLabel(opensOn, { month: "short", day: "numeric" }) })}</Banner> : null}
        {availability.plan ? <p className="text-body text-fg-muted">{t(availability.plan.moved ? "gr.pre.eidMoved" : "gr.pre.eid", { date: dayLabel(availability.plan.start, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) })}</p> : null}
        {p.description ? <p dir="auto" className="text-body text-fg-muted">{p.description}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <DietaryPills dietary={item.dietary} />
          {item.dietary?.allergens?.length ? <Pill>{t("rc.mn.allergens", { list: restaurantWebApi.dishAllergens(item.dietary.allergens).map((a) => t(`allergen.${a}` as const)).join(", ") })}</Pill> : null}
        </div>
      </div>

      <OptionGroups item={item} value={ids} onChange={setIds} idPrefix="pre" />

      {askQty ? (
        <section aria-labelledby="pre-qty" className="flex flex-col gap-3 border-t border-line pt-6">
          <div className="flex items-center justify-between gap-4">
            <span id="pre-qty" className="text-meta-strong text-fg">
              {qurbani ? t(/share/i.test(item.name) ? "gr.pre.qtyShares" : "gr.pre.qtyAnimals") : t("gr.pre.qtyPortions", { weight: portionLabel(item.nominalWeightG ?? 1000, item.weightUnit ?? "kg") })}
            </span>
            <Stepper value={qtyNow} min={1} max={room} onChange={setQty} label={t(qurbani ? (/share/i.test(item.name) ? "gr.pre.qtyShares" : "gr.pre.qtyAnimals") : "rs.qty")} />
          </div>
          {qurbani ? (
            <TextField label={t("gr.pre.behalf")} value={behalf} onChange={(e) => setBehalf(e.target.value)} maxLength={300} hint={t("gr.pre.behalfHint")} />
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="pre-when" className="flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex flex-col gap-1">
          <Heading level={2}>
            <span id="pre-when">{t("rs.pre.when")}</span>
          </Heading>
          <p className="text-meta text-fg-muted">{orderBy ? t(grocer ? "gr.pre.orderBy" : "rs.pre.orderBy", { by: stamp(orderBy), day: dayLabel(day!.date, { weekday: "long" }) }) : days_ && grocer ? t("gr.pre.noticeDays", { days: days_ }) : t(grocer ? "gr.pre.notice" : "rs.pre.notice", { hours: availability.leadHours })}</p>
        </div>
        <div role="radiogroup" aria-label={t("rs.pre.when")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const off = !!opensOn || d.tooSoon || d.windows.length === 0;
            // Pots and animals are capped; a cut of meat is not, so a cut shows no "n left".
            const capped = !!item.preorderOnly;
            const sub = d.closed ? t("rs.weekend.closed") : capped && d.full ? t("rs.weekend.full") : off ? "" : !capped || d.potsLeft === null ? t("rs.weekend.open") : t("rs.pre.left", { n: number(d.potsLeft) });
            const on = d.date === dayKey;
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={off || undefined}
                disabled={off}
                onClick={() => {
                  setDayKey(d.date);
                  setWin("");
                }}
                className={cn("flex h-16 w-[82px] shrink-0 flex-col items-center justify-center rounded-card border text-center transition-colors focus-visible:focus-ring", on ? "border-fg bg-fg text-bg" : off ? "border-line bg-bg text-fg-subtle" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
              >
                <span className="text-body-strong">{dayLabel(d.date, { weekday: "short", day: "numeric" })}</span>
                <span className={cn("text-caption", on ? "text-bg/80" : d.full ? "text-fg-subtle" : accentLeft(d.potsLeft) ? "text-points-text" : "text-fg-muted")}>{sub}</span>
              </button>
            );
          })}
        </div>

        {day?.full && item.preorderOnly ? <WaitList shop={shop} itemId={item.id} day={day} defaultName={userName} /> : null}

        {day && (!day.full || !item.preorderOnly) ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-meta text-fg-muted">{t("rs.pre.window")}</legend>
            <div role="radiogroup" aria-label={t("rs.pre.window")} className="grid grid-cols-3 gap-2">
              {day.windows.map((w) => (
                <button
                  key={w.start}
                  type="button"
                  role="radio"
                  aria-checked={w.start === win}
                  disabled={w.full}
                  onClick={() => setWin(w.start)}
                  className={cn("flex h-11 flex-col items-center justify-center rounded-full border px-2 text-body-strong transition-colors focus-visible:focus-ring", w.start === win ? "border-fg bg-fg text-bg" : w.full ? "border-line bg-bg text-fg-subtle" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
                >
                  <span className="leading-none">{t("rs.pre.windowLabel", { from: hourLabel(day.date, w.start), to: hourLabel(day.date, w.end) })}</span>
                  {w.full ? <span className="text-caption font-normal leading-none text-fg-subtle">{t("rs.pre.busy")}</span> : null}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </section>

      <section aria-label={t("rs.pre.summary")} className="flex flex-col gap-1 border-t border-line pt-4 text-body">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words">{summaryTitle}</span>
          <span className="shrink-0 tabular-nums">{money(bill.subtotal)}</span>
        </div>
        {item.taxable === false ? null : (
          <div className="flex justify-between text-fg-muted">
            <span>{menu.tax.label}</span>
            <span className="tabular-nums">{money(bill.tax)}</span>
          </div>
        )}
        <div className="flex justify-between text-body-strong text-fg">
          <span>{t("orderPay.total")}</span>
          <span className="tabular-nums">{money(bill.total)}</span>
        </div>
        {bill.deposit > 0 ? (
          <div className="mt-2 rounded-card bg-bg-subtle px-4 py-3">
            <p className="flex justify-between gap-3 text-body-strong text-fg">
              <span>{t("rs.pre.payNow", { pct: number(Math.round((item.depositBps ?? 0) / 100)) })}</span>
              <span className="tabular-nums">{deposit}</span>
            </p>
            <p className="text-meta text-fg-muted">{cutoff ? t(grocer ? "gr.pre.cancelRule" : "rs.pre.cancelRule", { balance: money(bill.balance), when: stamp(cutoff) }) : t("rs.pre.cancelRuleGeneric", { balance: money(bill.balance) })}</p>
          </div>
        ) : (
          <p className="mt-2 text-meta text-fg-muted">{t("rs.pre.noDepositNote")}</p>
        )}
      </section>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button size="lg" fullWidth disabled={!ready} onClick={() => setStep("pay")}>
        {bill.deposit > 0 ? t("rs.pre.reserveDeposit", { price: deposit }) : t("rs.pre.reserve")}
      </Button>
      {!ready ? <p className="-mt-3 text-center text-meta text-fg-muted">{t("rs.pre.pickDay")}</p> : null}
      <Button variant="ghost" size="sm" href={base} className="self-center">
        {t("rc.backToShop", { shop: shop.name })}
      </Button>
    </div>
  );
}

/** A full day: join the wait list. One message if a pot frees up; the guest ticks the consent first (CASL). */
function WaitList({ shop, itemId, day, defaultName }: { shop: Shop; itemId: string; day: Day; defaultName: string }) {
  const { t, date } = useFmt();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = useMemo(() => date(dayDate(day.date), { weekday: "short", day: "numeric" }, "UTC"), [date, day.date]);

  if (result) return <Banner tone="success">{result}</Banner>;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line p-4">
      <p className="text-body text-fg">
        {t("rs.pre.dayFull", { day: label })}{" "}
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-body-strong underline decoration-line-strong underline-offset-4 focus-visible:focus-ring">
            {t("rs.pre.joinWaitlist")} <span aria-hidden className="inline-block rtl:rotate-180">›</span>
          </button>
        ) : null}
      </p>
      {open ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!consent) return setError(t("rs.pre.waitConsentNeeded"));
            setBusy(true);
            setError(null);
            try {
              const r = await api.joinWaitlist(shop.slug, { itemId, date: day.date, phone: phone.trim(), ...(defaultName ? { name: defaultName } : {}), consent: true });
              setResult(r.message);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextField label={t("rs.pre.waitPhone")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Checkbox checked={consent} onChange={setConsent} size="sm" label={t("rs.pre.waitConsent", { shop: shop.name })} />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button type="submit" variant="secondary" loading={busy} disabled={phone.replace(/\D/g, "").length < 7}>
            {t("rs.pre.waitSubmit")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
