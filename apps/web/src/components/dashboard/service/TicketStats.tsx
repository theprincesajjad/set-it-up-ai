import type { ReactNode } from "react";
import type { serviceApi } from "@ll/shared";
import { StatBlock } from "@/components/dashboard/kit";
import { formatMoney } from "@/lib/format";

const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;

/** One bordered block of five plain numbers. Accent dot only for what the shop must act on; blue for what waits on a customer. */
export function TicketStats({ summary, loading, failure }: { summary: serviceApi.TicketSummaryResponse | null; loading: boolean; /** The summary could not load: shown INSTEAD of the tiles, which would read "Nothing overdue / Shelf is clear". */ failure?: ReactNode }) {
  const s = summary;
  if (failure) return <>{failure}</>;
  return (
    <StatBlock
      label="Tickets at a glance"
      loading={loading && !s}
      cols={5}
      items={[
        { label: "Needs you now", dot: "accent", value: s?.needsYou ?? 0, caption: "Diagnose, call back, or collect" },
        { label: "Waiting on customer", dot: "info", value: s?.waitingOnCustomer ?? 0, caption: "Quotes sent, not answered" },
        { label: "Due today", dot: "negative", value: (s?.dueToday ?? 0) + (s?.overdue ?? 0), caption: s?.overdue ? `${s.overdue} overdue` : "Nothing overdue" },
        { label: "Ready, not collected", dot: "positive", value: s?.readyUncollected ?? 0, caption: s?.readyUncollected ? `Oldest: ${n(s.oldestReadyDays, "day", "days")}` : "Shelf is clear" },
        { label: "Open quote value", dot: "neutral", value: formatMoney(s?.openQuoteValueCents ?? 0).replace(/\.00$/, ""), caption: `Across ${n(s?.openQuoteCount ?? 0, "quote", "quotes")}` },
      ]}
    />
  );
}
