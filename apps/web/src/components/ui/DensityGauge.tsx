import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { Badge } from "./Badge";

export type GaugeStatus = "low" | "building" | "ready";

function status(value: number, target: number): GaugeStatus {
  if (target <= 0 || value >= target) return "ready";
  return value / target >= 0.4 ? "building" : "low";
}

const STATUS_TEXT: Record<GaugeStatus, string> = { low: "Low", building: "Building", ready: "Ready" };
const STATUS_STROKE: Record<GaugeStatus, string> = { low: "stroke-chart-status-low", building: "stroke-chart-status-building", ready: "stroke-chart-status-healthy" };

/**
 * Semi-circle density gauge (system.md §6 DensityGauge, admin + rep): filled arc + value + "28 / 40 shops"
 * + status text, never colour alone.
 */
export function DensityGauge({ label, value, target, unit = "shops", format = formatNumber, className, compact }: { label: string; value: number; target: number; unit?: string; format?: (n: number) => string; className?: string; compact?: boolean }) {
  const s = status(value, target);
  const pct = target > 0 ? Math.min(1, value / target) : 1;
  const r = 68;
  const len = Math.PI * r;
  const togo = Math.max(0, target - value);
  return (
    <div className={cn("flex flex-col items-center rounded-card border border-line bg-card p-4 text-center", className)}>
      <p className="text-meta-strong text-fg-muted">{label}</p>
      <div role="img" aria-label={`${label}: ${format(value)} of ${format(target)} ${unit}. ${STATUS_TEXT[s]}.`} className="relative mt-2" style={{ width: compact ? 128 : 160, height: compact ? 72 : 90 }}>
        <svg viewBox="0 0 160 90" width="100%" height="100%" aria-hidden>
          <path d="M12 82 A68 68 0 0 1 148 82" fill="none" strokeWidth={8} strokeLinecap="round" className="stroke-ring-track" />
          <path d="M12 82 A68 68 0 0 1 148 82" fill="none" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${len}`} strokeDashoffset={len * (1 - pct)} className={cn("transition-[stroke-dashoffset] duration-500 ease-out", STATUS_STROKE[s])} />
        </svg>
        <span className="absolute inset-x-0 bottom-0 display text-stat tabular-nums text-fg">{format(value)}</span>
      </div>
      <p className="mt-1 text-meta tabular-nums text-fg">
        {format(value)} / {format(target)} {unit}
      </p>
      <p className="text-meta text-fg-muted">{s === "ready" ? "Target met" : `${format(togo)} to go · ${STATUS_TEXT[s]}`}</p>
      {s === "ready" && !compact ? (
        <Badge tone="success" className="mt-2">
          Ready to unlock
        </Badge>
      ) : null}
    </div>
  );
}
