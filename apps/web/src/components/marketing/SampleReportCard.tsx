"use client";
import { Download, Printer } from "lucide-react";
import { SAMPLE_BOARD_REPORT } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { downloadCsv } from "@/lib/dashboard/download";
import { formatDate, formatNumber } from "@/lib/format";
import { campaignReportRows } from "@/lib/reportCsv";
import { ReportSummary } from "./ReportMock";

const R = SAMPLE_BOARD_REPORT;
const days = Math.round((new Date(R.window.endsAt).getTime() - new Date(R.window.startsAt).getTime()) / 86_400_000);

/** "Oct 10 to 17" (same month) or "Oct 28 to Nov 3". */
function rangeLabel(from: string, to: string): string {
  const a = formatDate(from);
  const b = formatDate(to);
  return a.split(" ")[0] === b.split(" ")[0] ? `${a} to ${b.split(" ")[1]}` : `${a} to ${b}`;
}

/** "Sample data": the tag every rendering of a `sample: true` report carries. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <Badge tone="accent" className={className}>
      {copy.bia.sample.tag}
    </Badge>
  );
}

/**
 * The sample board report (SAMPLE_BOARD_REPORT, made-up numbers) in the same component the real report uses.
 * "hero" is the full card on /for-bias; "band" is the one-line version on the landing page; "page" is the
 * print view at /for-bias/sample-report.
 */
export function SampleReportCard({ variant = "hero", className }: { variant?: "hero" | "band" | "page"; className?: string }) {
  const sample = R.sample;
  if (variant === "band") {
    return (
      <figure className={cn("rounded-sheet border border-border bg-background p-6 md:p-8", className)}>
        {sample ? <SampleTag /> : null}
        <figcaption className="mt-3 text-meta text-muted-foreground">{R.title === "Passport week" ? "Passport weekend" : R.title}</figcaption>
        <p className="display mt-1 text-mkt-md tabular-nums md:text-mkt-lg">+{R.visitLiftPct}% visits</p>
        <p className="mt-2 text-meta text-muted-foreground">
          vs the same days before, at {R.perMerchant.length} shops. {formatNumber(R.returnedWithin30d ?? 0)} event visitors came back within 30 days.
        </p>
      </figure>
    );
  }
  return (
    <figure className={cn("flex flex-col gap-5 rounded-sheet border border-border bg-background p-6 md:p-8", className)}>
      <figcaption>
        {sample ? <SampleTag /> : null}
        <p className="mt-3 text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
          {R.title} · {rangeLabel(R.window.startsAt, R.window.endsAt)}
        </p>
        <p className="mt-2 text-meta text-muted-foreground">
          {R.perMerchant.length} participating shops · compared with the {days} days before
        </p>
      </figcaption>
      <ReportSummary report={R} goal={5} headingLevel={2} maxShops={variant === "page" ? undefined : 4} footnote={copy.bia.sample.caption} />
      <div className="flex flex-wrap gap-2 print:hidden">
        {variant === "page" ? (
          <Button size="sm" iconStart={Printer} onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        ) : (
          <Button size="sm" iconStart={Download} href="/for-bias/sample-report">
            {copy.bia.sample.pdf}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => downloadCsv("sample-board-report.csv", [["sample_data"], ...campaignReportRows(R)])}>
          {copy.bia.sample.csv}
        </Button>
      </div>
    </figure>
  );
}
