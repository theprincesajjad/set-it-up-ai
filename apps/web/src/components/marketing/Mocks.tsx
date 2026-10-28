"use client";
/**
 * Product compositions for the marketing site, built from the real components (ShopTile, MapPin,
 * StampCard, MemberQr, Keypad, CategoryIcon) with static demo data. Decorative: every mock is
 * aria-hidden and inert, so nothing in it is focusable. No stock illustrations.
 */
import { LocateFixed, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { networkApi } from "@ll/shared";
import { categoryLabels, palette, type MapCategoryId } from "@ll/design-tokens";
import { LogoMark } from "@/components/site/Brand";
import { MapPin } from "@/components/pass/MapPin";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Keypad } from "@/components/ui/Keypad";
import { MemberQr } from "@/components/ui/MemberQr";
import { QrCode } from "@/components/ui/QrCode";
import { ShopLogo, ShopTile } from "@/components/ui/ShopTile";
import { StampCard } from "@/components/ui/StampCard";
import { cn } from "@/lib/cn";

const noop = () => undefined;

function fake(id: string, name: string, vertical: string, o: Partial<networkApi.ShopListItemDto> = {}, brandColor: string | null = null): networkApi.ShopListItemDto {
  return {
    merchant: { id, slug: id, name, vertical, logoUrl: null, brandColor, neighbourhoodId: null, description: null },
    location: null,
    locationCount: 1,
    distanceMetres: null,
    openNow: true,
    hasPromo: false,
    promoLine: null,
    perk: null,
    terminology: "stamps",
    earnType: "stamps",
    myBalance: null,
    isMember: false,
    memberCount: null,
    ...o,
  };
}

/** A phone: black bezel, white screen, a 9:41 status bar. */
export function PhoneFrame({ children, className, tone = "bg", height = 620 }: { children: ReactNode; className?: string; tone?: "bg" | "map"; /** Screen height in px: shorter on pages where the default leaves empty space. */ height?: number }) {
  return (
    // A picture of the app in light mode: tokens forced light so dark pages don't half-invert it (polish-audit W21).
    <div aria-hidden inert data-theme="light" className={cn("pointer-events-none relative h-fit w-[300px] shrink-0 self-start select-none rounded-[52px] bg-primary p-[9px] ring-1 ring-border text-foreground", className)}>
      <div style={{ height }} className={cn("relative overflow-hidden rounded-[43px]", tone === "map" ? "bg-ll-map-land" : "bg-background")}>
        <div className="absolute inset-x-0 top-0 z-[5] flex h-11 items-center justify-between px-7 text-[13px] font-semibold text-foreground">
          <span>9:41</span>
          <span className="absolute start-1/2 top-2.5 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-primary" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-foreground/80 p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-foreground" />
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

const STREETS = (
  <svg viewBox="0 0 282 602" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
    <rect width="282" height="602" className="fill-ll-map-land" />
    <path d="M190 360 L282 330 L282 470 L214 480 Z" className="fill-ll-map-park" />
    <path d="M0 520 Q80 500 140 540 T282 560 V602 H0 Z" className="fill-ll-map-water" />
    {/* blocks */}
    {[
      [18, 70, 70, 90], [102, 64, 64, 100], [18, 176, 70, 80], [102, 180, 58, 72], [176, 60, 90, 70], [176, 146, 90, 80],
      [18, 272, 70, 96], [102, 268, 58, 92], [176, 240, 90, 70], [18, 384, 70, 90], [102, 376, 70, 96],
    ].map(([x, y, w, h], i) => (
      <rect key={i} x={x} y={y} width={w} height={h} rx="3" className="fill-border" />
    ))}
    {/* roads */}
    <path d="M96 0 L92 602" className="stroke-ll-map-road" strokeWidth="9" />
    <path d="M168 0 L166 602" className="stroke-ll-map-road" strokeWidth="6" />
    <path d="M0 162 L282 138" className="stroke-ll-map-road" strokeWidth="7" />
    <path d="M0 262 L282 232" className="stroke-ll-map-road" strokeWidth="5" />
    <path d="M0 372 L282 330" className="stroke-ll-map-road" strokeWidth="9" />
    <path d="M10 0 L10 602" className="stroke-ll-map-road" strokeWidth="4" />
    <text x="100" y="120" className="fill-muted-foreground" fontSize="8.5" fontFamily="Inter, sans-serif" transform="rotate(-89 100 120)">Roncesvalles Avenue</text>
    <text x="196" y="226" className="fill-muted-foreground" fontSize="8" fontFamily="Inter, sans-serif" transform="rotate(-6 196 226)">Howard Park Ave</text>
    <text x="206" y="420" className="fill-muted-foreground" fontSize="8" fontStyle="italic" fontFamily="Inter, sans-serif">High Park</text>
  </svg>
);

const MAP_PINS: { s: networkApi.ShopListItemDto; x: number; y: number; selected?: boolean }[] = [
  { s: fake("ll", "Leslie Loaf", "bakery", { hasPromo: true }), x: 130, y: 150 },
  { s: fake("pc", "Pinecone Coffee", "cafe", { isMember: true, myBalance: 7 }), x: 50, y: 222, selected: true },
  { s: fake("fx", "Fix-It Lab", "repair_electronics"), x: 150, y: 296 },
  { s: fake("sp", "Stitch Perfect", "alterations"), x: 40, y: 360 },
  { s: fake("nt", "Nonna's Table", "restaurant"), x: 140, y: 420 },
];

/** The Explore screen: Corner basemap, object pins, floating capsules, category rail. */
export function MapScreen({ rail = true }: { rail?: boolean }) {
  const cats: MapCategoryId[] = ["all", "coffee", "bakery", "eat", "shops"];
  return (
    <div className="absolute inset-0">
      {STREETS}
      {MAP_PINS.map((p) => (
        <div key={p.s.merchant.id} className="absolute" style={{ left: p.x - 17, top: p.y - 17 }}>
          <MapPin shop={p.s} selected={!!p.selected} onSelect={noop} />
        </div>
      ))}
      <div className="absolute inset-x-0 top-12 flex flex-col gap-2 overflow-hidden px-3">
        <div className="flex items-center gap-2">
          <span className="chrome inline-flex size-10 items-center justify-center rounded-full">
            <LogoMark size={20} />
          </span>
          <span className="chrome flex h-10 flex-1 items-center gap-2 rounded-full px-3 text-[13px] text-muted-foreground">
            <Search className="size-4" strokeWidth={1.75} /> search shops
          </span>
        </div>
        <div className="flex gap-1.5">
          {["roncesvalles", "my shops", "open now"].map((t, i) => (
            <span key={t} className={cn("inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[12px] font-semibold shadow-float", i === 1 ? "bg-primary text-primary-foreground" : "bg-background text-foreground")}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute end-3 bottom-[104px] inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float">
        <LocateFixed className="size-[18px]" strokeWidth={1.75} />
      </span>
      {rail ? (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-1">
          {cats.map((c, i) => (
            <span key={c} className="flex w-[52px] flex-col items-center gap-1">
              <span className={cn("flex size-11 items-center justify-center rounded-full bg-background shadow-float", i === 0 && "ring-2 ring-foreground")}>
                <CategoryIcon category={c} size={26} />
              </span>
              <span className={cn("display text-[11px] lowercase [text-shadow:0_0_3px_var(--background)]", i === 0 ? "text-foreground" : "text-muted-foreground")}>{categoryLabels[c]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const WALLET = [
  { name: "Pinecone Coffee", v: "cafe", value: 10, t: "stamps", sub: "reward ready", ready: true, c: palette.green[800] },
  { name: "Leslie Loaf", v: "bakery", value: 8, t: "stamps", sub: "reward ready", ready: true, c: palette.orange[700] },
  { name: "Fix-It Lab", v: "repair_electronics", value: 340, t: "points", sub: "160 pts to $20 off", ready: false, c: palette.blue[700] },
  { name: "Glow Studio", v: "salon", value: 3, t: "visits", sub: "2 more for a blow-dry", ready: false, c: null },
];

/** The wallet as the app draws it (polish-audit K2): lowercase large title, one honest number, a plain list. */
export function WalletScreen() {
  return (
    <div className="absolute inset-0 flex flex-col gap-4 px-4 pt-14">
      <span className="display text-[28px] leading-8 text-foreground">wallet</span>
      <div className="flex items-end gap-3">
        <span className="display text-[40px] leading-none text-foreground">2</span>
        <span className="flex flex-col pb-0.5 text-[13px] leading-4">
          <span className="font-semibold text-foreground">rewards ready</span>
          <span className="text-muted-foreground">across 2 shops</span>
        </span>
      </div>
      {[
        { title: "rewards ready", rows: WALLET.filter((w) => w.ready) },
        { title: "earning", rows: WALLET.filter((w) => !w.ready) },
      ].map((g) => (
        <div key={g.title} className="flex flex-col">
          <span className="border-b border-border pb-1.5 text-[12px] font-semibold text-muted-foreground">{g.title}</span>
          <ul className="divide-y divide-border">
            {g.rows.map((w) => (
              <li key={w.name}>
                <ShopTile variant="wallet" shop={{ name: w.name, vertical: w.v, brandColor: w.c }} balance={{ value: w.value, terminology: w.t }} rewardReady={w.ready} subtitle={w.sub} className="min-h-[56px]" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Join in 30 seconds" at the counter QR. */
export function JoinScreen() {
  return (
    <div className="absolute inset-0 flex flex-col gap-5 px-5 pt-16">
      <div className="flex items-center gap-3">
        <ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", brandColor: palette.amber[700] }} size={48} />
        <div>
          <p className="text-[15px] font-semibold text-foreground">Pinecone Coffee</p>
          <p className="text-[12px] italic text-muted-foreground">café · 412 Roncesvalles Ave</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="display text-[26px] leading-8 text-foreground">join in 30 seconds</span>
        <span className="text-[13px] text-muted-foreground">Join and get 1 free stamp</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-foreground">Mobile number</span>
        <div className="flex gap-2">
          <span className="flex h-11 items-center rounded-input bg-muted px-3 text-[14px] text-muted-foreground">+1</span>
          <span className="flex h-11 flex-1 items-center rounded-input border border-foreground px-3 text-[14px] tabular-nums text-foreground ring-1 ring-foreground">(416) 555-01</span>
        </div>
      </div>
      <span className="flex h-12 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">Text me a code</span>
      <span className="text-center text-[12px] text-muted-foreground">No app needed. Free.</span>
    </div>
  );
}

/** My card: white sheet over the wallet, big QR, member code in mono, one black wallet button. */
export function CardScreen() {
  return (
    <div className="absolute inset-0 bg-hover">
      <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col items-center gap-4 rounded-t-[28px] bg-background px-5 pt-3">
        <span className="h-[5px] w-9 rounded-full bg-hover" />
        <span className="display self-start text-[22px] leading-7 text-foreground">my card</span>
        <span className="-mt-3 self-start text-[13px] text-muted-foreground">Sam Rivera · 2 rewards ready</span>
        <MemberQr memberCode="LL4K7Q2M" size={190} caption="Works at every shop on the network">
          <QrCode value="https://localloyalty.example/c/LL4K7Q2M" size={190} />
        </MemberQr>
        <span className="mt-auto mb-8 flex h-12 w-full items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">Add to Apple Wallet</span>
      </div>
    </div>
  );
}

/** The counter: number in, one big black key. */
export function CounterMock({ className }: { className?: string }) {
  return (
    <div aria-hidden inert data-theme="light" className={cn("pointer-events-none flex w-full max-w-[380px] select-none flex-col gap-4 rounded-sheet border border-border bg-background p-5 text-foreground", className)}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-foreground">Counter</span>
        <span className="text-muted-foreground">Pinecone Coffee · Roncesvalles</span>
      </div>
      <div className="rounded-card bg-muted px-4 py-3">
        <span className="text-[12px] text-muted-foreground">Customer phone</span>
        <p className="display text-[30px] leading-9 tabular-nums text-foreground">(416) 555-0123</p>
      </div>
      <Keypad onKey={noop} size="compact" />
      <span className="flex min-h-[64px] items-center justify-center rounded-card bg-primary text-[17px] font-semibold text-primary-foreground">Add stamp</span>
    </div>
  );
}

/** A stamp card on its own (passport, programme previews). */
export function StampMock({ stamps = 7, goal = 10, reward = "Free drink", className }: { stamps?: number; goal?: number; reward?: string; className?: string }) {
  return (
    <div aria-hidden inert className={cn("pointer-events-none select-none", className)}>
      <StampCard stamps={stamps} goal={goal} rewardName={reward} />
    </div>
  );
}

/** The black "Added 1 stamp" toast the counter shows (the real Toast look). */
export function ToastMock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("w-fit rounded-card bg-primary px-4 py-3 text-[13px] font-medium text-primary-foreground shadow-float", className)}>
      {children}
    </div>
  );
}
