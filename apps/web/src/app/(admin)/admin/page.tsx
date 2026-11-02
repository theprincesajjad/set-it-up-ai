"use client";
import { MapPinned } from "lucide-react";
import { PageHeader, Panel, Tag } from "@/components/dashboard/kit";
import { CockpitOverview, SystemStatus } from "@/components/dashboard/admin/CockpitOverview";
import { KpiGrid, PanelEmpty, UsageMeter, moneyNum, pctNum } from "@/components/dashboard/admin/AdminKit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { longDate } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Founder's Monday morning: the overview first (numbers, who is slipping, who signed, who paid), then the launch plan by area. */
export default function AdminToday() {
  const o = useApi(() => browserApi.admin.overview(), []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Today" description={longDate()} actions={<SystemStatus />} />
      <CockpitOverview />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-8">
        <div>
          <h2 className="font-display text-headline font-bold text-fg">Launch plan</h2>
          <p className="text-meta text-fg-muted">Shops signed against the plan, by area, and what the network earns and costs.</p>
        </div>
        <Button size="sm" variant="secondary" href="/admin/neighbourhoods">Plan areas</Button>
      </div>
      <ListAsync state={o} errorTitle="Couldn't load the overview. Reload the page to try again.">
        {(d) => {
          const behind = d.pace.delta < 0;
          return (
            <>
              <Panel
                title="Pace against the plan"
                description={d.pace.month ? `Plan: ${formatNumber(d.pace.plannedEndOfMonth)} shops by the end of month ${d.pace.month}, 400 by month 3` : "The plan starts in November. Shops signed so far count as ahead."}
                action={<Tag tone={behind ? "accent" : "neutral"}>{d.pace.month === 0 ? "Before the plan" : behind ? `Behind by ${formatNumber(-d.pace.delta)} shops` : d.pace.delta === 0 ? "On pace" : `Ahead by ${formatNumber(d.pace.delta)} shops`}</Tag>}
              >
                {d.pace.month ? <UsageMeter label="Shops signed against this month's plan" value={d.pace.actual} max={d.pace.plannedEndOfMonth} levels={false} valueText={`${formatNumber(d.pace.actual)} of ${formatNumber(d.pace.plannedEndOfMonth)} shops`} /> : null}
                <p className="mt-2 text-meta text-fg-muted tabular">{formatNumber(d.pace.actual)} signed · {formatNumber(d.pace.plannedToday)} planned by today · {d.pace.areasOpened} areas opened, {d.pace.areasPlanned} planned this month</p>
              </Panel>
              <KpiGrid
                dl
                size="sm"
                cols={3}
                label="Money and activation"
                items={[
                  { label: "Fee revenue, 30 days", value: formatMoney(d.money.feeRevenue30dCents), ...moneyNum(d.money.feeRevenue30dCents), caption: `On ${formatMoney(d.money.volume30dCents)} paid through the app` },
                  { label: "At customer goal", value: pct(d.activation.rate), ...pctNum(d.activation.rate), caption: `${formatNumber(d.activation.activated)} of ${formatNumber(d.activation.signed)} shops reached their customer goal · target ${pct(d.activation.goal)}`, alert: d.activation.rate < d.activation.goal && d.activation.signed >= 10 ? "warning" : undefined },
                  { label: "Cost per shop", value: formatMoney(d.costs.perShopCents), ...moneyNum(d.costs.perShopCents), caption: `${formatMoney(d.costs.monthCents)} this month for ${formatNumber(d.costs.shops)} shops`, href: "/admin/costs" },
                ]}
              />
                <Panel title="Signups by area" description="Leads, shops signed and shops at their member goal, against the area's target" padded={false}>
                  {d.funnel.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-meta">
                        <caption className="sr-only">Funnel by area</caption>
                        <thead className="bg-bg-subtle text-caption font-medium text-fg-muted">
                          <tr>
                            <th scope="col" className="px-4 py-2.5 text-start">Area</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Leads</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Signed</th>
                            <th scope="col" className="px-3 py-2.5 text-end">At member goal</th>
                            <th scope="col" className="px-3 py-2.5 text-end">Of target</th>
                            <th scope="col" className="px-4 py-2.5 text-end">Calls due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.funnel.map((f) => (
                            <tr key={f.neighbourhoodId} className="border-t border-line transition-colors hover:bg-bg-subtle">
                              <td className="px-4 py-3"><span className="font-medium text-fg">{f.name}</span>{f.streetDayOn ? <span className="block text-caption text-fg-muted">Street day {formatDate(`${f.streetDayOn}T12:00:00`, true)}</span> : null}</td>
                              <td className="px-3 py-3 text-end tabular">{f.leads}</td>
                              <td className="px-3 py-3 text-end tabular">{f.signed}</td>
                              <td className="px-3 py-3 text-end tabular">{f.activated}</td>
                              <td className="px-3 py-3 text-end tabular">
                                <span className="ms-auto flex w-40 flex-col items-end gap-1">
                                  <span>{pct(f.signedPct)} <span className="text-fg-muted">of {f.targetShops}</span></span>
                                  <UsageMeter hideLabel size="sm" levels={false} label={`${f.name}: shops signed of the target`} value={f.signed} max={f.targetShops} className="w-full" />
                                </span>
                              </td>
                              <td className="px-4 py-3 text-end tabular">{f.checkInsDue ? <span className="text-fg">{f.checkInsDue} due</span> : <span className="text-fg-muted">0</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <PanelEmpty icon={MapPinned} title="No area has leads or shops yet" description="Plan an area and give it a street day to start the funnel." action={<Button size="sm" variant="secondary" href="/admin/neighbourhoods">Plan areas</Button>} />
                  )}
                </Panel>
            </>
          );
        }}
      </ListAsync>
    </div>
  );
}
