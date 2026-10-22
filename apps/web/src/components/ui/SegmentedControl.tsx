"use client";
import { cn } from "@/lib/cn";

/** 2-4 options view switch (List / Map, Day / Week). Not navigation. iOS-style: grey capsule track, white thumb. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className, floating }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string; floating?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full", floating ? "chrome h-11 p-1" : "h-9 bg-bg-subtle p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative min-w-14 rounded-full px-3.5 text-meta-strong transition-colors duration-150 ease-out focus-visible:focus-ring after:absolute after:-inset-y-1 after:inset-x-0",
            o.value === value ? "bg-bg text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-line" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
