"use client";
import { Check, CreditCard } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FEATURES, FEATURE_KEYS, PLANS, PLATFORM_PAYMENT_FEE_BPS, type FeatureKey, type PlanId, type billingApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useNetworkShops } from "@/components/dashboard/FeatureTeaser";
import { Dot, Meter, PageHeader, Panel, Section, Segmented } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async, NoAccess } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { RestaurantBilling } from "./RestaurantBilling";
import { cn } from "@/lib/cn";
import { formatDateYear, formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const HERO: Record<"plus" | "pro", FeatureKey> = { plus: "orders.order_ahead", pro: "service.tickets" };
const FAQ = [
  ["Will loyalty ever cost money?", "No. Your loyalty program and its reports stay free. That's a promise in our terms."],
  [`What's the ${PLATFORM_PAYMENT_FEE_BPS / 100}% fee?`, `Only on deposits and invoices you take in the app with ${PLANS.plus.name} or ${PLANS.pro.name}. The Free plan has no payments and no fees.`],
  [`Why can't I buy ${PLANS.plus.name} yet?`, copy.soon.pricingNote],
  ["What happens if I cancel?", "Your loyalty program keeps running on Free. Members, balances and history are all kept."],
];

export default function BillingPage() {
  const { api, role } = useMerchant();
  const state = useApi(role === "owner" ? () => api.billing.overview() : null, [api, role]);
  if (role !== "owner") return <NoAccess title="Billing is for the owner" body="Ask the shop owner to change plans." />;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader flush title="Billing & plans" description="Loyalty is free forever. Paid tools switch on as the network grows." />
      <Async state={state}>{(b) => <Billing b={b} reload={state.reload} />}</Async>
    </div>
  );
}

function Billing({ b, reload }: { b: billingApi.BillingOverviewResponse; reload: () => Promise<void> }) {
  const { api, base, enabled, merchantId } = useMerchant();
  const params = useSearchParams();
  const toast = useToast();
  const shops = useNetworkShops();
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [cancel, setCancel] = useState(false);
  const act = useAction();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const sub = b.subscription;

  async function checkout(plan: "plus" | "pro") {
    const r = await act.run(() => api.billing.checkout({ plan, interval: period, successUrl: `${origin}${base}/billing?checkout=success`, cancelUrl: `${origin}${base}/billing?checkout=cancelled` }));
    if (r) {
      try {
        sessionStorage.setItem("ll.checkout.return", `${base}/billing?checkout=success`);
      } catch {
        /* ignore */
      }
      window.location.assign(r.url);
    }
  }

  return (
    <>
      {params.get("checkout") === "success" ? <Banner tone="success">Thanks. Your plan updates as soon as the payment confirms.</Banner> : null}
      {params.get("checkout") === "cancelled" ? <Banner tone="neutral">Checkout cancelled. Nothing was charged.</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      <Panel>
        <p className="text-meta text-fg-muted">Current plan</p>
        <h2 className="mt-1 text-title text-fg">
          You&apos;re on {b.plan === "free" ? "Free" : b.plans.find((p) => p.id === b.plan)?.name}
          {b.plan === "free" ? ". Forever." : "."}
        </h2>
        {b.restaurantTier ? <p className="mt-1 text-meta text-fg-muted">With your restaurant plan, Café &amp; Retail tools are included.</p> : null}
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {["No transaction fees", "Unlimited locations, staff and members", "Your loyalty program and reports", "Network listing and perks"].map((t) => (
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-body-strong text-fg">Plans</h2>
        {b.plans.some((p) => p.id !== "free" && p.available) ? <Segmented label="Billing period" value={period} onChange={setPeriod} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Pay yearly: 2 months free" }]} /> : null}
      </div>
      <ul className="-mt-3 grid gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-3">
        {b.plans.map((p) => {
          const feats = FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === p.id && FEATURES[k].phase === 2);
          const target = Math.min(...feats.map((k) => FEATURES[k].unlockAtMerchants).filter((n) => n > 0), Infinity);
          const price = period === "year" ? p.annualPriceCents : p.priceCents;
          return (
            <li key={p.id}>
              <div className="flex h-full flex-col gap-3 bg-bg p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-body-strong text-fg">{p.name}</h3>
                  {p.current ? <Dot tone="positive">Current</Dot> : p.id !== "free" && !p.available ? <Dot>Coming soon</Dot> : null}
                </div>
                <p className={cn("text-[28px] font-semibold leading-8 tracking-[-0.01em] tabular-nums", p.id !== "free" && !p.available ? "text-fg-muted" : "text-fg")}>
                  {p.id === "free" ? "$0" : formatMoney(price).replace(".00", "")}
                  <span className="text-meta font-normal tracking-normal text-fg-muted">{p.id === "free" ? " forever" : period === "year" ? "/year, CAD" : "/month, CAD"}</span>
                </p>
                {p.id !== "free" && !p.available ? <p className="-mt-2 text-caption text-fg-muted">Planned price</p> : null}
                <p className="text-meta text-fg">{p.blurb}</p>
                <p className="text-caption font-normal text-fg-muted">Best for {p.bestFor.join(", ").toLowerCase()}</p>
                <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-meta text-fg">
                  {(p.id === "free" ? ["Points, stamps and visits", "Rewards and welcome bonus", "Network listing and wallet pass", "Customer directory and reports"] : feats.map((k) => FEATURES[k].name)).slice(0, 8).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                      {f}
                    </li>
                  ))}
                  {feats.length > 8 && p.id !== "free" ? <li className="ps-[22px] text-fg-muted">and {feats.length - 8} more: {feats.slice(8).map((k) => FEATURES[k].name.toLowerCase()).join(", ")}</li> : null}
                </ul>
                <div className="mt-auto flex flex-col gap-3 pt-2">
                  {p.id === "free" ? null : p.available ? (
                    !p.current && !sub ? (
                      <Button loading={act.busy} onClick={() => checkout(p.id as "plus" | "pro")}>
                        {`Start ${p.name}`}
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {Number.isFinite(target) && shops != null ? (
                        <div>
                          <div className="mb-1.5 flex justify-between text-caption font-normal text-fg-muted">
                            <span>Switches on at {target} shops</span>
                            <span className="tabular">{Math.min(shops, target)} / {target}</span>
                          </div>
                          <Meter value={Math.min(shops, target)} max={target} label={`${p.name}: network progress`} />
                        </div>
                      ) : null}
                      <Button variant="secondary" size="sm" iconStart={notified.has(p.id) ? Check : undefined} disabled={notified.has(p.id)} onClick={async () => {
                        await api.notifyFeature(HERO[p.id as "plus" | "pro"]).catch(() => undefined);
                        setNotified((s) => new Set(s).add(p.id));
                        toast("We'll email you when it's ready.");
                      }}>
                        {notified.has(p.id) ? "We'll email you" : "Notify me"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-meta text-fg-muted">{copy.soon.pricingPromise}</p>

      <RestaurantBilling />

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
