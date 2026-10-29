import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PlanLineProps {
  /** "Included with the annual plan, $390 a year" */
  children: ReactNode;
  linkLabel: string;
  href: string;
  className?: string;
}

/** The quiet upsell: 13 muted text with the price and a "See the plan" text link. Never a banner, never a button. */
export function PlanLine({ children, linkLabel, href, className }: PlanLineProps) {
  return (
    <p className={cn("text-body text-muted-foreground", className)}>
      {children}{" "}
      <a href={href} className="relative whitespace-nowrap font-[550] text-link hover:underline focus-visible:focus-ring after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
        {linkLabel}
      </a>
    </p>
  );
}
