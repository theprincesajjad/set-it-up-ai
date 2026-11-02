"use client";
/**
 * API performance (wave N): p50 / p95 latency and error rate per route group, the slowest routes, and the hourly trend, from the
 * API's in-process recorder (route templates and timings only, no ids, no personal data). Percentiles are histogram bucket bounds.
 */
import { useState } from "react";
import { Gauge } from "lucide-react";
import { PageHeader, Panel, Segmented, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { TrendChart } from "@/components/dashboard/admin/AdminCharts";
import { HealthPill, KpiGrid, PanelEmpty, pctNum } from "@/components/dashboard/admin/AdminKit";
import { ListAsync } from "@/components/dashboard/ListStates";
import type { adminCockpitApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatNumber } from "@/lib/format";

const HOURS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
] as const;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} s` : `${formatNumber(n)} ms`);
const errPct = (r: number) => `${Math.round(r * 10000) / 100}%`;

function StatTable({ rows, label, keyHeader }: { rows: adminCockpitApi.RouteStat[]; label: string; keyHeader: string }) {
  return (
    <div className="overflow-x-auto">
      <Table label={label} className="min-w-[620px]">
        <thead>
          <tr>
            <Th className="md:static">{keyHeader}</Th>
            <Th align="end" className="md:static">Requests</Th>
            <Th align="end" className="md:static">p50</Th>
            <Th align="end" className="md:static">p95</Th>
            <Th align="end" className="md:static">Slowest</Th>
            <Th align="end" className="md:static">Errors</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.key}>
              <Td className="font-mono text-caption">{r.key}</Td>
              <Td align="end" className="tabular">{formatNumber(r.count)}</Td>
              <Td align="end" className="tabular">≤ {ms(r.p50Ms)}</Td>
              <Td align="end" className={r.p95Ms >= 1000 ? "tabular font-semibold text-negative" : "tabular"}>≤ {ms(r.p95Ms)}</Td>
              <Td align="end" className="tabular">{ms(r.maxMs)}</Td>
              <Td align="end" className={r.errors ? "tabular text-negative" : "tabular"}>{r.errors ? `${formatNumber(r.errors)} (${errPct(r.errorRate)})` : "0"}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function AdminPerformancePage() {
  const [hours, setHours] = useState<(typeof HOURS)[number]["value"]>("24");
  const s = useApi(() => browserApi.admin.cockpit.performance(Number(hours)), [hours]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Performance" description="How fast the API answers, from its own timings" actions={<Segmented label="Window" options={[...HOURS]} value={hours} onChange={setHours} />} />
      <ListAsync state={s} errorTitle="Couldn't load performance. Reload the page to try again." rows={5}>
        {(d) => (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <HealthPill tone={d.total.errorRate >= 0.01 ? "down" : d.total.p95Ms >= 1000 ? "warn" : "ok"} live={d.total.errorRate < 0.01 && d.total.p95Ms < 1000}>
                {d.total.errorRate >= 0.01 ? "Errors above 1%" : d.total.p95Ms >= 1000 ? "Slow: p95 over 1 s" : "Healthy"}
              </HealthPill>
              <span className="text-meta text-fg-muted">Healthy means p95 under 1 s and server errors under 1% in this window.</span>
            </div>
            <KpiGrid
              label="Totals"
              items={[
                { label: "Requests", value: formatNumber(d.total.count), num: d.total.count, spark: d.trend.map((t) => t.count) },
                { label: "p50 latency", value: `≤ ${ms(d.total.p50Ms)}`, caption: "Half of requests answer within this" },
                { label: "p95 latency", value: `≤ ${ms(d.total.p95Ms)}`, caption: "Target: under 1 s", alert: d.total.p95Ms >= 1000 ? "negative" : undefined, spark: d.trend.map((t) => t.p95Ms) },
                { label: "Error rate", value: errPct(d.total.errorRate), ...pctNum(d.total.errorRate), format: { style: "percent", maximumFractionDigits: 2 }, caption: `${formatNumber(d.total.errors)} server errors`, alert: d.total.errorRate >= 0.01 ? "negative" : undefined },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <TrendChart periodLabel="Hour" title="p95 latency per hour" subtitle="Milliseconds, the bound of the histogram bucket" valueLabel="p95 (ms)" format={(n) => (n >= 1000 ? `${n / 1000}s` : `${n}`)} data={d.trend.map((t) => ({ label: t.hourStart.slice(5, 16).replace("T", " "), value: t.p95Ms }))} />
              </Panel>
              <Panel>
                <TrendChart periodLabel="Hour" title="Requests per hour" subtitle={`Last ${d.hours} hours`} valueLabel="Requests" format={(n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n)}`)} data={d.trend.map((t) => ({ label: t.hourStart.slice(5, 16).replace("T", " "), value: t.count }))} />
              </Panel>
            </div>
            <Panel title="Slowest routes" description="Highest p95 with at least 5 requests" padded={false}>
              {d.slowest.length ? <StatTable rows={d.slowest} label="Slowest routes" keyHeader="Route" /> : <PanelEmpty icon={Gauge} title="Not enough requests yet" description="Routes show here once they have at least 5 requests in the window." />}
            </Panel>
            <Panel title="By route group" padded={false}>
              {d.groups.length ? <StatTable rows={d.groups} label="Latency by route group" keyHeader="Group" /> : <PanelEmpty icon={Gauge} title="No requests recorded in this window" />}
            </Panel>
            <p className="text-meta text-fg-muted">Recorded in the API process and saved every 5 minutes. Only route templates and timings are kept, never ids, query strings or personal data.</p>
          </>
        )}
      </ListAsync>
    </div>
  );
}
