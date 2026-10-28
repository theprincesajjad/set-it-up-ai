import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";

/**
 * The v2 mark, "four corners" (public/brand/logo-mark.svg): a black tile with four places, one in
 * the accent (the point you earned). Inline so it never flashes; inverts in dark mode.
 */
export function LogoMark({ size = 28, className, inverse }: { size?: number; className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="16" className={inverse ? "fill-bg" : "fill-fg"} />
      <circle cx="22" cy="22" r="7.5" className={inverse ? "fill-fg" : "fill-bg"} />
      <circle cx="42" cy="22" r="7.5" className={inverse ? "fill-fg" : "fill-bg"} />
      <circle cx="22" cy="42" r="7.5" className={inverse ? "fill-fg" : "fill-bg"} />
      <circle cx="42" cy="42" r="7.5" className="fill-ll-orange-500" />
    </svg>
  );
}

/** Wordmark: mark + lowercase BRAND.name in Bricolage 800. Never hard-code the name. */
export function Wordmark({ inverse, className, size = 28, href = "/" }: { inverse?: boolean; className?: string; size?: number; href?: string | null }) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} inverse={inverse} />
      <span className={cn("font-wordmark text-[19px] font-extrabold leading-none tracking-[-0.01em]", inverse ? "text-bg" : "text-fg")}>{BRAND.name.toLowerCase()}</span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} aria-label={`${BRAND.name} home`} className="rounded-input focus-visible:focus-ring">
      {inner}
    </Link>
  );
}
