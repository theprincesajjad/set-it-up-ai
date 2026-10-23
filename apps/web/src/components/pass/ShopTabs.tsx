"use client";
import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

/** Rewards / Promos / About tabs on the shop page (references.md §5, Neo Financial merchant page). */
export function ShopTabs({ panels }: { panels: { id: string; label: string; count?: number; content: ReactNode }[] }) {
  const [tab, setTab] = useState(panels[0]?.id ?? "");
  const active = panels.find((p) => p.id === tab) ?? panels[0];
  return (
    <div className="flex flex-col gap-5">
      <Tabs
        label="Shop"
        value={active?.id ?? ""}
        onChange={setTab}
        items={panels.map((p) => ({
          id: p.id,
          label: p.label,
          meta: p.count ? <span className="text-meta font-normal tabular-nums text-fg-muted">{p.count}</span> : undefined,
        }))}
      />
      <div role="tabpanel" aria-label={active?.label} className="flex flex-col gap-5">
        {active?.content}
      </div>
    </div>
  );
}
