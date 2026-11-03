import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";

/**
 * The marketing wordmark (wave S): a violet tile holding one earned stamp (a white ring around a sun-yellow dot), beside the name in the
 * display face. Marketing header and footer only; the app keeps components/site/Brand.tsx. `id` is kept for callers (no filter any more).
 */
export function MarketingWordmark({ className }: { id?: string; className?: string }) {
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-md text-mkt-ink focus-visible:focus-ring", className)}>
      <svg viewBox="0 0 32 32" width={32} height={32} aria-hidden className="shrink-0">
        <rect x="0" y="0" width="32" height="32" rx="10" fill="var(--mkt-violet)" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="var(--mkt-on-violet)" strokeWidth="2.75" />
        <circle cx="16" cy="16" r="4.25" fill="var(--mkt-sun)" />
      </svg>
      <span className="font-mkt-display text-lg leading-none">{BRAND.name.toLowerCase()}</span>
    </Link>
  );
}
