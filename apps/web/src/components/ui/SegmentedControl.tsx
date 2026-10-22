"use client";
import { cn } from "@/lib/cn";

/** 2-4 options view switch (List / Map, Day / Week). Not navigation. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-10 rounded-md bg-surface-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("relative min-w-16 rounded-sm px-3 text-label transition-colors focus-visible:focus-ring after:absolute after:-inset-y-1 after:inset-x-0", o.value === value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
