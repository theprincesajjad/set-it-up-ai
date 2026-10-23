"use client";
import { Check, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { useState } from "react";
import { BarChart, HBarList, WeekdayBars } from "@/components/dashboard/Charts";
import { Empty, ErrorLine, PageHeader, PageTabs, Panel, QuietButton, Section, Segmented, SkeletonRows, StatBlock, type StatItem } from "@/components/dashboard/kit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NoAccess } from "@/components/dashboard/PageStates";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { reportsApi } from "@ll/shared";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { downloadCsv } from "@/lib/dashboard/download";
import { pctDelta, rangeFor, type RangeKey } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

type Tab = "overview" | "visits" | "members" | "rewards" | "promos" | "network" | "advanced";
const pct = (n: number) => `${Math.round(n * 100)}%`;

const promoCols: Column<reportsApi.PromoResult>[] = [
  { key: "promo", header: "Promo", mobile: "title", cell: (x) => <span className="font-medium">{x.title}</span> },
  { key: "views", header: "Views", align: "end", mobile: "subtitle", cell: (x) => `${formatNumber(x.views)} views` },
  { key: "claims", header: "Redemptions", align: "end", mobile: "subtitle", cell: (x) => `${formatNumber(x.claims)} redeemed` },
  { key: "visits", header: "Visits", align: "end", mobile: "hidden", cell: (x) => formatNumber(x.attributedVisits) },
  { key: "lift", header: "Lift", align: "end", mobile: "trailing", cell: (x) => (x.liftPct == null ? "–" : `${x.liftPct > 0 ? "+" : ""}${Math.round(x.liftPct)}%`) },
];

export default function ReportsPage() {
  const { api, role, enabled, detail } = useMerchant();
  const term = detail.program?.terminology ?? "points";
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
  // Pricing v2: promo results need promos (Plus); network overlap is reports.advanced (Plus).
  const promosOn = enabled("promos.basic");
  const overlapOn = enabled("reports.advanced");
  const promos = useApi(manager && tab === "promos" && promosOn ? () => api.reports.promos() : null, [api, tab]);
  const overlap = useApi(manager && tab === "network" && overlapOn ? () => api.reports.networkOverlap() : null, [api, tab]);
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
    return x === null ? null : ({ good: x > 0 ? true : x < 0 ? false : null, text: `${x > 0 ? "+" : ""}${x}%`, context: `vs ${r.label}` } satisfies StatItem["delta"]);
  };
  const exportBtn = (name: string, rows: (string | number)[][]) => (
    <QuietButton onClick={() => downloadCsv(name, rows)}>
      <Download aria-hidden className="size-3.5" /> Export CSV
    </QuietButton>
  );
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const s of series) weekday[new Date(`${s.date}T12:00:00Z`).getUTCDay()]! += s.visits;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Reports" description="Loyalty reports are free forever. Customer names are only shown for your own shop." actions={<Segmented label="Date range" value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />} />
      <PageTabs<Tab>
        label="Report"
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "visits", label: "Visits" },
          { id: "members", label: "Members" },
          { id: "rewards", label: "Rewards" },
          // Pricing v2: paid reports appear only once the shop has them (no teaser tabs).
          ...(promosOn ? [{ id: "promos" as const, label: "Promos" }] : []),
          ...(overlapOn ? [{ id: "network" as const, label: "Network" }, { id: "advanced" as const, label: "Retention" }] : []),
        ]}
      />

      {overview.error && !overview.data ? <ErrorLine message={overview.error} onRetry={overview.reload} /> : null}
      {daily.error && !daily.data ? <ErrorLine message={daily.error} onRetry={daily.reload} /> : null}

      {tab === "overview" ? (
        <>
          <StatBlock
            cols={3}
            loading={!c}
            items={[
              { label: "Visits", value: c ? formatNumber(c.visits) : "–", delta: d(c?.visits, p?.visits) },
              { label: "Active members", value: c ? formatNumber(c.activeMembers) : "–", delta: d(c?.activeMembers, p?.activeMembers) },
              { label: "New members", value: c ? formatNumber(c.newMembers) : "–", delta: d(c?.newMembers, p?.newMembers) },
              { label: "Redemption rate", value: c ? pct(c.redemptionRate) : "–", caption: "Goal: 20% a month" },
              { label: "Spend by members", value: c ? formatMoney(c.revenueFromMembersCents) : "–", caption: c ? `${formatMoney(c.avgSpendPerVisitCents)} per visit` : undefined },
              { label: "Came back", value: c ? pct(c.repeatRate) : "–", caption: "Active members with 2+ visits" },
            ]}
          />
          <Panel>
            {daily.data ? (
              <BarChart
                title="Visits per day"
                valueLabel="Visits"
                compareLabel={compare ? "Previous period" : undefined}
                data={series.map((s, i) => ({ label: s.date, value: s.visits, compare: compare ? prev[i]?.visits : undefined }))}
                action={
                  <>
                    <QuietButton aria-pressed={compare} onClick={() => setCompare((v) => !v)} className={compare ? "text-fg" : undefined}>
                      <span aria-hidden className={cn("inline-flex size-4 items-center justify-center rounded-[4px] border", compare ? "border-fg bg-fg text-bg" : "border-line-strong")}>{compare ? <Check className="size-3" strokeWidth={3} /> : null}</span>
                      Compare<span className="hidden sm:inline"> to previous period</span>
                    </QuietButton>
                    {exportBtn("visits-per-day.csv", [["date", "visits", "new_members", "points_issued", "points_redeemed", "revenue"], ...series.map((s) => [s.date, s.visits, s.newMembers, s.pointsIssued, s.pointsRedeemed, (s.revenueCents / 100).toFixed(2)])])}
                  </>
                }
              />
            ) : (
              <SkeletonRows rows={6} />
            )}
          </Panel>
          {daily.data ? (
            <Panel>
              <BarChart title="New members per day" valueLabel="New members" data={series.map((s) => ({ label: s.date, value: s.newMembers }))} height={120} />
            </Panel>
          ) : null}
          {overview.data ? <LiabilityCard l={overview.data.pointsLiability} term={term} /> : null}
        </>
      ) : null}

      {tab === "visits" ? (
        <>
          <Panel title={"Busiest days"} description={"Total visits by weekday in this range"} action={exportBtn("visits-by-weekday.csv", [["weekday", "visits"], ...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w, i) => [w, weekday[i]!])])}>
            <WeekdayBars counts={weekday} />
          </Panel>
          <Panel title={"Most frequent visitors"}>
            {top.data ? <HBarList rows={top.data.items.map((t) => ({ key: t.memberId, label: `${t.name ?? "Member"}${t.phoneLast4 ? ` ···${t.phoneLast4}` : ""}`, value: t.visits }))} /> : <SkeletonRows rows={5} />}
          </Panel>
        </>
      ) : null}

      {tab === "members" ? (
        <>
          {activation.data ? (
            <Panel title={"Activation"} description={activation.data.activatedAt ? `Activated ${formatDate(activation.data.activatedAt)}` : `${activation.data.daysSinceSignup} days since you joined`}>
              <ProgressBar value={activation.data.activeMembers} max={activation.data.target} label="Members with a visit" valueText={`${activation.data.activeMembers} of ${activation.data.target}`} />
            </Panel>
          ) : null}
          <Panel title={"Top customers by spend"} action={top.data ? exportBtn("top-customers.csv", [["name", "last4", "visits", "spend", "points_earned", "balance"], ...top.data.items.map((t) => [t.name ?? "", t.phoneLast4 ?? "", t.visits, (t.spendCents / 100).toFixed(2), t.pointsEarned, t.balance])]) : null}>
            {top.data ? <HBarList format={(n) => formatMoney(n)} rows={top.data.items.map((t) => ({ key: t.memberId, label: t.name ?? "Member", value: t.spendCents, hint: `${t.visits} visits` }))} /> : <SkeletonRows rows={5} />}
          </Panel>
        </>
      ) : null}

      {tab === "rewards" ? (
        <Panel title={"Redemptions by reward"} action={rewards.data ? exportBtn("rewards.csv", [["reward", "cost", "redemptions", "members", "points_spent", "discount"], ...rewards.data.items.map((x) => [x.name, x.pointsCost, x.redemptions, x.uniqueMembers, x.pointsSpent, (x.discountCents / 100).toFixed(2)])]) : null}>
          {rewards.data ? (rewards.data.items.length ? <HBarList rows={rewards.data.items.map((x) => ({ key: x.rewardId, label: x.name, value: x.redemptions, hint: `${x.uniqueMembers} members` }))} /> : <Empty className="py-2">Not enough data yet. Check back after a week of visits.</Empty>) : <SkeletonRows rows={5} />}
        </Panel>
      ) : null}

      {tab === "promos" && promosOn ? (
        <Section title="Promo results" description="Visits during each promo compared with the 14 days before.">
          {promos.data ? (
            promos.data.items.length ? (
              <DataTable
                caption="Promo results"
                rowKey={(x) => x.promoId}
                rows={promos.data.items}
                columns={promoCols}
              />
            ) : (
              <Empty className="py-2">Results show up once a promo goes live.</Empty>
            )
          ) : (
            <SkeletonRows rows={5} />
          )}
        </Section>
      ) : null}

      {tab === "network" && overlapOn ? (
        overlap.data ? (
          <>
            <StatBlock
              items={[
                { label: "Also shop on your street", value: pct(overlap.data.sharedPct), caption: `${formatNumber(overlap.data.sharedMembers)} of ${formatNumber(overlap.data.myMembers)} members, last ${overlap.data.windowDays} days` },
                { label: "Other shops they visit", value: overlap.data.avgOtherShops.toFixed(1), caption: "On average" },
              ]}
            />
            <Panel title={`Overlap on ${overlap.data.neighbourhood?.name ?? "your street"}`} description="Aggregated: no customer is ever identified. Shops with fewer than 5 shared members aren't listed.">
              {overlap.data.shops.length ? <HBarList rows={overlap.data.shops.map((s) => ({ key: s.merchantId, label: s.name, value: s.sharedMembers, hint: overlap.data!.myMembers ? `${Math.round((s.sharedMembers / overlap.data!.myMembers) * 100)}%` : undefined }))} /> : <p className="text-meta text-fg-muted">Not enough shared customers yet{overlap.data.suppressedShops ? ` (${overlap.data.suppressedShops} shops below the privacy threshold)` : ""}.</p>}
            </Panel>
          </>
        ) : (
          <SkeletonRows rows={6} />
        )
      ) : null}

      {tab === "advanced" ? (
        enabled("reports.advanced") ? (
          <Panel title={"Retention by join month"} description="Share of each month's new members who visited again.">
            {retention.data ? (
              <div className="overflow-x-auto">
                <table className="w-full text-meta">
                  <caption className="sr-only">Retention cohorts</caption>
                  <thead className="text-caption text-fg-muted">
                    <tr>
                      <th scope="col" className="py-2 text-start">Joined</th>
                      <th scope="col" className="py-2 text-end">Members</th>
                      {Array.from({ length: retention.data.months }, (_, i) => <th key={i} scope="col" className="py-2 text-end">M{i}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {retention.data.cohorts.map((co) => (
                      <tr key={co.cohort} className="border-t border-line">
                        <td className="py-2">{co.cohort}</td>
                        <td className="py-2 text-end tabular-nums">{co.size}</td>
                        {co.retention.map((v, i) => <td key={i} className="py-2 text-end tabular-nums">{pct(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <SkeletonRows rows={5} />
            )}
          </Panel>
        ) : null
      ) : null}
    </div>
  );
}

/** Outstanding points liability (method: docs/engineering/api/reports.md). */
function LiabilityCard({ l, term }: { l: reportsApi.PointsLiability; term: string }) {
  return (
    <Section title={`Unredeemed ${term}`} description="What your members are holding right now, not just in this date range.">
      <StatBlock
        items={[
          { label: "Outstanding", value: <>{formatNumber(l.outstandingPoints)}<span className="ms-1.5 text-body font-normal text-fg-muted">{l.outstandingPoints === 1 ? term.replace(/s$/, "") : term}</span></>, caption: `${formatNumber(l.membersWithBalance)} ${l.membersWithBalance === 1 ? "member" : "members"} with a balance` },
          {
            label: "Estimated value",
            value: l.estimatedValueCents != null ? formatMoney(l.estimatedValueCents) : "–",
            caption: l.basisReward && l.centsPerPoint != null ? `At ${l.centsPerPoint.toFixed(2).replace(/\.?0+$/, "")}¢ per ${term.replace(/s$/, "")} (${l.basisReward.name})` : "Add a dollars-off reward to see a dollar estimate",
          },
        ]}
      />
      <p className="mt-3 text-caption font-normal text-fg-muted">Estimate: every outstanding {term.replace(/s$/, "")} valued at your cheapest dollars-off reward. Not every balance gets redeemed, so the real cost is usually lower. {term[0]!.toUpperCase() + term.slice(1)} don&apos;t expire unless you turned expiry on.</p>
    </Section>
  );
}
