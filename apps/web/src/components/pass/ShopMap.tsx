"use client";
/**
 * Lightweight network map (references.md §1, Corner-style): round logo pins (label on the
 * selected one), a marigold balance badge on shops I'm a member of, a pine dot for live promos,
 * and a peek card for the selected pin. No map tiles or third-party SDK (old phones, < 100 KB JS):
 * pins are projected from lat/lng onto a muted, decorative street background.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { networkApi } from "@ll/shared";
import { cn } from "@/lib/cn";
import { formatDistance, formatPoints } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { verticalLabel } from "@/components/ui/VerticalIcon";

export function ShopMap({ items, me }: { items: networkApi.ShopListItemDto[]; me?: { lat: number; lng: number } | null }) {
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null);
  const [selected, setSelected] = useState<string | null>(located[0]?.merchant.id ?? null);

  const project = useMemo(() => {
    const pts = located.map((s) => [s.location!.lat!, s.location!.lng!] as const).concat(me ? [[me.lat, me.lng] as const] : []);
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const dLat = Math.max(maxLat - minLat, 0.002);
    const dLng = Math.max(maxLng - minLng, 0.002);
    // 10% padding; y grows downward (north at the top).
    return (lat: number, lng: number) => ({ x: 10 + ((lng - minLng) / dLng) * 80, y: 12 + ((maxLat - lat) / dLat) * 70 });
  }, [located, me]);

  if (!located.length) return <p className="rounded-lg bg-surface p-4 text-body-sm text-fg-muted">No shops with a map location yet. Try the list.</p>;
  const sel = located.find((s) => s.merchant.id === selected) ?? null;
  const short = (n: string) => (n.length > 14 ? `${n.slice(0, 13)}…` : n);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Map of shops" className="relative h-[420px] overflow-hidden rounded-xl border border-border bg-canvas-subtle">
        {/* Decorative streets */}
        <svg aria-hidden className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 55 C 30 50, 60 60, 100 52" className="stroke-surface" strokeWidth="5" fill="none" />
          <path d="M48 0 C 45 40, 55 70, 50 100" className="stroke-surface" strokeWidth="3.5" fill="none" />
          <path d="M0 20 L100 28 M0 85 L100 80" className="stroke-surface" strokeWidth="2" fill="none" />
          <rect x="6" y="64" width="16" height="14" rx="3" className="fill-success-subtle" />
        </svg>
        {me ? (
          <span aria-label="You are here" role="img" className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-info shadow-[0_0_0_12px_color-mix(in_srgb,var(--ll-color-info)_20%,transparent)]" style={{ left: `${project(me.lat, me.lng).x}%`, top: `${project(me.lat, me.lng).y}%` }} />
        ) : null}
        {located.map((s) => {
          const p = project(s.location!.lat!, s.location!.lng!);
          const active = s.merchant.id === selected;
          return (
            <button
              key={s.merchant.id}
              type="button"
              onClick={() => setSelected(s.merchant.id)}
              aria-pressed={active}
              aria-label={`${s.merchant.name}${s.isMember && s.myBalance != null ? `, ${formatPoints(s.myBalance, s.terminology)}` : ""}${s.hasPromo ? ", has an offer" : ""}`}
              className={cn("absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-full flex-col items-center justify-end gap-0.5 rounded-md p-1 focus-visible:focus-ring", active ? "z-[2]" : "z-[1]")}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span className={cn("relative rounded-full bg-surface shadow-md", active ? "p-[3px] ring-2 ring-brand" : "p-0.5")}>
                <ShopLogo shop={s.merchant} size={active ? 48 : 24} className="rounded-full" />
                {s.isMember && s.myBalance != null ? (
                  <span className="absolute -end-2 -top-1.5 rounded-full bg-accent px-1.5 text-caption font-bold tabular-nums text-on-accent">{s.myBalance}</span>
                ) : null}
                {s.hasPromo ? <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface bg-brand" /> : null}
              </span>
              {/* Only the selected pin carries a label, so a busy strip stays readable (Blackbird-style). */}
              {active ? <span className="whitespace-nowrap rounded-full bg-surface px-1.5 text-caption font-semibold text-fg shadow-sm">{short(s.merchant.name)}</span> : null}
            </button>
          );
        })}
      </div>
      {sel ? (
        <div aria-live="polite" className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-md">
          <ShopLogo shop={sel.merchant} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title text-fg">{sel.merchant.name}</p>
            <p className="truncate text-body-sm text-fg-muted">
              {[verticalLabel(sel.merchant.vertical), sel.distanceMetres != null ? formatDistance(sel.distanceMetres) : sel.location?.address].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sel.openNow != null ? (
                <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-caption font-semibold", sel.openNow ? "bg-success-subtle text-on-success-subtle" : "bg-neutral-subtle text-on-neutral-subtle")}>{sel.openNow ? "Open" : "Closed"}</span>
              ) : null}
              {sel.isMember && sel.myBalance != null ? <span className="inline-flex h-6 items-center rounded-full bg-accent-subtle px-2 text-caption font-semibold text-on-accent-subtle">{formatPoints(sel.myBalance, sel.terminology)}</span> : null}
            </div>
          </div>
          <Button size="sm" variant={sel.isMember ? "tonal" : "primary"} href={`/shops/${sel.merchant.slug}`}>
            {sel.isMember ? "View" : "Join"}
          </Button>
        </div>
      ) : null}
      <p className="text-caption text-fg-muted">
        Map positions are approximate. <Link href="#list" className="underline">Switch to the list</Link> for addresses.
      </p>
    </div>
  );
}
