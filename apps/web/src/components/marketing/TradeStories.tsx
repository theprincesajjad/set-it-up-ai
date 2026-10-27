import Link from "next/link";
import { copy } from "@/copy/en-CA";
import { MHeading, MSection } from "./Section";

const S = copy.landing.verticals.stories;

/** Two worked examples (a salon, a studio) with the price in plain words. Labelled as examples: no invented customers or quotes. */
export function TradeStories() {
  return (
    <MSection tone="subtle" id="stories">
      <MHeading eyebrow={S.eyebrow} title={S.title} sub={S.note} />
      <ul className="grid gap-4 md:grid-cols-2">
        {S.items.map((i) => (
          <li key={i.who} className="flex flex-col rounded-sheet border border-line bg-bg p-6 md:p-8">
            <h3 className="text-headline text-fg">{i.who}</h3>
            <p className="mt-3 text-body text-fg-muted">{i.what}</p>
            <p className="mt-auto pt-5 text-meta-strong text-fg">{i.price}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-meta">
        <Link href="/pricing#trades" className="text-fg underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg">
          What is included for your trade
        </Link>
      </p>
    </MSection>
  );
}
