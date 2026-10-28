"use client";
import { PageHeader, Panel, StatBlock, Tag, Meter } from "@/components/dashboard/kit";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { BarChart } from "@/components/dashboard/Charts";
import { NetworkGauges } from "@/components/dashboard/NetworkGauges";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { longDate } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

const REASON: Record<adminApi.AtRiskReason, string> = { payment_failed: "Payment failed", stalled_setup: "Setup stalled", quiet: "Gone quiet", slow_activation: "Slow to activate", sms_cap: "SMS allowance used" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Shops listed before "All N": the founder calls the worst few first; the funnel table beside it stays the same height. */
const AT_RISK_PREVIEW = 6;

/** Founder's morning: am I on pace, what do I earn and spend, which street is stalling, which shops need a call. */
export default function AdminToday() {
  const o = useApi(() => browserApi.admin.overview(), []);
  const net = useApi(() => browserApi.admin.dashboard(), []);
  const [all, setAll] = useState<adminApi.AtRiskShop[] | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Today" description={longDate()} actions={<Button size="sm" variant="secondary" href="/admin/neighbourhoods">Plan areas</Button>} />
      <ListAsync state={o} errorTitle="We could not load the network overview.">
        {(d) => {
          const behind = d.pace.delta < 0;
          const risk = all ?? d.atRisk.items.slice(0, AT_RISK_PREVIEW);
          return (
            <>
              <Panel
                title="Pace against the plan"
                description={d.pace.month ? `Plan: ${formatNumber(d.pace.plannedEndOfMonth)} shops by the end of month ${d.pace.month}, 400 by month 3` : "The plan starts in November. Shops signed so far count as ahead."}
                action={<Tag tone={behind ? "accent" : "neutral"}>{d.pace.month === 0 ? "Before the plan" : behind ? `Behind by ${formatNumber(-d.pace.delta)} shops` : d.pace.delta === 0 ? "On pace" : `Ahead by ${formatNumber(d.pace.delta)} shops`}</Tag>}
              >
                {d.pace.month ? <Meter value={Math.min(d.pace.actual, d.pace.plannedEndOfMonth)} max={d.pace.plannedEndOfMonth} label="Shops signed against this month's plan" tone={behind ? "accent" : "fg"} /> : null}
                <p className="mt-2 text-meta text-fg-muted tabular">{formatNumber(d.pace.actual)} signed · {formatNumber(d.pace.plannedToday)} planned by today · {d.pace.areasOpened} areas opened, {d.pace.areasPlanned} planned this month</p>
              </Panel>
              <StatBlock
                label="Money and activation"
                items={[
                  { label: "MRR", value: formatMoney(d.money.mrrCents), caption: d.money.payingShops ? `${d.money.payingShops} paying · Plus ${d.money.byPlan.plus}, Pro ${d.money.byPlan.pro}${d.money.byPlan.restaurant ? `, Restaurant ${d.money.byPlan.restaurant}` : ""}` : "Paid plans start in month 4", href: "/admin/costs" },
                  { label: "Fee revenue, 30 days", value: formatMoney(d.money.feeRevenue30dCents), caption: `On ${formatMoney(d.money.volume30dCents)} paid through the app` },
                  { label: "Activated", value: pct(d.activation.rate), caption: `${formatNumber(d.activation.activated)} of ${formatNumber(d.activation.signed)} shops · goal ${pct(d.activation.goal)}`, dot: d.activation.rate < d.activation.goal && d.activation.signed >= 10 ? "accent" : undefined },
                  { label: "Cost per shop", value: formatMoney(d.costs.perShopCents), caption: `${formatMoney(d.costs.monthCents)} this month for ${formatNumber(d.costs.shops)} shops`, href: "/admin/costs" },
                ]}
              />
              {d.money.mrrCents ? (
                <Panel title="What MRR is made of" description="Plan subscriptions, restaurant tiers and add-ons on paying shops">
                  <dl data-testid="mrr-split" className="grid grid-cols-2 gap-x-6 gap-y-2 text-meta sm:grid-cols-5">
                    {([
                      ["Plus and Pro", d.money.mrrSplit.plansCents],
                      ["Restaurant tiers", d.money.mrrSplit.restaurantCents],
                      ["WhatsApp packs", d.money.mrrSplit.whatsappCents],
                      ["Extra locations", d.money.mrrSplit.extraLocationsCents],
                      ["Other add-ons", d.money.mrrSplit.otherAddOnsCents],
                    ] as const).map(([label, cents]) => (
                      <div key={label}>
                        <dt className="text-label text-fg-muted">{label}</dt>
                        <dd className="tabular text-fg">{formatMoney(cents)}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              ) : null}
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Panel title="Signups by area" description="Leads, shops signed and activated against the area's target" padded={false}>
                  {d.funnel.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-meta">
                        <caption className="sr-only">Funnel by area</caption>
                        <thead className="bg-bg-subtle text-label text-fg-muted">
                          <tr>
                            <th scope="col" className="px-4 py-2.5 text-start">Area</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Leads</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Signed</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Activated</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Of target</th>
                            <th scope="col" className="px-4 py-2.5 text-end">Calls due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.funnel.map((f) => (
                            <tr key={f.neighbourhoodId} className="border-t border-line">
                              <td className="px-4 py-3"><span className="font-medium text-fg">{f.name}</span>{f.streetDayOn ? <span className="block text-caption text-fg-muted">Street day {formatDate(`${f.streetDayOn}T12:00:00`, true)}</span> : null}</td>
                              <td className="px-3 py-3 text-end tabular">{f.leads}</td>
                              <td className="px-3 py-3 text-end tabular">{f.signed}</td>
                              <td className="px-3 py-3 text-end tabular">{f.activated}</td>
                              <td className="px-3 py-3 text-end tabular">{pct(f.signedPct)} <span className="text-fg-subtle">of {f.targetShops}</span></td>
                              <td className="px-4 py-3 text-end tabular">{f.checkInsDue ? <span className="text-fg">{f.checkInsDue} due</span> : <span className="text-fg-subtle">0</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-4 py-4 text-meta text-fg-muted">No area has leads or shops yet. Plan an area to start the funnel.</p>
                  )}
                </Panel>
                <Panel title="Shops at risk" description={`${d.atRisk.total} to call, most urgent first`} padded={false} action={d.atRisk.total > AT_RISK_PREVIEW && !all ? <Button size="sm" variant="ghost" onClick={async () => setAll((await browserApi.admin.atRisk()).items)}>All {d.atRisk.total}</Button> : null}>
                  {risk.length ? (
                    <ul className="divide-y divide-line">
                      {risk.map((r) => (
                        <li key={r.merchantId} className="flex items-center gap-3 px-4 py-3">
                          <span aria-hidden className={`size-2 shrink-0 rounded-full ${r.reason === "payment_failed" ? "bg-negative" : r.reason === "sms_cap" ? "bg-fg-subtle" : "bg-points"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-medium text-fg">{r.name}</p>
                            <p className="text-meta text-fg-muted"><span className="text-fg">{REASON[r.reason]}.</span> {r.detail}</p>
                          </div>
                          <Button size="sm" variant="secondary" href={`/admin/merchants/${r.merchantId}`}>Open</Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-4 text-meta text-fg-muted">No shop needs a call.</p>
                  )}
                </Panel>
              </div>
            </>
          );
        }}
      </ListAsync>
      <ListAsync state={net} errorTitle="We could not load the network overview.">
        {(n) => (
          <>
            <NetworkGauges activeMerchants={n.merchants.byStatus.active} multiShopPct={n.multiShopPct} />
            <Panel>
              <BarChart title="Weekly visits" subtitle="Last 8 weeks, network-wide · grey: active customers" valueLabel="Visits" compareLabel="Active customers" data={n.weeklyVisits.map((w) => ({ label: w.weekStart.slice(0, 10), value: w.visits, compare: w.activeCustomers }))} />
            </Panel>
          </>
        )}
      </ListAsync>
    </div>
  );
}
