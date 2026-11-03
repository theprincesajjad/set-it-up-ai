import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";
import { InkFilter } from "./StampCard";

/**
 * The marketing wordmark (wave R): the signature ink stamp as the mark, in stamp-ink vermilion, beside the name in Instrument Sans.
 * Marketing header and footer only; the app keeps components/site/Brand.tsx. `id` keeps each filter unique on the page.
 */
export function MarketingWordmark({ id, className }: { id: string; className?: string }) {
  return (
    <Link href="/" aria-label={`${BRAND.name} home`} className={cn("inline-flex min-h-11 items-center gap-2 rounded-md text-mkt-ink focus-visible:focus-ring", className)}>
      <svg viewBox="0 0 48 48" width={28} height={28} aria-hidden className="shrink-0 -rotate-6 text-mkt-vermilion">
        <InkFilter id={id} />
        <g filter={`url(#${id})`}>
          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M19 14v18M28 14v18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      </svg>
      <span className="text-lg leading-none font-semibold">{BRAND.name.toLowerCase()}</span>
    </Link>
  );
}
