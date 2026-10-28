import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * A tiny trend line from a number array (SVG, no axes, no labels). Strokes in `currentColor`, so colour it with a text class
 * (`text-tile-mint-foreground`, `text-trade`). `area` adds a soft fill under the line. Draws nothing for fewer than two points
 * or a flat zero series. Decorative (`aria-hidden`): say the number in text next to it.
 */
export function Sparkline({ values, className, area = true, strokeWidth = 2 }: { values: number[]; className?: string; area?: boolean; strokeWidth?: number }) {
  const gid = useId();
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const w = 100;
  const h = 32;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (h - pad * 2) * (1 - (v - min) / span)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-24 overflow-visible text-current", className)}>
      {area ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`} />
        </>
      ) : null}
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
