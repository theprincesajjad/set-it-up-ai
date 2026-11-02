"use client";
/**
 * Kit (wave Q): a swipeable row of cards (a customer's cards on /me, offers, reward tiles, testimonials, "shops near you"). The shadcn
 * Carousel (embla-carousel-react 8.6.0) with our arrows (44px glass buttons, hidden on touch), dots that show where you are, and the
 * language's direction (Urdu scrolls right to left).
 *
 *   <CardCarousel label="Your cards" items={cards.map((c) => <WalletCard key={c.id} card={c} />)} />
 *   <CardCarousel label="Offers" items={offers} basis="basis-[85%] sm:basis-1/2 lg:basis-1/3" dots={false} />
 *
 * Keep it under ~12 items; past that use a list. Lazy-load it below the fold on public pages: `dynamic(() => import(".../CardCarousel"))`
 * (embla is ~7 kB gzip). Reduced motion: embla snaps without the glide (duration 0).
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/primitives/carousel";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface CardCarouselProps {
  /** Names the region for screen readers ("Your cards"). */
  label: string;
  items: ReactNode[];
  /** Tailwind basis classes per item. Default: 88% on phones (the next card peeks), half from sm, a third from lg. */
  basis?: string;
  dots?: boolean;
  arrows?: boolean;
  loop?: boolean;
  className?: string;
}

export function CardCarousel({ label, items, basis = "basis-[88%] sm:basis-1/2 lg:basis-1/3", dots = true, arrows = true, loop = false, className }: CardCarouselProps) {
  const { t, dir } = useLocaleOrEnglish();
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const [snaps, setSnaps] = useState(0);
  const [edges, setEdges] = useState({ prev: false, next: false });
  // Only feeds embla's glide duration (nothing rendered differs), so reading it during the first client render is safe.
  const [reduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (!api) return;
    const sync = () => {
      setIndex(api.selectedScrollSnap());
      setSnaps(api.scrollSnapList().length);
      setEdges({ prev: api.canScrollPrev(), next: api.canScrollNext() });
    };
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);
  const arrow = "grid size-11 place-items-center rounded-full glass-lite text-foreground transition-opacity disabled:pointer-events-none disabled:opacity-0 focus-visible:focus-ring pointer-coarse:hidden";
  return (
    <Carousel setApi={setApi} opts={{ direction: dir, align: "start", loop, duration: reduced ? 0 : 25, containScroll: "trimSnaps" }} aria-label={label} className={cn("w-full", className)}>
      <CarouselContent className="-ms-3">
        {items.map((node, i) => (
          <CarouselItem key={i} className={cn("ps-3", basis)} aria-label={t("kit.slideOf", { n: i + 1, total: items.length })}>
            {node}
          </CarouselItem>
        ))}
      </CarouselContent>
      {(arrows || dots) && snaps > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          {dots ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
              {Array.from({ length: snaps }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={t("kit.goToSlide", { n: i + 1 })}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => api?.scrollTo(i)}
                  className="group grid h-11 w-6 place-items-center rounded-full focus-visible:focus-ring pointer-coarse:w-7"
                >
                  <span className={cn("block h-1.5 rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none", i === index ? "w-5 bg-foreground" : "w-1.5 bg-lg-seg-track group-hover:bg-muted-foreground")} />
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {arrows ? (
            <div className="flex shrink-0 gap-2">
              <button type="button" className={arrow} onClick={() => api?.scrollPrev()} disabled={!edges.prev} aria-label={t("kit.prev")}>
                <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" strokeWidth={2} />
              </button>
              <button type="button" className={arrow} onClick={() => api?.scrollNext()} disabled={!edges.next} aria-label={t("kit.next")}>
                <ChevronRight aria-hidden className="size-5 rtl:rotate-180" strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Carousel>
  );
}
