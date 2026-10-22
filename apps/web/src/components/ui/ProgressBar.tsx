import { cn } from "@/lib/cn";

/** Thin progress bar: black fill (accent when it measures points to a reward). */
export function ProgressBar({ value, max, label, valueText, tone = "brand", className, showValue = true }: { value: number; max: number; label?: string; valueText?: string; tone?: "brand" | "accent"; className?: string; showValue?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const text = valueText ?? `${value} of ${max}`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label || showValue ? (
        <div className="flex items-baseline justify-between gap-3 text-meta">
          {label ? <span className="font-semibold text-fg">{label}</span> : <span />}
          {showValue ? <span className="tabular-nums text-fg-muted">{text}</span> : null}
        </div>
      ) : null}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", tone === "accent" ? "bg-accent" : "bg-fg")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
