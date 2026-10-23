"use client";
import { Check } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/dashboard";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { quarters, type Period } from "@/lib/dashboard/biaPeriods";
import { saveBlob } from "@/lib/dashboard/download";

/** The /bia/reports/print URL for a street and period. `auto=1` opens the print dialog when the page loads. */
export function printUrl(hoodId: string, p: Period, auto = true): string {
  const q = new URLSearchParams({ n: hoodId, ...(p.from ? { from: p.from, to: p.to! } : {}), label: p.label, ...(auto ? { auto: "1" } : {}) });
  return `/bia/reports/print?${q.toString()}`;
}

/** Download the period report as CSV through the signed-in session. Returns an error message, or null on success. */
export async function downloadReportCsv(hoodId: string, p: Period, name: string): Promise<string | null> {
  try {
    const res = await browserApi.campaigns.periodReportCsv(hoodId, p.from ? { from: p.from, to: p.to } : {});
    saveBlob(await res.blob(), `${name}-board-report-${p.label.toLowerCase().replace(/\s+/g, "-")}.csv`);
    return null;
  } catch (e) {
    return errorMessage(e);
  }
}

/** "Board report": one page for the next board meeting from the campaigns in a quarter. PDF is the browser's print on the print route. */
export function BoardReportPanel({ hoodId, hoodName = "street", lines }: { hoodId: string; hoodName?: string; lines: string[] }) {
  const options = quarters(new Date());
  const [id, setId] = useState(options[0]!.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const period = options.find((o) => o.id === id) ?? options[0]!;
  return (
    <Panel title="Board report" description="One page for your next board meeting, from the campaigns in this period.">
      <div className="flex flex-col gap-4">
        <Select label="Period" hideLabel value={id} onChange={(e) => setId(e.target.value)} options={options.map((o) => ({ value: o.id, label: o.label }))} />
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l} className="flex gap-2.5 text-meta text-fg">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              {l}
            </li>
          ))}
        </ul>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Button fullWidth size="md" href={printUrl(hoodId, period)}>
          Download PDF
        </Button>
        <Button
          fullWidth
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(await downloadReportCsv(hoodId, period, hoodName));
            setBusy(false);
          }}
        >
          Export CSV
        </Button>
      </div>
    </Panel>
  );
}
