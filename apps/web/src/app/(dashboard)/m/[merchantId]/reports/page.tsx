"use client";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HBarList } from "@/components/dashboard/Charts";
import { Heatmap } from "@/components/dashboard/reports/Heatmap";
import { Empty, ErrorLine, PageHeader, PageTabs, Panel, QuietButton, Section, Segmented, SkeletonRows, StatBlock, type StatItem } from "@/components/dashboard/kit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { NoAccess } from "@/components/dashboard/PageStates";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { reportsApi } from "@ll/shared";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { downloadCsv } from "@/lib/dashboard/download";
import { rewardNoun } from "@/lib/dashboard/home";
import { cameBackShare, joinersTitle, owedDetail, owedHeadline } from "@/lib/dashboard/reports";
import { promoWhen } from "@/lib/dashboard/promos";
import { pctDelta, rangeFor, type RangeKey } from "@/lib/dashboard/time";
import { useApi } from "@/lib/dashboard/useApi";

type Tab = "overview" | "retention" | "rewards" | "promos" | "network";
type Range = "week" | "4w" | "12w";
const RANGE_DAYS: Record<Range, number> = { week: 7, "4w": 28, "12w": 84 };
const RANGE_LABEL: Record<Range, string> = { week: "last week", "4w": "previous 4 weeks", "12w": "previous 12 weeks" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

const promoCols: Column<reportsApi.PromoResult>[] = [
  { key: "promo", header: "Promo", mobile: "title", cell: (x) => <span className="font-medium">{x.title}</span> },
  { key: "window", header: "Visits in window", align: "end", mobile: "subtitle", cell: (x) => `${formatNumber(x.windowVisits)} in the window` },
  { key: "typical", header: "Typical", align: "end", mobile: "hidden", cell: (x) => (x.typicalVisits == null ? "Not enough history" : formatNumber(x.typicalVisits)) },
  { key: "extra", header: "Extra visits", align: "end", mobile: "trailing", cell: (x) => (x.extraVisits == null ? "–" : `${x.extraVisits > 0 ? "+" : ""}${x.extraVisits}`) },
  { key: "free", header: "Free items given", align: "end", mobile: "hidden", cell: (x) => formatNumber(x.freeItemsGiven) },
];

export default function ReportsPage() {
  const { api, base, role, enabled, detail } = useMerchant();
  const term = detail.program?.terminology ?? "points";
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("4w");
  const days = RANGE_DAYS[range];
  const r = rangeFor(days === 7 ? "7d" : days === 28 ? "30d" : "90d");
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const manager = role !== "staff";
  const advanced = enabled("reports.advanced");
  const promosOn = enabled("promos.basic");
  const posOn = enabled("integrations.pos_auto_award");
  const overview = useApi(manager ? () => api.reports.overview({ from, to: r.to }) : null, [api, range]);
  const heat = useApi(manager ? () => api.reports.heatmap(Math.max(1, Math.round(days / 7))) : null, [api, range]);
  const owed = useApi(manager ? () => api.reports.rewardsOwed() : null, [api]);
  const retention = useApi(manager && advanced ? () => api.reports.retention(6) : null, [api, advanced]);
  const overlap = useApi(manager && advanced ? () => api.reports.networkOverlap() : null, [api, advanced]);
  const rewards = useApi(manager && tab === "rewards" ? () => api.reports.rewards({ from, to: r.to }) : null, [api, range, tab]);
  const promos = useApi(manager && promosOn && tab === "promos" ? () => api.reports.promos() : null, [api, tab, promosOn]);
  const livePromos = useApi(manager && promosOn && tab === "overview" ? () => api.promos("live") : null, [api, tab, promosOn]);
  if (!manager) return <NoAccess />;

  const c = overview.data?.current;
  const p = overview.data?.previous;
  const noun = rewardNoun(detail.merchant.vertical);
  const d = (cur?: number, pr?: number) => {
    if (cur == null || pr == null) return null;
    const x = pctDelta(cur, pr);
    return x === null ? null : ({ good: x > 0 ? true : x < 0 ? false : null, text: `${x > 0 ? "+" : ""}${x}%`, context: `vs ${RANGE_LABEL[range]}` } satisfies StatItem["delta"]);
  };
  const exportBtn = (name: string, rows: (string | number)[][]) => (
    <QuietButton onClick={() => downloadCsv(name, rows)}>
      <Download aria-hidden className="size-3.5" /> Export CSV
    </QuietButton>
  );
  const joiners = retention.data?.joinerReturn ?? null;
  const back = joiners ? cameBackShare(joiners, 14) : null;
  const slowPromo = (livePromos.data?.items ?? []).find((x) => x.startTime && x.endTime);
  const heatNote = slowPromo ? `The glow at ${promoWhen(slowPromo).toLowerCase()} is the ${slowPromo.title} promo.` : undefined;
  const cost = owed.data;
  const dayRange = range === "week" ? "This week" : range === "4w" ? "4 weeks" : "12 weeks";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Reports" description="Loyalty reports are free. Customer names appear only for your own shop." actions={<Segmented label="Date range" value={range} onChange={setRange} options={[{ value: "week", label: "This week" }, { value: "4w", label: "4 weeks" }, { value: "12w", label: "12 weeks" }]} />} />
      <PageTabs<Tab>
        label="Report"
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          // Pricing v2: paid reports appear only once the shop has them (no teaser tabs).
          ...(advanced ? [{ id: "retention" as const, label: "Retention" }] : []),
          { id: "rewards", label: "Rewards" },
          ...(promosOn ? [{ id: "promos" as const, label: "Promos" }] : []),
          ...(advanced ? [{ id: "network" as const, label: "Network" }] : []),
        ]}
      />

      {overview.error && !overview.data ? <ErrorLine message={overview.error} onRetry={overview.reload} /> : null}

      {tab === "overview" ? (
        <>
          <StatBlock
            label={`Key numbers, ${dayRange.toLowerCase()}`}
            loading={!c}
            items={[
              { label: "Visits", value: c ? formatNumber(c.visits) : "–", delta: d(c?.visits, p?.visits) },
              { label: "New members", value: c ? formatNumber(c.newMembers) : "–", delta: d(c?.newMembers, p?.newMembers) },
              back && back.pct != null
                ? { label: "Came back within 14 days", value: `${back.pct}%`, caption: back.caption }
                : { label: "Came back", value: c ? pct(c.repeatRate) : "–", caption: "Active members with 2+ visits" },
              {
                label: `${noun[0]!.toUpperCase()}${noun.slice(1)}s given`,
                value: c ? formatNumber(c.redemptions) : "–",
                caption: c && cost?.rewardCostCents != null ? `about ${formatMoney(c.redemptions * cost.rewardCostCents).replace(/\.00$/, "")} at cost (estimate)` : "Set your cost in Rewards for an estimate",
              },
            ]}
          />
          {posOn ? (
            <StatBlock
              label="Spend by members"
              cols={2}
              items={[
                { label: "Spend by members", value: c ? formatMoney(c.revenueFromMembersCents) : "–", caption: c ? `${formatMoney(c.avgSpendPerVisitCents)} per visit, from your POS` : undefined },
                { label: "Redemption rate", value: c ? pct(c.redemptionRate) : "–", caption: "Members who redeemed" },
              ]}
            />
          ) : null}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            {heat.data ? <Heatmap data={heat.data} note={heatNote} /> : <div className="skeleton h-[360px] w-full rounded-card" />}
            <div className="flex flex-col gap-4">
              {cost ? (
                <section aria-label="Rewards owed" className="rounded-card border border-line p-6">
                  <p className="text-[13px] text-fg-muted">Rewards owed right now</p>
                  <p className="mt-1 font-display text-[32px] font-bold leading-10 tracking-[-0.01em] text-fg">{owedHeadline(cost, noun)}</p>
                  <p className="mt-2 text-[13px] leading-5 text-fg-muted">{owedDetail(cost, term, noun)}</p>
                  <Link href={`${base}/program`} className="mt-2 inline-block text-[13px] font-medium text-fg underline underline-offset-4">Edit cost in Rewards</Link>
                </section>
              ) : null}
              {joiners && joiners.joined > 0 ? (
                <section aria-label="Joiners who came back" className="rounded-card border border-line p-6">
                  <p className="text-[13px] text-fg-muted">{joinersTitle(joiners)}</p>
                  <ul className="mt-3">
                    {joiners.windows.map((w) => (
                      <li key={w.days} className="flex items-center justify-between border-t border-line py-2.5 text-[14px] first:border-t">
                        <span className="text-fg">Within {w.days} days</span>
                        <span className="tabular font-medium text-fg">{w.cameBack} of {joiners.joined}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {advanced && overlap.data && overlap.data.shops.length ? (
                <section aria-label="Your members also visit" className="rounded-card border border-line p-6">
                  <p className="text-[13px] text-fg-muted">Your members also visit (opt-in network)</p>
                  <p className="mt-2 text-[14px] font-medium leading-6 text-fg">
                    {overlap.data.shops.slice(0, 3).map((x) => `${x.name} ${overlap.data!.myMembers ? Math.round((x.sharedMembers / overlap.data!.myMembers) * 100) : 0}%`).join(" · ")}
                  </p>
                  <p className="mt-3 text-[12px] text-fg-muted">Shops see totals only, never each other&apos;s customers.</p>
                </section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {tab === "retention" && advanced ? (
        <>
          {joiners ? (
            <Panel title="Joiners who came back" description={joinersTitle(joiners)}>
              <StatBlock bare cols={3} items={joiners.windows.map((w) => ({ label: `Within ${w.days} days`, value: `${w.cameBack} of ${joiners.joined}`, caption: joiners.joined ? pct(w.cameBack / joiners.joined) : undefined }))} />
            </Panel>
          ) : null}
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
        </>
      ) : null}

      {tab === "rewards" ? (
        <>
          <Panel title={"Redemptions by reward"} action={rewards.data ? exportBtn("rewards.csv", [["reward", "cost", "redemptions", "members", "points_spent", "discount"], ...rewards.data.items.map((x) => [x.name, x.pointsCost, x.redemptions, x.uniqueMembers, x.pointsSpent, (x.discountCents / 100).toFixed(2)])]) : null}>
            {rewards.data ? (rewards.data.items.length ? <HBarList rows={rewards.data.items.map((x) => ({ key: x.rewardId, label: x.name, value: x.redemptions, hint: `${x.uniqueMembers} members` }))} /> : <Empty className="py-2">Not enough data yet. Check back after a week of visits.</Empty>) : <SkeletonRows rows={5} />}
          </Panel>
          {overview.data ? <LiabilityCard l={overview.data.pointsLiability} term={term} /> : null}
        </>
      ) : null}

      {tab === "promos" && promosOn ? (
        <Section title="Promo results" description="Visits in each promo's weekdays and hours, against the same hours in the four weeks before it started.">
          {promos.data ? (
            promos.data.items.length ? (
              <DataTable caption="Promo results" rowKey={(x) => x.promoId} rows={promos.data.items} columns={promoCols} />
            ) : (
              <Empty className="py-2">Results show up once a promo goes live.</Empty>
            )
          ) : (
            <SkeletonRows rows={5} />
          )}
        </Section>
      ) : null}

      {tab === "network" && advanced ? (
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
