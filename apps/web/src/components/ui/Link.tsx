"use client";
import NextLink from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/** Inline text link: fg, hairline underline that darkens on hover; external icon + rel. */
export function TextLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const { t } = useLocaleOrEnglish();
  const isExternal = external ?? /^https?:\/\//.test(href);
  const cls = cn("rounded-[4px] text-fg underline decoration-line-strong/60 underline-offset-[3px] transition-colors hover:decoration-fg focus-visible:focus-ring", className);
  if (isExternal)
    return (
      <a href={href} className={cn(cls, "inline-flex items-center gap-0.5")} rel="noopener noreferrer" target="_blank">
        {children}
        <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.75} />
        <span className="sr-only">{t("wp.ui.newTab")}</span>
      </a>
    );
  return (
    <NextLink href={href} className={cls}>
      {children}
    </NextLink>
  );
}
