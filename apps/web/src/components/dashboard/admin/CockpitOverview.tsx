"use client";
/**
 * The founder's overview at the top of /admin (wave N): signups week over week, shops (live, activated, paying by plan), MRR and ARR,
 * trial to paid, money processed through the platform with its split, stamps, bookings and active customers, each with the change
 * against the period before, and 12-week trends. Numbers come from GET /v1/admin/cockpit.
 */
import { useState } from "react";
import { Panel, StatBlock } from "@/components/dashboard/kit";
import { BarChart, LineChart } from "@/components/dashboard/Charts";
import { ListAsync } from "@/components/dashboard/ListStates";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatMoney, formatNumber } from "@/lib/format";
import { PeriodPicker, deltaLine, pct, type Period } from "./cockpit";

const money0 = (c: number) => (c >= 100_000 ? `$${formatNumber(Math.round(c / 100))}` : formatMoney(c));

export function CockpitOverview() {
  const [days, setDays] = useState<Period>(30);
  const s = useApi(() => browserApi.admin.cockpit.overview(days), [days]);
  const ctx = `vs previous ${days} days`;
  return (
    <section aria-labelledby="cockpit-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="cockpit-title" className="font-display text-headline font-bold text-fg">
            Overview
          </h2>
          <p className="text-meta text-fg-muted">Rolling windows ending now, compared with the window before.</p>
        </div>
        <PeriodPicker value={days} onChange={setDays} />
      </div>
      <ListAsync state={s} errorTitle="We could not load the overview. Reload the page to try again." rows={3}>
        {(d) => {
          const plans = d.shops.payingByPlan;
          return (
            <>
              <StatBlock
                tiles
                label="Growth"
                items={[
                  { label: "Signups this week", value: formatNumber(d.signupsWeek.current), delta: deltaLine(d.signupsWeek, "vs last week"), caption: `${formatNumber(d.signupsWeek.previous)} last week`, href: "/admin/businesses?sort=signedUpAt", spark: d.weekly.map((w) => w.signups) },
                  { label: "MRR", value: money0(d.money.mrrCents), caption: `ARR ${money0(d.money.arrCents)}`, href: "/admin/costs" },
                  { label: "Paying shops", value: formatNumber(d.shops.paying), caption: `Pro ${plans.plus} · Studio ${plans.studio} · Service ${plans.pro}${plans.restaurant ? ` · Restaurant ${plans.restaurant}` : ""}`, href: "/admin/businesses?status=paying" },
                  { label: "Trial to paid", value: pct(d.money.trialToPaid.rate), caption: `${d.money.trialToPaid.converted} of ${d.money.trialToPaid.ended} ended trials · ${d.shops.trialing} in trial now`, href: "/admin/businesses?status=trial" },
                ]}
              />
              <StatBlock
                label="Shops"
                cols={4}
                items={[
                  { label: "Shops", value: formatNumber(d.shops.total), caption: `${formatNumber(d.shops.churned)} churned` },
                  { label: "Live", value: formatNumber(d.shops.live), caption: d.shops.total ? `${Math.round((d.shops.live / d.shops.total) * 100)}% of shops` : undefined },
                  { label: "Activated", value: formatNumber(d.shops.activated), caption: "First stamp or booking" },
                  { label: "Signups", value: formatNumber(d.period.signups.current), delta: deltaLine(d.period.signups, ctx) },
                ]}
              />
              <StatBlock
                label={`Activity, last ${days} days`}
                cols={4}
                items={[
                  { label: "Money processed", value: money0(d.period.gmvCents.current), delta: deltaLine(d.period.gmvCents, ctx) },
                  { label: "Stamps given", value: formatNumber(d.period.stamps.current), delta: deltaLine(d.period.stamps, ctx) },
                  { label: "Bookings", value: formatNumber(d.period.bookings.current), delta: deltaLine(d.period.bookings, ctx) },
                  { label: "Active customers", value: formatNumber(d.period.activeCustomers.current), delta: deltaLine(d.period.activeCustomers, ctx) },
                ]}
              />
              <Panel title="Where the money came from" description={`Processed through the platform in the last ${days} days. Deposits count only when no paid invoice carries them.`}>
                <dl data-testid="gmv-split" className="grid grid-cols-2 gap-x-6 gap-y-2 text-meta sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      ["Orders", d.period.gmvSplit.ordersCents],
                      ["Invoices", d.period.gmvSplit.invoicesCents],
                      ["Deposits", d.period.gmvSplit.depositsCents],
                      ["Tiffin", d.period.gmvSplit.tiffinCents],
                      ["Classes", d.period.gmvSplit.classesCents],
                      ["POS sales", d.period.gmvSplit.posCents],
                    ] as const
                  ).map(([label, cents]) => (
                    <div key={label}>
                      <dt className="text-label text-fg-muted">{label}</dt>
                      <dd className="tabular text-fg">{formatMoney(cents)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel>
                  <BarChart title="Signups per week" subtitle="Last 12 weeks" valueLabel="Signups" data={d.weekly.map((w) => ({ label: w.weekStart, value: w.signups }))} />
                </Panel>
                <Panel>
                  <LineChart title="Money processed per week" subtitle="Last 12 weeks" valueLabel="Processed" format={money0} data={d.weekly.map((w) => ({ label: w.weekStart, value: w.gmvCents }))} />
                </Panel>
                <Panel>
                  <BarChart title="Stamps per week" subtitle="Last 12 weeks" valueLabel="Stamps" data={d.weekly.map((w) => ({ label: w.weekStart, value: w.stamps }))} />
                </Panel>
                <Panel>
                  <LineChart title="Active customers per week" subtitle="Last 12 weeks · a visit or a completed appointment" valueLabel="Customers" data={d.weekly.map((w) => ({ label: w.weekStart, value: w.activeCustomers }))} />
                </Panel>
              </div>
            </>
          );
        }}
      </ListAsync>
    </section>
  );
}
