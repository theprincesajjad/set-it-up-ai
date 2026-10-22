"use client";
/**
 * Network map (references.md §1, Corner-style): full-width vector map, round logo / initials pins
 * with short labels, floating category chips above a peek card. maplibre-gl loads lazily on the
 * client; without WebGL or tiles the page falls back to the list (`onFail`).
 */
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { networkApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { cn } from "@/lib/cn";
import { formatDistance, formatPoints } from "@/lib/format";
import { MAP_CATEGORIES } from "./mapStyle";

const NetworkMap = dynamic(() => import("./NetworkMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0 rounded-none" /> });

export function ShopMap({ items, me, onFail }: { items: networkApi.ShopListItemDto[]; me?: { lat: number; lng: number } | null; onFail: (reason: string) => void }) {
  const [cat, setCat] = useState<string | null>(null);
  const shown = useMemo(() => {
    const c = MAP_CATEGORIES.find((x) => x.id === cat);
    return c ? items.filter((s) => c.verticals.includes(s.merchant.vertical)) : items;
  }, [items, cat]);
  const located = shown.filter((s) => s.location?.lat != null && s.location?.lng != null);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = located.find((s) => s.merchant.id === selected) ?? located[0] ?? null;
  const cats = MAP_CATEGORIES.filter((c) => items.some((s) => c.verticals.includes(s.merchant.vertical)));

  return (
    <div className="relative -mx-4 h-[calc(100dvh-220px)] min-h-[460px] overflow-hidden border-y border-border bg-[#F4EFE6] sm:mx-0 sm:rounded-xl sm:border">
      <NetworkMap items={shown} selected={sel?.merchant.id ?? null} onSelect={setSelected} me={me} onFail={onFail} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-2 p-3">
        {cats.length > 1 ? (
          <div role="group" aria-label="Categories" className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
            <Chip selected={!cat} onClick={() => setCat(null)} className="shadow-sm">All</Chip>
            {cats.map((c) => (
              <Chip key={c.id} selected={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} className="shadow-sm">{c.label}</Chip>
            ))}
          </div>
        ) : null}
        {sel ? (
          <div aria-live="polite" className="pointer-events-auto flex items-center gap-3 rounded-lg bg-surface p-3 shadow-lg">
            {/* Same solid initials colour as the shop's map pin. */}
            <ShopLogo shop={sel.merchant} size={56} tone="solid" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-title text-fg">{sel.merchant.name}</p>
              <p className="truncate text-body-sm text-fg-muted">{[verticalLabel(sel.merchant.vertical), sel.distanceMetres != null ? formatDistance(sel.distanceMetres) : sel.location?.address].filter(Boolean).join(" · ")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sel.openNow != null ? <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-caption font-semibold", sel.openNow ? "bg-success-subtle text-on-success-subtle" : "bg-neutral-subtle text-on-neutral-subtle")}>{sel.openNow ? "Open" : "Closed"}</span> : null}
                {sel.isMember && sel.myBalance != null ? <span className="inline-flex h-6 items-center rounded-full bg-accent-subtle px-2 text-caption font-semibold text-on-accent-subtle">{formatPoints(sel.myBalance, sel.terminology)}</span> : null}
                {sel.memberCount ? <span className="inline-flex h-6 items-center rounded-full bg-surface-sunken px-2 text-caption text-fg-muted">{sel.memberCount} neighbours are members</span> : null}
              </div>
            </div>
            <Button size="sm" variant={sel.isMember ? "tonal" : "primary"} href={`/shops/${sel.merchant.slug}`}>
              {sel.isMember ? "View" : "Join"}
            </Button>
          </div>
        ) : (
          <p className="pointer-events-auto rounded-lg bg-surface p-3 text-body-sm text-fg-muted shadow-md">No shops with a map location here. Try the list.</p>
        )}
      </div>
    </div>
  );
}
