"use client";
import type { serviceApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { resultsMoney } from "@/lib/dashboard/rebooking";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** "This month: 31 reminded · 9 rebooked · $495", with the last 7 days beneath it. Counts reminders that led to a booking, not texts delivered. */
export function RebookResults({ results }: { results: serviceApi.RebookingResultsResponse }) {
  const { t } = useLocaleOrEnglish();
  const line = (key: "rb.results.month" | "rb.results.week", w: serviceApi.RebookingWindowResults) => t(key, { sent: w.sent, booked: w.booked, amount: resultsMoney(w.amountCents) });
  return (
    <Panel title={t("rb.results.title")}>
      {results.month.sent ? (
        <p className="text-body-strong text-fg tabular" data-testid="rebook-results-month">{line("rb.results.month", results.month)}</p>
      ) : (
        <p className="text-meta text-fg-muted" data-testid="rebook-results-month">{t("rb.results.empty")}</p>
      )}
      {results.week.sent ? <p className="mt-1 text-meta text-fg-muted tabular" data-testid="rebook-results-week">{line("rb.results.week", results.week)}</p> : null}
    </Panel>
  );
}
