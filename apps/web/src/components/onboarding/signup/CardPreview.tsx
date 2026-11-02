"use client";
/**
 * The loyalty card the owner is making, in the shop's own colour (shopColorProps: a brand colour from the website import, else the
 * trade colour; both contrast-checked in design-tokens). Stamp cards show the stamp grid with three stamps in; points cards a bar.
 * It re-renders as the owner types, with a short crossfade (none under reduced motion).
 */
import { Gift } from "lucide-react";
import { unitWord, type Locale } from "@ll/shared";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n";
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
}

const MAX_DOTS = 20;

export function CardPreview({ name, vertical, brandColor, logo, card, className, compact }: CardPreviewProps) {
  const { t, locale } = useLocaleOrEnglish();
  const shown = name.trim() || t("sf.preview.yourShop");
  const unit = card ? unitWord(locale as Locale, card.terminology) : "";
  const filled = card ? Math.min(3, Math.max(1, card.goal - 1)) : 0;
  return (
    <figure
      {...shopColorProps({ vertical: vertical || null, brandColor: brandColor ?? null })}
      aria-label={t("sf.preview.label")}
      data-card-preview
      className={cn("relative isolate overflow-hidden rounded-[20px] bg-trade text-trade-foreground shadow-card transition-colors duration-300 motion-reduce:transition-none", compact ? "p-4" : "p-5 sm:p-6", className)}
    >
      {/* A soft sheen in the card's own colour: depth without a second colour. */}
      <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 -z-10 size-56 rounded-full bg-trade-foreground opacity-[0.08]" />
      <div className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full bg-card object-cover ring-2 ring-trade-foreground/20" />
        ) : (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-trade-foreground/15 text-[18px] font-[650]">
            {shown.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-[650] leading-6 tracking-[-0.01em]" data-card-name>
            <bdi>{shown}</bdi>
          </p>
          <p className="text-meta">{t("sf.preview.cardLine")}</p>
        </div>
      </div>
      {card ? (
        <div key={`${card.goal}-${card.earnType}`} className="mt-5 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          {card.earnType === "stamps" && card.goal <= MAX_DOTS ? (
            <ol aria-hidden className={cn("grid gap-2", card.goal <= 6 ? "grid-cols-6" : card.goal <= 10 ? "grid-cols-5" : "grid-cols-7 sm:grid-cols-10")}>
              {Array.from({ length: card.goal }, (_, i) => (
                <li key={i} className={cn("grid aspect-square place-items-center rounded-full", i < filled ? "bg-trade-foreground text-trade" : "border-2 border-dashed border-trade-foreground/40", i === card.goal - 1 && i >= filled && "border-solid")}>
                  {i === card.goal - 1 ? <Gift className={cn("size-[45%]", i < filled ? "" : "opacity-80")} strokeWidth={2} /> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div aria-hidden>
              <div className="flex items-baseline justify-between text-meta">
                <span className="tabular-nums" dir="ltr">
                  {Math.round(card.goal * 0.3)} / {card.goal}
                </span>
                <span>{unit}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-trade-foreground/20">
                <div className="h-full w-[30%] rounded-full bg-trade-foreground" />
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
}
