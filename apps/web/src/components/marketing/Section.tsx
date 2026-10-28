import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SectionTone = "canvas" | "subtle" | "peach" | "mint" | "butter" | "lilac" | "sky" | "rose" | "brand" | "ink";

const TONE: Record<SectionTone, string> = {
  canvas: "",
  subtle: "bg-muted",
  peach: "mkt-band-peach",
  mint: "mkt-band-mint",
  butter: "mkt-band-butter",
  lilac: "mkt-band-lilac",
  sky: "mkt-band-sky",
  rose: "mkt-band-rose",
  /** Terracotta band, white text (the closing ask). */
  brand: "bg-primary text-primary-foreground",
  /** Deep forest band, light text (the restaurant math). */
  ink: "bg-forest text-forest-foreground",
};

/** Marketing section: cream by default, a pastel or deep band when asked, generous vertical rhythm. */
export function MSection({ children, className, id, tone = "canvas" }: { children: ReactNode; className?: string; id?: string; tone?: SectionTone }) {
  return (
    <section id={id} className={cn("py-16 md:py-24", TONE[tone], className)}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">{children}</div>
    </section>
  );
}

/** Eyebrow: a small terracotta caps label (on a deep band it takes the band's own text colour). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-meta-strong text-primary-text", className)}>{children}</p>;
}

/** Editorial heading: a terracotta kicker, a big Fraunces headline, one paragraph. */
export function MHeading({ eyebrow, title, sub, center, className, onBand }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean; className?: string; /** On a forest or terracotta band: kicker and sub take the band's text colour. */ onBand?: boolean }) {
  return (
    <div className={cn("mb-10 max-w-2xl md:mb-14", center && "mx-auto text-center", className)}>
      {eyebrow ? <p className={cn("text-meta-strong", onBand ? "opacity-90" : "text-primary-text")}>{eyebrow}</p> : null}
      <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{title}</h2>
      {sub ? <p className={cn("mt-5 text-[17px] leading-[1.55]", onBand ? "opacity-90" : "text-muted-foreground")}>{sub}</p> : null}
    </div>
  );
}
