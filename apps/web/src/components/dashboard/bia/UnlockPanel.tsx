"use client";
import type { campaignsApi } from "@ll/shared";
import { Meter, Panel } from "@/components/dashboard";
import { formatNumber } from "@/lib/format";

type Gates = campaignsApi.NeighbourhoodOverview["gates"];

export interface GateRow {
  key: "liveMonths" | "activeShops" | "activeCustomers" | "multiShopPct";
  label: string;
  value: number;
  target: number;
  /** Right-hand text: "14 months", "31", "1,284 · 86%", "27%". */
  text: string;
  met: boolean;
}

/** The four per-street gates with their current values, from the shared thresholds. */
export function gateRows(g: Gates): GateRow[] {
  const t = g.thresholds;
  const row = (key: GateRow["key"], label: string, value: number, target: number, text: string): GateRow => ({ key, label, value, target, text, met: value >= target });
  return [
    row("liveMonths", `Live for ${t.liveMonths} months`, g.liveMonths, t.liveMonths, `${g.liveMonths} ${g.liveMonths === 1 ? "month" : "months"}`),
    row("activeShops", `${formatNumber(t.activeShops)} active shops`, g.activeShops, t.activeShops, formatNumber(g.activeShops)),
    row("activeCustomers", `${formatNumber(t.activeCustomers)} active shoppers`, g.activeCustomers, t.activeCustomers, g.activeCustomers >= t.activeCustomers ? formatNumber(g.activeCustomers) : `${formatNumber(g.activeCustomers)} · ${Math.round((g.activeCustomers / t.activeCustomers) * 100)}%`),
    row("multiShopPct", `${t.multiShopPct}% shop at 2 or more`, g.multiShopPct, t.multiShopPct, `${g.multiShopPct}%`),
  ];
}

/** "Ready" when every gate is met, otherwise "N to go". */
export function unlockStatus(rows: GateRow[]): { ready: boolean; toGo: number; label: string } {
  const toGo = rows.filter((r) => !r.met).length;
  return { ready: toGo === 0, toGo, label: toGo === 0 ? "Ready" : `${toGo} to go` };
}

/** "Campaigns unlock": the real per-street gates, replacing a generic "coming soon". */
export function UnlockPanel({ gates }: { gates: Gates }) {
  const rows = gateRows(gates);
  const s = unlockStatus(rows);
  return (
    <Panel title="Campaigns unlock" action={<span data-testid="unlock-status" className="text-meta-strong text-fg-muted">{s.label}</span>} description={s.ready ? "Your street meets all four. Campaigns are open to you." : "Your street is ready to sell campaigns when all four are met."}>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-meta">
              <span className="text-fg">{r.label}</span>
              <span className="font-semibold tabular text-fg">{r.text}</span>
            </div>
            <Meter className="mt-2" value={Math.min(r.value, r.target)} max={r.target} label={`${r.label}: ${r.met ? "met" : "not yet"}`} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
