import NextLink from "next/link";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Inline text link (system.md "Link"): fgLink, underlined in body copy, external icon + rel. */
export function TextLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const isExternal = external ?? /^https?:\/\//.test(href);
  const cls = cn("text-fg-link underline underline-offset-2 hover:decoration-2 focus-visible:focus-ring rounded-xs", className);
  if (isExternal)
    return (
      <a href={href} className={cn(cls, "inline-flex items-center gap-1")} rel="noopener noreferrer" target="_blank">
        {children}
        <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  return (
    <NextLink href={href} className={cls}>
      {children}
    </NextLink>
  );
}
