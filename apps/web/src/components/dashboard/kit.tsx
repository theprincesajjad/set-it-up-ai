"use client";
/**
 * Dashboard-only building blocks (foundations.md "Merchant dashboard"): calm, hairline,
 * monochrome. Shared by the merchant dashboard, rep console, admin and BIA tools.
 * Generic controls (buttons, fields, dialogs) come from @/components/ui.
 */
import { ChevronRight, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ page */

/** Page header: title (22 semibold), one-line description, actions right. One black primary per page. */
export function PageHeader({ title, description, actions, back, className, flush }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; className?: string; /** No bottom margin (inside a gap layout). */ flush?: boolean }) {
  return (
    <header className={cn(!flush && "mb-6", "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-meta text-fg-muted hover:text-fg">
            <ChevronRight aria-hidden className="size-3.5 rotate-180" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-title text-fg [text-wrap:balance]">{title}</h1>
        {description ? <p className="mt-0.5 text-meta text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Section: a small heading row (title + quiet action) above content. No box. */
export function Section({ title, description, action, children, className, id }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const auto = useId();
  const hid = `${id ?? auto}-h`;
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} className={cn("flex min-w-0 flex-col", className)}>
      {title || action ? (
        <div className="mb-2 flex min-h-8 items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 id={hid} className="text-body-strong text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-meta text-fg-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Hairline-bordered block (16 radius) for forms and grouped settings. */
export function Panel({ title, description, action, children, className, footer, padded = true, as = "section" }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; padded?: boolean; as?: "section" | "div" }) {
  const As = as;
  const id = useId();
  return (
    <As aria-labelledby={title && As === "section" ? id : undefined} className={cn("min-w-0 overflow-hidden rounded-card border border-line bg-bg", className)}>
      {title || action ? (
        <div className={cn("flex items-start justify-between gap-3 px-5 pt-4", !padded && "border-b border-line pb-3")}>
          <div className="min-w-0">
            {title ? (
              <h2 id={id} className="text-body-strong text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-0.5 text-meta text-fg-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cn(padded && "px-5 pb-5", padded && (title || action) ? "pt-3" : padded ? "pt-5" : "")}>{children}</div> : null}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-bg-subtle px-5 py-3">{footer}</div> : null}
    </As>
  );
}

/** Quiet text link with optional chevron, for section actions ("See all", "Open counter"). */
export function QuietLink({ href, children, className, chevron = true }: { href: string; children: ReactNode; className?: string; chevron?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-0.5 rounded-sm text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring", className)}>
      {children}
      {chevron ? <ChevronRight aria-hidden className="size-3.5" /> : null}
    </Link>
  );
}

/** Quiet button (no fill) in the same style as QuietLink. */
export function QuietButton({ children, onClick, className, disabled, type = "button", ...rest }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; type?: "button" | "submit" } & Omit<HTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn("inline-flex min-h-8 items-center gap-1 rounded-sm text-meta font-medium text-fg-muted hover:text-fg disabled:opacity-50 focus-visible:focus-ring", className)} {...rest}>
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- stats */

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Real comparison only. `good` true = positive colour, false = negative, null = muted. */
  delta?: { text: string; good: boolean | null; /** "vs previous 30 days", hidden on phones. */ context?: string } | null;
  caption?: ReactNode;
  href?: string;
}

/** One bordered block, numbers separated by vertical hairlines (label above, big number, small delta below). */
export function StatBlock({ items, loading, label = "Key numbers", className, bare }: { items: StatItem[]; loading?: boolean; label?: string; className?: string; /** No outer border (inside another bordered block). */ bare?: boolean }) {
  const cols = items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2";
  return (
    <dl aria-label={label} className={cn("grid gap-px overflow-hidden bg-line", !bare && "rounded-card border border-line", cols, className)}>
      {items.map((s) => {
        const body = (
          <>
            <dt className="text-meta text-fg-muted">{s.label}</dt>
            <dd className="mt-1.5 text-[28px] font-semibold leading-8 tracking-[-0.01em] text-fg tabular">
              {loading ? <span className="skeleton inline-block h-7 w-16 rounded-sm align-middle" /> : s.value}
            </dd>
            <dd className="mt-1 min-h-4 text-caption font-normal tabular">
              {s.delta ? (
                <>
                  <span className={s.delta.good === true ? "text-positive" : s.delta.good === false ? "text-negative" : "text-fg-muted"}>{s.delta.text}</span>
                  {s.delta.context ? <span className="hidden text-fg-muted sm:inline"> {s.delta.context}</span> : null}
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
          <Link key={s.label} href={s.href} className="block bg-bg px-5 py-4 transition-colors hover:bg-bg-subtle focus-visible:focus-ring">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="bg-bg px-5 py-4">
            {body}
          </div>
        );
      })}
    </dl>
  );
}

/* ----------------------------------------------------------------- lists */

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

/* ---------------------------------------------------------------- status */

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
  ticket: { intake: ["info", "Dropped off"], diagnosing: ["info"], quote_sent: ["accent", "Needs approval"], approved: ["info"], in_progress: ["info", "In progress"], waiting_parts: ["info", "Waiting for parts"], ready: ["positive"], picked_up: ["neutral", "Picked up"], declined: ["neutral"], cancelled: ["neutral"] },
  quote: { draft: ["neutral"], sent: ["accent", "Needs approval"], approved: ["positive"], declined: ["negative"], expired: ["neutral"], superseded: ["neutral"] },
  invoice: { draft: ["neutral"], open: ["accent"], paid: ["positive"], void: ["neutral"] },
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

/* --------------------------------------------------------------- filters */

/** Filter capsules row (Stripe / Square). Active = muted fill, never colour. */
export function Capsules<T extends string>({ options, value, onChange, label, className }: { options: { value: T; label: string; count?: number | null }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-meta transition-colors focus-visible:focus-ring",
              on ? "border-fg bg-fg font-medium text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle",
            )}
          >
            {o.label}
            {o.count != null ? <span className={cn("tabular", on ? "text-bg/70" : "text-fg-muted")}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented switch for ranges and views (h-8, muted track). */
export function Segmented<T extends string>({ options, value, onChange, label, className }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 items-center rounded-input bg-bg-subtle p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("h-7 rounded-[8px] px-2.5 text-meta transition-colors focus-visible:focus-ring", o.value === value ? "bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--ll-color-line)]" : "text-fg-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs for in-page views. */
export function PageTabs<T extends string>({ items, value, onChange, label, className }: { items: { id: T; label: ReactNode; count?: number | null }[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-meta transition-colors focus-visible:focus-ring", on ? "border-fg font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label}
            {t.count != null ? <span className="tabular text-fg-muted">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- table */

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
    <th scope="col" className={cn("sticky top-14 z-[1] h-9 whitespace-nowrap border-b border-line bg-bg-subtle px-3 text-caption font-medium text-fg-muted first:ps-4 last:pe-4", align === "end" ? "text-end" : "text-start", className)} {...rest}>
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

/* ---------------------------------------------------------------- panels */

/** Right-side detail panel (Square customer directory). Full screen on phones. */
export function SidePanel({ open, onClose, title, subtitle, children, footer, label, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; label: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-overlay print:hidden">
      <button type="button" aria-label="Close panel" tabIndex={-1} className="absolute inset-0 cursor-default bg-fg/[0.06]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-y-0 end-0 flex w-full flex-col border-s border-line bg-bg shadow-float outline-none motion-safe:animate-fade-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-headline text-fg">{title}</div>
            {subtitle ? <div className="mt-0.5 truncate text-meta text-fg-muted">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-me-2 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ empty/misc */

/** Empty state: one sentence + one action. No illustration. */
export function Empty({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-8 text-meta text-fg-muted sm:flex-row sm:items-center sm:justify-between", className)}>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Small icon + label button row used in toolbars (secondary, hairline). */
export function ToolbarButton({ icon: Icon, children, onClick, href, disabled, className }: { icon?: LucideIcon; children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; className?: string }) {
  const cls = cn("inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-bg px-3 text-meta font-medium text-fg transition-colors hover:bg-bg-subtle disabled:opacity-50 focus-visible:focus-ring", className);
  const inner = (
    <>
      {Icon ? <Icon aria-hidden className="size-3.5 text-fg-muted" strokeWidth={1.75} /> : null}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line bg-bg px-1 font-sans text-[11px] text-fg-muted">{children}</kbd>;
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
