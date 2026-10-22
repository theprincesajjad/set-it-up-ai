import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * v2: cards on a white page get a hairline, never a shadow (foundations.md "Shape, depth").
   * "raised" and "flat" are both hairline cards (kept for API compatibility); "dashed" for placeholders;
   * "subtle" is a borderless grey block for grouped content.
   */
  tone?: "raised" | "flat" | "dashed" | "subtle";
  padding?: "none" | "sm" | "md" | "lg";
  /** Whole card is a link. */
  href?: string;
  as?: "div" | "section" | "article" | "li";
}

const pad = { none: "", sm: "p-3", md: "p-4", lg: "p-5 md:p-6" };

export function Card({ tone = "raised", padding = "md", href, as = "div", className, children, ...rest }: CardProps) {
  const As = as as "div";
  const cls = cn(
    "rounded-card text-fg",
    tone === "subtle" ? "bg-bg-subtle" : "bg-bg",
    (tone === "raised" || tone === "flat") && "border border-line",
    tone === "dashed" && "border border-dashed border-line-strong/60",
    pad[padding],
    href && "block transition-colors duration-150 ease-out hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring",
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
      <div className="min-w-0">
        <h3 className="text-headline text-fg">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-meta text-fg-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** ListRow: leading, title, subtitle, trailing; >= 56px. Put several inside a ListGroup for hairline dividers. */
export function ListRow({ leading, title, subtitle, trailing, href, className, chevron }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; href?: string; className?: string; chevron?: boolean }) {
  const inner = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-fg">{title}</div>
        {subtitle ? <div className="truncate text-meta text-fg-muted">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-end">{trailing}</div> : null}
      {chevron || (href && chevron !== false) ? <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" /> : null}
    </>
  );
  const cls = cn("flex min-h-14 items-center gap-3 py-2.5", href && "-mx-4 px-4 transition-colors hover:bg-bg-subtle active:bg-bg-muted focus-visible:focus-ring", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/**
 * iOS-style grouped list: an optional small header, then rows separated by hairlines inside one
 * hairline-bordered block (16 radius). Children are usually <li>s holding ListRows.
 */
export function ListGroup({ title, action, footer, children, className, inset = true, as = "ul", label }: { title?: ReactNode; action?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; inset?: boolean; as?: "ul" | "div"; label?: string }) {
  const As = as;
  return (
    <section className={cn("flex flex-col gap-2", className)} aria-label={label}>
      {title || action ? (
        <div className="flex items-baseline justify-between gap-3">
          {title ? <h2 className="text-meta-strong text-fg-muted">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <As className={cn("flex flex-col divide-y divide-line overflow-hidden", inset && "rounded-card border border-line bg-bg px-4")}>{children}</As>
      {footer ? <div className="text-meta text-fg-muted">{footer}</div> : null}
    </section>
  );
}
