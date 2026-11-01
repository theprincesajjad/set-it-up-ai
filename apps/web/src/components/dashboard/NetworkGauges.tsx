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
        <p className="min-w-0 text-meta text-fg-muted">{label}</p>
        <p className="shrink-0 text-caption font-normal text-fg-muted">{s === "ready" ? <span className="text-positive-text">{STATUS_TEXT[s]}</span> : `${format(Math.max(0, target - value))} to go`}</p>
      </div>
      <p className="mt-1 text-headline text-fg tabular">
        {format(value)}
        <span className="text-meta font-normal text-fg-muted">
          {" "}
          / {format(target)}
          {unit === "%" ? "%" : ` ${unit}`}
        </span>
      </p>
      <div role="progressbar" aria-label={`${label}: ${format(value)} of ${format(target)} ${unit}. ${STATUS_TEXT[s]}.`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value} className="mt-2 h-1 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn("h-full rounded-full", s === "ready" ? "bg-positive" : "bg-trade")} style={{ width: `${Math.max(1.5, pct)}%` }} />
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
  // A gate with no shop target (unlockAtMerchants 0) is open to every shop from day one: "62 / 0 shops, Target met" says nothing, so it is
  // left out and named in one line instead.
  const gates = [
    { label: "Service tools", value: activeMerchants, target: pro, unit: "shops" },
    { label: "Pro tools", value: activeMerchants, target: plus, unit: "shops" },
    { label: "Street campaigns", value: activeMerchants, target: camp, unit: "shops" },
    { label: "Ads & sponsored", value: activeMerchants, target: ads, unit: "shops" },
  ];
  const items = gates.filter((g) => g.target > 0);
  const open = gates.filter((g) => g.target <= 0).map((g) => g.label);
  const cells = items.length + (multiShopPct != null ? 1 : 0);
  return (
    <section aria-label="Shops joined, by feature" className="flex flex-col gap-2">
      {cells ? (
        <div className={cn("grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2", cells >= 4 ? "lg:grid-cols-4" : cells === 3 ? "lg:grid-cols-3" : "")}>
          {items.map((g) => (
            <DensityBar key={g.label} {...g} className="bg-bg px-5 py-4" />
          ))}
          {multiShopPct != null ? <DensityBar label="2+ shop customers" value={Math.round(multiShopPct * 100)} target={30} unit="%" format={(n) => `${n}`} className="bg-bg px-5 py-4" /> : null}
        </div>
      ) : null}
      {open.length ? <p className="text-meta text-fg-muted">{open.join(", ")}: open to every shop, no network target.</p> : null}
    </section>
  );
}
