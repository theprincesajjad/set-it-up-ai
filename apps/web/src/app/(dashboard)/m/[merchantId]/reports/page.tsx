"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { BarChart, HBarList, WeekdayBars } from "@/components/dashboard/Charts";
import { FeatureTeaser } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { downloadCsv } from "@/lib/dashboard/download";
import { pctDelta, rangeFor, type RangeKey } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

type Tab = "overview" | "visits" | "members" | "rewards" | "promos" | "network" | "advanced";
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function ReportsPage() {
  const { api, role, enabled } = useMerchant();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Exclude<RangeKey, "today">>("30d");
  const [compare, setCompare] = useState(false);
  const r = rangeFor(range);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const prevFrom = new Date(new Date(r.from).getTime() - days * 86_400_000).toISOString();
  const manager = role !== "staff";
  const overview = useApi(manager ? () => api.reports.overview({ from: r.from, to: r.to }) : null, [api, range]);
  const daily = useApi(manager ? () => api.reports.daily({ from: r.from, to: r.to }) : null, [api, range]);
  const prevDaily = useApi(manager && compare ? () => api.reports.daily({ from: prevFrom, to: r.from }) : null, [api, range, compare]);
  const top = useApi(manager && (tab === "visits" || tab === "members") ? () => api.reports.topCustomers({ from: r.from, to: r.to, by: tab === "visits" ? "visits" : "spend", limit: 10 }) : null, [api, range, tab]);
  const rewards = useApi(manager && tab === "rewards" ? () => api.reports.rewards({ from: r.from, to: r.to }) : null, [api, range, tab]);
  const promos = useApi(manager && tab === "promos" ? () => api.reports.promos() : null, [api, tab]);
  const overlap = useApi(manager && tab === "network" ? () => api.reports.networkOverlap() : null, [api, tab]);
  const activation = useApi(manager && tab === "members" ? () => api.reports.activation() : null, [api, tab]);
  const retention = useApi(manager && tab === "advanced" && enabled("reports.advanced") ? () => api.reports.retention(6) : null, [api, tab]);
  if (!manager) return <NoAccess />;

  const series = daily.data?.series ?? [];
  const prev = prevDaily.data?.series ?? [];
  const c = overview.data?.current;
  const p = overview.data?.previous;
  const d = (cur?: number, pr?: number) => {
    if (cur == null || pr == null) return null;
    const x = pctDelta(cur, pr);
    return x === null ? null : { pct: x, good: x > 0 ? true : x < 0 ? false : null, text: `${x >= 0 ? "+" : ""}${x}% vs ${r.label}` };
  };
  const exportBtn = (name: string, rows: (string | number)[][]) => (
    <Button variant="ghost" size="sm" iconStart={Download} onClick={() => downloadCsv(name, rows)}>
      Export CSV
    </Button>
  );
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const s of series) weekday[new Date(`${s.date}T12:00:00Z`).getUTCDay()]! += s.visits;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="All the basics are free. Customer names are only shown for your own shop." actions={<SegmentedControl label="Date range" value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />} />
      <Tabs label="Report" value={tab} onChange={(v) => setTab(v as Tab)} items={[{ id: "overview", label: "Overview" }, { id: "visits", label: "Visits" }, { id: "members", label: "Members" }, { id: "rewards", label: "Rewards" }, { id: "promos", label: "Promos" }, { id: "network", label: "Network" }, { id: "advanced", label: "Retention", meta: enabled("reports.advanced") ? null : <Badge>Soon</Badge> }]} />

      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Visits" value={c ? formatNumber(c.visits) : null} loading={!c} delta={d(c?.visits, p?.visits)} />
            <StatTile label="Active members" value={c ? formatNumber(c.activeMembers) : null} loading={!c} delta={d(c?.activeMembers, p?.activeMembers)} />
            <StatTile label="New members" value={c ? formatNumber(c.newMembers) : null} loading={!c} delta={d(c?.newMembers, p?.newMembers)} />
            <StatTile label="Redemption rate" value={c ? pct(c.redemptionRate) : null} loading={!c} caption="Goal: 20% a month" />
            <StatTile label="Spend by members" value={c ? formatMoney(c.revenueFromMembersCents) : null} loading={!c} caption={c ? `${formatMoney(c.avgSpendPerVisitCents)} per visit` : undefined} />
            <StatTile label="Came back" value={c ? pct(c.repeatRate) : null} loading={!c} caption="Active members with 2+ visits" />
          </div>
          <Switch label="Compare to previous period" checked={compare} onChange={setCompare} />
          {daily.data ? (
            <BarChart title="Visits per day" valueLabel="Visits" compareLabel={compare ? "Previous period" : undefined} data={series.map((s, i) => ({ label: formatDate(`${s.date}T12:00:00Z`), value: s.visits, compare: compare ? prev[i]?.visits : undefined }))} action={exportBtn("visits-per-day.csv", [["date", "visits", "new_members", "points_issued", "points_redeemed", "revenue"], ...series.map((s) => [s.date, s.visits, s.newMembers, s.pointsIssued, s.pointsRedeemed, (s.revenueCents / 100).toFixed(2)])])} />
          ) : (
            <Skeleton className="h-60 rounded-lg" />
          )}
          {daily.data ? <BarChart title="New members per day" valueLabel="New members" data={series.map((s) => ({ label: formatDate(`${s.date}T12:00:00Z`), value: s.newMembers }))} /> : null}
        </>
      ) : null}

      {tab === "visits" ? (
        <>
          <Card padding="lg">
            <CardHeader title="Busiest days" subtitle="Total visits by weekday in this range" action={exportBtn("visits-by-weekday.csv", [["weekday", "visits"], ...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w, i) => [w, weekday[i]!])])} />
            <WeekdayBars counts={weekday} />
          </Card>
          <Card padding="lg">
            <CardHeader title="Most frequent visitors" />
            {top.data ? <HBarList rows={top.data.items.map((t) => ({ key: t.memberId, label: `${t.name ?? "Member"}${t.phoneLast4 ? ` ···${t.phoneLast4}` : ""}`, value: t.visits }))} /> : <Skeleton className="h-40" />}
          </Card>
        </>
      ) : null}

      {tab === "members" ? (
        <>
          {activation.data ? (
            <Card padding="lg">
              <CardHeader title="Activation" subtitle={activation.data.activatedAt ? `Activated ${formatDate(activation.data.activatedAt)}` : `${activation.data.daysSinceSignup} days since you joined`} />
              <ProgressBar value={activation.data.activeMembers} max={activation.data.target} label="Members with a visit" valueText={`${activation.data.activeMembers} of ${activation.data.target}`} />
            </Card>
          ) : null}
          <Card padding="lg">
            <CardHeader title="Top customers by spend" action={top.data ? exportBtn("top-customers.csv", [["name", "last4", "visits", "spend", "points_earned", "balance"], ...top.data.items.map((t) => [t.name ?? "", t.phoneLast4 ?? "", t.visits, (t.spendCents / 100).toFixed(2), t.pointsEarned, t.balance])]) : null} />
            {top.data ? <HBarList format={(n) => formatMoney(n)} rows={top.data.items.map((t) => ({ key: t.memberId, label: t.name ?? "Member", value: t.spendCents, hint: `${t.visits} visits` }))} /> : <Skeleton className="h-40" />}
          </Card>
        </>
      ) : null}

      {tab === "rewards" ? (
        <Card padding="lg">
          <CardHeader title="Redemptions by reward" action={rewards.data ? exportBtn("rewards.csv", [["reward", "cost", "redemptions", "members", "points_spent", "discount"], ...rewards.data.items.map((x) => [x.name, x.pointsCost, x.redemptions, x.uniqueMembers, x.pointsSpent, (x.discountCents / 100).toFixed(2)])]) : null} />
          {rewards.data ? (rewards.data.items.length ? <HBarList rows={rewards.data.items.map((x) => ({ key: x.rewardId, label: x.name, value: x.redemptions, hint: `${x.uniqueMembers} members` }))} /> : <p className="text-body-sm text-fg-muted">Not enough data yet. Check back after a week of visits.</p>) : <Skeleton className="h-40" />}
        </Card>
      ) : null}

      {tab === "promos" ? (
        <Card padding="lg">
          <CardHeader title="Promo results" subtitle="Visits during each promo compared with the 14 days before." />
          {promos.data ? (
            promos.data.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <caption className="sr-only">Promo results</caption>
                  <thead className="text-label text-fg-muted">
                    <tr>
                      <th scope="col" className="py-2 text-start">Promo</th>
                      <th scope="col" className="py-2 text-end">Views</th>
                      <th scope="col" className="py-2 text-end">Redemptions</th>
                      <th scope="col" className="py-2 text-end">Visits</th>
                      <th scope="col" className="py-2 text-end">Lift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promos.data.items.map((x) => (
                      <tr key={x.promoId} className="border-t border-border">
                        <td className="py-2">{x.title}</td>
                        <td className="py-2 text-end tabular-nums">{formatNumber(x.views)}</td>
                        <td className="py-2 text-end tabular-nums">{formatNumber(x.claims)}</td>
                        <td className="py-2 text-end tabular-nums">{formatNumber(x.attributedVisits)}</td>
                        <td className="py-2 text-end tabular-nums">{x.liftPct == null ? "–" : `${x.liftPct > 0 ? "+" : ""}${Math.round(x.liftPct)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-body-sm text-fg-muted">Results show up once a promo goes live.</p>
            )
          ) : (
            <Skeleton className="h-40" />
          )}
        </Card>
      ) : null}

      {tab === "network" ? (
        overlap.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="Also shop on your street" value={pct(overlap.data.sharedPct)} caption={`${formatNumber(overlap.data.sharedMembers)} of ${formatNumber(overlap.data.myMembers)} members, last ${overlap.data.windowDays} days`} />
              <StatTile label="Other shops they visit" value={overlap.data.avgOtherShops.toFixed(1)} caption="On average" />
            </div>
            <Card padding="lg">
              <CardHeader title={`Overlap on ${overlap.data.neighbourhood?.name ?? "your street"}`} subtitle="Aggregated: no customer is ever identified. Shops with fewer than 5 shared members aren't listed." />
              {overlap.data.shops.length ? <HBarList tone="chart-network" rows={overlap.data.shops.map((s) => ({ key: s.merchantId, label: s.name, value: s.sharedMembers, hint: overlap.data!.myMembers ? `${Math.round((s.sharedMembers / overlap.data!.myMembers) * 100)}%` : undefined }))} /> : <p className="text-body-sm text-fg-muted">Not enough shared customers yet{overlap.data.suppressedShops ? ` (${overlap.data.suppressedShops} shops below the privacy threshold)` : ""}.</p>}
            </Card>
          </>
        ) : (
          <Skeleton className="h-60 rounded-lg" />
        )
      ) : null}

      {tab === "advanced" ? (
        enabled("reports.advanced") ? (
          <Card padding="lg">
            <CardHeader title="Retention by join month" subtitle="Share of each month's new members who visited again." />
            {retention.data ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <caption className="sr-only">Retention cohorts</caption>
                  <thead className="text-label text-fg-muted">
                    <tr>
                      <th scope="col" className="py-2 text-start">Joined</th>
                      <th scope="col" className="py-2 text-end">Members</th>
                      {Array.from({ length: retention.data.months }, (_, i) => <th key={i} scope="col" className="py-2 text-end">M{i}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {retention.data.cohorts.map((co) => (
                      <tr key={co.cohort} className="border-t border-border">
                        <td className="py-2">{co.cohort}</td>
                        <td className="py-2 text-end tabular-nums">{co.size}</td>
                        {co.retention.map((v, i) => <td key={i} className="py-2 text-end tabular-nums">{pct(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Card>
        ) : (
          <FeatureTeaser featureKey="reports.advanced" title="Retention reports" />
        )
      ) : null}
    </div>
  );
}
