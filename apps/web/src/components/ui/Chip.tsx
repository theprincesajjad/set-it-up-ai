"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Filter / selection capsule (36px, 44px hit area). Unselected: white with a hairline;
 * selected: black. `floating` adds the one float shadow for chips over the map.
 */
export function Chip({ selected, onClick, children, icon, className, floating }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode; className?: string; floating?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-meta-strong transition-colors duration-150 ease-out focus-visible:focus-ring",
        "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        selected ? "bg-fg text-bg" : floating ? "bg-bg text-fg" : "border border-line bg-bg text-fg hover:bg-bg-subtle",
        floating && "shadow-float",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function ChipGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      {children}
    </div>
  );
}
