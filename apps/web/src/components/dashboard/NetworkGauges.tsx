"use client";
import { FEATURES } from "@ll/shared";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { gaugeStatus } from "@/lib/dashboard/rollout";

const STATUS_TEXT = { low: "Low", building: "Building", ready: "Target met" } as const;

/** Density gauge as a thin bar: label, value / target, a 4px bar and a status word (never colour alone). */
export function DensityBar({ label, value, target, unit = "shops", format = formatNumber, className }: { label: string; value: number; target: number; unit?: string; format?: (n: number) => string; className?: string }) {
  const s = gaugeStatus(value, target);
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 100;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-meta text-fg-muted">{label}</p>
        <p className="shrink-0 text-caption font-normal text-fg-muted">{s === "ready" ? <span className="text-positive">{STATUS_TEXT[s]}</span> : `${format(Math.max(0, target - value))} to go`}</p>
      </div>
      <p className="mt-1 text-headline text-fg tabular">
        {format(value)}
        <span className="text-meta font-normal text-fg-muted">
          {" "}
          / {format(target)} {unit}
        </span>
      </p>
      <div role="progressbar" aria-label={`${label}: ${format(value)} of ${format(target)} ${unit}. ${STATUS_TEXT[s]}.`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value} className="mt-2 h-1 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn("h-full rounded-full", s === "ready" ? "bg-positive" : "bg-fg")} style={{ width: `${Math.max(1.5, pct)}%` }} />
      </div>
    </div>
  );
}

/** Admin rollout gauges (admin.md §1): one per gate, plus the 2+ shop customer metric. One bordered row. */
export function NetworkGauges({ activeMerchants, multiShopPct }: { activeMerchants: number; multiShopPct: number | null }) {
  const pro = FEATURES["service.tickets"].unlockAtMerchants;
  const plus = FEATURES["orders.order_ahead"].unlockAtMerchants;
  const ads = FEATURES["ads.sponsored_listing"].unlockAtMerchants;
  const camp = FEATURES["campaigns.neighbourhood"].unlockAtMerchants;
  const items = [
    { label: "Pro unlock", value: activeMerchants, target: pro, unit: "merchants" },
    { label: "Plus unlock", value: activeMerchants, target: plus, unit: "merchants" },
    { label: "Street campaigns", value: activeMerchants, target: camp, unit: "merchants" },
    { label: "Ads & sponsored", value: activeMerchants, target: ads, unit: "merchants" },
  ];
  return (
    <section aria-label="Network density" className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
      {items.map((g) => (
        <DensityBar key={g.label} {...g} className="bg-bg px-5 py-4" />
      ))}
      {multiShopPct != null ? <DensityBar label="2+ shop customers" value={Math.round(multiShopPct * 100)} target={30} unit="%" format={(n) => `${n}`} className="bg-bg px-5 py-4" /> : <div className="hidden bg-bg lg:block" />}
    </section>
  );
}
