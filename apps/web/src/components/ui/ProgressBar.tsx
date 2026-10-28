"use client";
import { Progress as ProgressRoot } from "@base-ui/react/progress";
import { ProgressIndicator, ProgressTrack } from "@/components/primitives/progress";
import { cn } from "@/lib/utils";

/**
 * Thin progress bar: black fill (points colour when it measures points to a reward). v3: Base UI Progress (the shadcn primitive's Root)
 * carries `role=progressbar` with value, min and max; the shadcn Track and Indicator draw it. The label and the "3 of 10" text above are ours.
 */
export function ProgressBar({ value, max, label, valueText, tone = "brand", className, showValue = true }: { value: number; max: number; label?: string; valueText?: string; tone?: "brand" | "accent"; className?: string; showValue?: boolean }) {
  const text = valueText ?? `${value} of ${max}`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label || showValue ? (
        <div className="flex items-baseline justify-between gap-3 text-meta">
          {label ? <span className="font-semibold text-fg">{label}</span> : <span />}
          {showValue ? <span className="tabular-nums text-fg-muted">{text}</span> : null}
        </div>
      ) : null}
      <ProgressRoot.Root value={Math.max(0, Math.min(max, value))} min={0} max={Math.max(1, max)} aria-label={label ?? text} getAriaValueText={() => text}>
        <ProgressTrack className="h-1.5 bg-bg-muted">
          <ProgressIndicator className={cn("rounded-full duration-300 ease-out", tone === "accent" ? "bg-points" : "bg-fg")} />
        </ProgressTrack>
      </ProgressRoot.Root>
    </div>
  );
}
