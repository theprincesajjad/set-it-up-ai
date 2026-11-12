import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";

/**
 * The mark (public/brand/logo-mark.svg, app/icon.svg): a rounded tile holding one earned stamp, a ring around a dot. The same drawing
 * as the marketing header (components/marketing/landing/Wordmark.tsx), the favicon and the share cards, in the theme's own primary
 * colour (near-black in Clear). Inline so it never flashes.
 */
export function LogoMark({ size = 28, className, inverse }: { size?: number; className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="8" className={inverse ? "fill-card" : "fill-primary"} />
      <circle cx="16" cy="16" r="8.5" fill="none" strokeWidth="2.5" className={inverse ? "stroke-primary" : "stroke-primary-foreground"} />
      <circle cx="16" cy="16" r="3.5" className={inverse ? "fill-primary" : "fill-primary-foreground"} />
    </svg>
  );
}

/** Wordmark: the mark and the name as it is written everywhere else ("Local Loyalty", from BRAND). Never hard-code the name. */
export function Wordmark({ inverse, className, size = 28, href = "/" }: { inverse?: boolean; className?: string; size?: number; href?: string | null }) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} inverse={inverse} />
      <span className={cn("font-wordmark text-[19px] font-extrabold leading-none tracking-[-0.01em]", inverse ? "text-bg" : "text-fg")}>{BRAND.name}</span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} aria-label={`${BRAND.name} home`} className="rounded-input focus-visible:focus-ring">
      {inner}
    </Link>
  );
}
