"use client";
import { Check, CreditCard } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPOINTMENT_VERTICALS, FEATURES, FEATURE_KEYS, FEES, NETWORK_GATE_SHOPS, PAID_PLAN_IDS, PLANS, PLATFORM_PAYMENT_FEE_BPS, type PaidPlanId, type PlanId, type billingApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Dot, PageHeader, Panel, Section, Segmented, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async, NoAccess } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { RestaurantBilling } from "./RestaurantBilling";
import { TrialBanner } from "./TrialBanner";
import { formatDateYear, formatMoney } from "@/lib/format";
import { fill } from "@/lib/marketing/text";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const B = copy.billingSolo;
const PB = copy.proBilling;
const isPaid = (v: string | null): v is PaidPlanId => !!v && (PAID_PLAN_IDS as readonly string[]).includes(v);

/** phase-solo A: calendars, texts, promos and the website against the plan (solo-pro-launch.md §3.2). */
function UsagePanel({ usage }: { usage: billingApi.PlanUsageDto }) {
  const period = usage.promos.period === "year" ? B.periodYear : B.periodMonth;
  const rows: { label: string; value: string; note?: string }[] = [
    {
      label: B.calendars,
      value: usage.calendars.limit == null ? fill(B.calendarsUnlimited, { used: usage.calendars.used }) : fill(B.calendarsValue, { used: usage.calendars.used, limit: usage.calendars.limit }),
    },
    {
      label: B.texts,
      value: fill(B.textsValue, { used: Math.min(usage.texts.used, usage.texts.includedPerMonth), included: usage.texts.includedPerMonth }),
      note: usage.texts.overageTexts > 0 ? fill(B.textsOver, { n: usage.texts.overageTexts, amount: formatMoney(usage.texts.overageCents) }) : usage.plan === "free" ? fill(B.textsFree, { included: usage.texts.includedPerMonth }) : undefined,
    },
    { label: B.promos, value: usage.promos.limit > 0 ? fill(B.promosValue, { used: usage.promos.used, limit: usage.promos.limit, period }) : B.promosNone },
    { label: B.site, value: usage.annualSiteEntitled ? B.siteOn : B.siteOff },
  ];
  return (
    <Panel title={B.usageTitle}>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2" data-testid="plan-usage">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <dt className="text-meta text-fg-muted">{r.label}</dt>
            {/* dir="auto": English values with numbers stay readable inside an RTL page until the copy is translated. */}
            <dd dir="auto" className="text-start text-body tabular-nums text-fg">{r.value}</dd>
            {r.note ? <dd dir="auto" className="text-start text-meta text-fg-muted">{r.note}</dd> : null}
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Shops that sell food on a restaurant tier see that ladder first (verticals set at signup). */
const RESTAURANT_VERTICALS = ["restaurant", "restaurant_south_asian", "tiffin", "caterer", "banquet_hall", "bakery"];
const FAQ = [
  ["Will loyalty ever cost money?", "No. Your loyalty program and its reports stay free. That's a promise in our terms."],
  [`What's the ${PLATFORM_PAYMENT_FEE_BPS / 100}% fee?`, `Only on deposits and invoices you take in the app with ${PLANS.plus.name}, ${PLANS.studio.name} or ${PLANS.pro.name}. The Free plan has no subscription and no fee on loyalty. Online orders on Free carry ${FEES.orderBpsFree / 100}%.`],
  [`Can I subscribe to ${PLANS.plus.name} today?`, `Yes. Subscribe below and your shop's tools switch on at once. A few extras that need many shops nearby (sponsored promos and listings, map pins, BIA campaigns) open once ${NETWORK_GATE_SHOPS} shops have joined.`],
  ["What happens if I cancel?", "Your loyalty program keeps running on Free. Members, balances and history are all kept."],
];

export default function BillingPage() {
  const { api, role } = useMerchant();
  const state = useApi(role === "owner" ? () => api.billing.overview() : null, [api, role]);
  if (role !== "owner") return <NoAccess title="Billing is for the owner" body="Ask the shop owner to change plans." />;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader flush title="Billing & plans" description="Loyalty is free forever. Subscribe to the tools for your kind of shop any time, and cancel any time." />
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>{(b) => <Billing b={b} reload={state.reload} />}</Async>
    </div>
  );
}

function Billing({ b, reload }: { b: billingApi.BillingOverviewResponse; reload: () => Promise<void> }) {
  const { api, base, enabled, merchantId, detail } = useMerchant();
  const params = useSearchParams();
  const [period, setPeriod] = useState<"month" | "year">(params.get("interval") === "year" ? "year" : "month");
  const [cancel, setCancel] = useState(false);
  const act = useAction();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const sub = b.subscription;
  const restaurantFirst = RESTAURANT_VERTICALS.includes(detail.merchant.vertical) || !!b.restaurantTier;
  const subscribe = params.get("subscribe");
  const autoRan = useRef(false);

  async function checkout(plan: PaidPlanId, interval: "month" | "year" = period) {
    const r = await act.run(() => api.billing.checkout({ plan, interval, successUrl: `${origin}${base}/billing?checkout=success`, cancelUrl: `${origin}${base}/billing?checkout=cancelled` }));
    if (r) {
      try {
        sessionStorage.setItem("ll.checkout.return", `${base}/billing?checkout=success`);
      } catch {
        /* ignore */
      }
      window.location.assign(r.url);
    }
  }

  // A "Start Pro" button on the pricing page lands here with ?subscribe=plus: go straight to the checkout once.
  useEffect(() => {
    if (autoRan.current || sub || !isPaid(subscribe)) return;
    autoRan.current = true;
    void checkout(subscribe, params.get("interval") === "year" ? "year" : "month");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, sub]);

  const tier = params.get("tier");
  // "See Pro" / "See Studio" links (pro-value.md §5) land here with ?plan=: that card is marked.
  const picked = params.get("plan");
  const restaurant = <RestaurantBilling autoTier={subscribe?.startsWith("restaurant-") && !sub ? (subscribe.slice(11) as "starter" | "growth" | "pro") : null} recommended={tier === "starter" || tier === "growth" || tier === "pro" ? tier : null} />;

  return (
    <>
      {params.get("welcome") === "restaurant" ? (
        <Banner tone="success" title="Your shop is created.">
          Pick the plan that turns on ordering, tiffin or catering, or add your menu first. Nothing is charged until you subscribe.{" "}
          <a className="underline" href={`${base}/setup?step=trade_setup`}>Set up my menu first</a>
        </Banner>
      ) : null}
      {params.get("checkout") === "success" ? <Banner tone="success">Thanks. Your plan updates as soon as the payment confirms.</Banner> : null}
      {params.get("checkout") === "cancelled" ? <Banner tone="neutral">Checkout cancelled. Nothing was charged.</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      <TrialBanner b={b} busy={act.busy} onKeep={(interval) => void checkout("plus", interval)} reload={reload} />

      <Panel>
        <p className="text-meta text-fg-muted">Current plan</p>
        <h2 className="mt-1 text-title text-fg">
          {/* On the free trial the shop is still on Free underneath: say the trial, not "Free. Forever." (the line below has the date). */}
          {b.plan === "free" && b.usage?.trial ? (
            <>You&apos;re on the {PLANS[b.usage.trial.plan].name} trial.</>
          ) : (
            <>
              You&apos;re on {b.plan === "free" ? "Free" : b.plans.find((p) => p.id === b.plan)?.name}
              {b.plan === "free" ? ". Forever." : "."}
            </>
          )}
        </h2>
        {b.restaurantTier ? <p className="mt-1 text-meta text-fg-muted">With your restaurant plan, {PLANS.studio.name} tools are included.</p> : null}
        {b.usage?.trial ? <p className="mt-1 text-meta text-fg-muted" data-testid="trial-on">{PLANS[b.usage.trial.plan].name} · {fill(PB.trialOn, { date: formatDateYear(b.usage.trial.endsAt) })}</p> : null}
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {["No subscription and no fee on loyalty", "Unlimited locations, staff and members", "Your loyalty program and reports", "Network listing and perks"].map((t) => (
            <li key={t} className="flex items-center gap-2 text-meta text-fg">
              <Check aria-hidden className="size-3.5 text-fg-muted" />
              {t}
            </li>
          ))}
        </ul>
        {sub ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <p className="text-body text-fg">
              {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDateYear(sub.currentPeriodEnd)} · billed {sub.interval === "year" ? "yearly" : "monthly"} · {sub.status.replace("_", " ")}
            </p>
            <Button variant="secondary" iconStart={CreditCard} loading={act.busy} onClick={async () => {
              const r = await act.run(() => api.billing.portal(`${origin}${base}/billing`));
              if (r) window.location.assign(r.url);
            }}>
              Cards and invoices
            </Button>
            {sub.cancelAtPeriodEnd ? (
              <Button variant="ghost" onClick={async () => {
                await act.run(() => api.billing.resume());
                await reload();
              }}>
                Keep my plan
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setCancel(true)}>
                Cancel plan
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-4 border-t border-line pt-3 text-meta text-fg-muted">No card on file needed.</p>
        )}
      </Panel>

      {b.usage ? <UsagePanel usage={b.usage} /> : null}

      {restaurantFirst ? restaurant : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-body-strong text-fg">{restaurantFirst ? "Other plans" : "Plans"}</h2>
        {b.plans.some((p) => p.id !== "free" && p.available) ? <Segmented label="Billing period" value={period} onChange={setPeriod} options={[{ value: "month", label: B.monthly }, { value: "year", label: B.yearly }]} /> : null}
      </div>
      {period === "year" ? (
        <div className="-mt-3 flex flex-col gap-1">
          <p className="text-meta text-fg">{B.annualIncludes}</p>
          {b.firstYearPrice?.eligible ? (
            <p className="text-meta text-fg" data-testid="billing-first-year">
              {fill(PB.firstYearNote, { pro: PLANS.plus.name, price: formatMoney(b.firstYearPrice.priceCents).replace(".00", ""), list: formatMoney(b.firstYearPrice.listPriceCents).replace(".00", "") })}
            </p>
          ) : null}
        </div>
      ) : null}
      <ul className="-mt-3 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" data-testid="billing-plans">
        {b.plans.map((p) => {
          // The website (requiresAnnual) leads the list on yearly billing and is left off monthly.
          const feats = FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === p.id && FEATURES[k].phase === 2 && !FEATURES[k].pack && (period === "year" || !FEATURES[k].requiresAnnual)).sort((a, z) => Number(!!FEATURES[z].requiresAnnual) - Number(!!FEATURES[a].requiresAnnual));
          const price = period === "year" ? p.annualPriceCents : p.priceCents;
          // The first-year price of annual Pro: the list price struck through, never named.
          const fy = period === "year" && p.id === "plus" && b.firstYearPrice?.eligible && b.firstYearPrice.priceCents < p.annualPriceCents ? b.firstYearPrice : null;
          const isPicked = picked === p.id && !p.current;
          return (
            <li key={p.id} data-plan={p.id}>
              <div className={`flex h-full flex-col gap-3 bg-bg p-5 ${isPicked ? "ring-2 ring-inset ring-link" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-body-strong text-fg">{p.name}</h3>
                  {p.current ? <Dot tone="positive">Current</Dot> : isPicked ? <Dot tone="info">{PB.preselected}</Dot> : null}
                </div>
                <p className="text-[28px] font-semibold leading-8 tracking-[-0.01em] tabular-nums text-fg">
                  {fy ? (
                    <>
                      <span className="sr-only">regular price </span>
                      <s className="me-1.5 text-body font-normal text-fg-muted">{formatMoney(fy.listPriceCents).replace(".00", "")}</s>
                      <span className="sr-only">, now </span>
                    </>
                  ) : null}
                  {p.id === "free" ? "$0" : formatMoney(fy ? fy.priceCents : price).replace(".00", "")}
                  <span className="text-meta font-normal tracking-normal text-fg-muted">{p.id === "free" ? " forever" : fy ? ` ${PB.firstYear}, CAD` : period === "year" ? "/year, CAD" : "/month, CAD"}</span>
                </p>
                <p className="text-meta text-fg">{p.blurb}</p>
                <p className="text-caption font-normal text-fg-muted">Best for {p.bestFor.join(", ").toLowerCase()}</p>
                <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-meta text-fg">
                  {(p.id === "free" ? copy.soloPricing.free.lines : feats.map((k) => FEATURES[k].name)).slice(0, 8).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                      {f}
                    </li>
                  ))}
                  {feats.length > 8 && p.id !== "free" ? <li className="ps-[22px] text-fg-muted">and {feats.length - 8} more: {feats.slice(8).map((k) => FEATURES[k].name).join(", ")}</li> : null}
                </ul>
                <div className="mt-auto flex flex-col gap-3 pt-2">
                  {p.id === "free" || p.current || sub ? null : (
                    <Button loading={act.busy} variant={isPicked || (!picked && p.id === "plus") ? "primary" : "secondary"} onClick={() => checkout(p.id as PaidPlanId)}>
                      {`Subscribe to ${p.name}`}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-meta text-fg-muted">{copy.soon.pricingPromise}</p>

      {/* A nail tech, a barber or a groomer never needs the restaurant ladder: it is only noise between their plans and the FAQ. */}
      {restaurantFirst || APPOINTMENT_VERTICALS.includes(detail.merchant.vertical) ? null : restaurant}

      {enabled("payments.in_app") ? (
        <Section title="Payments in the app">
          <PaymentsCard merchantId={merchantId} />
        </Section>
      ) : null}

      <Section title="Questions">
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between py-2 text-meta-strong text-fg">
                {q}
                <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-3 text-meta text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </Section>
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} title="Cancel your plan?" body="Your loyalty program keeps running on Free. Paid tools turn off at the end of this period; your data is kept." confirmLabel="Cancel plan" danger onConfirm={async () => {
        await api.billing.cancel();
        await reload();
      }} />
    </>
  );
}

function PaymentsCard({ merchantId }: { merchantId: string }) {
  const { api, base } = useMerchant();
  const status = useApi(() => api.billing.paymentsStatus(), [api]);
  const act = useAction();
  void merchantId;
  return (
    <Panel title="Stripe payouts" description="Card payments go straight to your bank through Stripe." action={status.data?.chargesEnabled ? <Dot tone="positive">Ready</Dot> : status.data?.connected ? <Dot tone="info">Finishing setup</Dot> : <Dot>Not set up</Dot>}>
      {status.data?.chargesEnabled ? (
        <p className="text-body text-fg">Payments and payouts are on. Platform fee {status.data.platformFeeBps / 100}% per payment.</p>
      ) : (
        <Button loading={act.busy} onClick={async () => {
          const origin = window.location.origin;
          const r = await act.run(() => api.billing.paymentsConnect({ returnUrl: `${origin}${base}/billing?onboarding=done`, refreshUrl: `${origin}${base}/billing?onboarding=refresh` }));
          if (r) window.location.assign(r.url);
        }}>
          {status.data?.connected ? "Finish Stripe setup" : "Set up payments"}
        </Button>
      )}
      {act.error ? <Banner tone="danger" className="mt-3">{act.error}</Banner> : null}
    </Panel>
  );
}

export type { PlanId };
