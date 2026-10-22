"use client";
/**
 * Product compositions for the marketing site, built from the real components (ShopTile, MapPin,
 * StampCard, MemberQr, Keypad, CategoryIcon) with static demo data. Decorative: every mock is
 * aria-hidden and inert, so nothing in it is focusable. No stock illustrations.
 */
import { LocateFixed, QrCode as QrIcon, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { networkApi } from "@ll/shared";
import { categoryLabels, type MapCategoryId } from "@ll/design-tokens";
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
    terminology: "stamps",
    earnType: "stamps",
    myBalance: null,
    isMember: false,
    memberCount: null,
    ...o,
  };
}

/** A phone: black bezel, white screen, a 9:41 status bar. */
export function PhoneFrame({ children, className, tone = "bg" }: { children: ReactNode; className?: string; tone?: "bg" | "map" }) {
  return (
    <div aria-hidden inert className={cn("pointer-events-none relative w-[300px] shrink-0 select-none rounded-[52px] bg-[#0B0B0C] p-[9px] ring-1 ring-line", className)}>
      <div className={cn("relative h-[620px] overflow-hidden rounded-[43px]", tone === "map" ? "bg-ll-map-land" : "bg-bg")}>
        <div className="absolute inset-x-0 top-0 z-[5] flex h-11 items-center justify-between px-7 text-[13px] font-semibold text-[#0B0B0C]">
          <span>9:41</span>
          <span className="absolute start-1/2 top-2.5 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-[#0B0B0C]" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-[#0B0B0C]/80 p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-[#0B0B0C]" />
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
    <rect width="282" height="602" fill="#F2F2F0" />
    <path d="M190 360 L282 330 L282 470 L214 480 Z" fill="#EEF3EA" />
    <path d="M0 520 Q80 500 140 540 T282 560 V602 H0 Z" fill="#E9F0F5" />
    {/* blocks */}
    {[
      [18, 70, 70, 90], [102, 64, 64, 100], [18, 176, 70, 80], [102, 180, 58, 72], [176, 60, 90, 70], [176, 146, 90, 80],
      [18, 272, 70, 96], [102, 268, 58, 92], [176, 240, 90, 70], [18, 384, 70, 90], [102, 376, 70, 96],
    ].map(([x, y, w, h], i) => (
      <rect key={i} x={x} y={y} width={w} height={h} rx="3" fill="#EAEAE7" />
    ))}
    {/* roads */}
    <path d="M96 0 L92 602" stroke="#FFFFFF" strokeWidth="9" />
    <path d="M168 0 L166 602" stroke="#FFFFFF" strokeWidth="6" />
    <path d="M0 162 L282 138" stroke="#FFFFFF" strokeWidth="7" />
    <path d="M0 262 L282 232" stroke="#FFFFFF" strokeWidth="5" />
    <path d="M0 372 L282 330" stroke="#FFFFFF" strokeWidth="9" />
    <path d="M10 0 L10 602" stroke="#FFFFFF" strokeWidth="4" />
    <text x="100" y="120" fill="#9A9AA0" fontSize="8.5" fontFamily="Inter, sans-serif" transform="rotate(-89 100 120)">Roncesvalles Avenue</text>
    <text x="196" y="226" fill="#9A9AA0" fontSize="8" fontFamily="Inter, sans-serif" transform="rotate(-6 196 226)">Howard Park Ave</text>
    <text x="206" y="420" fill="#9AABB8" fontSize="8" fontStyle="italic" fontFamily="Inter, sans-serif">High Park</text>
  </svg>
);

const MAP_PINS: { s: networkApi.ShopListItemDto; x: number; y: number; selected?: boolean }[] = [
  { s: fake("pc", "Pinecone Coffee", "cafe", { isMember: true, myBalance: 7 }), x: 72, y: 196, selected: true },
  { s: fake("ll", "Leslie Loaf", "bakery", { hasPromo: true }), x: 140, y: 112 },
  { s: fake("fx", "Fix-It Phone Lab", "repair_electronics"), x: 150, y: 290 },
  { s: fake("sp", "Stitch Perfect", "alterations"), x: 60, y: 344 },
  { s: fake("nt", "Nonna's Table", "restaurant"), x: 168, y: 396 },
  { s: fake("gw", "Glow Studio", "salon"), x: 40, y: 452 },
];

/** The Explore screen: Corner basemap, object pins, floating capsules, category rail. */
export function MapScreen({ rail = true }: { rail?: boolean }) {
  const cats: MapCategoryId[] = ["all", "coffee", "bakery", "eat", "shops"];
  return (
    <div className="absolute inset-0">
      {STREETS}
      {MAP_PINS.map((p) => (
        <div key={p.s.merchant.id} className="absolute" style={{ left: p.x - 22, top: p.y - 22 }}>
          <MapPin shop={p.s} selected={!!p.selected} onSelect={noop} />
        </div>
      ))}
      <div className="absolute inset-x-0 top-12 flex flex-col gap-2 px-3">
        <div className="flex items-center gap-2">
          <span className="chrome inline-flex size-10 items-center justify-center rounded-full">
            <LogoMark size={20} />
          </span>
          <span className="chrome flex h-10 flex-1 items-center gap-2 rounded-full px-3 text-[13px] text-fg-muted">
            <Search className="size-4" strokeWidth={1.75} /> search shops
          </span>
        </div>
        <div className="flex gap-1.5">
          {["roncesvalles", "my shops", "open now"].map((t, i) => (
            <span key={t} className={cn("inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold shadow-float", i === 1 ? "bg-[#0B0B0C] text-[#FFFFFF]" : "bg-[#FFFFFF] text-[#0B0B0C]")}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <span className="absolute end-3 bottom-[104px] inline-flex size-11 items-center justify-center rounded-full bg-[#0B0B0C] text-[#FFFFFF] shadow-float">
        <LocateFixed className="size-[18px]" strokeWidth={1.75} />
      </span>
      {rail ? (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-1">
          {cats.map((c, i) => (
            <span key={c} className="flex w-[52px] flex-col items-center gap-1">
              <span className={cn("flex size-11 items-center justify-center rounded-full bg-[#FFFFFF] shadow-float", i === 0 && "ring-2 ring-[#0B0B0C]")}>
                <CategoryIcon category={c} size={26} />
              </span>
              <span className={cn("display text-[11px] lowercase [text-shadow:0_0_3px_#fff]", i === 0 ? "text-[#0B0B0C]" : "text-[#6B6B70]")}>{categoryLabels[c]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const WALLET = [
  { name: "Pinecone Coffee", v: "cafe", value: 10, t: "stamps", sub: "Free drink is ready", ready: true, c: "#7A4B2A" },
  { name: "Leslie Loaf", v: "bakery", value: 1, t: "reward", sub: "Free loaf is ready", ready: true, c: null },
  { name: "Fix-It Phone Lab", v: "repair_electronics", value: 340, t: "points", sub: "160 pts to $20 off", ready: false, c: "#1D4ED8" },
  { name: "Glow Studio", v: "salon", value: 3, t: "visits", sub: "2 more for a free blow-dry", ready: false, c: null },
];

/** The wallet: large title, one honest number, the black card button, a grouped list. */
export function WalletScreen() {
  return (
    <div className="absolute inset-0 flex flex-col gap-4 px-4 pt-14">
      <div className="flex items-center justify-between">
        <span className="display text-[26px] leading-8 text-fg">Wallet</span>
        <span className="text-[12px] text-fg-muted">Sam · across 4 shops</span>
      </div>
      <div className="flex items-end gap-2.5">
        <span className="display text-[56px] leading-[0.9] text-accent-text">2</span>
        <span className="pb-1 text-[13px] leading-4 text-fg-muted">rewards ready</span>
      </div>
      <span className="flex h-11 items-center justify-center gap-2 rounded-full bg-fg text-[14px] font-semibold text-bg">
        <QrIcon className="size-4" strokeWidth={1.75} /> Show my card
      </span>
      <div className="flex gap-4 border-b border-line text-[13px] font-semibold">
        <span className="border-b-2 border-fg pb-2 text-fg">Shops</span>
        <span className="pb-2 text-fg-muted">Rewards</span>
        <span className="pb-2 text-fg-muted">Activity</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-[12px] font-semibold text-fg-muted">Rewards ready</span>
        <ul className="divide-y divide-line rounded-card border border-line px-3">
          {WALLET.map((w, i) => (
            <li key={w.name} className={i === 2 ? "border-t-[6px] border-t-bg-subtle" : undefined}>
              <ShopTile variant="wallet" shop={{ name: w.name, vertical: w.v, brandColor: w.c }} balance={{ value: w.value, terminology: w.t }} rewardReady={w.ready} subtitle={w.sub} className="min-h-[56px] [&_.text-title]:text-[18px]" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "Join in 30 seconds" at the counter QR. */
export function JoinScreen() {
  return (
    <div className="absolute inset-0 flex flex-col gap-5 px-5 pt-16">
      <div className="flex items-center gap-3">
        <ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", brandColor: "#7A4B2A" }} size={48} />
        <div>
          <p className="text-[15px] font-semibold text-fg">Pinecone Coffee</p>
          <p className="text-[12px] italic text-fg-muted">café · 412 Roncesvalles Ave</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="display text-[26px] leading-8 text-fg">Join in 30 seconds</span>
        <span className="flex items-center gap-2 text-[13px] text-fg">
          <span className="size-1.5 rounded-full bg-accent" /> Join and get 1 free stamp
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-fg">Mobile number</span>
        <div className="flex gap-2">
          <span className="flex h-11 items-center rounded-input bg-bg-subtle px-3 text-[14px] text-fg-muted">+1</span>
          <span className="flex h-11 flex-1 items-center rounded-input border border-fg px-3 text-[14px] tabular-nums text-fg ring-1 ring-fg">(416) 555-01</span>
        </div>
      </div>
      <span className="flex h-12 items-center justify-center rounded-full bg-fg text-[14px] font-semibold text-bg">Text me a code</span>
      <span className="text-center text-[12px] text-fg-muted">No app needed. Free.</span>
    </div>
  );
}

/** My card: white sheet over the wallet, big QR, member code in mono, one black wallet button. */
export function CardScreen() {
  return (
    <div className="absolute inset-0 bg-bg-muted">
      <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col items-center gap-4 rounded-t-[28px] bg-bg px-5 pt-3">
        <span className="h-[5px] w-9 rounded-full bg-bg-muted" />
        <span className="self-start text-[16px] font-semibold text-fg">My card</span>
        <span className="text-[14px] font-semibold text-fg">Sam Rivera</span>
        <MemberQr memberCode="LL4K7Q2M" size={190} caption="Works at every shop on the network">
          <QrCode value="https://localloyalty.example/c/LL4K7Q2M" size={190} />
        </MemberQr>
        <span className="mt-auto mb-8 flex h-12 w-full items-center justify-center rounded-full bg-fg text-[14px] font-semibold text-bg">Add to Apple Wallet</span>
      </div>
    </div>
  );
}

/** The counter: number in, one big black key. */
export function CounterMock({ className }: { className?: string }) {
  return (
    <div aria-hidden inert className={cn("pointer-events-none flex w-full max-w-[380px] select-none flex-col gap-4 rounded-sheet border border-line bg-bg p-5", className)}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold text-fg">Counter</span>
        <span className="text-fg-muted">Pinecone Coffee · Roncesvalles</span>
      </div>
      <div className="rounded-card bg-bg-subtle px-4 py-3">
        <span className="text-[12px] text-fg-muted">Customer phone</span>
        <p className="display text-[30px] leading-9 tabular-nums text-fg">(416) 555-0123</p>
      </div>
      <Keypad onKey={noop} size="compact" />
      <span className="flex min-h-[64px] items-center justify-center rounded-card bg-fg text-[17px] font-semibold text-bg">Add stamp</span>
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
    <div aria-hidden className={cn("w-fit rounded-card bg-fg px-4 py-3 text-[13px] font-medium text-bg shadow-float", className)}>
      {children}
    </div>
  );
}
