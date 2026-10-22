import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Marketing section: white by default, generous vertical rhythm. `ink` is the black band. */
export function MSection({ children, className, id, tone = "canvas" }: { children: ReactNode; className?: string; id?: string; tone?: "canvas" | "subtle" | "brand" | "ink" }) {
  return (
    <section id={id} className={cn("py-16 md:py-24", tone === "subtle" && "bg-bg-subtle", (tone === "brand" || tone === "ink") && "bg-fg text-bg", className)}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">{children}</div>
    </section>
  );
}

/** Editorial heading: small grey kicker, a big Bricolage headline, one paragraph. */
export function MHeading({ eyebrow, title, sub, center, className }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean; className?: string }) {
  return (
    <div className={cn("mb-10 max-w-2xl md:mb-14", center && "mx-auto text-center", className)}>
      {eyebrow ? <p className="text-meta-strong text-fg-muted">{eyebrow}</p> : null}
      <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{title}</h2>
      {sub ? <p className="mt-5 text-[17px] leading-[1.55] text-fg-muted">{sub}</p> : null}
    </div>
  );
}
