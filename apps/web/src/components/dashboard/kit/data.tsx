"use client";
/**
 * Dashboard kit: data display (stats, rows, status, tables, empty / loading / error states).
 * Owner: workstream C. Moved verbatim from kit.tsx (workstream A split); no behaviour change.
 * Import from "@/components/dashboard/kit" (the barrel), not from this file.
 */
import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
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
}

/** One bordered block, numbers separated by vertical hairlines (label above, big number, small delta below). */
export function StatBlock({ items, loading, label = "Key numbers", className, bare, cols: colsProp }: { items: StatItem[]; loading?: boolean; label?: string; className?: string; /** No outer border (inside another bordered block). */ bare?: boolean; cols?: 2 | 3 | 4 | 5 }) {
  const n = colsProp ?? (items.length >= 4 ? 4 : items.length === 3 ? 3 : 2);
  const cols = n === 5 ? "grid-cols-2 lg:grid-cols-5" : n === 4 ? "grid-cols-2 lg:grid-cols-4" : n === 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2";
  return (
    <dl aria-label={label} className={cn("grid gap-px overflow-hidden bg-line", !bare && "rounded-card border border-line", cols, className)}>
      {items.map((s, idx) => {
        // An odd last cell spans both phone columns so the hairline grid has no empty grey cell.
        const span = idx === items.length - 1 && items.length % 2 === 1 ? "col-span-2 lg:col-span-1" : "";
        const body = (
          <>
            <dt className="flex items-center gap-1.5 text-meta text-fg-muted">
              {s.dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", { positive: "bg-positive", negative: "bg-negative", neutral: "bg-fg-subtle", accent: "bg-accent", info: "bg-location" }[s.dot])} /> : null}
              {s.label}
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
                <span className="text-fg-subtle">&nbsp;</span>
              )}
            </dd>
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className={cn("block bg-bg px-5 py-[18px] transition-colors hover:bg-bg-subtle focus-visible:focus-ring", span)}>
            {body}
          </Link>
        ) : (
          <div key={s.label} className={cn("bg-bg px-5 py-[18px]", span)}>
            {body}
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

/** A 48px list row: leading, title + meta, trailing (right-aligned tabular). */
export function Row({ leading, title, meta, trailing, href, onClick, className }: { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode; href?: string; onClick?: () => void; className?: string }) {
  const inner = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-fg">{title}</span>
        {meta ? <span className="block truncate text-meta text-fg-muted">{meta}</span> : null}
      </span>
      {trailing != null ? <span className="shrink-0 text-end text-body tabular">{trailing}</span> : null}
    </>
  );
  const cls = cn("flex min-h-12 items-center gap-3 py-2", (href || onClick) && "-mx-2 rounded-sm px-2 hover:bg-bg-subtle focus-visible:focus-ring", className);
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(cls, "w-full text-start")}>
          {inner}
        </button>
      ) : (
        <div className={cls}>{inner}</div>
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
  const c = { positive: "bg-positive", negative: "bg-negative", neutral: "bg-fg-subtle", accent: "bg-accent", info: "bg-location" }[tone];
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

/** Small neutral tag (hairline capsule). For "Reward ready" use tone="accent" (points only). */
export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent"; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-caption", tone === "accent" ? "bg-accent-soft text-accent-text" : "border border-line text-fg-muted", className)}>
      {children}
    </span>
  );
}

/** Thin 4px progress bar (setup progress, density gauges, activation). */
export function Meter({ value, max, label, className, tone = "fg" }: { value: number; max: number; label: string; className?: string; tone?: "fg" | "accent" | "muted" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 100;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn("h-1 w-full overflow-hidden rounded-full bg-bg-muted", className)}>
      <div className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : tone === "muted" ? "bg-fg-subtle" : "bg-fg")} style={{ width: `${pct}%` }} />
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

/** Sticky header cell on bg-subtle (sticks under the 56px top bar). */
export function Th({ className, align = "start", children, ...rest }: Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "end" }) {
  return (
    <th scope="col" className={cn("z-[1] h-9 md:sticky md:top-14 whitespace-nowrap border-b border-line bg-bg-subtle px-3 text-caption font-medium text-fg-muted first:ps-4 last:pe-4", align === "end" ? "text-end" : "text-start", className)} {...rest}>
      {children}
    </th>
  );
}

export function Td({ className, align = "start", children, ...rest }: Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & { align?: "start" | "end" }) {
  return (
    <td className={cn("h-11 whitespace-nowrap border-b border-line px-3 text-fg first:ps-4 last:pe-4", align === "end" ? "text-end tabular" : "text-start", className)} {...rest}>
      {children}
    </td>
  );
}

/** Clickable row: hover subtle fill; Enter opens. */
export function Tr({ onOpen, selected, className, children, ...rest }: HTMLAttributes<HTMLTableRowElement> & { onOpen?: () => void; selected?: boolean }) {
  return (
    <tr
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => (e.key === "Enter" ? onOpen() : undefined) : undefined}
      aria-selected={onOpen ? !!selected : undefined}
      className={cn("[&:last-child>td]:border-b-0", onOpen && "cursor-pointer hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:outline-none", selected && "bg-bg-subtle", className)}
      {...rest}
    >
      {children}
    </tr>
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
 * Dashboard empty state (same props as ui/EmptyState): left-aligned, title + one sentence + one
 * action, on a hairline row. No icon, no centred hero (foundations.md anti-slop checklist).
 */
export function EmptyState({ title, description, action, secondaryAction, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; secondaryAction?: ReactNode; tone?: "brand" | "danger"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 border-y border-line py-6 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="text-meta-strong text-fg">{title}</p>
        {description ? <p className="mt-0.5 text-meta text-fg-muted">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryAction}
          {action}
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
  accent: "bg-accent-soft text-accent-text",
  info: "bg-bg-subtle text-fg border border-line",
};

/** Filled status capsule for dense tables ("Live", "Paused", "Needs approval"). Prefer `StatusDot` in prose lists. */
export function StatusPill({ tone = "neutral", children, className }: { tone?: DotTone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-caption font-medium", PILL[tone], className)}>{children}</span>;
}
