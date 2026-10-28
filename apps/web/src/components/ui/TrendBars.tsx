import { cn } from "@/lib/cn";

/**
 * A highlight-bar chart (Main Street Warm): every bar is a quiet tint, one bar (the peak, or `highlight`) is the accent. The accent is the
 * trade colour by default (`[data-trade]`), or `tone="primary"` for terracotta. `labels` puts up to three captions under the bars
 * (start, middle, end). The figure has a text summary through `label`; bars are decoration.
 */
export function TrendBars({
  values,
  labels,
  highlight,
  tone = "trade",
  height = 88,
  label,
  className,
}: {
  values: number[];
  /** Captions under the bars: [start, middle, end]. Any may be empty. */
  labels?: [string?, string?, string?];
  /** Index of the highlighted bar; the largest value when omitted. */
  highlight?: number;
  tone?: "trade" | "primary";
  height?: number;
  /** Accessible summary of the chart. */
  label: string;
  className?: string;
}) {
  const max = Math.max(...values, 1);
  const peak = highlight ?? (values.some((v) => v > 0) ? values.indexOf(Math.max(...values)) : -1);
  const hot = tone === "primary" ? "bg-primary" : "bg-trade";
  const quiet = tone === "primary" ? "bg-[color-mix(in_srgb,var(--primary)_20%,var(--card))]" : "bg-[color-mix(in_srgb,var(--trade)_22%,var(--card))]";
  return (
    <figure role="img" aria-label={label} className={cn("m-0", className)}>
      <div className="flex items-end gap-1.5" style={{ height }} dir="ltr">
        {values.map((v, i) => (
          <span key={i} className={cn("min-h-1 flex-1 rounded-md", i === peak ? hot : quiet)} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
        ))}
      </div>
      {labels && labels.some(Boolean) ? (
        <figcaption aria-hidden className="mt-2 flex justify-between text-caption text-muted-foreground">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
          <span>{labels[2]}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
