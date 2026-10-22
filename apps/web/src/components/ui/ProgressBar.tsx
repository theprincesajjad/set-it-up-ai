import { cn } from "@/lib/cn";

export function ProgressBar({ value, max, label, valueText, tone = "brand", className, showValue = true }: { value: number; max: number; label?: string; valueText?: string; tone?: "brand" | "accent"; className?: string; showValue?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const text = valueText ?? `${value} of ${max}`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label || showValue ? (
        <div className="flex items-baseline justify-between gap-3 text-label">
          {label ? <span className="text-fg">{label}</span> : <span />}
          {showValue ? <span className="tabular-nums text-fg-muted">{text}</span> : null}
        </div>
      ) : null}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text} aria-label={label} className="h-2 overflow-hidden rounded-full bg-ring-track">
        <div className={cn("h-full rounded-full transition-[width] duration-300 ease-standard", tone === "accent" ? "bg-accent" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
