"use client";
import { Check, CreditCard, Leaf, Sprout } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { FEATURES, FEATURE_KEYS, type FeatureKey, type PlanId, type billingApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { FeatureTeaser, useNetworkShops } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async, NoAccess } from "@/components/dashboard/PageStates";
import { Badge, ComingSoonBadge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ChipGroup } from "@/components/ui/Chip";
import { PageHeader, Section } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { formatDateYear, formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const HERO: Record<"plus" | "pro", FeatureKey> = { plus: "orders.order_ahead", pro: "service.tickets" };
const FAQ = [
  ["Will loyalty ever cost money?", "No. Every loyalty feature stays free. That's a promise in our terms."],
  ["What's the 0.75% fee?", "Only on payments you take in the app with Plus or Pro. The Free plan has no payments and no fees."],
  ["Why can't I buy Plus yet?", copy.soon.pricingNote],
  ["What happens if I cancel?", "Your loyalty program keeps running on Free. Members, balances and history are all kept."],
];

export default function BillingPage() {
  const { api, role } = useMerchant();
  const state = useApi(role === "owner" ? () => api.billing.overview() : null, [api, role]);
  if (role !== "owner") return <NoAccess title="Billing is for the owner" body="Ask the shop owner to change plans." />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Billing & plans" description="Loyalty is free forever. Paid tools switch on as the network grows." />
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

      <Card padding="lg" className="border-2 border-brand">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h2 text-fg">
            You&apos;re on <strong>{b.plan === "free" ? "Free" : b.plans.find((p) => p.id === b.plan)?.name}</strong>
            {b.plan === "free" ? ". Forever." : "."}
          </h2>
          <Badge tone="brand">{b.plan === "free" ? "Free plan" : "Current plan"}</Badge>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {["No transaction fees", "Unlimited locations, staff and members", "Every loyalty feature", "Network listing and perks"].map((t) => (
            <li key={t} className="flex items-center gap-2 text-body text-fg">
              <Leaf aria-hidden className="size-5 text-success" />
              {t}
            </li>
          ))}
        </ul>
        {sub ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
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
          <p className="mt-3 text-body-sm text-fg-muted">No card on file needed.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">Plans</h2>
        {b.plans.some((p) => p.id !== "free" && p.available) ? <SegmentedControl label="Billing period" value={period} onChange={setPeriod} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Pay yearly: 2 months free" }]} /> : null}
      </div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {b.plans.map((p) => {
          const feats = FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === p.id && FEATURES[k].phase === 2);
          const target = Math.min(...feats.map((k) => FEATURES[k].unlockAtMerchants).filter((n) => n > 0), Infinity);
          const price = period === "year" ? p.annualPriceCents : p.priceCents;
          return (
            <li key={p.id}>
              <Card padding="lg" className={cn("flex h-full flex-col gap-3", p.current && "outline outline-2 outline-brand")}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-h3 text-fg">{p.name}</h3>
                  {p.current ? <Badge tone="brand">Current</Badge> : p.id !== "free" && !p.available ? <ComingSoonBadge /> : null}
                </div>
                <p className={cn("text-h2 tabular-nums", p.id !== "free" && !p.available ? "text-fg-muted" : "text-fg")}>
                  {p.id === "free" ? "$0" : formatMoney(price).replace(".00", "")}
                  <span className="text-body text-fg-muted">{p.id === "free" ? " forever" : period === "year" ? "/year, CAD" : "/month, CAD"}</span>
                </p>
                {p.id !== "free" && !p.available ? <p className="-mt-2 text-caption text-fg-muted">Planned price</p> : null}
                <p className="text-body-sm text-fg">{p.blurb}</p>
                <ChipGroup label="Best for">
                  {p.bestFor.map((x) => (
                    <span key={x} className="inline-flex h-7 items-center rounded-full bg-surface-sunken px-2.5 text-caption text-fg">
                      {x}
                    </span>
                  ))}
                </ChipGroup>
                <ul className="flex flex-col gap-1.5 text-body-sm text-fg">
                  {(p.id === "free" ? ["Points, stamps and visits", "Rewards, VIP levels, promos", "Email campaigns", "POS integrations and reports"] : feats.map((k) => FEATURES[k].name)).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
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
                      {Number.isFinite(target) && shops != null ? <ProgressBar value={Math.min(shops, target)} max={target} label="Network progress" valueText={`${shops} of ${target} shops on the network`} /> : null}
                      {Number.isFinite(target) && shops != null ? <p className="text-caption text-fg-muted">Paid features switch on at {target} shops.</p> : null}
                      <Button variant="tonal" iconStart={notified.has(p.id) ? Check : Sprout} disabled={notified.has(p.id)} onClick={async () => {
                        await api.notifyFeature(HERO[p.id as "plus" | "pro"]).catch(() => undefined);
                        setNotified((s) => new Set(s).add(p.id));
                        toast("We'll email you when it's ready.");
                      }}>
                        {notified.has(p.id) ? "We'll email you" : "Notify me"}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-body-sm text-fg-muted">{copy.soon.pricingPromise}</p>

      <Section title="Payments in the app">
        {enabled("payments.in_app") ? <PaymentsCard merchantId={merchantId} /> : <FeatureTeaser featureKey="payments.in_app" title="In-app payments" description="Take deposits, invoices and order-ahead payments by card. 0.75% platform fee on Plus and Pro; Free has no payments and no fees." />}
      </Section>

      <Section title="Questions">
        <div className="flex flex-col divide-y divide-border rounded-lg bg-surface shadow-sm">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="min-h-11 cursor-pointer list-none py-2 text-body-strong text-fg">{q}</summary>
              <p className="pb-2 text-body text-fg-muted">{a}</p>
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
    <Card padding="lg">
      <CardHeader title="Stripe payouts" subtitle="Card payments go straight to your bank through Stripe." action={status.data?.chargesEnabled ? <Badge tone="success">Ready</Badge> : status.data?.connected ? <Badge tone="info">Finishing setup</Badge> : <Badge>Not set up</Badge>} />
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
    </Card>
  );
}

export type { PlanId };
