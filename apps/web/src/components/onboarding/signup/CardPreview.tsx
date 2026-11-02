"use client";
/**
 * The loyalty card the owner is making, in the shop's own colour (shopColorProps: a brand colour from the website import or the card step,
 * else the trade colour; both contrast-checked in design-tokens). Stamp cards show the stamp grid with three stamps in; points cards a bar
 * whose goal rolls (AnimatedNumber, NumberFlow) as it changes.
 *
 * Wave Q: depth and motion. A sheen and an inner edge in the card's own colour, a soft float shadow, the stamps popping in one by one, and
 * with `tilt` (the desktop preview, "You're live") the card leans toward a mouse pointer with a glare that follows it. `stack` puts a second
 * card behind it. No tilt on touch or under reduced motion; no colour that is not the shop's.
 */
import { Gift } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { unitWord, type Locale } from "@ll/shared";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { shopColorProps } from "@/lib/shopColor";
import type { CardModel } from "./draft";

export interface CardPreviewProps {
  name: string;
  vertical: string;
  brandColor?: string | null;
  logo?: string | null;
  card: CardModel | null;
  className?: string;
  /** Smaller type and padding (the phone header strip). */
  compact?: boolean;
  /** Lean toward a fine pointer (desktop only; off under reduced motion). */
  tilt?: boolean;
  /** A second card peeking out behind (the desktop preview panel). */
  stack?: boolean;
}

const MAX_DOTS = 20;

export function CardPreview({ name, vertical, brandColor, logo, card, className, compact, tilt, stack }: CardPreviewProps) {
  const { t, locale } = useLocaleOrEnglish();
  const shown = name.trim() || t("sf.preview.yourShop");
  const unit = card ? unitWord(locale as Locale, card.terminology) : "";
  const filled = card ? Math.min(3, Math.max(1, card.goal - 1)) : 0;
  const colors = shopColorProps({ vertical: vertical || null, brandColor: brandColor ?? null });
  const ref = useRef<HTMLElement>(null);
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!tilt || !el || e.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - y) * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 10).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    el.dataset.tilting = "";
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    delete el.dataset.tilting;
  };
  const figure = (
    <figure
      ref={ref}
      {...colors}
      aria-label={t("sf.preview.label")}
      data-card-preview
      onPointerMove={tilt ? onMove : undefined}
      onPointerLeave={tilt ? onLeave : undefined}
      style={{ ...colors.style, transform: tilt ? "perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))" : undefined } as CSSProperties}
      className={cn(
        "group/card relative isolate overflow-hidden rounded-[20px] bg-trade text-trade-foreground shadow-float ring-1 ring-inset ring-trade-foreground/10 transition-[background-color,transform] duration-300 ease-out motion-reduce:transition-none",
        tilt && "will-change-transform data-tilting:duration-100",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      {/* Depth in the card's own colour: a sheen from the top corner, a soft glow bottom start, and (tilt) a glare under the pointer. */}
      <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 -z-10 size-56 rounded-full bg-trade-foreground opacity-[0.09]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -start-10 -z-10 size-48 rounded-full bg-trade-foreground opacity-[0.05]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-trade-foreground/10 via-transparent to-transparent" />
      {tilt ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-data-tilting/card:opacity-100 bg-[radial-gradient(circle_at_var(--gx,50%)_var(--gy,50%),color-mix(in_oklab,var(--trade-foreground)_18%,transparent),transparent_55%)]" />
      ) : null}
      <div className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full bg-card object-cover ring-2 ring-trade-foreground/20" />
        ) : (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-trade-foreground/15 text-[18px] font-[650] ring-1 ring-trade-foreground/15">
            {shown.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-[650] leading-6 tracking-[-0.01em]" data-card-name>
            <bdi>{shown}</bdi>
          </p>
          <p className="text-meta opacity-90">{t("sf.preview.cardLine")}</p>
        </div>
      </div>
      {card ? (
        <div className="mt-5">
          {card.earnType === "stamps" && card.goal <= MAX_DOTS ? (
            <ol aria-hidden className={cn("grid gap-2", card.goal <= 6 ? "grid-cols-6" : card.goal <= 10 ? "grid-cols-5" : "grid-cols-7 sm:grid-cols-10")}>
              {Array.from({ length: card.goal }, (_, i) => (
                <li
                  key={i}
                  style={{ animationDelay: `${i * 35}ms` }}
                  className={cn(
                    "grid aspect-square place-items-center rounded-full animate-in fade-in-0 zoom-in-75 fill-mode-backwards duration-300 motion-reduce:animate-none",
                    i < filled ? "bg-trade-foreground text-trade shadow-sm" : "border-2 border-dashed border-trade-foreground/40",
                    i === card.goal - 1 && i >= filled && "border-solid bg-trade-foreground/10",
                  )}
                >
                  {i === card.goal - 1 ? <Gift className={cn("size-[45%]", i < filled ? "" : "opacity-80")} strokeWidth={2} /> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div aria-hidden>
              <div className="flex items-baseline justify-between text-meta">
                <span className="tabular-nums" dir="ltr">
                  {Math.round(card.goal * 0.3)} / <AnimatedNumber value={card.goal} />
                </span>
                <span>{unit}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-trade-foreground/20">
                <div className="h-full w-[30%] rounded-full bg-trade-foreground animate-in slide-in-from-left-full duration-700 ease-out rtl:slide-in-from-right-full motion-reduce:animate-none" />
              </div>
            </div>
          )}
          <p className="mt-4 flex items-center gap-2 text-body font-[550]" data-card-rule>
            <Gift aria-hidden className="size-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0">{t("sf.card.rule", { goal: card.goal, unit, reward: card.reward.trim() || t("sf.card.rewardBlank") })}</span>
          </p>
        </div>
      ) : (
        <div aria-hidden className="mt-5 grid grid-cols-5 gap-2 opacity-60">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="aspect-square rounded-full border-2 border-dashed border-trade-foreground/40" />
          ))}
        </div>
      )}
    </figure>
  );
  if (!stack) return figure;
  return (
    <div className="relative isolate">
      {/* The next card in the wallet, peeking out behind: the same colour, deeper and smaller. */}
      <span {...colors} aria-hidden className="absolute inset-x-6 -bottom-3 -z-10 h-12 rounded-[20px] bg-trade opacity-40 shadow-float" />
      <span {...colors} aria-hidden className="absolute inset-x-12 -bottom-6 -z-20 h-12 rounded-[20px] bg-trade opacity-20" />
      {figure}
    </div>
  );
}
