import Link from "next/link";
import { BRAND } from "@ll/shared";
import { cn } from "@/lib/cn";

/** The Shopfront mark, inline so it never flashes. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={className}>
      <defs>
        <clipPath id="ll-awning">
          <path d="M6 22a12 12 0 0 1 12-12h28a12 12 0 0 1 12 12v2a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0a6.5 6.5 0 0 1-13 0z" />
        </clipPath>
      </defs>
      <rect x="6" y="10" width="52" height="48" rx="12" fill="#1F6A50" />
      <g clipPath="url(#ll-awning)">
        <rect x="6" y="10" width="52" height="21" fill="#F5A524" />
        <rect x="19" y="10" width="13" height="21" fill="#FDDA8E" />
        <rect x="45" y="10" width="13" height="21" fill="#FDDA8E" />
      </g>
      <path d="M24 58V44a8 8 0 0 1 16 0v14z" fill="#FAF6EF" />
      <circle cx="35.5" cy="51" r="2" fill="#F5A524" />
    </svg>
  );
}

/** Wordmark: mark + BRAND.name (first word ink, rest pine). Never hard-code the name. */
export function Wordmark({ inverse, className, size = 32, href = "/" }: { inverse?: boolean; className?: string; size?: number; href?: string | null }) {
  const [first, ...rest] = BRAND.name.split(" ");
  const inner = (
    <span className={cn("inline-flex items-center gap-2 text-[20px] font-bold tracking-[-0.02em]", className)}>
      <LogoMark size={size} />
      <span>
        <span className={inverse ? "text-on-brand" : "text-fg"}>{first}</span>
        {rest.length ? <span className={inverse ? "text-on-brand" : "text-fg-brand"}> {rest.join(" ")}</span> : null}
      </span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} aria-label={`${BRAND.name} home`} className="rounded-sm focus-visible:focus-ring">
      {inner}
    </Link>
  );
}
