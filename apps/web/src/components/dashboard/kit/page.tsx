"use client";
/**
 * Dashboard kit: page chrome (PageHeader, Section, Panel, quiet links and buttons, BackLink, ToolbarButton, Kbd).
 * Owner: workstream B. Moved verbatim from kit.tsx (workstream A split); no behaviour change.
 * Import from "@/components/dashboard/kit" (the barrel), not from this file.
 */
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
// Clear theme (docs/design/v3.2-clear-audit.md): the list-page look, scoped under [data-theme-style="clear"]; Warm is untouched.
import "./clear.css";

/** Page header: title (22 semibold), one-line description, actions right. One terracotta primary per page. */
export function PageHeader({ title, description, actions, back, className, flush }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; className?: string; /** No bottom margin (inside a gap layout). */ flush?: boolean }) {
  return (
    <header className={cn("kit-ph", !flush && "mb-6", "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="kit-back mb-1 inline-flex items-center gap-1 text-meta text-fg-muted hover:text-fg">
            <ChevronRight aria-hidden className="size-3.5 rotate-180" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="kit-ph-title text-[clamp(26px,3vw,32px)] font-bold leading-[1.15] text-fg [text-wrap:balance] [[data-trade]_&]:text-trade-deep">{title}</h1>
        {description ? <p className="kit-ph-desc mt-0.5 text-meta text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="kit-ph-acts flex shrink-0 flex-wrap items-center gap-2 max-sm:[&>*:not(:only-child)]:grow max-sm:[&>a:only-child]:w-full max-sm:[&>button:only-child]:w-full">{actions}</div> : null}
    </header>
  );
}

/** Section: a small heading row (title + quiet action) above content. No box. */
export function Section({ title, description, action, children, className, id }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const auto = useId();
  const hid = `${id ?? auto}-h`;
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} className={cn("kit-sec flex min-w-0 flex-col", className)}>
      {title || action ? (
        <div className="kit-sec-h mb-2 flex min-h-8 items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 id={hid} className="kit-sec-title text-headline text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-meta text-fg-muted">{description}</p> : null}
          </div>
          {action ? <div className="max-w-full shrink-0">{action}</div> : null}
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
  // Layout utilities (flex/grid/gap...) style the content; everything else styles the box.
  const parts = (className ?? "").split(/\s+/).filter(Boolean);
  const isLayout = (c: string) => /^(flex|grid|gap|items-|justify-|space-|divide-|place-|grid-cols|flex-col|flex-wrap)/.test(c.replace(/^[a-z0-9]+:/, ""));
  const inner = parts.filter(isLayout).join(" ");
  const outer = parts.filter((c) => !isLayout(c)).join(" ");
  return (
    <As aria-labelledby={title && As === "section" ? id : undefined} data-pad={padded ? "" : undefined} className={cn("kit-panel min-w-0 overflow-hidden rounded-card border border-line bg-card shadow-card", outer)}>
      {title || action ? (
        <div className={cn("kit-panel-h flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4", !padded && "border-b border-line pb-3")}>
          <div className="min-w-0">
            {title ? (
              <h2 id={id} className="kit-panel-title text-headline text-fg">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-0.5 text-meta text-fg-muted">{description}</p> : null}
          </div>
          {action ? <div className="max-w-full shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children ? <div className={cn("kit-panel-b", padded && "px-5 pb-5", padded && (title || action) ? "pt-3" : padded ? "pt-5" : "", inner)}>{children}</div> : null}
      {footer ? <div className="kit-panel-f flex flex-wrap items-center justify-end gap-2 border-t border-line bg-bg-subtle px-5 py-3">{footer}</div> : null}
    </As>
  );
}

/** Quiet text link with optional chevron, for section actions ("See all", "Open counter"). */
export function QuietLink({ href, children, className, chevron = true }: { href: string; children: ReactNode; className?: string; chevron?: boolean }) {
  return (
    <Link href={href} className={cn("kit-quiet inline-flex items-center gap-0.5 rounded-sm text-meta font-medium text-fg-muted hover:text-fg focus-visible:focus-ring", className)}>
      {children}
      {chevron ? <ChevronRight aria-hidden className="size-3.5" /> : null}
    </Link>
  );
}

/** Quiet button (no fill) in the same style as QuietLink. */
export function QuietButton({ children, onClick, className, disabled, type = "button", ...rest }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; type?: "button" | "submit" } & Omit<HTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn("kit-quiet inline-flex min-h-8 items-center gap-1 rounded-sm text-meta font-medium text-fg-muted hover:text-fg disabled:opacity-50 focus-visible:focus-ring", className)} {...rest}>
      {children}
    </button>
  );
}

/** Small icon + label button row used in toolbars (secondary, hairline). */
export function ToolbarButton({ icon: Icon, children, onClick, href, disabled, className }: { icon?: LucideIcon; children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; className?: string }) {
  const cls = cn("kit-tbtn clear:glass-lite inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-bg px-3 text-meta font-medium text-fg transition-colors hover:bg-bg-subtle disabled:opacity-50 focus-visible:focus-ring", className);
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

/** Quiet "‹ Parent" link above a page title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="kit-back -mb-2 inline-flex items-center gap-1 self-start text-meta text-fg-muted hover:text-fg print:hidden">
      <ChevronRight aria-hidden className="size-3.5 rotate-180" />
      {children}
    </Link>
  );
}
