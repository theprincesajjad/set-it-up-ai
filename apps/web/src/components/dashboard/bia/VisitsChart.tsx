"use client";
import { useMemo, useState } from "react";
import type { campaignsApi } from "@ll/shared";
import { Panel } from "@/components/dashboard";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/dashboard/useApi";
import { formatDate, formatNumber } from "@/lib/format";

const KIND: Record<campaignsApi.CampaignKind, string> = { passport: "Passport week", points_weekend: "Points weekend", multiplier: "Street multiplier" };

/** "Aug 3" for a Monday YYYY-MM-DD. */
const weekLabel = (ymd: string) => formatDate(new Date(`${ymd}T12:00:00Z`));

/**
 * Visits per week for the last 12 weeks. Bars are black; the weeks a campaign ran are accent, so lift reads without
 * reading numbers (foundations.md: accent only for the campaign weeks). A table carries the same numbers for screen readers
 * and for "View as table".
 */
export function VisitsChart({ weekly, hoodId }: { weekly: campaignsApi.NeighbourhoodOverview["weekly"]; hoodId: string }) {
  const [asTable, setAsTable] = useState(false);
  const ids = useMemo(() => [...new Set(weekly.flatMap((w) => w.campaignIds))], [weekly]);
  const campaigns = useApi(ids.length ? () => browserApi.campaigns.list({ neighbourhoodId: hoodId, limit: 100 }) : null, [hoodId, ids.join(",")]);
  const named = (campaigns.data?.items ?? []).filter((c) => ids.includes(c.id));
  const max = Math.max(1, ...weekly.map((w) => w.visits));
  const first = weekly[0];
  const last = weekly[weekly.length - 1];
  return (
    <Panel
      title="Visits per week"
      action={
        <div className="flex items-center gap-3 text-meta text-fg-muted">
          <span>{weekly.length} weeks</span>
          <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded-sm hover:text-fg focus-visible:focus-ring">
            {asTable ? "View as chart" : "View as table"}
          </button>
        </div>
      }
    >
      {asTable ? (
        <div className="max-h-72 overflow-auto border-y border-line">
          <table className="w-full text-meta">
            <thead className="sticky top-0 bg-bg-subtle text-caption text-fg-muted">
              <tr>
                <th scope="col" className="h-8 px-3 text-start font-medium">Week of</th>
                <th scope="col" className="h-8 px-3 text-end font-medium">Visits</th>
                <th scope="col" className="h-8 px-3 text-start font-medium">Campaign</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.weekStart} className="border-t border-line">
                  <td className="h-9 px-3">{weekLabel(w.weekStart)}</td>
                  <td className="h-9 px-3 text-end tabular">{formatNumber(w.visits)}</td>
                  <td className="h-9 px-3 text-fg-muted">{w.campaignIds.length ? "Campaign week" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure>
          <div role="img" aria-label={`Visits per week, ${weekly.length} weeks, from ${first ? weekLabel(first.weekStart) : ""} to ${last ? weekLabel(last.weekStart) : ""}. Weeks with a campaign are marked in orange.`} className="flex h-40 items-end gap-1.5 md:gap-2" data-testid="visits-chart">
            {weekly.map((w) => (
              <div key={w.weekStart} className="flex h-full flex-1 items-end" title={`${weekLabel(w.weekStart)}: ${formatNumber(w.visits)} visits`}>
                <span data-campaign-week={w.campaignIds.length ? "true" : "false"} className={cn("block w-full rounded-[3px]", w.campaignIds.length ? "bg-points" : "bg-fg")} style={{ height: `${Math.max(2, (w.visits / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-3 flex justify-between border-t border-line pt-2 text-caption text-fg-muted">
            <span>{first ? weekLabel(first.weekStart) : ""}</span>
            <span>{last ? weekLabel(last.weekStart) : ""}</span>
          </div>
          {named.length ? (
            <figcaption className="mt-3 flex flex-col gap-1 text-meta text-fg-muted">
              {named.map((c) => (
                <span key={c.id} className="flex items-center gap-2">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-points" />
                  {c.name || KIND[c.kind]}, {formatDate(c.startsAt)} to {formatDate(c.endsAt)}
                </span>
              ))}
            </figcaption>
          ) : null}
        </figure>
      )}
    </Panel>
  );
}
