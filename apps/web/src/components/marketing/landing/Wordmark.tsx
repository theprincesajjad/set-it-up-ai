import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";

/**
 * The marketing wordmark (wave T): a near-black rounded tile holding one earned stamp (a white ring around a white dot), beside the
 * name in the display face. `onBlack` inverts it for the black footer. Marketing header and footer only; the app keeps
 * components/site/Brand.tsx. `id` is kept for callers (no filter any more).
 */
export function MarketingWordmark({ className, onBlack = false }: { id?: string; className?: string; onBlack?: boolean }) {
  const tile = onBlack ? "var(--mkt-on-black)" : "var(--mkt-black)";
  const mark = onBlack ? "var(--mkt-black)" : "var(--mkt-on-black)";
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-md focus-visible:focus-ring", onBlack ? "text-mkt-on-black" : "text-mkt-black", className)}>
      <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden className="shrink-0">
        <rect x="0" y="0" width="32" height="32" rx="8" fill={tile} />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke={mark} strokeWidth="2.5" />
        <circle cx="16" cy="16" r="3.5" fill={mark} />
      </svg>
      <span className="font-mkt-display text-lg leading-none tracking-tight">{BRAND.name}</span>
    </Link>
  );
}
