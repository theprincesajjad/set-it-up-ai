"use client";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Interactive filter / selection chip (36px, 48px hit area). */
export function Chip({ selected, onClick, children, icon, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label transition-colors focus-visible:focus-ring",
        "after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
        selected ? "border-transparent bg-brand-subtle text-on-brand-subtle" : "border-border-strong bg-surface text-fg hover:bg-surface-sunken",
        className,
      )}
    >
      {selected ? <Check aria-hidden className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function ChipGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]", className)}>
      {children}
    </div>
  );
}
