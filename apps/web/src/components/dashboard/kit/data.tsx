"use client";
/**
 * Dashboard kit: data display (stats, rows, status, tables, empty / loading / error states).
 * Owner: workstream C. Moved verbatim from kit.tsx (workstream A split); no behaviour change.
 * Import from "@/components/dashboard/kit" (the barrel), not from this file.
 */
import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes, type HTMLAttributes } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/primitives/item";
import { Badge as BadgePrimitive } from "@/components/primitives/badge";
import { TableCell, TableHead, TableRow } from "@/components/primitives/table";
import { StatTile as ToneStatTile } from "@/components/ui/StatTile";
import { TONES, type Tone } from "@/components/ui/tones";
import { cn } from "@/lib/utils";
import { QuietButton } from "./page";

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Real comparison only. `good` true = positive colour, false = negative, null = muted. */
  delta?: { text: string; good: boolean | null; /** "vs previous 30 days", hidden on phones. */ context?: string } | null;
  caption?: ReactNode;
  href?: string;
  /** Small dot before the label: "the shop must act" (accent), "waiting on a customer" (info), a problem (negative). */
  dot?: DotTone;
  /** Pastel tile tone when the block is drawn with `tiles` (default: trade, mint, butter, lilac, sky, rose in order). */
  tone?: Tone;
  /** Sparkline values for a pastel tile. */
  spark?: number[];
}

/** One bordered block, numbers separated by vertical hairlines (label above, big number, small delta below). */
export function StatBlock({ items, loading, label = "Key numbers", className, bare, cols: colsProp, tiles }: { items: StatItem[]; loading?: boolean; label?: string; className?: string; /** No outer border (inside another bordered block). */ bare?: boolean; cols?: 2 | 3 | 4 | 5; /** Main Street Warm: draw each number as a pastel StatTile (big Fraunces number, delta line, sparkline from `item.spark`) instead of the hairline grid. */ tiles?: boolean }) {
  const n = colsProp ?? (items.length >= 4 ? 4 : items.length === 3 ? 3 : 2);
  const cols = n === 5 ? "grid-cols-2 lg:grid-cols-5" : n === 4 ? "grid-cols-2 lg:grid-cols-4" : n === 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2";
  if (tiles) {
    return (
      <div role="group" aria-label={label} className={cn("grid gap-3 md:gap-4", cols, className)}>
        {items.map((s, idx) => (
          <ToneStatTile
            key={s.label}
            tone={s.tone ?? TONES[idx % TONES.length]!}
            label={s.label}
            value={s.value}
            delta={s.delta ? { pct: s.delta.good === true ? 1 : s.delta.good === false ? -1 : 0, good: s.delta.good, text: s.delta.context ? `${s.delta.text} ${s.delta.context}` : s.delta.text } : null}
            caption={s.caption}
            spark={s.spark}
            href={s.href}
            loading={loading}
          />
        ))}
      </div>
    );
  }
  return (
    <dl aria-label={label} className={cn("grid gap-px overflow-hidden bg-line", !bare && "rounded-card border border-line", cols, className)}>
      {items.map((s, idx) => {
        // An odd last cell spans both phone columns so the hairline grid has no empty grey cell.
        const span = idx === items.length - 1 && items.length % 2 === 1 ? "col-span-2 lg:col-span-1" : "";
        // Every cell is a <div> holding its dt and dds (the only wrapper a <dl> allows). A linked cell puts the link inside the dt and
        // stretches it over the whole cell, so the cell stays one big target without an <a> sitting between the <dl> and its <dt>.
        const label = (
          <>
            {s.dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", { positive: "bg-positive", negative: "bg-negative", neutral: "bg-fg-subtle", accent: "bg-points", info: "bg-location" }[s.dot])} /> : null}
            {s.label}
          </>
        );
        return (
          <div key={s.label} className={cn("relative bg-bg px-5 py-[18px] transition-colors", s.href && "hover:bg-bg-subtle", span)}>
            <dt className="flex items-center gap-1.5 text-meta text-fg-muted">
              {s.href ? (
                <Link href={s.href} className="flex items-center gap-1.5 after:absolute after:inset-0 focus-visible:focus-ring">
                  {label}
                </Link>
              ) : (
                label
              )}
            </dt>
            <dd className="mt-1.5 text-[clamp(22px,6.2vw,30px)] font-semibold leading-9 tracking-[-0.01em] text-fg tabular">
              {loading ? <span className="skeleton inline-block h-7 w-16 rounded-sm align-middle" /> : s.value}
            </dd>
            <dd className="mt-1 min-h-4 text-[12px] font-normal leading-4 tabular">
              {s.delta ? (
                <>
                  <span className={s.delta.good === true ? "text-positive-text" : s.delta.good === false ? "text-negative" : "text-fg-muted"}>{s.delta.text}</span>
                  {s.delta.context ? <span className="text-fg-muted"> {s.delta.context}</span> : null}
                </>
              ) : s.caption ? (
                <span className="text-fg-muted">{s.caption}</span>
              ) : (
                <span aria-hidden>&nbsp;</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Hairline list: rows separated by 1px lines, top + bottom rule. */
export function RowList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y divide-line border-y border-line", className)}>
      {children}
    </ul>
  );
}

/**
 * A 48px list row: leading, title + meta, trailing (right-aligned tabular). v3: built on the shadcn Item (media, content, title,
 * description, actions); the element is a link, a button or a plain div through Item's `render`, as before.
 */
export function Row({ leading, title, meta, trailing, href, onClick, className }: { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode; href?: string; onClick?: () => void; className?: string }) {
  const clickable = !!(href || onClick);
  const cls = cn(
    "min-h-12 flex-nowrap gap-3 rounded-none border-0 px-0 py-2 focus-visible:border-transparent focus-visible:ring-0",
    clickable && "-mx-2 rounded-sm px-2 hover:bg-bg-subtle focus-visible:focus-ring",
    onClick && !href && "w-full text-start",
    className,
  );
  const inner = (
    <>
      {leading ? <ItemMedia>{leading}</ItemMedia> : null}
      <ItemContent className="min-w-0 flex-1 gap-0">
        <ItemTitle className="block w-auto max-w-full truncate text-body font-normal leading-normal text-fg">{title}</ItemTitle>
        {meta ? <ItemDescription className="line-clamp-none block truncate text-meta text-fg-muted">{meta}</ItemDescription> : null}
      </ItemContent>
      {trailing != null ? <ItemActions className="shrink-0 text-end text-body tabular">{trailing}</ItemActions> : null}
    </>
  );
  return (
    <li>
      {href ? (
        <Item render={<Link href={href} />} className={cls}>
          {inner}
        </Item>
      ) : onClick ? (
        <Item render={<button type="button" onClick={onClick} />} className={cls}>
          {inner}
        </Item>
      ) : (
        <Item className={cls}>{inner}</Item>
      )}
    </li>
  );
}

/** Definition rows for detail panels: label left (muted), value right. */
export function DefList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((i) => (
        <div key={i.label} className="flex min-h-10 items-center justify-between gap-4 py-2">
          <dt className="text-meta text-fg-muted">{i.label}</dt>
          <dd className="min-w-0 truncate text-end text-meta text-fg tabular">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type DotTone = "positive" | "negative" | "neutral" | "accent" | "info";

/** Status = a small dot + word, never a filled card. */
export function Dot({ tone = "neutral", children, className }: { tone?: DotTone; children: ReactNode; className?: string }) {
  const c = { positive: "bg-positive", negative: "bg-negative", neutral: "bg-fg-subtle", accent: "bg-points", info: "bg-location" }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-meta text-fg", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", c)} />
      {children}
    </span>
  );
}

const STATUS: Record<string, Record<string, [DotTone, string?]>> = {
  promo: { draft: ["neutral"], scheduled: ["info"], live: ["positive"], ended: ["neutral"], archived: ["neutral"] },
  message: { draft: ["neutral"], scheduled: ["info"], sending: ["info"], sent: ["positive"], failed: ["negative"], cancelled: ["neutral"] },
  order: { pending: ["accent", "New"], accepted: ["info"], preparing: ["info"], ready: ["positive"], picked_up: ["neutral", "Picked up"], cancelled: ["neutral"], refunded: ["neutral"] },
  ticket: { intake: ["info", "Dropped off"], diagnosing: ["info"], quote_sent: ["info", "Awaiting approval"], approved: ["info"], in_progress: ["info", "In progress"], waiting_parts: ["info", "Waiting for parts"], ready: ["positive"], picked_up: ["neutral", "Picked up"], declined: ["neutral"], cancelled: ["neutral"] },
  quote: { draft: ["neutral"], sent: ["info", "Awaiting approval"], approved: ["positive"], declined: ["negative"], expired: ["neutral"], superseded: ["neutral"] },
  invoice: { draft: ["neutral"], open: ["info", "Awaiting payment"], paid: ["positive"], void: ["neutral"] },
  integration: { connected: ["positive"], pending: ["info"], error: ["negative"], disconnected: ["neutral"] },
  merchant: { onboarding: ["info"], active: ["positive"], paused: ["negative"], closed: ["neutral"] },
  rollout: { hidden: ["neutral", "Hidden"], beta: ["info", "Beta"], ga: ["positive", "Live"] },
  campaign: { draft: ["neutral"], scheduled: ["info"], live: ["positive"], ended: ["neutral"], cancelled: ["neutral"] },
  ad: { draft: ["neutral"], pending_review: ["info", "In review"], approved: ["info"], live: ["positive"], rejected: ["negative"], ended: ["neutral"], paused: ["neutral"] },
};

/** Domain status as dot + word. */
export function StatusDot({ domain, status, label }: { domain: keyof typeof STATUS | string; status: string; label?: string }) {
  const [tone, l] = STATUS[domain]?.[status] ?? ["neutral"];
  return <Dot tone={tone}>{label ?? l ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</Dot>;
}

/** Small neutral tag (hairline capsule). For "Reward ready" use tone="accent" (points only). v3: the shadcn Badge. */
export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent"; className?: string }) {
  return (
    <BadgePrimitive variant="outline" className={cn("h-5 px-2 text-caption font-normal", tone === "accent" ? "border-transparent bg-points-soft text-points-text" : "border-line text-fg-muted", className)}>
      {children}
    </BadgePrimitive>
  );
}

/** Thin 4px progress bar (setup progress, density gauges, activation). */
export function Meter({ value, max, label, className, tone = "fg" }: { value: number; max: number; label: string; className?: string; tone?: "fg" | "accent" | "muted" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn("h-1 w-full overflow-hidden rounded-full bg-bg-muted", className)}>
      <div className={cn("h-full rounded-full", tone === "accent" ? "bg-points" : tone === "muted" ? "bg-fg-subtle" : "bg-fg")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Table wrapper: hairline top/bottom, horizontal scroll on phones only (keeps the sticky header on desktop). */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("-mx-4 overflow-x-auto border-y border-line sm:mx-0 md:overflow-visible", className)}>{children}</div>;
}

export function Table({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <table aria-label={label} className={cn("w-full border-collapse text-meta", className)}>
      {children}
    </table>
  );
}

/**
 * Sticky header cell on bg-subtle (sticks under the 56px top bar). v3: the shadcn TableHead. `Table` below stays a plain <table> on
 * purpose: the primitive Table wraps itself in an overflow-x-auto div, and that scroll container would stop `sticky` from sticking to the page.
 */
export function Th({ className, align = "start", children, ...rest }: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "end" }) {
  return (
    <TableHead scope="col" className={cn("z-[1] h-9 md:sticky md:top-14 whitespace-nowrap border-b border-line bg-bg-subtle px-3 text-caption font-medium text-fg-muted first:ps-4 last:pe-4", align === "end" ? "text-end" : "text-start", className)} {...rest}>
      {children}
    </TableHead>
  );
}

export function Td({ className, align = "start", children, ...rest }: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "end" }) {
  return (
    <TableCell className={cn("h-11 whitespace-nowrap border-b border-line px-3 text-fg first:ps-4 last:pe-4", align === "end" ? "text-end tabular" : "text-start", className)} {...rest}>
      {children}
    </TableCell>
  );
}

/**
 * Clickable row: hover subtle fill. Enter or Space opens it; Up and Down move to the previous and next row, Home and End to the first and
 * last (each row is a tab stop, as before). The sheet it opens restores focus to the row when it closes.
 */
export function Tr({ onOpen, selected, className, children, onKeyDown, ...rest }: HTMLAttributes<HTMLTableRowElement> & { onOpen?: () => void; selected?: boolean }) {
  return (
    <TableRow
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              onKeyDown?.(e);
              if (e.defaultPrevented || e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
                return;
              }
              const rows = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>(":scope > tr[tabindex]") ?? []);
              const at = rows.indexOf(e.currentTarget);
              const next = e.key === "ArrowDown" ? rows[at + 1] : e.key === "ArrowUp" ? rows[at - 1] : e.key === "Home" ? rows[0] : e.key === "End" ? rows[rows.length - 1] : undefined;
              if (next) {
                e.preventDefault();
                next.focus();
              }
            }
          : onKeyDown
      }
      aria-selected={onOpen ? !!selected : undefined}
      className={cn("border-b-0 [&:last-child>td]:border-b-0", onOpen && "cursor-pointer hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:focus-ring focus-visible:-outline-offset-2 focus-visible:focus-ring", !onOpen && "hover:bg-transparent", selected && "bg-bg-subtle", className)}
      {...rest}
    >
      {children}
    </TableRow>
  );
}

/** Empty state: one sentence + one action. No illustration. */
export function Empty({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-8 text-meta text-fg-muted sm:flex-row sm:items-center sm:justify-between", className)}>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Loading rows for lists/tables. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 py-2", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-9 w-full rounded-sm" />
      ))}
    </div>
  );
}

/** Error line with retry. */
export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-input border border-line px-4 py-3 text-meta">
      <Dot tone="negative">{message}</Dot>
      {onRetry ? <QuietButton onClick={onRetry}>Try again</QuietButton> : null}
    </div>
  );
}

/**
 * Dashboard empty state (same props as ui/EmptyState), Figma 12:349: a hairline card, one bold sentence, one muted line and one
 * action under them. Left-aligned; no icon, no illustration of people, no centred hero (foundations.md anti-slop checklist).
 */
export function EmptyState({ title, description, action, secondaryAction, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; secondaryAction?: ReactNode; tone?: "brand" | "danger"; className?: string }) {
  return (
    <div data-state="empty" className={cn("rounded-card border border-line bg-card p-5", className)}>
      <p className="text-body-strong text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-prose text-meta text-fg-muted">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/** One cell of a StatGrid (same props as ui/StatTile): label above, number, small delta/caption below. */
export function StatTile({ label, value, delta, href, loading, caption }: { label: string; value: ReactNode; delta?: { pct?: number; good?: boolean | null; text?: string } | null; spark?: number[]; href?: string; loading?: boolean; caption?: ReactNode }) {
  const body = (
    <>
      <p className="text-meta text-fg-muted">{label}</p>
      <p className="mt-1.5 text-[28px] font-semibold leading-8 tracking-[-0.01em] text-fg tabular">{loading ? <span className="skeleton inline-block h-7 w-16 rounded-sm align-middle" /> : (value ?? "–")}</p>
      {delta && !loading ? (
        <p className={cn("mt-1 text-caption font-normal tabular", delta.good === true ? "text-positive-text" : delta.good === false ? "text-negative" : "text-fg-muted")}>{delta.text ?? `${(delta.pct ?? 0) >= 0 ? "+" : ""}${delta.pct}%`}</p>
      ) : null}
      {caption ? <p className="mt-1 text-caption font-normal text-fg-muted">{caption}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block bg-bg px-5 py-4 transition-colors hover:bg-bg-subtle focus-visible:focus-ring">
      {body}
    </Link>
  ) : (
    <div className="bg-bg px-5 py-4">{body}</div>
  );
}

/** Bordered block of StatTiles separated by hairlines. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4", className)}>{children}</div>;
}

const PILL: Record<DotTone, string> = {
  positive: "bg-positive/10 text-positive-text",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-bg-muted text-fg-muted",
  accent: "bg-points-soft text-points-text",
  info: "bg-bg-subtle text-fg border border-line",
};

/** Filled status capsule for dense tables ("Live", "Paused", "Needs approval"). Prefer `StatusDot` in prose lists. */
export function StatusPill({ tone = "neutral", children, className }: { tone?: DotTone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-caption font-medium", PILL[tone], className)}>{children}</span>;
}
