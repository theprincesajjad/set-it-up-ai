import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Max-width content column. `public` = 480 single column (web pass), `app` = 1200 (dashboard), `marketing` = 1200 with larger gutters. */
export function Container({ size = "app", className, children }: { size?: "public" | "app" | "marketing" | "prose"; className?: string; children: ReactNode }) {
  const w = { public: "max-w-[480px] px-4", app: "max-w-[1200px] px-4 md:px-6", marketing: "max-w-[1200px] px-4 md:px-8", prose: "max-w-[720px] px-4 md:px-6" }[size];
  return <div className={cn("mx-auto w-full", w, className)}>{children}</div>;
}

/** Page header: h1 + optional description + primary action on the right (sticky bottom on mobile is up to the page). */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-overline uppercase text-fg-muted">{eyebrow}</p> : null}
        <h1 className="text-h1 text-fg">{title}</h1>
        {description ? <p className="mt-1 text-body text-fg-muted">{description}</p> : null}
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
          <h2 id={id ? `${id}-title` : undefined} className="text-h3 text-fg">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** 4px coloured environment strip for staff consoles (system.md §7): info for rep, danger for admin. */
export function EnvironmentStrip({ env }: { env: "rep" | "admin" }) {
  return <div aria-hidden className={cn("h-1 w-full", env === "admin" ? "bg-danger" : "bg-info")} />;
}
