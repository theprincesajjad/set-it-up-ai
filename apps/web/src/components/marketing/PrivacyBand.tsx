import { Check, Lock, MapPin } from "lucide-react";
import { Icon3d } from "@/components/ui/Icon3d";
import { MHeading, MSection } from "./Section";

/** Nail-tech page only: the address rules for a home studio, with the before and after a client sees. Samples, labelled. */
export function PrivacyBand({ eyebrow, title, sub, points, before, beforeLine, after, afterLine }: { eyebrow: string; title: string; sub: string; points: readonly string[]; before: string; beforeLine: string; after: string; afterLine: string }) {
  return (
    <MSection tone="sky" id="privacy">
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
        <div aria-hidden inert data-theme="light" className="flex flex-col gap-4 text-foreground">
          <Icon3d name="home_studio" size={200} trade="salon" className="self-center" />
          <div className="rounded-sheet bg-card p-6 shadow-card">
            <p className="flex items-center gap-2 text-meta-strong text-muted-foreground">
              <MapPin className="size-4" />
              {before}
            </p>
            <p className="display mt-2 text-title text-balance">{beforeLine}</p>
          </div>
          <div className="rounded-sheet bg-card p-6 shadow-card">
            <p className="flex items-center gap-2 text-meta-strong text-muted-foreground">
              <Lock className="size-4" />
              {after}
            </p>
            <p className="display mt-2 text-title text-balance">{afterLine}</p>
          </div>
        </div>
      </div>
    </MSection>
  );
}
