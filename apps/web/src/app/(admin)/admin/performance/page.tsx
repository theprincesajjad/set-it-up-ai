"use client";
/**
 * API performance (wave N): p50 / p95 latency and error rate per route group, the slowest routes, and the hourly trend, from the
 * API's in-process recorder (route templates and timings only, no ids, no personal data). Percentiles are histogram bucket bounds.
 */
import { useState } from "react";
import { PageHeader, Panel, Segmented, StatBlock, Table, Td, Th, Tr } from "@/components/dashboard/kit";
import { LineChart } from "@/components/dashboard/Charts";
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
            <StatBlock
              items={[
                { label: "Requests", value: formatNumber(d.total.count) },
                { label: "p50 latency", value: `≤ ${ms(d.total.p50Ms)}` },
                { label: "p95 latency", value: `≤ ${ms(d.total.p95Ms)}`, dot: d.total.p95Ms >= 1000 ? "negative" : undefined },
                { label: "Error rate", value: errPct(d.total.errorRate), caption: `${formatNumber(d.total.errors)} server errors`, dot: d.total.errorRate >= 0.01 ? "negative" : undefined },
              ]}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <LineChart title="p95 latency per hour" subtitle="Milliseconds, the bound of the histogram bucket" valueLabel="p95 (ms)" format={(n) => (n >= 1000 ? `${n / 1000}s` : `${n}`)} data={d.trend.map((t) => ({ label: t.hourStart.slice(5, 16).replace("T", " "), value: t.p95Ms }))} />
              </Panel>
              <Panel>
                <LineChart title="Requests per hour" subtitle={`Last ${d.hours} hours`} valueLabel="Requests" format={(n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n)}`)} data={d.trend.map((t) => ({ label: t.hourStart.slice(5, 16).replace("T", " "), value: t.count }))} />
              </Panel>
            </div>
            <Panel title="Slowest routes" description="Highest p95 with at least 5 requests" padded={false}>
              {d.slowest.length ? <StatTable rows={d.slowest} label="Slowest routes" keyHeader="Route" /> : <p className="px-4 py-4 text-meta text-fg-muted">Not enough requests yet.</p>}
            </Panel>
            <Panel title="By route group" padded={false}>
              {d.groups.length ? <StatTable rows={d.groups} label="Latency by route group" keyHeader="Group" /> : <p className="px-4 py-4 text-meta text-fg-muted">No requests recorded in this window.</p>}
            </Panel>
            <p className="text-meta text-fg-muted">Recorded in the API process and saved every 5 minutes. Only route templates and timings are kept, never ids, query strings or personal data.</p>
          </>
        )}
      </ListAsync>
    </div>
  );
}
