/**
 * Product mocks for the home page, built from the real Clear pieces (components/ui/ClearKit: StatCardShell, StatChip, TradeTile, Rows,
 * Row) and the real markup recipes of the Today screen (components/dashboard/home), the counter, the Wallet-style pass
 * (components/pass/ShopPassHero + ClearPass.module.css) and the member map. Server-only and static: no script, no data fetch, no link or
 * button inside (every mock is a picture: aria-hidden, with a label on its figure). Sample shop, sample people, sample numbers.
 * Reference screens: scratchpad/shots/clear-final (Today 1440 and 390, counter 1180, pass 390, map 390).
 */
import {
  ArrowUpRight, BarChart3, Check, Bell, BookOpen, Calculator, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, Coffee, Delete, Gift, Globe, Home, LayoutGrid, LocateFixed, Mail, Map as MapIcon,
  MapPin, Maximize2, Megaphone, MessageCircle, MoreHorizontal, QrCode, ScanLine, Search, Settings, SlidersHorizontal, Sparkles, Star, Ticket, UserRound, Users, Wallet, Activity, Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Row, Rows, StatCardShell, StatChip, TradeTile } from "@/components/ui/ClearKit";
import passStyles from "@/components/pass/ClearPass.module.css";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

const M = copy.landing.mock;

const NAV_ICONS: LucideIcon[][] = [[Home, Calculator], [Users, Gift, Megaphone, Mail], [BarChart3, MapIcon], [QrCode, SlidersHorizontal]];
const STAT_ICONS: LucideIcon[] = [Users, Ticket, Gift, UserRound];
const NEEDS_ICONS: LucideIcon[] = [Gift, MessageCircle, ClipboardCheck];
/** Visits by hour, 7 a.m. to 6 p.m.; the current hour (5 p.m.) is the trade colour, like the real chart. */
const HOURS = [5, 1, 5, 5, 2, 10, 8, 3, 3, 1, 8, 0.4];
const NOW_HOUR = 10;

/** The card recipe the Today cards use in Clear (TodayCards CLEAR_CARD), as a utility. */
const CARD = "card-clear overflow-hidden";

/** The 56 tall card header (ClearKit CardHead), as a span: a mock has no headings of its own. */
function Head({ title, count, action }: { title: string; count?: string; action?: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
      <span className="flex items-center gap-2 text-headline text-foreground">
        {title}
        {count ? <span className="inline-flex h-5 items-center rounded-r2 bg-muted px-2 text-meta-strong tabular-nums">{count}</span> : null}
      </span>
      {action ? <span className="text-body text-muted-foreground">{action}</span> : null}
    </div>
  );
}

/** The slim secondary pill on a Needs you row. */
const Pill = ({ children }: { children: string }) => <span className="glass-tint inline-flex h-7 items-center rounded-full px-3 text-body font-[550] text-foreground">{children}</span>;

function HourChart({ height = 128 }: { height?: number }) {
  const max = Math.max(...HOURS);
  return (
    <div className="px-4 pb-4">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {HOURS.map((h, i) => (
          <span key={i} className={cn("hm-bar flex-1 rounded-t-[4px]", i === NOW_HOUR ? "bg-chart-hi" : "bg-chart-muted")} style={{ "--h": h / max } as CSSProperties} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-meta text-muted-foreground">
        <span>{M.hoursFrom}</span>
        <span className="font-semibold text-foreground">{M.hoursPeak}</span>
        <span>{M.hoursTo}</span>
      </div>
    </div>
  );
}

function ShopMark({ size = "size-8 rounded-r3 text-[13px]" }: { size?: string }) {
  return <span className={cn("inline-grid shrink-0 place-items-center bg-trade font-semibold text-trade-foreground", size)}>{M.shopShort}</span>;
}

// ---------------------------------------------------------------------------
// Today, desktop (1200 x 700 canvas, Clear shell: glass sidebar and toolbar)
// ---------------------------------------------------------------------------

export function TodayDesktop() {
  return (
    <div className="hm-desk" data-trade="cafe" aria-hidden>
      <aside className="hm-side glass-side">
        <div className="flex items-center gap-3 px-2 pt-1 pb-3">
          <ShopMark />
          <span className="min-w-0 leading-tight">
            <b className="block truncate text-[14px] font-semibold">{M.shop}</b>
            <span className="block truncate text-meta text-muted-foreground">{M.street}</span>
          </span>
        </div>
        {M.nav.map((g, gi) => (
          <div key={g.group} className="mt-2">
            <span className="block px-3 pt-2 pb-1 text-meta font-medium text-muted-foreground">{g.group}</span>
            {g.items.map((item, ii) => {
              const Icon = NAV_ICONS[gi]![ii]!;
              const on = gi === 0 && ii === 0;
              return (
                <span key={item} className={cn("flex h-9 items-center gap-3 rounded-[18px] px-3 text-[13px] font-medium", on && "glass-nav-on")}>
                  <Icon className={cn("size-4", on ? "text-trade" : "text-muted-foreground")} strokeWidth={1.8} />
                  {item}
                </span>
              );
            })}
          </div>
        ))}
        <div className="mt-auto px-3 pb-2">
          <div className="flex justify-between text-meta text-muted-foreground">
            <span>{M.setup}</span>
            <span className="tabular-nums">{M.setupN}</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-muted">
            <div className="h-1 w-4/5 rounded-full bg-foreground" />
          </div>
        </div>
      </aside>
      <div className="hm-desk-main">
        <div className="hm-toolbar glass-chrome">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <MapPin className="size-4" strokeWidth={1.8} />
            {M.street}
          </span>
          <span className="hm-search">
            <Search className="size-4" strokeWidth={1.8} />
            <span className="flex-1">{M.search}</span>
            <span className="text-meta">{M.kbd}</span>
          </span>
          <span className="flex items-center justify-end gap-2">
            <span className="glass-lite inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium">
              <Globe className="size-4" strokeWidth={1.8} />
              {M.lang}
            </span>
            <span className="inline-grid size-8 place-items-center">
              <CircleHelp className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="inline-grid size-8 place-items-center">
              <Bell className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="inline-grid size-8 place-items-center rounded-full bg-foreground text-meta font-semibold text-background">{M.ownerShort}</span>
          </span>
        </div>
        <div className="mt-6 mb-6 flex items-end justify-between gap-4">
          <span>
            <b className="block text-large-title">{M.greeting}</b>
            <span className="mt-1 block text-body text-muted-foreground">{M.date}</span>
          </span>
          <span className="flex gap-2">
            <span className="glass-lite inline-flex h-8 items-center rounded-full px-4 text-[13px] font-[550]">{M.printKit}</span>
            <span className="inline-flex h-8 items-center rounded-full bg-primary px-4 text-[13px] font-[550] text-primary-foreground shadow-primary">{M.openCounter}</span>
          </span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {M.stats.map((s, i) => (
            <StatCardShell key={s.label} icon={STAT_ICONS[i]!} label={s.label} value={s.value} chip={<StatChip tone={s.tone === "up" ? "up" : "neutral"} icon={s.tone === "up" ? ArrowUpRight : undefined}>{s.chip}</StatChip>} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-8 gap-4">
          <div className={cn(CARD, "col-span-5")}>
            <Head title={M.needs} count={String(M.needsRows.length)} />
            <Rows>
              {M.needsRows.map((r, i) => (
                <Row key={r.t} minHeight={84} leading={<TradeTile icon={NEEDS_ICONS[i]!} />} title={r.t} subtitle={r.s} trailing={<Pill>{r.a}</Pill>} />
              ))}
            </Rows>
          </div>
          <div className="col-span-3 flex flex-col gap-4">
            <div className={CARD}>
              <Head title={M.hours} action={M.hoursWhen} />
              <HourChart height={112} />
            </div>
            <div className={CARD}>
              <Head title={M.upNext} action={M.upNextLink} />
              <Rows>
                <Row leading={<span className="w-16 text-body text-muted-foreground tabular-nums">{M.upNextTime}</span>} title={M.upNextTitle} subtitle={M.upNextSub} />
              </Rows>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone screens (393 x 852 canvases for <IPhone>)
// ---------------------------------------------------------------------------

/** The phone tab bar: 358 x 64 glass, tabs 56, the active one lifted with a blue label (AppShell, Clear). */
function TabBar({ tabs, icons }: { tabs: readonly string[]; icons: LucideIcon[] }) {
  return (
    <div className="hm-tabbar glass-sheet">
      {tabs.map((t, i) => {
        const Icon = icons[i]!;
        return (
          <span key={t} className={cn("hm-tab", i === 0 && "glass-lift text-link")}>
            <Icon className="size-6" strokeWidth={1.7} />
            {t}
          </span>
        );
      })}
    </div>
  );
}

/** The owner's Today on a phone (Clear, 390): shop capsule, greeting, Open counter, four stat cards, Needs you, the tab bar. */
export function TodayPhone() {
  return (
    <div className="hm-screen" data-trade="cafe">
      <div className="flex items-center gap-2 px-4 pt-[58px]">
        <span className="glass-chrome flex h-11 flex-1 items-center gap-3 rounded-[22px] px-1.5">
          <ShopMark size="size-8 rounded-full text-[12px]" />
          <span className="min-w-0 leading-tight">
            <b className="block truncate text-[14px] font-semibold">{M.shop}</b>
            <span className="block truncate text-[12px] text-muted-foreground">{M.street}</span>
          </span>
        </span>
        <span className="glass-chrome inline-grid size-11 place-items-center rounded-full">
          <Search className="size-5" strokeWidth={1.8} />
        </span>
        <span className="glass-chrome inline-grid size-11 place-items-center rounded-full">
          <Bell className="size-5" strokeWidth={1.8} />
        </span>
      </div>
      <div className="px-4 pt-5">
        <b className="block text-[30px] leading-9 font-bold tracking-[-0.022em]">{M.greeting}</b>
        <span className="mt-1 block text-[15px] text-muted-foreground">{M.date}</span>
        <span className="mt-4 flex h-14 items-center gap-3 rounded-[28px] bg-primary px-5 text-[17px] font-semibold text-primary-foreground">
          <Calculator className="size-5" strokeWidth={1.8} />
          <span className="flex-1">{M.openCounter}</span>
          <ChevronRight className="size-5" strokeWidth={2} />
        </span>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {M.stats.map((s, i) => (
            <StatCardShell key={s.label} layout="phone" icon={STAT_ICONS[i]!} label={s.label} value={s.value} chip={i % 2 === 0 ? <StatChip tone={s.tone === "up" ? "up" : "neutral"} icon={s.tone === "up" ? ArrowUpRight : undefined}>{s.chip}</StatChip> : undefined} />
          ))}
        </div>
        <div className={cn(CARD, "mt-3")}>
          <Head title={M.needs} count={String(M.needsRows.length)} />
          <Rows inset>
            <Row leading={<TradeTile icon={Gift} size="phone" />} title={M.needsRows[0]!.t} subtitle={M.needsRows[0]!.s} />
          </Rows>
        </div>
      </div>
      <TabBar tabs={M.tabs} icons={[Home, Calculator, Users, MoreHorizontal]} />
    </div>
  );
}

/** The customer's pass (Clear): the shop colour behind the top, the strong-glass Wallet card, Show my code, nearby businesses, the tab bar. */
export function PassPhone() {
  const P = M.pass;
  const goal = 10;
  const have = 9;
  return (
    <div className="hm-screen" data-trade="cafe">
      <div className="hm-field" />
      <div className="relative px-4 pt-[62px] text-trade-pass-text">
        <div className="flex items-center justify-between">
          <b className="text-[17px] font-semibold">{P.hi}</b>
          <span className="flex items-center gap-3">
            <Search className="size-[22px]" strokeWidth={1.8} />
            <Settings className="size-[22px]" strokeWidth={1.8} />
            <span className="hm-pass-lang inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium">
              <Globe className="size-4" strokeWidth={1.8} />
              {M.lang}
            </span>
          </span>
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] opacity-85">{P.yourPass}</p>
        <b className="mt-1 block text-[30px] leading-9 font-bold tracking-[-0.022em]">{M.shop}</b>
        <span className="block text-[15px] opacity-90">{M.kind}</span>
      </div>
      <div className="relative mx-4 mt-4 glass-sheet rounded-r8 p-5">
        <div className="flex items-center gap-3 pb-4">
          <ShopMark size="size-10 rounded-r3 text-[14px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] leading-5 font-semibold tracking-[-0.014em]">{P.card}</p>
            <p className="truncate text-[13px] text-muted-foreground">{P.line}</p>
          </div>
          <span className="inline-flex h-5 items-center rounded-r2 bg-muted px-2 text-[12px] font-medium">{P.badge}</span>
        </div>
        <div className={cn(passStyles.stamps, "pb-4")} style={{ "--cols": 5, "--size": "54px" } as CSSProperties}>
          {Array.from({ length: goal }, (_, i) => (
            <span key={i} className={cn(passStyles.stamp, i < have ? passStyles.stampOn : i === have ? passStyles.stampNext : null, i === have - 1 && "hm-stamp-new")}>
              {i < have ? <Coffee className="size-5" strokeWidth={1.8} /> : null}
            </span>
          ))}
        </div>
        <div className="rule-top grid grid-cols-[auto_1fr_auto] gap-4 pt-4">
          {[
            [P.stampsLabel, P.stamps, "text-[24px] font-semibold tracking-[-0.02em] tabular-nums"],
            [P.nextLabel, P.next, "text-[15px] font-medium"],
            [P.sinceLabel, P.since, "text-[15px] font-medium tabular-nums"],
          ].map(([k, v, c]) => (
            <div key={k} className="min-w-0">
              <span className="block truncate text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted-foreground">{k}</span>
              <span className={cn("block leading-8", c)}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="mx-4 mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[17px] font-semibold text-primary-foreground">
        <QrCode className="size-5" strokeWidth={1.8} />
        {P.code}
      </span>
      <p className="mt-5 px-8 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{P.nearby}</p>
      <div className={cn(CARD, "mx-4 mt-2")}>
        <Rows inset ruleTop={false}>
          {P.shops.map((s, i) => (
            <div key={s.name} data-trade={s.trade}>
              <Row
                leading={<span className="inline-grid size-9 place-items-center rounded-r4 bg-trade-tint text-trade">{[<Sparkles key="s" className="size-[18px]" strokeWidth={1.8} />, <BookOpen key="b" className="size-[18px]" strokeWidth={1.8} />, <Smartphone key="p" className="size-[18px]" strokeWidth={1.8} />][i]}</span>}
                title={s.name}
                subtitle={s.kind}
                trailing={<span className="inline-flex h-6 items-center rounded-r2 bg-muted px-2 text-[12px] font-medium">{P.isNew}</span>}
              />
            </div>
          ))}
        </Rows>
      </div>
      <TabBar tabs={P.tabs} icons={[Wallet, Gift, MapIcon, Activity]} />
    </div>
  );
}

/** Pins on the sample map: x, y on the 393-wide canvas, the trade (its colour) and initials. */
const PINS: { x: number; y: number; trade: string; s: string }[] = [
  { x: 52, y: 196, trade: "restaurant", s: "NB" },
  { x: 100, y: 168, trade: "restaurant", s: "LK" },
  { x: 168, y: 222, trade: "bakery", s: "SG" },
  { x: 290, y: 196, trade: "pet", s: "PG" },
  { x: 244, y: 404, trade: "salon", s: "AT" },
  { x: 312, y: 360, trade: "grocery", s: "AG" },
];

/** The member map (Clear): the map under glass chrome, pins in each trade's colour, our shop labelled, the glass bottom sheet. */
export function MapPhone() {
  const P = M.map;
  return (
    <div className="hm-screen hm-map">
      <svg className="hm-map-art" viewBox="0 0 393 852" preserveAspectRatio="xMidYMid slice">
        <rect className="park" x="210" y="40" width="150" height="110" rx="10" />
        <path className="water" d="M-10 690 C 90 650, 180 720, 300 680 S 420 700, 420 700 L 420 900 L -10 900 Z" />
        <g className="road">
          <path d="M-20 300 L 420 140" />
          <path d="M-20 470 L 420 330" />
          <path d="M80 -20 L 200 900" />
          <path d="M260 -20 L 340 900" />
        </g>
        <g className="street">
          <path d="M-20 380 L 420 230" />
          <path d="M-20 560 L 420 420" />
          <path d="M20 -20 L 120 900" />
          <path d="M150 -20 L 260 900" />
          <path d="M330 -20 L 400 900" />
          <path d="M-20 160 L 420 40" />
        </g>
      </svg>
      <div className="absolute inset-x-4 top-[60px] flex items-center gap-2">
        <span className="glass-chrome inline-grid size-11 place-items-center rounded-full">
          <LayoutGrid className="size-5" strokeWidth={2} />
        </span>
        <span className="glass-chrome flex h-11 flex-1 items-center rounded-full p-1 text-[15px] font-medium">
          <span className="glass-seg-on flex h-9 flex-1 items-center justify-center rounded-full">{P.tabs[0]}</span>
          <span className="flex flex-1 justify-center">{P.tabs[1]}</span>
        </span>
      </div>
      <div className="glass-chrome absolute end-4 top-[120px] flex flex-col items-center gap-4 rounded-full px-2.5 py-3">
        <Maximize2 className="size-5" strokeWidth={1.8} />
        <LocateFixed className="size-5" strokeWidth={1.8} />
      </div>
      {PINS.map((p) => (
        <span key={p.s} data-trade={p.trade} className="hm-pin" style={{ left: p.x, top: p.y }}>
          {p.s}
        </span>
      ))}
      <span data-trade="cafe" className="hm-pin hm-pin-us" style={{ left: 184, top: 300 }}>
        {M.shopShort}
      </span>
      <span className="hm-pin-label" style={{ left: 214, top: 290 }}>
        <b>{P.pin}</b>
        <i>{P.pinKind}</i>
      </span>
      <div className="hm-sheet glass-sheet">
        <span className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-border-strong" />
        <span className="flex h-11 items-center gap-2 rounded-full bg-card px-4 text-[15px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">
          <Search className="size-[18px]" strokeWidth={1.8} />
          {P.search}
        </span>
        <div className="mt-3 flex gap-2 text-[14px] font-medium">
          <span className="inline-flex h-9 items-center gap-1 rounded-full bg-card px-3 shadow-[inset_0_0_0_1px_var(--border)]">
            {P.chips[0]}
            <ChevronDown className="size-4" strokeWidth={2} />
          </span>
          <span className="glass-tint inline-flex h-9 items-center rounded-full px-3">{P.chips[1]}</span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-primary-foreground">
            <Star className="size-4" strokeWidth={2} />
            {P.chips[2]}
          </span>
        </div>
        <p className="mt-4 px-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{P.near}</p>
        <Rows inset ruleTop={false} className="mt-1">
          {P.list.map((s) => (
            <div key={s.name} data-trade={s.trade}>
              <Row leading={<span className="inline-grid size-9 place-items-center rounded-r4 bg-trade text-[13px] font-semibold text-trade-foreground">{s.short}</span>} title={s.name} subtitle={s.kind} className="px-2" />
            </div>
          ))}
        </Rows>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counter (tablet, 1180 x 820) and its keypad pane on a phone
// ---------------------------------------------------------------------------

function Keypad() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
        <span key={k} className="hm-key">
          {k}
        </span>
      ))}
      <span className="inline-grid h-16 place-items-center text-muted-foreground">
        <ScanLine className="size-6" strokeWidth={1.6} />
      </span>
      <span className="hm-key">0</span>
      <span className="inline-grid h-16 place-items-center text-muted-foreground">
        <Delete className="size-6" strokeWidth={1.6} />
      </span>
    </div>
  );
}

function FindPane() {
  const C = M.counter;
  return (
    <div className="flex flex-col gap-4">
      <span className="text-[15px] text-muted-foreground">{C.find}</span>
      <span className="flex items-center gap-4 rounded-r6 bg-card p-4 shadow-[inset_0_0_0_1px_var(--border-strong)]">
        <span className="inline-grid size-12 place-items-center rounded-r4 bg-trade-tint text-trade">
          <ScanLine className="size-6" strokeWidth={1.6} />
        </span>
        <span>
          <b className="block text-[17px] font-semibold">{C.hold}</b>
          <span className="block text-[13px] text-muted-foreground">{C.holdSub}</span>
        </span>
      </span>
      <span className="text-[13px] text-muted-foreground">{C.type}</span>
      <span className="hm-digits">
        (•••) •••-<i />
      </span>
      <Keypad />
    </div>
  );
}

export function CounterTablet() {
  const C = M.counter;
  const KIND: Record<string, LucideIcon> = { stamp: Coffee, reward: Gift, join: Users };
  return (
    <div className="hm-counter" data-trade="cafe" aria-hidden>
      <div className="glass-flat flex items-center justify-between border-b border-border px-6 py-3">
        <span className="flex items-center gap-3">
          <ShopMark size="size-10 rounded-r4 text-[14px]" />
          <span className="leading-tight">
            <b className="block text-[17px] font-semibold">{M.shop}</b>
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {C.title}
              <span className="size-2 rounded-full bg-success" />
              {C.online}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="glass-lite inline-flex h-10 items-center gap-2 rounded-full ps-1.5 pe-4 text-[14px] font-medium">
            <span className="inline-grid size-7 place-items-center rounded-full bg-muted text-[11px]">S</span>
            {M.owner}
          </span>
          <span className="glass-tint inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium">{C.exit}</span>
        </span>
      </div>
      <div className="grid grid-cols-[380px_1fr]">
        <div className="bg-card px-6 py-6">
          <FindPane />
        </div>
        <div className="px-6 py-6">
          <span className="text-[13px] text-muted-foreground">{C.regulars}</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {C.names.map((n) => (
              <span key={n} className="glass-lite inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium">
                {n}
              </span>
            ))}
          </div>
          <div className={cn(CARD, "mt-5")}>
            <Head title={C.recent} />
            <Rows>
              {C.rows.map((r) => {
                const Icon = KIND[r.kind] ?? Coffee;
                return (
                  <Row
                    key={r.who + r.what}
                    leading={<TradeTile icon={Icon} tone={r.kind === "stamp" ? "trade" : "neutral"} />}
                    title={r.who}
                    subtitle={r.what}
                    trailing={
                      <>
                        <span className="w-10 text-end text-[17px] font-semibold tabular-nums">{r.n}</span>
                        <span className="w-12 text-end text-body text-muted-foreground">{C.undo}</span>
                      </>
                    }
                  />
                );
              })}
            </Rows>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The counter's find pane on a phone (the counter runs on any phone or tablet). */
export function CounterPhone() {
  return (
    <div className="hm-screen bg-card" data-trade="cafe">
      <div className="px-5 pt-[70px]">
        <span className="mb-5 flex items-center gap-3">
          <ShopMark size="size-9 rounded-r4 text-[13px]" />
          <span className="leading-tight">
            <b className="block text-[16px] font-semibold">{M.shop}</b>
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span className="size-2 rounded-full bg-success" />
              {M.counter.online}
            </span>
          </span>
        </span>
        <FindPane />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promo composer
// ---------------------------------------------------------------------------

export function PromoMock() {
  const P = M.promo;
  const icons = [Ticket, Gift, Sparkles];
  return (
    <div className="hm-promo" data-trade="cafe" aria-hidden>
      <div className={cn(CARD, "hm-promo-card")}>
        <Head title={P.title} />
        <Rows>
          {P.templates.map((t, i) => (
            <Row key={t.t} leading={<TradeTile icon={icons[i]!} />} title={t.t} subtitle={t.s} className={i === 0 ? "bg-row-sel" : undefined} trailing={i === 0 ? <span className="inline-grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" strokeWidth={3} /></span> : <span className="size-5 rounded-full shadow-[inset_0_0_0_1.5px_var(--border-strong)]" />} />
          ))}
          <Row title={P.to} subtitle={P.toValue} leading={<TradeTile icon={Users} tone="neutral" />} />
          <Row title={P.when} subtitle={P.whenValue} leading={<TradeTile icon={Megaphone} tone="neutral" />} />
        </Rows>
        <div className="px-4 pt-1 pb-4">
          <span className="flex h-10 items-center justify-center rounded-r4 bg-primary text-[13px] font-[550] text-primary-foreground">{P.send}</span>
        </div>
      </div>
      <div className="hm-notif glass-sheet">
        <ShopMark size="size-9 rounded-r3 text-[12px]" />
        <span className="min-w-0">
          <b className="flex justify-between text-[13px] font-semibold">
            {P.preview}
            <span className="font-normal text-muted-foreground">{P.now}</span>
          </b>
          <span className="block text-[13px] leading-5">{P.previewText}</span>
        </span>
      </div>
      <div className="hm-result card-clear">
        <span className="text-[28px] font-bold tracking-[-0.03em] text-success-text tabular-nums">{P.result}</span>
        <span className="text-[13px] text-muted-foreground">{P.resultSub}</span>
      </div>
    </div>
  );
}
