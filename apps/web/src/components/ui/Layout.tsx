import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Max-width content column. `public` = 480 single column (web pass), `app` = 1200 (dashboard), `marketing` = 1200 with larger gutters. */
export function Container({ size = "app", className, children }: { size?: "public" | "app" | "marketing" | "prose"; className?: string; children: ReactNode }) {
  const w = { public: "max-w-[480px] px-4", app: "max-w-[1200px] px-4 md:px-6", marketing: "max-w-[1200px] px-4 md:px-8", prose: "max-w-[720px] px-4 md:px-6" }[size];
  return <div className={cn("mx-auto w-full", w, className)}>{children}</div>;
}

/** Page header (foundations.md "Merchant dashboard"): title 22 semibold, one-line description, actions on the right. */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-meta text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-title text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("flex flex-col gap-3", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title ? (
        <div className="flex items-center justify-between gap-3">
          <h2 id={id ? `${id}-title` : undefined} className="text-headline text-foreground">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Thin environment strip for staff consoles (system.md §7): black for rep, red for admin. */
export function EnvironmentStrip({ env }: { env: "rep" | "admin" }) {
  return <div aria-hidden className={cn("h-[3px] w-full", env === "admin" ? "bg-destructive" : "bg-fg")} />;
}

/** iOS-style large title for phone-first pages (28 Bricolage), with an optional line under it. */
export function LargeTitle({ children, subtitle, className, id }: { children: ReactNode; subtitle?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <h1 id={id} className="display text-large-title text-foreground">
        {children}
      </h1>
      {subtitle ? <p className="text-body text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
