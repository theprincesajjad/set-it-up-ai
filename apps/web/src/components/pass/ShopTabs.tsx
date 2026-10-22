"use client";
import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";

/** Rewards / Promos / About tabs on the shop page (references.md §5, Neo Financial merchant page). */
export function ShopTabs({ panels }: { panels: { id: string; label: string; count?: number; content: ReactNode }[] }) {
  const [tab, setTab] = useState(panels[0]?.id ?? "");
  const active = panels.find((p) => p.id === tab) ?? panels[0];
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Shop"
        value={active?.id ?? ""}
        onChange={setTab}
        items={panels.map((p) => ({
          id: p.id,
          label: p.label,
          meta: p.count ? <span className="rounded-full bg-neutral-subtle px-1.5 text-caption tabular-nums text-on-neutral-subtle">{p.count}</span> : undefined,
        }))}
      />
      <div role="tabpanel" aria-label={active?.label} className="flex flex-col gap-3">
        {active?.content}
      </div>
    </div>
  );
}
