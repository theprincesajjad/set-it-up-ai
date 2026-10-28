import { Coffee, Gift } from "lucide-react";
import { tradeColors } from "@ll/design-tokens";
import type { CSSProperties, ReactNode } from "react";
import { IconTile } from "@/components/ui/IconTile";
import { StatTile } from "@/components/ui/StatTile";
import { cn } from "@/lib/cn";

/**
 * The hero picture (Figma "Marketing home / hero / 1440"): a sand stage with the category illustrations on pastel tiles, a sample
 * coffee-shop pass in its trade colours, one stat tile and a "redeemed" note. Decorative and inert; every shop and number in it is
 * a sample, and the caption under the stage says so.
 */
/** The sample pass is a picture of the app in light mode: its trade colours are the light ones whatever the page theme is. */
const PASS = tradeColors("cafe", "light");
const PASS_VARS = { "--trade": PASS.accent, "--trade-foreground": PASS.foreground, "--trade-alt": PASS.alt, "--trade-deep": PASS.deep } as CSSProperties;

const TILES: { art: string; tone: string }[] = [
  { art: "coffee", tone: "bg-tile-peach" },
  { art: "beauty", tone: "bg-tile-rose" },
  { art: "eat", tone: "bg-tile-butter" },
  { art: "shops", tone: "bg-tile-sky" },
  { art: "repair", tone: "bg-tile-lilac" },
  { art: "bakery", tone: "bg-tile-mint" },
];

/** Entrance order: each step is one --i unit (70 ms) in marketing.css. */
const DELAY = ["[--i:0]", "[--i:1]", "[--i:2]", "[--i:3]", "[--i:4]", "[--i:5]", "[--i:6]", "[--i:7]", "[--i:8]"];

function Tile({ art, tone, i, className }: { art: string; tone: string; i: number; className?: string }) {
  return (
    <div className={cn("mkt-pop flex aspect-square items-center justify-center rounded-tile", DELAY[i], tone, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/categories/${art}.svg`} alt="" width={96} height={96} draggable={false} className="size-[58%] select-none" />
    </div>
  );
}

export function HeroArt({ caption }: { caption: string }) {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div aria-hidden inert data-theme="light" className="mkt-stage relative select-none rounded-[36px] p-4 text-foreground sm:p-6 md:rounded-[44px] md:p-8">
        <div className="grid grid-cols-6 gap-3 sm:gap-4">
          {TILES.slice(0, 3).map((t, i) => (
            <Tile key={t.art} {...t} i={i} className="col-span-2" />
          ))}

          {/* The pass: trade gradient, awning edge, eight of ten stamps. */}
          <div style={PASS_VARS} className="[--i:3] mkt-pop relative col-span-4 overflow-hidden rounded-card bg-[linear-gradient(100deg,var(--trade)_0%,var(--trade)_62%,var(--trade-alt)_135%)] p-4 text-trade-foreground shadow-card sm:p-5">
            <div className="absolute inset-x-0 top-0 h-2.5 bg-[repeating-linear-gradient(90deg,var(--primary)_0_24px,var(--card)_24px_48px)]" />
            <div className="mt-2 flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-card text-[11px] font-bold text-trade-deep">PC</span>
              <span className="text-[14px] font-semibold sm:text-[15px]">Pinecone Coffee</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className={cn("flex aspect-square items-center justify-center rounded-full", n < 8 ? "bg-card text-trade-deep" : "border-[1.5px] border-dashed border-trade-foreground/70", n === 7 && "mkt-stamp")}>
                  {n < 8 ? <Coffee className="size-[45%]" strokeWidth={2} /> : null}
                </span>
              ))}
            </div>
            <p className="font-display mt-3 text-[26px] leading-none font-extrabold tabular-nums sm:text-[32px]">
              8 <span className="opacity-80">/ 10</span>
            </p>
            <p className="mt-1 text-[12px] sm:text-[13px]">2 more for a free latte</p>
          </div>

          <div className="[--i:4] mkt-pop col-span-2 flex">
            <div className="w-full self-start [&_svg]:!w-10 sm:[&_svg]:!w-12">
              <StatTile tone="butter" label="Guests today" value="126" delta={{ pct: 14, good: true, text: "14% vs usual" }} spark={[3, 5, 4, 7, 6, 9, 8, 11]} />
            </div>
          </div>

          {TILES.slice(3).map((t, i) => (
            <Tile key={t.art} {...t} i={5 + i} className="col-span-2" />
          ))}
        </div>

        <div className="[--i:8] mkt-pop absolute start-[8%] end-[8%] top-[56%] flex items-center gap-3 rounded-card bg-card px-3.5 py-3 shadow-float sm:start-auto sm:end-[5%] sm:w-[50%] sm:px-4">
          <IconTile icon={Gift} tone="lilac" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-foreground">Maya redeemed a free latte</p>
            <p className="text-[12px] text-muted-foreground">Just now · counter 1</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-caption text-muted-foreground">{caption}</p>
    </div>
  );
}

/** A 3 x 2 block of category illustrations on pastel tiles: the stage for the pricing and sign-in pages. Decorative. */
export function ArtTiles({ className }: { className?: string }) {
  return (
    <div aria-hidden inert data-theme="light" className={cn("mkt-stage grid grid-cols-3 gap-3 rounded-[32px] p-4 sm:gap-4 sm:p-6", className)}>
      {TILES.map((t, i) => (
        <Tile key={t.art} {...t} i={i} />
      ))}
    </div>
  );
}

/** A sand stage with a phone in the middle and two category illustrations on pastel tiles beside it (the hero picture of the shopper and restaurant pages). */
export function PhoneStage({ children, arts }: { children: ReactNode; arts: [string, string] }) {
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div className="mkt-stage flex justify-center rounded-[36px] px-4 py-8 sm:py-10 md:rounded-[44px]">{children}</div>
      <div aria-hidden data-theme="light" className="absolute -start-2 top-10 hidden w-24 sm:block lg:-start-8">
        <Tile art={arts[0]} tone="bg-tile-butter" i={1} className="shadow-card" />
      </div>
      <div aria-hidden data-theme="light" className="absolute -end-2 bottom-14 hidden w-24 sm:block lg:-end-8">
        <Tile art={arts[1]} tone="bg-tile-rose" i={2} className="shadow-card" />
      </div>
    </div>
  );
}
