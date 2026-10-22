import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function MSection({ children, className, id, tone = "canvas" }: { children: ReactNode; className?: string; id?: string; tone?: "canvas" | "subtle" | "brand" }) {
  return (
    <section id={id} className={cn("py-12 md:py-24", tone === "subtle" && "bg-canvas-subtle", tone === "brand" && "bg-brand text-on-brand", className)}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">{children}</div>
    </section>
  );
}

export function MHeading({ eyebrow, title, sub, center }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("mb-8 max-w-2xl md:mb-12", center && "mx-auto text-center")}>
      {eyebrow ? <p className="text-overline uppercase text-fg-brand">{eyebrow}</p> : null}
      <h2 className="mt-2 font-display text-[32px] font-semibold leading-[38px] tracking-[-0.01em] text-fg md:text-display">{title}</h2>
      {sub ? <p className="mt-3 text-body-lg text-fg-muted">{sub}</p> : null}
    </div>
  );
}
