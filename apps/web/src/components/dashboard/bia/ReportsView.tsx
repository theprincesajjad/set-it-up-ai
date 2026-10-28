"use client";
import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { networkApi } from "@ll/shared";
import { EmptyState, PageHeader, Panel, StatusDot } from "@/components/dashboard";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { torontoMidnight, quarters, type Period } from "@/lib/dashboard/biaPeriods";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate } from "@/lib/format";
import { downloadReportCsv, printUrl } from "./BoardReportPanel";

const CUSTOM = "custom";

/** Parse YYYY-MM-DD as a Toronto midnight. */
function day(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? torontoMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Reports: pick a quarter or custom dates for a PDF or CSV, quarter by quarter history, and the campaigns that already have a report. */
export function ReportsView({ hood }: { hood: networkApi.NeighbourhoodDto }) {
  const options = useMemo(() => quarters(new Date(), 8), []);
  const [id, setId] = useState(options[0]!.id);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campaigns = useApi(() => browserApi.campaigns.list({ neighbourhoodId: hood.id, limit: 100 }), [hood.id]);

  const custom = id === CUSTOM;
  const f = custom ? day(from) : null;
  const t = custom ? day(to) : null;
  const customValid = !!f && !!t && t.getTime() > f.getTime() && t.getTime() - f.getTime() <= 366 * 86_400_000;
  const period: Period | null = custom
    ? customValid
      ? { id: CUSTOM, label: `${formatDate(f)} to ${formatDate(new Date(t!.getTime() - 1))}`, from: f!.toISOString(), to: t!.toISOString(), days: Math.round((t!.getTime() - f!.getTime()) / 86_400_000) }
      : null
    : (options.find((o) => o.id === id) ?? null);

  async function csv(p: Period, key: string) {
    setBusy(key);
    setError(await downloadReportCsv(hood.id, p, hood.slug));
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="A board report for any quarter or for dates you choose: visits, new members and how many event visitors came back. PDF opens your browser's print dialog." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Panel title="Make a report" description={`For ${hood.biaName ?? hood.name}. Aggregates only: no customer is identified.`}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Period" value={id} onChange={(e) => setId(e.target.value)} options={[...options.map((o) => ({ value: o.id, label: o.label })), { value: CUSTOM, label: "Custom dates" }]} />
            {custom ? (
              <>
                <TextField type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
                <TextField type="date" label="To" hint="Up to 366 days" value={to} onChange={(e) => setTo(e.target.value)} error={from && to && !customValid ? "Pick an end date after the start, within a year." : undefined} />
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button iconStart={Printer} href={period ? printUrl(hood.id, period) : undefined} disabled={!period}>
              Download PDF
            </Button>
            <Button variant="secondary" iconStart={Download} disabled={!period} loading={busy === "now"} onClick={() => period && void csv(period, "now")}>
              Export CSV
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Quarter by quarter" description="Each quarter's report, ready to open again.">
        <ul className="divide-y divide-line">
          {options.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-body text-fg">{q.label}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" href={printUrl(hood.id, q)}>
                  PDF
                </Button>
                <Button size="sm" variant="ghost" loading={busy === q.id} aria-label={`Export ${q.label} as CSV`} onClick={() => void csv(q, q.id)}>
                  CSV
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Campaign reports" description="Each campaign has its own report, with the shops, lift and 30-day return.">
        <ListAsync state={campaigns} errorTitle="We could not load the reports.">
          {(d) => {
            const ran = d.items.filter((c) => c.status === "live" || c.status === "ended");
            return ran.length ? (
              <ul className="divide-y divide-line">
                {ran.map((c) => (
                  <li key={c.id}>
                    <Link href={`/bia/campaigns/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-bg-subtle focus-visible:focus-ring">
                      <span>
                        <span className="block text-body-strong text-fg">{c.name}</span>
                        <span className="block text-meta text-fg-muted">
                          {formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.merchants.length} shops
                        </span>
                      </span>
                      <StatusDot domain="campaign" status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No campaign has run yet" description="Once a campaign goes live, its report appears here and in your board report." />
            );
          }}
        </ListAsync>
      </Panel>
    </div>
  );
}

