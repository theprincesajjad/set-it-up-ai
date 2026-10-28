import { LOCALES, type Locale, type serviceApi } from "@ll/shared";
import { DefList, Panel } from "@/components/dashboard/kit";
import { formatDate } from "@/lib/format";

/** Who the customer is to the shop: points, past repairs, the language their texts go out in, and how they were reached. */
export function CustomerPanel({ ticket, summary, quote }: { ticket: serviceApi.TicketDto; summary?: serviceApi.TicketDetailResponse["customerSummary"]; quote: serviceApi.QuoteDto | null }) {
  const lang = (ticket.customer?.language ?? "en") as Locale;
  return (
    <Panel title="Customer">
      <DefList
        items={[
          ...(summary?.balance != null ? [{ label: "Loyalty balance", value: <span className="text-points-text">{summary.balance.toLocaleString("en-CA")} pts</span> }] : []),
          { label: "Past repairs", value: summary ? (summary.pastTickets ? `${summary.pastTickets}, last in ${formatDate(summary.lastTicketAt)}` : "First visit") : "" },
          { label: "Language for texts", value: LOCALES[lang]?.englishName ?? "English" },
          ...(quote?.approvalUrl ? [{ label: "Quote link", value: quote.firstViewedAt ? "Texted, opened" : "Texted" }] : []),
        ]}
      />
    </Panel>
  );
}
