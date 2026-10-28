"use client";
import { cn } from "@/lib/cn";

/**
 * 2-4 options view switch (List / Map, Day / Week). Not navigation. iOS-style: grey capsule track, white thumb.
 * Clear (audit #14): a glass track inset 2 with a lifted glass segment; `size` sm 28 / md 32 (default) / lg 44 (the counter); `floating` is the
 * glass capsule over a map (44). Warm ignores `size`.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className, floating, size = "md" }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string; floating?: boolean; size?: "sm" | "md" | "lg" }) {
  const clearTrack = floating ? "clear:glass-chrome clear:h-11 clear:p-0.5" : { sm: "clear:h-7", md: "clear:h-8", lg: "clear:h-11" }[size];
  const clearSeg = floating || size === "lg" ? "clear:px-4 clear:text-body" : size === "sm" ? "clear:px-3 clear:text-meta-strong" : "clear:px-3.5 clear:text-body";
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full", floating ? "chrome h-11 p-1" : "h-9 bg-bg-subtle p-0.5 clear:seg-track", clearTrack, className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative min-w-14 rounded-full px-3.5 text-meta-strong transition-colors duration-150 ease-out focus-visible:focus-ring after:absolute after:-inset-y-1 after:inset-x-0 clear:font-[550] clear:min-w-0",
            clearSeg,
            size === "sm" && !floating && "clear:after:-inset-y-2",
            o.value === value ? "bg-bg text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-line clear:glass-seg-on clear:ring-0" : "text-fg-muted hover:text-fg clear:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
