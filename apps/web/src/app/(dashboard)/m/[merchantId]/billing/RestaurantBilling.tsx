"use client";
import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FEATURES, RESTAURANT_FEATURES, type RestaurantTier, type billingApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Dot, Meter, Panel, Section, Segmented, Table, TableWrap, Td, Th } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { formatDate, formatDateYear, formatMoney, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const money = (cents: number) => formatMoney(cents).replace(".00", "");
const TIER_RANK: Record<RestaurantTier, number> = { starter: 0, growth: 1, pro: 2 };
const pctText = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** What each tier adds on top of the one below it, from the shared feature list so it can't drift from gating. */
const addedBy = (tier: RestaurantTier) => RESTAURANT_FEATURES.filter((k) => FEATURES[k].packTier === tier).map((k) => FEATURES[k].name);

/** Restaurant pack: current tier, upgrade cards, add-ons, fee explainer and invoice history. */
export function RestaurantBilling({ autoTier = null, recommended = null }: { autoTier?: RestaurantTier | null; recommended?: RestaurantTier | null }) {
  const { api } = useMerchant();
  const state = useApi(() => api.billing.restaurant(), [api]);
  const invoices = useApi(() => api.billing.invoices(), [api]);
  return (
    <Async state={state}>
      {(r) => (
        <Pack
          r={r}
          invoices={invoices.data?.items ?? null}
          autoTier={autoTier}
          recommended={recommended}
          reload={async () => {
            await Promise.all([state.reload(), invoices.reload()]);
          }}
        />
      )}
    </Async>
  );
}

function Pack({ r, invoices, reload, autoTier, recommended }: { r: billingApi.RestaurantBillingResponse; invoices: billingApi.InvoiceDto[] | null; reload: () => Promise<void>; autoTier: RestaurantTier | null; recommended: RestaurantTier | null }) {
  const { api, base } = useMerchant();
  const act = useAction();
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [cancel, setCancel] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const sub = r.subscription;
  const founding = r.foundingOffer;
  const current = r.plans.find((p) => p.current);

  async function choose(tier: RestaurantTier) {
    if (sub) {
      await act.run(() => api.billing.restaurantChange(tier));
      await reload();
      return;
    }
    const res = await act.run(() => api.billing.restaurantCheckout({ tier, interval: period, successUrl: `${origin}${base}/billing?checkout=success`, cancelUrl: `${origin}${base}/billing?checkout=cancelled` }));
    if (res) window.location.assign(res.url);
  }

  // "Start Restaurant Growth" on the pricing page arrives as ?subscribe=restaurant-growth: open that checkout once.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !autoTier || sub || !r.plans.some((p) => p.tier === autoTier)) return;
    autoRan.current = true;
    void choose(autoTier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTier, sub]);

  return (
    <>
      <Section title="Restaurant plan" description="For restaurants, sweet shops and tiffin kitchens. Any tier includes Pro.">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <Panel>
          <p className="text-meta text-fg-muted">Current restaurant plan</p>
          <h3 className="mt-1 text-title text-fg">{current ? current.name : "Not on a restaurant plan"}</h3>
          {sub ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <p className="text-body text-fg">
                {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDateYear(sub.currentPeriodEnd)} · billed {sub.interval === "year" ? "yearly" : "monthly"} · {sub.status.replace("_", " ")}
              </p>
              {sub.cancelAtPeriodEnd ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await act.run(() => api.billing.restaurantResume());
                    await reload();
                  }}
                >
                  Keep my plan
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setCancel(true)}>
                  Cancel restaurant plan
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-meta text-fg-muted">Commission-free ordering, your own ordering page, WhatsApp updates and more. Pick a tier below.</p>
          )}
          {founding.eligible ? (
            <p className="mt-4 border-t border-line pt-3 text-meta text-fg">
              Founding restaurant: {founding.firstYearPct}% off for your first 12 months, then {founding.lifetimePct}% off for as long as you stay.
            </p>
          ) : null}
        </Panel>

        {!sub ? <Segmented label="Billing period" value={period} onChange={setPeriod} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Pay yearly: 2 months free" }]} /> : null}
        <ul className="grid gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-3">
          {r.plans.map((p) => {
            const price = period === "year" && !sub ? p.annualPriceCents : p.priceCents;
            const lower = r.plans.filter((x) => TIER_RANK[x.tier] < TIER_RANK[p.tier]);
            const feats = addedBy(p.tier);
            const down = r.tier != null && TIER_RANK[p.tier] < TIER_RANK[r.tier];
            return (
              <li key={p.tier}>
                <div className="flex h-full flex-col gap-3 bg-bg p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-body-strong text-fg">{p.name}</h4>
                    {p.current ? <Dot tone="positive">Current</Dot> : recommended === p.tier && !current ? <Dot tone="accent">Recommended for you</Dot> : null}
                  </div>
                  <p className="text-[28px] font-semibold leading-8 tracking-[-0.01em] tabular-nums text-fg">
                    {money(price)}
                    <span className="text-meta font-normal tracking-normal text-fg-muted">{period === "year" && !sub ? "/year, CAD" : "/month, CAD"}</span>
                  </p>
                  {p.foundingPriceCents != null && !(period === "year" && !sub) ? (
                    <p className="-mt-2 text-caption text-fg-muted">
                      {money(p.foundingPriceCents)}/month for 12 months, then {money(p.foundingLifetimePriceCents ?? p.priceCents)}/month
                    </p>
                  ) : null}
                  <p className="text-meta text-fg">{p.blurb}</p>
                  <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-meta text-fg">
                    {lower.length ? <li className="text-fg-muted">Everything in {lower[lower.length - 1]!.name}, plus</li> : <li className="text-fg-muted">Includes Pro</li>}
                    {feats.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                        {f}
                      </li>
                    ))}
                    {p.whatsappPerMonth ? (
                      <li className="flex items-start gap-2">
                        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-muted" />
                        {formatNumber(p.whatsappPerMonth)} WhatsApp messages a month
                      </li>
                    ) : null}
                  </ul>
                  <div className="mt-auto pt-2">
                    {p.current ? null : (
                      <Button variant={down ? "secondary" : "primary"} loading={act.busy} onClick={() => choose(p.tier)}>
                        {sub ? (down ? `Switch to ${p.name}` : `Upgrade to ${p.name}`) : `Start ${p.name}`}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Add-ons" description="Added to your restaurant plan and prorated to today. Take one off any time.">
        {sub ? (
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {r.addOns.map((a) => (
              <AddOnRow key={a.id} a={a} busy={act.busy} onSet={async (on, quantity) => {
                await act.run(() => (on ? api.billing.attachAddOn(a.id, quantity) : api.billing.detachAddOn(a.id)));
                await reload();
              }} />
            ))}
          </div>
        ) : (
          <p className="text-meta text-fg-muted">Add-ons unlock once you&apos;re on a restaurant plan.</p>
        )}
        {r.tier ? (
          <div className="max-w-[420px]">
            <div className="mb-1.5 flex justify-between text-caption font-normal text-fg-muted">
              <span>WhatsApp messages this month</span>
              <span className="tabular">
                {formatNumber(r.whatsapp.used)} of {formatNumber(r.whatsapp.includedPerMonth + r.whatsapp.extraCredits)}
              </span>
            </div>
            <Meter value={Math.min(r.whatsapp.used, Math.max(1, r.whatsapp.includedPerMonth + r.whatsapp.extraCredits))} max={Math.max(1, r.whatsapp.includedPerMonth + r.whatsapp.extraCredits)} label="WhatsApp messages used" />
          </div>
        ) : null}
      </Section>

      <Section title="What you pay on payments" description="Card processing is Stripe's standard rate, passed through at cost. These are our fees on top.">
        <TableWrap>
          <Table label="Payment fees">
            <thead>
              <tr>
                <Th>Payment</Th>
                <Th align="end">Our fee</Th>
                <Th className="hidden sm:table-cell">Note</Th>
              </tr>
            </thead>
            <tbody>
              {r.fees.map((f) => (
                <tr key={f.kind}>
                  <Td>{f.label}</Td>
                  <Td align="end">{f.platformFeeBps === 0 ? "None" : pctText(f.platformFeeBps)}</Td>
                  <Td className="hidden whitespace-normal text-fg-muted sm:table-cell">{f.note}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="text-meta text-fg-muted">Delivery apps keep roughly 15 to 30% of every order. On a restaurant plan, online orders keep it all.</p>
      </Section>

      <Section title="Invoices">
        {invoices == null ? (
          <p className="text-meta text-fg-muted">Loading invoices.</p>
        ) : invoices.length === 0 ? (
          <p className="text-meta text-fg-muted">No invoices yet. They show up here after your first payment.</p>
        ) : (
          <TableWrap>
            <Table label="Invoice history">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th className="hidden sm:table-cell">Description</Th>
                  <Th>Status</Th>
                  <Th align="end">Amount</Th>
                  <Th align="end">
                    <span className="sr-only">Open</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>{formatDate(i.createdAt)}</Td>
                    <Td className="hidden max-w-[320px] truncate text-fg-muted sm:table-cell">{i.description ?? i.number ?? "Subscription"}</Td>
                    <Td>
                      <Dot tone={i.status === "paid" ? "positive" : i.status === "open" ? "info" : "neutral"}>{i.status}</Dot>
                    </Td>
                    <Td align="end">{formatMoney(i.totalCents)}</Td>
                    <Td align="end">
                      {i.hostedUrl ? (
                        <a href={i.hostedUrl} target="_blank" rel="noreferrer" className={cn("text-meta-strong text-fg underline-offset-2 hover:underline")}>
                          View
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>

      <ConfirmDialog
        open={cancel}
        onClose={() => setCancel(false)}
        title="Cancel your restaurant plan?"
        body="Restaurant tools turn off at the end of this period. Your menu, customers and loyalty program are kept."
        confirmLabel="Cancel restaurant plan"
        danger
        onConfirm={async () => {
          await api.billing.restaurantCancel();
          await reload();
        }}
      />
    </>
  );
}

function AddOnRow({ a, busy, onSet }: { a: billingApi.AddOnDto; busy: boolean; onSet: (on: boolean, quantity: number) => Promise<void> }) {
  const multi = a.id === "extra_location";
  const suffix = a.unit === "pack" ? "per pack, each period" : "per month";
  const description = `${money(a.priceCents)} ${suffix}${a.unavailableReason ? `. ${a.unavailableReason}` : ""}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <div className="min-w-0 flex-1">
        <Switch label={a.name} description={description} checked={a.active} disabled={busy || (!a.active && !a.available)} onChange={(on) => onSet(on, a.quantity || 1)} />
      </div>
      {multi && a.active ? (
        <div className="flex items-center gap-2" role="group" aria-label="Extra locations">
          <Button variant="secondary" size="sm" aria-label="One fewer location" disabled={busy || a.quantity <= 1} onClick={() => onSet(true, a.quantity - 1)}>
            <Minus aria-hidden className="size-4" />
          </Button>
          <span className="min-w-6 text-center text-meta-strong tabular text-fg">{a.quantity}</span>
          <Button variant="secondary" size="sm" aria-label="One more location" disabled={busy || a.quantity >= 50} onClick={() => onSet(true, a.quantity + 1)}>
            <Plus aria-hidden className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
