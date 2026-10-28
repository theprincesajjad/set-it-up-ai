import type { campaignsApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * The campaign report summary: key numbers, then visits by shop (black for the event, grey for the same number of days
 * before). One component for three places: the real CampaignDetail, the BIA board report and the labelled sample on
 * /for-bias, so the sample can never drift from what a BIA actually gets. The bars are decorative; a table that
 * screen readers can read carries the same numbers.
 */
export interface ReportSummaryProps {
  report: campaignsApi.CampaignReport;
  /** Show this many shops (busiest first). Default: all. */
  maxShops?: number;
  /** Shops needed to complete the passport, for "completed all 5". */
  goal?: number;
  /** "board": the four numbers a board reads. "full": adds customers and bonus points. */
  tiles?: "board" | "full";
  className?: string;
  /** Shown under the bars. */
  footnote?: string;
  /** Heading level of "Visits by shop": 2 where the card sits straight under the page title. */
  headingLevel?: 2 | 3;
}

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
/** Whole percent for the 30-day return: a board reads "38%", and the exact share is in the CSV. */
const pctWhole = (n: number) => `${Math.round(n)}%`;

export function ReportTiles({ report: r, goal, tiles = "board", compact }: Pick<ReportSummaryProps, "report" | "goal" | "tiles"> & { /** One row of four, smaller type: the one-page print report. */ compact?: boolean }) {
  const lift = r.visitLiftPct;
  const cells: { value: string; label: string; caption: string }[] = [
    {
      value: lift == null ? "–" : `${lift >= 0 ? "+" : ""}${pct(lift)}`,
      label: "visits at event shops",
      caption: lift == null ? `${formatNumber(r.visits)} visits, no baseline yet` : `${formatNumber(r.visits)} vs ${formatNumber(r.baselineVisits)}`,
    },
    { value: formatNumber(r.participants), label: "took part", caption: `${formatNumber(r.completions)} completed${goal ? ` all ${goal}` : ""}` },
    { value: formatNumber(r.newMembers), label: "new members", caption: `vs ${formatNumber(r.baselineNewMembers)} before` },
    r.returnedWithin30dPct == null || r.returnedWithin30d == null
      ? { value: `Available ${formatDate(r.returnWindowEndsAt)}`, label: "came back within 30 days", caption: compact ? "after the 30 days" : "Event visitors who visit again in the 30 days after" }
      : {
          value: pctWhole(r.returnedWithin30dPct),
          label: "came back within 30 days",
          caption: `${formatNumber(r.returnedWithin30d)} of ${formatNumber(r.uniqueCustomers)} event visitors${r.baselineReturnedWithin30dPct != null ? ` · ${pctWhole(r.baselineReturnedWithin30dPct)} before` : ""}`,
        },
  ];
  if (tiles === "full") {
    cells.splice(1, 0, { value: formatNumber(r.uniqueCustomers), label: "customers", caption: `${formatNumber(r.baselineUniqueCustomers)} before` });
    cells.push({ value: formatNumber(r.bonusPointsIssued), label: "bonus points", caption: "Network-funded" });
  }
  return (
    <dl aria-label="Key numbers" className={cn("grid gap-px overflow-hidden rounded-card border border-border bg-border", compact ? "grid-cols-4" : cn("grid-cols-2", cells.length > 4 ? "lg:grid-cols-3" : "lg:grid-cols-4"))}>
      {cells.map((c) => (
        <div key={c.label} className={cn("flex flex-col bg-background", compact ? "gap-0.5 px-3 py-2" : "gap-1 px-4 py-4 md:px-5")}>
          <dd className={cn("display tabular-nums text-foreground", c.value.startsWith("Available") ? (compact ? "text-[14px] leading-5" : "text-[18px] leading-7") : compact ? "text-[20px] leading-6" : "text-[30px] leading-9")}>{c.value}</dd>
          <dt className="text-meta-strong text-foreground">{c.label}</dt>
          <dd className="text-caption text-muted-foreground">{c.caption}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReportShopBars({ report: r, maxShops, headingLevel = 3 }: Pick<ReportSummaryProps, "report" | "maxShops"> & { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const shops = [...r.perMerchant].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  const shown = shops.slice(0, maxShops ?? shops.length);
  const max = Math.max(1, ...shown.map((s) => Math.max(s.visits, s.baselineVisits)));
  if (!shown.length) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Heading className="text-body-strong text-foreground">Visits by shop</Heading>
        {shown.length < shops.length ? <p className="text-caption text-muted-foreground">Top {shown.length} of {shops.length} shops</p> : null}
      </div>
      <ul aria-hidden className="mt-3 flex flex-col gap-3">
        {shown.map((s) => (
          <li key={s.merchantId} className="grid grid-cols-[88px_1fr] items-center gap-3 text-meta md:grid-cols-[132px_1fr]">
            <span className="truncate text-muted-foreground">{s.name.toLowerCase()}</span>
            <span className="flex flex-col gap-1">
              <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(1.5, (s.visits / max) * 100)}%` }} />
              <span className="block h-1 rounded-full bg-hover" style={{ width: `${Math.max(1, (s.baselineVisits / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <div className="sr-only">
        <table>
        <caption>Visits by shop</caption>
        <thead>
          <tr>
            <th scope="col">Shop</th>
            <th scope="col">During the event</th>
            <th scope="col">Before</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.merchantId}>
              <th scope="row">{s.name}</th>
              <td>{s.visits}</td>
              <td>{s.baselineVisits}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function ReportSummary({ report, maxShops, goal, tiles, className, footnote, headingLevel }: ReportSummaryProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <ReportTiles report={report} goal={goal} tiles={tiles} />
      <ReportShopBars report={report} maxShops={maxShops} headingLevel={headingLevel} />
      {footnote ? <p className="text-caption text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}
