import { MSection } from "@/components/marketing/Section";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { sentenceCase } from "@/lib/marketing/text";
import { pv } from "./PlanCards";

const T = copy.pricing.trades;
/** phase-pro P1: the rows with Pro and Studio, prices filled from PLANS. */
const ROWS = copy.proPricing.trades.map((r) => ({ who: r.who, what: pv(r.what), price: pv(r.price) }));

const DOTS = ["bg-tile-rose-foreground", "bg-tile-mint-foreground", "bg-tile-butter-foreground", "bg-tile-peach-foreground", "bg-tile-sky-foreground", "bg-tile-lilac-foreground"];

const TONES = [
  "bg-tile-rose text-tile-rose-foreground",
  "bg-tile-mint text-tile-mint-foreground",
  "bg-tile-butter text-tile-butter-foreground",
  "bg-tile-peach text-tile-peach-foreground",
  "bg-tile-sky text-tile-sky-foreground",
  "bg-tile-lilac text-tile-lilac-foreground",
];

/** One row per trade: what Pro switches on for that kind of shop, and what it costs. The same list sells and gates. */
export function TradeRows() {
  return (
    <MSection id="trades" tone="butter" className="scroll-mt-20 md:py-20!">
      <p className="text-meta-strong text-muted-foreground">{T.eyebrow}</p>
      <h2 className="display mt-4 max-w-3xl text-mkt-md text-balance md:text-mkt-lg">{sentenceCase(T.title)}</h2>
      <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">{T.sub}</p>
      {/* One grid for all rows (each row a subgrid), so the three columns line up from row to row. */}
      <ul className="mt-10 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
        {ROWS.map((r, i) => (
          <li key={r.who} className="grid gap-2 rounded-card bg-card p-5 shadow-card md:col-span-3 md:grid-cols-subgrid md:items-center md:gap-x-8">
            <p className="flex items-center gap-3 text-body-strong text-foreground">
              <span aria-hidden className={cn("size-3 shrink-0 rounded-full", DOTS[i % DOTS.length])} />
              {r.who}
            </p>
            <p className="text-meta text-muted-foreground">{r.what}</p>
            <p className={cn("w-fit rounded-full px-3.5 py-1.5 text-meta-strong max-md:rounded-r4 tabular-nums md:justify-self-end", TONES[i % TONES.length])}>{r.price}</p>
          </li>
        ))}
      </ul>
    </MSection>
  );
}
