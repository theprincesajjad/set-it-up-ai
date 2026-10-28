import { MSection } from "@/components/marketing/Section";
import { copy } from "@/copy/en-CA";

const T = copy.pricing.trades;

/** One row per trade: what Café & Retail switches on for that kind of shop, and what it costs. The same list sells and gates. */
export function TradeRows() {
  return (
    <MSection id="trades" className="scroll-mt-20 md:py-20!">
      <p className="text-meta-strong text-muted-foreground">{T.eyebrow}</p>
      <h2 className="display mt-4 max-w-3xl text-mkt-md text-balance md:text-mkt-lg">{T.title}</h2>
      <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">{T.sub}</p>
      <ul className="mt-10 flex flex-col divide-y divide-border border-y border-border">
        {T.rows.map((r) => (
          <li key={r.who} className="grid gap-2 py-5 md:grid-cols-[1fr_1.6fr_auto] md:items-baseline md:gap-8">
            <p className="text-body-strong text-foreground">{r.who}</p>
            <p className="text-meta text-muted-foreground">{r.what}</p>
            <p className="text-meta-strong tabular-nums text-foreground md:text-end">{r.price}</p>
          </li>
        ))}
      </ul>
    </MSection>
  );
}
