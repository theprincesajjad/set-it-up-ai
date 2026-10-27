"use client";
import { CircleCheck } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import type { tiffinApi } from "@ll/shared";
import { PaymentBox, pollUntil } from "@/components/pass/PaymentBox";
import { PhoneSignIn } from "@/components/pass/PhoneSignIn";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/TextField";
import { browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { restaurantCustomerApi } from "@/lib/restaurant/api";
import { monthlyOfWeekly } from "@/lib/restaurant/tcb";
import { addDays, dayDate, todayIso } from "@/lib/restaurant/util";
import { DietaryPills } from "./dietary";
import { ManualDue, PayOptions, offeredMethods } from "./ManualDue";
import { BigNumber, ChoiceRow, FieldLabel, Heading, Pill, ShopHead, Stepper, useFmt } from "./ui";

const api = restaurantCustomerApi(browserClient);

type Shop = { name: string; slug: string; logoUrl: string | null; brandColor: string | null; phone: string | null };
type Plan = tiffinApi.PublicPlanDto;

const noopSubscribe = () => () => {};
/** The saved subscribe form for this shop, or null (none saved, a private window, or on the server). Parsed once per read of the same text. */
let lastRaw: string | null = null;
let lastDraft: Record<string, unknown> | null = null;
function readDraft(key: string): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === lastRaw) return lastDraft;
    lastRaw = raw;
    lastDraft = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    return lastDraft;
  } catch {
    return null;
  }
}

export function planPrice(p: Pick<Plan, "priceCents" | "extraServingCents">, servings: number) {
  return p.priceCents + Math.max(0, servings - 1) * p.extraServingCents;
}

/** /shops/<slug>/tiffin: plans with the upcoming menu, servings stepper with live price, subscribe. */
export function TiffinPlans({ shop, data, signedIn, initialPlanId, initialServings, devAutofill, defaultName }: { shop: Shop; data: tiffinApi.PublicPlansResponse; signedIn: boolean; initialPlanId?: string; initialServings?: number; /** The name already on the customer's profile. */ defaultName?: string; /** Fill the sign-in code from the API in non-production. */ devAutofill?: boolean }) {
  const { t, money, date, pick } = useFmt();
  const plans = data.plans;
  const [planId, setPlanId] = useState<string | null>(plans.some((p) => p.id === initialPlanId) ? initialPlanId! : null);
  const [servings, setServings] = useState(Math.max(1, initialServings ?? 1));
  const [fulfilment, setFulfilment] = useState<tiffinApi.TiffinFulfilment>("delivery");
  const [address, setAddress] = useState("");
  const [postal, setPostal] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [dietNotes, setDietNotes] = useState("");
  const [start, setStart] = useState(addDays(todayIso(), 1));
  const [name, setName] = useState(defaultName ?? "");
  const [monthly, setMonthly] = useState(true);
  const draftKey = `tcb.tiffin.draft.${shop.slug}`;
  const methods = offeredMethods(data.accepted ?? { card: true, pad: data.padEnabled, etransfer: false, cash: false });
  const [method, setMethod] = useState<tiffinApi.TiffinPaymentMethod>(methods[0] ?? "card");
  const [errors, setErrors] = useState<Partial<Record<"address" | "postal" | "start" | "name", string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<tiffinApi.SubscribeResponse | null>(null);
  const [paid, setPaid] = useState<"no" | "checking" | "yes">("no");

  // Signing in refreshes this page: keep what the customer already typed (plan, address, notes) so nothing has to be entered twice.
  // The draft lives in sessionStorage; it is read after hydration (null on the server) and applied once.
  const stored = useSyncExternalStore(noopSubscribe, () => readDraft(draftKey), () => null);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [restored, setRestored] = useState(false);
  if (!restored && stored !== null) {
    setRestored(true);
    const d = stored;
    if (typeof d.planId === "string" && plans.some((p) => p.id === d.planId) && !initialPlanId) setPlanId(d.planId);
    if (typeof d.servings === "number") setServings(Math.max(1, d.servings));
    if (d.fulfilment === "delivery" || d.fulfilment === "pickup") setFulfilment(d.fulfilment);
    if (typeof d.address === "string") setAddress(d.address);
    if (typeof d.postal === "string") setPostal(d.postal);
    if (typeof d.addressNotes === "string") setAddressNotes(d.addressNotes);
    if (typeof d.dietNotes === "string") setDietNotes(d.dietNotes);
    if (typeof d.start === "string" && d.start >= todayIso()) setStart(d.start);
    if (typeof d.name === "string" && !defaultName) setName(d.name);
    if (typeof d.monthly === "boolean") setMonthly(d.monthly);
    if (typeof d.method === "string" && (methods as string[]).includes(d.method)) setMethod(d.method as tiffinApi.TiffinPaymentMethod);
  }
  useEffect(() => {
    if (!hydrated || result) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ planId, servings, fulfilment, address, postal, addressNotes, dietNotes, start, name, monthly, method }));
    } catch {
      /* ignore */
    }
  }, [hydrated, result, draftKey, planId, servings, fulfilment, address, postal, addressNotes, dietNotes, start, name, monthly, method]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const handPaid = method === "etransfer" || method === "cash";
  /** A weekly plan paid by hand is billed once a month by default (one e-transfer to chase, not four). */
  const billedMonthly = (p: Plan) => p.cadence === "weekly" && handPaid && monthly;
  const cadence = (p: Plan) => t(p.cadence === "trial" ? "tcb2.tf.trialDay" : billedMonthly(p) || p.cadence === "monthly" ? "rc.tf.monthly" : "rc.tf.weekly");
  const priceOf = (p: Plan, n: number) => (billedMonthly(p) ? monthlyOfWeekly(planPrice(p, n)) : planPrice(p, n));
  const dayNames = (p: Plan) => [...p.daysOfWeek].sort((a, b) => a - b).map((d) => date(new Date(Date.UTC(2024, 0, 7 + d, 12)), { weekday: "short" }, "UTC")).join(" · ");

  function choose(p: Plan) {
    setPlanId(p.id);
    setServings((s) => Math.min(s, p.maxServings));
    setFulfilment(p.deliveryAllowed ? "delivery" : "pickup");
    setMethod((m) => (methods.includes(m) ? m : (methods[0] ?? "card")));
    setError(null);
  }

  async function subscribe(ev: FormEvent) {
    ev.preventDefault();
    if (!plan) return;
    const e: typeof errors = {};
    if (fulfilment === "delivery" && address.trim().length < 3) e.address = t("rc.tf.errAddress");
    if (fulfilment === "delivery" && postal.trim().length < 3) e.postal = t("rc.tf.errPostal");
    if (!start || start < todayIso()) e.start = t("rc.tf.errStart");
    else if (plan.cadence === "trial" && !plan.daysOfWeek.includes(dayDate(start).getUTCDay())) e.start = t("tcb2.tf.errTrialDay", { days: dayNames(plan) });
    if (name.trim().length < 2) e.name = t("tcb2.tf.errName");
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.tiffin.subscribe({
        planId: plan.id,
        servings,
        fulfilment,
        ...(fulfilment === "delivery" ? { address: address.trim(), postalCode: postal.trim(), ...(addressNotes.trim() ? { addressNotes: addressNotes.trim() } : {}) } : {}),
        ...(dietNotes.trim() ? { dietaryNotes: dietNotes.trim() } : {}),
        startDate: start,
        paymentMethod: method,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(plan.cadence === "weekly" && handPaid ? { billingCadence: monthly ? ("monthly" as const) : ("weekly" as const) } : {}),
      });
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setResult(r);
      if (!r.payment && !r.manual) setPaid("yes");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPaid() {
    if (!result) return;
    setPaid("checking");
    const ok = await pollUntil(async () => (await api.tiffin.detail(result.subscription.id)).subscription.status === "active");
    setPaid(ok ? "yes" : "checking");
  }

  const head = (
    <>
      <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
      <div className="flex flex-col gap-2">
        <Heading>{t("rc.tf.title")}</Heading>
        <p className="text-body text-fg-muted">{t("rc.tf.intro")}</p>
      </div>
    </>
  );

  if (result) {
    const startLabel = date(dayDate(result.subscription.startDate), { weekday: "long", month: "long", day: "numeric" }, "UTC");
    return (
      <div className="flex flex-col gap-6">
        <ShopHead shop={shop} href={`/shops/${encodeURIComponent(shop.slug)}`} />
        {result.manual ? (
          <section className="flex flex-col gap-4" aria-label={t("tcb.pay.doneTitle", { shop: shop.name })}>
            <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
            <Heading level={2}>{t("tcb.pay.doneTitle", { shop: shop.name })}</Heading>
            <ManualDue manual={result.manual} shop={shop.name} method={result.subscription.paymentMethod} />
            <p className="text-body text-fg-muted">{t("tcb.pay.doneBody", { shop: shop.name })}</p>
            <Button size="lg" fullWidth href="/me/tiffin">
              {t("rc.tf.manage")}
            </Button>
          </section>
        ) : paid === "yes" ? (
          <section className="flex flex-col gap-3 rounded-sheet bg-bg-subtle p-5" aria-label={t("rc.tf.doneTitle")}>
            <CircleCheck aria-hidden className="size-7 text-positive" strokeWidth={1.5} />
            <Heading level={2}>{t("rc.tf.doneTitle")}</Heading>
            <p className="text-body text-fg-muted">{t("rc.tf.doneBody", { date: startLabel })}</p>
            <Button size="lg" fullWidth href="/me/tiffin">
              {t("rc.tf.manage")}
            </Button>
          </section>
        ) : paid === "checking" ? (
          <Banner tone="info" title={t("rc.tf.processing")}>
            {t("rc.tf.pending")}
          </Banner>
        ) : result.payment ? (
          <section className="flex flex-col gap-4">
            <Heading level={2}>{t("rc.tf.payTitle", { cadence: cadence(plan ?? plans[0]!) })}</Heading>
            <BigNumber>{money(result.payment.amountCents)}</BigNumber>
            <PaymentBox paymentIntentId={result.payment.paymentIntentId} clientSecret={result.payment.clientSecret} amountCents={result.payment.amountCents} label={t("rc.tf.pay", { amount: money(result.payment.amountCents) })} onPaid={onPaid} />
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {head}
      {plans.length === 0 ? (
        <EmptyState title={t("rc.tf.noPlans")} description={t("rc.tf.noPlansBody")} action={shop.phone ? <Button variant="secondary" href={`tel:${shop.phone}`}>{t("rc.callShop", { shop: shop.name })}</Button> : undefined} />
      ) : (
        <ul className="flex flex-col gap-4">
          {plans.map((p) => {
            const tr = pick({ name: p.name, description: p.description, translations: p.translations });
            const selected = p.id === planId;
            const price = priceOf(p, selected ? servings : 1);
            return (
              <li key={p.id} className={cn("rounded-card border p-4", selected ? "border-fg" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Heading level={2} plain className="break-words">
                      {tr.name}
                    </Heading>
                    {tr.description ? <p className="mt-1 text-body text-fg-muted">{tr.description}</p> : null}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="display text-title tabular-nums text-fg">{data.taxApplies && p.taxable ? t("tcb.tax.plus", { amount: money(price) }) : money(price)}</p>
                    <p className="text-meta text-fg-muted">{t("rc.tf.perCadence", { cadence: cadence(p) })}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.cadence === "trial" ? <Pill>{t("tcb2.tf.trialPill")}</Pill> : null}
                  <Pill>{dayNames(p)}</Pill>
                  {data.certifiedFoodHandler ? <Pill>{t("tcb.badge.certified")}</Pill> : null}
                  <Pill>{t("rc.tf.mealsPerDay", { n: p.mealsPerDay })}</Pill>
                  {p.deliveryAllowed && !p.pickupAllowed ? <Pill>{t("rc.tf.deliveryOnly")}</Pill> : null}
                  {p.pickupAllowed && !p.deliveryAllowed ? <Pill>{t("rc.tf.pickupOnly")}</Pill> : null}
                  <DietaryPills dietary={p.dietary} />
                </div>
                <p className="mt-3 text-meta text-fg-muted">
                  {p.deliveryAllowed ? (p.deliveryFeeCents > 0 ? t("rc.tf.deliveryFee", { price: money(p.deliveryFeeCents) }) : t("rc.tf.freeDelivery")) + " · " : ""}
                  {t("rc.tf.cutoff", { hours: p.cutoffHours })}
                </p>

                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-meta-strong text-fg focus-visible:focus-ring">{t("rc.tf.upcoming")}</summary>
                  {p.upcomingMenu.length ? (
                    <ul className="mt-2 flex flex-col gap-2">
                      {p.upcomingMenu.map((m) => (
                        <li key={m.date} className="flex gap-3 text-meta">
                          <span className="w-20 shrink-0 text-fg-muted">{date(dayDate(m.date), { weekday: "short", month: "short", day: "numeric" }, "UTC")}</span>
                          <span className="min-w-0 text-fg">{m.items.map((i) => pick({ name: i.name, translations: i.translations }).name).join(", ") || t("rc.tm.menuTba")}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-meta text-fg-muted">{t("rc.tf.noMenu")}</p>
                  )}
                </details>

                {!selected ? (
                  <Button className="mt-4" variant="secondary" fullWidth onClick={() => choose(p)}>
                    {t("rc.tf.choose")}
                  </Button>
                ) : (
                  <form onSubmit={subscribe} noValidate className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <FieldLabel>{t("rc.tf.servings")}</FieldLabel>
                        {p.extraServingCents > 0 ? <p className="text-meta text-fg-muted">{t("rc.tf.servingsHint", { price: money(p.extraServingCents) })}</p> : null}
                      </div>
                      <Stepper value={servings} min={1} max={p.maxServings} onChange={setServings} label={t("rc.tf.servings")} />
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-y border-line py-3">
                      <span className="text-meta text-fg-muted">{t("rc.tf.servingsCount", { n: servings })}</span>
                      <span className="text-body-strong tabular-nums text-fg" aria-live="polite">
                        {t("rc.tf.per", { price: money(price), cadence: cadence(p) })}
                      </span>
                    </div>

                    {p.deliveryAllowed && p.pickupAllowed ? (
                      <div className="flex flex-col gap-2">
                        <FieldLabel>{t("rc.tf.fulfilment")}</FieldLabel>
                        <ChoiceRow
                          label={t("rc.tf.fulfilment")}
                          value={fulfilment}
                          onChange={setFulfilment}
                          options={[
                            { value: "delivery", label: t("rc.tm.fulfilDelivery") },
                            { value: "pickup", label: t("rc.tm.fulfilPickup") },
                          ]}
                        />
                      </div>
                    ) : null}

                    {fulfilment === "delivery" ? (
                      <>
                        <TextField label={t("rc.tf.address")} value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} autoComplete="street-address" maxLength={300} required />
                        <TextField label={t("rc.tf.postal")} dir="ltr" value={postal} onChange={(e) => setPostal(e.target.value.toUpperCase())} error={errors.postal} autoComplete="postal-code" maxLength={10} required className="max-w-40" />
                        <TextField type="textarea" label={`${t("rc.tf.addressNotes")} (${t("rc.optional")})`} hint={t("rc.tf.addressNotesHint")} value={addressNotes} onChange={(e) => setAddressNotes(e.target.value)} maxLength={500} rows={2} />
                      </>
                    ) : null}
                    <TextField label={t("tcb2.tf.name")} hint={t("tcb2.tf.nameHint", { shop: shop.name })} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" maxLength={80} />
                    <TextField type="textarea" label={`${t("rc.tf.dietNotes")} (${t("rc.optional")})`} value={dietNotes} onChange={(e) => setDietNotes(e.target.value)} maxLength={500} rows={2} />
                    <TextField type="date" label={p.cadence === "trial" ? t("tcb2.tf.trialDate") : t("rc.tf.startDate")} min={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} error={errors.start} required />
                    <PayOptions shop={shop.name} methods={methods} value={method} onChange={setMethod} etransfer={data.etransfer ?? null} amountCents={price} />
                    {p.cadence === "weekly" && handPaid ? (
                      <div className="flex flex-col gap-2">
                        <FieldLabel>{t("tcb2.tf.billing")}</FieldLabel>
                        <ChoiceRow
                          label={t("tcb2.tf.billing")}
                          value={monthly ? "monthly" : "weekly"}
                          onChange={(v) => setMonthly(v === "monthly")}
                          options={[
                            { value: "monthly", label: t("tcb2.tf.billMonthly", { price: money(monthlyOfWeekly(planPrice(p, servings))) }) },
                            { value: "weekly", label: t("tcb2.tf.billWeekly", { price: money(planPrice(p, servings)) }) },
                          ]}
                        />
                      </div>
                    ) : null}
                    {error ? <Banner tone="danger">{error}</Banner> : null}
                    {signedIn ? (
                      <Button type="submit" size="lg" fullWidth loading={busy}>
                        {method === "etransfer" || method === "cash" ? t("tcb.pay.subscribeManual", { amount: money(price) }) : t("rc.tf.subscribeFor", { price: money(price) })}
                      </Button>
                    ) : (
                      <p className="text-center text-meta text-fg-muted">{t("auth.inline.subscribe")}</p>
                    )}
                  </form>
                )}
                {selected && !signedIn ? (
                  // Outside the <form> (forms can't nest). No `next`: signing in refreshes this page in place, keeping the plan and language.
                  <div className="mt-5 border-t border-line pt-5">
                    <PhoneSignIn heading="h3" title={t("rc.tf.signInToSubscribe")} devAutofill={devAutofill} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {signedIn ? (
        <Button variant="ghost" fullWidth href="/me/tiffin">
          {t("rc.tf.manageLink")}
        </Button>
      ) : null}
    </div>
  );
}
