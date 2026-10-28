/**
 * Clear building blocks (docs/design/v3.2-clear-audit.md section 2; handoff in docs/design/v3.2-clear-build.md section 4).
 * The pieces the screen teams compose: the page grid, the flat card with a 56 header, rows at 64 / 44, the icon tile, the stat card shell,
 * the 24 chip and the glass button. Sizes are the audit's; they read the Clear tokens, so under Warm they render in Warm colours.
 *
 * Content layer only: none of these is glass except `GlassButton`. Dividers are overlaid lines (no layout height), so heights are exact.
 */
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

/**
 * The page grid (audit 2.1): 8 columns with 16 px gutters from md (at 1440 the content runs 268 to 1428, columns 131), 2 columns with a 16 gutter
 * on phones (columns 171). Children take `col-span-*`: a stat card is `col-span-1 md:col-span-2`, "Needs you" `md:col-span-5`, the chart column
 * `md:col-span-3`, a full-width card `col-span-full`.
 */
export function PageGrid({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-8", className)} {...rest}>
      {children}
    </div>
  );
}

/** Page header (audit #15): title 26/32 (700), 4, the subtitle 13/20 muted; actions on the end edge, 8 apart. 24 below it to the first card. */
export function PageTitle({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-large-title text-foreground max-md:text-[28px] max-md:leading-9">{title}</h1>
        {subtitle ? <p className="mt-1 text-body text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card, header, rows
// ---------------------------------------------------------------------------

/**
 * A flat page card (audit 2.4 Card): white, radius 20, the hairline as an inset shadow, the soft elevation. No padding of its own: put a
 * `CardHead` and `Row`s in it, or pass `padded` for 16 all round. `as="section"` with `aria-labelledby` for a titled region.
 */
export function SurfaceCard({ padded, as: As = "div", className, children, ...rest }: HTMLAttributes<HTMLElement> & { padded?: boolean; as?: "div" | "section" | "article" | "li" }) {
  return (
    <As className={cn("card-clear overflow-hidden text-card-foreground", padded && "p-4", className)} {...rest}>
      {children}
    </As>
  );
}

/**
 * Card header (audit #16): 56 tall in every card (padding 12 16, a 32 control slot), title 14/20 at 650 on the start edge, an optional count badge
 * after it, the action (a segmented control, a link, a slim button) on the end edge. Follow it with `<Rows>` (which draws the line under it).
 */
export function CardHead({ title, count, action, id, className }: { title: ReactNode; count?: ReactNode; action?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex min-h-14 items-center justify-between gap-3 px-4 py-3", className)}>
      <h2 id={id} className="flex min-w-0 items-center gap-2 font-sans text-headline text-foreground">
        <span className="truncate">{title}</span>
        {count !== undefined && count !== null ? <span className="inline-flex h-5 items-center rounded-r2 bg-muted px-2 text-meta-strong text-foreground tabular-nums">{count}</span> : null}
      </h2>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Rows inside a card with overlaid dividers (the rows keep their exact 64 / 44). `inset` starts each divider 16 in (phones, iOS grouping).
 * `ruleTop` also draws the line above the first row (rows right under a `CardHead`).
 */
export function Rows({ inset, ruleTop = true, as: As = "div", className, children, ...rest }: HTMLAttributes<HTMLElement> & { inset?: boolean; ruleTop?: boolean; as?: "div" | "ul" | "ol" }) {
  return (
    <As className={cn("flex flex-col", inset ? "divide-overlay-inset" : "divide-overlay", ruleTop && "rule-top", className)} {...rest}>
      {children}
    </As>
  );
}

export interface RowProps {
  /** An `IconTile`, an avatar, a time column ("2:00 p.m.", 64 wide), a checkbox. 12 to the text. */
  leading?: ReactNode;
  title: ReactNode;
  /** Second line: makes the row 64 (otherwise 44). */
  subtitle?: ReactNode;
  /** A slim button, a badge, a value. Inset 16 from the end edge. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** "Needs you" rows are 92 on desktop (audit #1); `minHeight` overrides the 64 / 44. */
  minHeight?: number;
  className?: string;
  as?: "div" | "li";
}

/**
 * A list row (audit 2.4 Row): padding 12 16, two-line 64 or one-line 44, title 13/20 at 650, subtitle 13/20 muted, a leading slot 12 from the text and
 * a trailing slot. A link row or a button row gets the hover surface and a focus ring. Put rows in `Rows` for the dividers.
 */
export function Row({ leading, title, subtitle, trailing, href, onClick, minHeight, className, as: As = "div" }: RowProps) {
  const body = (
    <>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-[650] tracking-[-0.008em] text-foreground">{title}</span>
        {subtitle ? <span className="block truncate text-body text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
    </>
  );
  const cls = cn("flex w-full items-center gap-3 px-4 py-3 text-start", subtitle ? "min-h-16" : "min-h-11", (href || onClick) && "transition-colors hover:bg-hover focus-visible:focus-ring", className);
  const style = minHeight ? { minHeight } : undefined;
  const wrap = (el: ReactNode) => (As === "li" ? <li>{el}</li> : el);
  if (href)
    return wrap(
      <Link href={href} className={cls} style={style}>
        {body}
      </Link>,
    );
  if (onClick)
    return wrap(
      <button type="button" onClick={onClick} className={cls} style={style}>
        {body}
      </button>,
    );
  return (
    <As className={cls} style={style}>
      {body}
    </As>
  );
}

// ---------------------------------------------------------------------------
// Tiles, chips, stat card
// ---------------------------------------------------------------------------

/**
 * Icon tile (audit 2.4): 32 r10 with a 16 glyph on desktop, 36 r12 on phones (`size="phone"`). `trade` (default) is the trade tint with a
 * trade glyph (rev 5: the only trade colour besides the active nav and the chart's current bar); `neutral` is the grey tile.
 */
export function TradeTile({ icon: Icon, size = "desktop", tone = "trade", className }: { icon: LucideIcon; size?: "desktop" | "phone"; tone?: "trade" | "neutral"; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center", size === "phone" ? "size-9 rounded-r4" : "size-8 rounded-r3", tone === "trade" ? "bg-trade-tint text-trade" : "bg-tile text-muted-foreground", className)}>
      <Icon className="size-4" strokeWidth={1.8} />
    </span>
  );
}

/** Chip (audit #31): 24 tall, r12, padding 8, 12/16 at 600, an optional 12 px icon 4 from the text. `up` green, `info` blue, `neutral` grey. */
export function StatChip({ tone = "neutral", icon: Icon, children, className }: { tone?: "up" | "info" | "neutral" | "warning" | "down"; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const t = { up: "bg-success-soft text-success-text", info: "bg-info-soft text-info-text", neutral: "bg-muted text-foreground", warning: "bg-warning-soft text-warning-text", down: "bg-destructive-soft text-destructive-text" }[tone];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 self-start rounded-xl px-2 text-meta font-semibold whitespace-nowrap", t, className)}>
      {Icon ? <Icon aria-hidden className="size-3" strokeWidth={2.4} /> : null}
      {children}
    </span>
  );
}

/**
 * Stat card shell (audit #6, 2.4): desktop 144 tall (16 + tile 32 + 8 + number 40 + 8 + chip 24 + 16), the tile and label on one line; phone 172
 * (`layout="phone"`: the 36 tile above the label, a 32/36 number). Pass the formatted number as `value` (tabular), the chip as `chip`.
 * No sparklines (rev 5). Span 2 grid columns on desktop, 1 of 2 on phones.
 */
export function StatCardShell({ icon, label, value, chip, layout = "desktop", href, className }: { icon: LucideIcon; label: ReactNode; value: ReactNode; chip?: ReactNode; layout?: "desktop" | "phone"; href?: string; className?: string }) {
  const phone = layout === "phone";
  const inner = (
    <>
      <span className={cn("flex min-w-0", phone ? "flex-col items-start gap-3" : "items-center gap-3")}>
        <TradeTile icon={icon} size={phone ? "phone" : "desktop"} />
        <span className="min-w-0 truncate text-body font-[550] text-muted-foreground">{label}</span>
      </span>
      <span className={cn("font-[650] tabular-nums text-foreground", phone ? "-mt-1 text-[32px] leading-9 tracking-[-0.032em]" : "text-[36px] leading-10 tracking-[-0.032em]")}>{value}</span>
      {chip}
    </>
  );
  const cls = cn("card-clear flex min-w-0 flex-col gap-2 p-4", phone ? "min-h-43" : "min-h-36", href && "transition-colors hover:bg-hover focus-visible:focus-ring", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Glass button
// ---------------------------------------------------------------------------

/**
 * A glass button for the chrome and the page header ("Print QR kit", Filter, Sort): `glass-lite`, 32 tall (`size="slim"` 28, `"lg"` 40),
 * a pill. Inside cards and long lists use `<Button variant="secondary">` (the glass tint without a backdrop read) instead.
 */
export function GlassButton({ size = "default", className, children, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: "slim" | "default" | "lg" }) {
  const s = { slim: "h-7 px-3", default: "h-8 px-4", lg: "h-10 px-4" }[size];
  return (
    <button type={type} className={cn("glass-lite inline-flex items-center justify-center gap-1.5 rounded-full text-body font-[550] whitespace-nowrap text-foreground focus-visible:focus-ring max-md:min-h-11", s, className)} {...rest}>
      {children}
    </button>
  );
}
