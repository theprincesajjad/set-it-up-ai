"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { campaignsApi, type networkApi } from "@ll/shared";
import { ListAsync } from "@/components/dashboard/ListStates";
import { PageHeader, Panel, SegmentedControl, StatBlock, type StatItem } from "@/components/dashboard";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { ROLLING, comparisonLine, periodQuery } from "@/lib/dashboard/biaPeriods";
import { useApi } from "@/lib/dashboard/useApi";
import { formatNumber } from "@/lib/format";
import { BoardReportPanel } from "./BoardReportPanel";
import { CampaignsPanel } from "./CampaignsPanel";
import { ShopsTable } from "./ShopsTable";
import { UnlockPanel } from "./UnlockPanel";
import { VisitsChart } from "./VisitsChart";

const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

/** Stats for the four numbers a BIA reads first, each with a real comparison against the period before. */
export function overviewStats(o: campaignsApi.NeighbourhoodOverview, comparedWith: string): StatItem[] {
  const joined = o.shops.joinedInPeriod;
  return [
    {
      label: "Shops live",
      value: formatNumber(o.shops.live),
      caption: `${o.shops.members != null ? `of ${formatNumber(o.shops.members)} members · ` : ""}${joined} joined in this period`,
    },
    {
      label: "Active members",
      value: formatNumber(o.activeMembers.value),
      delta: { text: `${sign(o.activeMembers.delta)}${formatNumber(Math.abs(o.activeMembers.delta))}`, good: o.activeMembers.delta === 0 ? null : o.activeMembers.delta > 0, context: comparedWith },
    },
    {
      label: "Shoppers at 2+ shops",
      value: `${o.multiShopPct.value}%`,
      delta: { text: `${sign(o.multiShopPct.deltaPoints)}${Math.abs(o.multiShopPct.deltaPoints)} points`, good: o.multiShopPct.deltaPoints === 0 ? null : o.multiShopPct.deltaPoints > 0 },
    },
    {
      label: "Visits",
      value: formatNumber(o.visits.value),
      delta: o.visits.deltaPct == null ? { text: "No prior period", good: null } : { text: `${sign(o.visits.deltaPct)}${Math.abs(o.visits.deltaPct)}%`, good: o.visits.deltaPct === 0 ? null : o.visits.deltaPct > 0, context: comparedWith },
    },
  ];
}

const REPORT_LINES = ["Visits and lift vs the days before", "New members", "Event visitors who came back in 30 days", "Campaign results and prizes", "Shops activated"];

/** BIA overview: stats, visits per week with campaign weeks in accent, campaigns, shops, board report and the unlock gates. */
export function Overview({ hood }: { hood: networkApi.NeighbourhoodDto }) {
  const [periodId, setPeriodId] = useState<string>(ROLLING[0]!.id);
  const period = ROLLING.find((p) => p.id === periodId) ?? ROLLING[0]!;
  const q = useMemo(() => periodQuery(period), [period]);
  const overview = useApi(() => browserApi.campaigns.overview(hood.id, q), [hood.id, periodId]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Overview"
        description={comparisonLine(period)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl label="Period" value={periodId} onChange={setPeriodId} options={ROLLING.map((p) => ({ value: p.id, label: p.label }))} />
            <Button size="sm" href="/bia/campaigns?new=1">
              New campaign
            </Button>
          </div>
        }
      />
      <ListAsync state={overview} errorTitle="We could not load the overview.">
        {(o) => (
          <>
            <StatBlock tiles label="Street key numbers" items={overviewStats(o, `vs prior ${period.days} days`)} />
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-5">
                <VisitsChart weekly={o.weekly} hoodId={hood.id} />
                <CampaignsPanel hoodId={hood.id} />
                <Panel title="Shops on your street" action={<Link href="/bia/shops" className="text-meta-strong text-fg-muted hover:text-fg">View all {o.shopsTable.length}</Link>}>
                  <ShopsTable rows={o.shopsTable} limit={6} />
                </Panel>
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <BoardReportPanel hoodId={hood.id} hoodName={hood.slug} lines={REPORT_LINES} />
                <UnlockPanel gates={o.gates} />
              </div>
            </div>
          </>
        )}
      </ListAsync>
    </div>
  );
}

