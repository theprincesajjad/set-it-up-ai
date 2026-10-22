import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** "raised" (shadow on canvas, default) or "flat" (1px border, inside other surfaces). */
  tone?: "raised" | "flat" | "dashed";
  padding?: "none" | "sm" | "md" | "lg";
  /** Whole card is a link. */
  href?: string;
  as?: "div" | "section" | "article" | "li";
}

const pad = { none: "", sm: "p-4", md: "p-4 md:p-5", lg: "p-5 md:p-6" };

export function Card({ tone = "raised", padding = "md", href, as = "div", className, children, ...rest }: CardProps) {
  const As = as as "div";
  const cls = cn(
    "rounded-lg bg-surface text-fg",
    tone === "raised" && "shadow-sm",
    tone === "flat" && "border border-border",
    tone === "dashed" && "border border-dashed border-border-strong",
    pad[padding],
    href && "block transition-shadow hover:shadow-md active:opacity-[0.88] focus-visible:focus-ring",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <As className={cls} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, action, subtitle, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div>
        <h3 className="text-title text-fg">{title}</h3>
        {subtitle ? <p className="text-body-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** ListRow (system.md §3): leading, title, subtitle, trailing; >= 56px. */
export function ListRow({ leading, title, subtitle, trailing, href, className }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; href?: string; className?: string }) {
  const inner = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-fg">{title}</div>
        {subtitle ? <div className="truncate text-body-sm text-fg-muted">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-end">{trailing}</div> : null}
    </>
  );
  const cls = cn("flex min-h-14 items-center gap-3 py-2", href && "rounded-md hover:bg-canvas-subtle focus-visible:focus-ring", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
