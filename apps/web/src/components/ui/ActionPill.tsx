import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "sand" | "primary" | "trade";
const TONE: Record<Tone, string> = {
  sand: "bg-hover text-foreground hover:bg-sidebar",
  primary: "bg-primary text-primary-foreground shadow-glow hover:bg-brand-hover",
  trade: "bg-trade-soft text-trade-deep hover:brightness-[0.97]",
};

export interface ActionPillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  tone?: Tone;
  /** Renders a link. */
  href?: string;
  /** Draws the pill without making it interactive: use it inside a row that is already one link (a link inside a link is invalid HTML). */
  decorative?: boolean;
}

/**
 * The small pill at the end of a row ("Remind", "Text them", "Print"): 32 px tall with a 44 px hit area. A link with `href`, a button
 * with `onClick`, or `decorative` for a row that is itself the link.
 */
export function ActionPill({ children, tone = "sand", href, decorative, className, type = "button", ...rest }: ActionPillProps) {
  const cls = cn("relative inline-flex h-8 shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full px-3.5 text-meta-strong transition-colors duration-150 ease-out focus-visible:focus-ring after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']", TONE[tone], className);
  if (decorative) return <span className={cls}>{children}</span>;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
