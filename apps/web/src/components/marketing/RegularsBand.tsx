import { Check } from "lucide-react";
import { MHeading, MSection } from "./Section";
import { PoweredByPreview } from "./PoweredBy";
import type { Locale } from "@ll/shared";

/** "Your regulars": stamps, promos to regulars, the shared pass, and the one quiet client-loop line as a client sees it. */
export function RegularsBand({ eyebrow, title, sub, points, loop, locale, vertical }: { eyebrow: string; title: string; sub: string; points: readonly string[]; loop: string; locale: Locale; vertical: string }) {
  return (
    <MSection tone="butter" id="regulars">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <div>
          <MHeading eyebrow={eyebrow} title={title} sub={sub} className="mb-8!" />
          <ul className="flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-body text-foreground">
                <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-positive-text">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <PoweredByPreview locale={locale} vertical={vertical} />
          <p className="mt-4 text-meta text-muted-foreground">{loop}</p>
        </div>
      </div>
    </MSection>
  );
}
