import Link from "next/link";
import { copy } from "@/copy/en-CA";

/** The whole price on the landing: free, then $39 and $99 (and restaurants from $99), so an owner never has to open /pricing to learn it. */
export function PriceStrip() {
  const c = copy.landing.compare;
  return (
    <div className="mt-10" data-testid="price-strip">
      <h3 className="text-headline text-foreground">{c.pricesTitle}</h3>
      <ul className="mt-4 grid gap-px overflow-hidden rounded-card border border-border bg-border md:grid-cols-3">
        {c.prices.map((p) => (
          <li key={p.name} className="bg-background p-5">
            <p className="text-meta-strong text-muted-foreground">{p.name}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="display text-mkt-sm tabular-nums text-foreground">{p.price}</span>
              <span className="text-meta text-muted-foreground">{p.per}</span>
            </p>
            <p className="mt-2 text-meta text-muted-foreground">{p.line}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta">
        <Link href="/pricing" className="text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
          See every price
        </Link>
      </p>
    </div>
  );
}
