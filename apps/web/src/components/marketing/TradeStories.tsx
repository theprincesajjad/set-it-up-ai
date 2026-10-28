import Link from "next/link";
import { copy } from "@/copy/en-CA";
import { MHeading, MSection } from "./Section";

const S = copy.landing.verticals.stories;

/** Trade of each worked example, so its card wears that trade's colour (salon: rose, studio: teal and lime). */
const TRADES = ["salon", "fitness"];

/** Two worked examples (a salon, a studio) with the price in plain words. Labelled as examples: no invented customers or quotes. */
export function TradeStories() {
  return (
    <MSection tone="lilac" id="stories">
      <MHeading eyebrow={S.eyebrow} title={S.title} sub={S.note} />
      <ul className="grid gap-4 md:grid-cols-2">
        {S.items.map((i, n) => (
          <li key={i.who} data-trade={TRADES[n % TRADES.length]} className="mkt-lift flex flex-col overflow-hidden rounded-sheet bg-card shadow-card">
            <div className="h-2.5 bg-[repeating-linear-gradient(90deg,var(--trade)_0_28px,var(--card)_28px_56px)]" aria-hidden />
            <div className="flex flex-1 flex-col p-6 md:p-8">
              <h3 className="display text-title text-trade-deep">{i.who}</h3>
              <p className="mt-3 text-body text-muted-foreground">{i.what}</p>
              <p className="mt-auto pt-5">
                <span className="inline-flex rounded-full bg-trade-soft px-3.5 py-1.5 text-meta-strong text-trade-deep">{i.price}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-meta">
        <Link href="/pricing#trades" className="text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
          What is included for your trade
        </Link>
      </p>
    </MSection>
  );
}
