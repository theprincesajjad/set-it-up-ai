import { Check } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { MHeading, MSection } from "./Section";
import { TradeChips } from "./TradeChips";
import { WARM } from "./warm-copy";

const PLANE: Record<string, string> = {
  peach: "bg-tile-peach",
  mint: "bg-tile-mint",
  lilac: "bg-tile-lilac",
  butter: "bg-tile-butter",
  sky: "bg-tile-sky",
};

/** A real screenshot of the app in a browser-style frame. */
export function Shot({ src, w, h, alt, className, sizes = "(min-width: 1024px) 700px, 100vw" }: { src: string; w: number; h: number; alt: string; className?: string; sizes?: string }) {
  return (
    <div className={cn("mkt-shot", className)}>
      <Image unoptimized src={src} alt={alt} width={w} height={h} sizes={sizes} className="block h-auto w-full" />
    </div>
  );
}

/** Feature rows: a product screenshot on a pastel plane beside three lines of what it does (Mobbin: OpenTable front of house, Square). */
export function Showcase() {
  const S = WARM.showcase;
  return (
    <MSection id="product">
      <MHeading eyebrow={S.eyebrow} title={S.title} sub={S.sub} />
      <div className="flex flex-col gap-16 md:gap-24">
        {S.rows.map((r, n) => {
          const flip = n % 2 === 1;
          const phones = "phones" in r ? r.phones : undefined;
          const shot = "shot" in r ? r.shot : undefined;
          return (
            <div key={r.id} className="mkt-reveal grid items-center gap-8 md:grid-cols-[1.45fr_1fr] md:gap-14">
              <div className={cn("rounded-[32px] p-4 md:rounded-[40px] md:p-7", PLANE[r.tone], flip && "md:order-2")}>
                {shot ? (
                  <Shot {...shot} />
                ) : phones ? (
                  <div className="flex items-start justify-center gap-3 md:gap-5">
                    {phones.map((ph, k) => (
                      <div key={ph.src} className={cn("w-[44%] max-w-[250px] overflow-hidden rounded-[30px] border-[6px] border-foreground/90 bg-card shadow-float", k === 1 && "mt-10")}>
                        <Image unoptimized src={ph.src} alt={ph.alt} width={ph.w} height={ph.h} sizes="250px" className="block h-auto w-full" />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <h3 className="display text-mkt-sm text-balance">{r.title}</h3>
                <p className="mt-4 text-[17px] leading-[1.55] text-muted-foreground">{r.body}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {r.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-body text-foreground">
                      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-forest text-forest-foreground">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </MSection>
  );
}

/** "Every trade gets its own colour": two real Today screens in different trades, and the trade chips. */
export function TradeColours() {
  const T = WARM.trades;
  return (
    <MSection tone="rose" id="trades">
      <MHeading eyebrow={T.eyebrow} title={T.title} sub={T.body} />
      <div className="grid gap-6 md:grid-cols-2">
        {T.shots.map((s) => (
          <figure key={s.label} className="mkt-reveal">
            <Shot src={s.src} w={s.w} h={s.h} alt={s.alt} sizes="(min-width: 768px) 560px, 100vw" />
            <figcaption className="mt-3 text-meta-strong text-foreground">{s.label}</figcaption>
          </figure>
        ))}
      </div>
      <TradeChips className="mt-10" />
    </MSection>
  );
}
