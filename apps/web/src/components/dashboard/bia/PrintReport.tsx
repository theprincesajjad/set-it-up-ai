"use client";
import { Printer } from "lucide-react";
import { useEffect } from "react";
import type { campaignsApi } from "@ll/shared";
import { Async } from "@/components/dashboard/PageStates";
import { ReportTiles } from "@/components/marketing/ReportMock";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatDateYear, formatNumber } from "@/lib/format";
import { overviewStats } from "./Overview";
import { ShopsTable } from "./ShopsTable";

const KIND: Record<campaignsApi.CampaignKind, string> = { passport: "Passport week", points_weekend: "Points weekend", multiplier: "Street multiplier" };
const MAX_CAMPAIGNS = 3;
const MAX_SHOPS = 6;

/** One-page board report at Letter: key numbers, the campaigns in the period with their 30-day return, the busiest shops. */
export function PrintReport({ hoodId, from, to, label, auto }: { hoodId: string; from?: string; to?: string; label: string; auto: boolean }) {
  const report = useApi(() => browserApi.campaigns.periodReport(hoodId, { from, to }), [hoodId, from, to]);
  const ready = !!report.data;
  useEffect(() => {
    if (auto && ready) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [auto, ready]);
  return (
    <div className="mx-auto max-w-[8in] print:max-w-none">
      <style>{`@media print { @page { size: Letter; margin: 0.5in; } }`}</style>
      <Async state={report}>
        {(r) => <Page r={r} label={label} />}
      </Async>
    </div>
  );
}

function Page({ r, label }: { r: campaignsApi.NeighbourhoodReport; label: string }) {
  const o = r.overview;
  const days = Math.round((new Date(r.period.to).getTime() - new Date(r.period.from).getTime()) / 86_400_000);
  const shown = r.campaigns.slice(0, MAX_CAMPAIGNS);
  const more = r.campaigns.length - shown.length;
  const activated = o.shopsTable.filter((s) => s.activated).length;
  return (
    <article data-testid="print-report" className="flex flex-col gap-4 text-fg print:gap-3 print:text-[11px]">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">{r.neighbourhood.name} board report</h1>
          <p className="text-meta text-fg-muted">
            {label} · {formatDateYear(r.period.from)} to {formatDateYear(new Date(new Date(r.period.to).getTime() - 1))} · prepared {formatDateYear(r.generatedAt)}
          </p>
        </div>
        <Button size="sm" iconStart={Printer} onClick={() => window.print()} className="print:hidden">
          Print or save as PDF
        </Button>
      </header>

      <section aria-label="Key numbers">
        <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-line bg-line">
          {overviewStats(o, `vs prior ${days} days`).map((s) => (
            <div key={s.label} className="bg-bg px-3 py-2.5">
              <dt className="text-caption text-fg-muted">{s.label}</dt>
              <dd className="mt-0.5 text-[20px] font-semibold leading-6 tabular">{s.value}</dd>
              <dd className="mt-0.5 min-h-4 text-[11px] leading-4 text-fg-muted">{s.delta ? `${s.delta.text}${s.delta.context ? ` ${s.delta.context}` : ""}` : s.caption}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Campaigns" className="flex flex-col gap-3">
        <h2 className="text-body-strong">Campaigns in this period</h2>
        {shown.length ? (
          shown.map((c) => (
            <div key={c.id} className="break-inside-avoid">
              <p className="mb-1.5 text-meta-strong">
                {c.name} <span className="font-normal text-fg-muted">· {KIND[c.kind]} · {formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {c.shops} shops</span>
              </p>
              <ReportTiles report={c.report} compact />
            </div>
          ))
        ) : (
          <p className="text-meta text-fg-muted">No campaign ran in this period.</p>
        )}
        {more > 0 ? <p className="text-meta text-fg-muted">And {more} more. They are in the CSV export.</p> : null}
      </section>

      <section aria-label="Shops">
        <h2 className="text-body-strong">
          Shops: {formatNumber(o.shops.live)} live{o.shops.members != null ? ` of ${formatNumber(o.shops.members)} members` : ""}, {formatNumber(activated)} activated
        </h2>
        <ShopsTable rows={o.shopsTable} limit={MAX_SHOPS} label="Busiest shops" dense />
      </section>

      <footer className="border-t border-line pt-2 text-caption text-fg-muted">
        Aggregates only: no customer is identified in this report. “Came back within 30 days” counts customers with a visit at a participating shop during the campaign who visit any shop on the street in the 30 days after it ends; it is shown once those 30 days have passed. Visits are compared with the same number of days before.
      </footer>
    </article>
  );
}
