import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A link drawn as a filter capsule (same look as Chip). `current` fills it black. */
export function ChipLink({ href, current, children, className }: { href: string; current?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? "true" : undefined}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-meta-strong transition-colors duration-150 ease-out focus-visible:focus-ring",
        "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        current ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </Link>
  );
}
