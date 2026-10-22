"use client";
import { LocateFixed, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { networkApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDistance, formatPoints } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShopTile } from "@/components/ui/ShopTile";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { verticalIcon, verticalLabel } from "@/components/ui/VerticalIcon";

export interface ShopFinderProps {
  initial: networkApi.ShopListItemDto[];
  neighbourhoods: networkApi.NeighbourhoodDto[];
  neighbourhood?: string | null;
}

/** /map: network shops near you (geolocation), search and vertical filters. A list first; no map tiles (old phones). */
export function ShopFinder({ initial, neighbourhoods, neighbourhood: initialHood }: ShopFinderProps) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState<string | null>(null);
  const [hood, setHood] = useState<string | null>(initialHood ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await browserApi.network.shops({ q: q.trim() || undefined, vertical: vertical ?? undefined, neighbourhood: coords ? undefined : hood ?? undefined, lat: coords?.lat, lng: coords?.lng, limit: 100 });
        setItems(r.items);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, vertical, hood, coords]);

  function locate() {
    if (!("geolocation" in navigator)) return setNotice(copy.err.locationDenied);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setNotice(null);
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setNotice(copy.err.locationDenied);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const verticals = Array.from(new Set(initial.map((s) => s.merchant.vertical))).slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-fg">Shops near you</h1>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <TextField label="Search shops" hideLabel type="search" placeholder="Search coffee, books, repair..." value={q} onChange={(e) => setQ(e.target.value)} className="ps-10" />
          <Search aria-hidden className="pointer-events-none absolute start-3 top-3.5 size-5 text-fg-muted" />
        </div>
        <Button variant={coords ? "tonal" : "secondary"} iconStart={LocateFixed} loading={locating} onClick={locate}>
          {coords ? "Sorted by distance" : "Use my location"}
        </Button>
        {notice ? <Banner tone="info">{notice}</Banner> : null}
        {neighbourhoods.length > 1 && !coords ? (
          <ChipGroup label="Neighbourhood">
            <Chip selected={!hood} onClick={() => setHood(null)}>
              All
            </Chip>
            {neighbourhoods.map((n) => (
              <Chip key={n.slug} selected={hood === n.slug} onClick={() => setHood(n.slug)}>
                {n.name}
              </Chip>
            ))}
          </ChipGroup>
        ) : null}
        {verticals.length > 1 ? (
          <ChipGroup label="Type of shop">
            {verticals.map((v) => {
              const Icon = verticalIcon(v);
              return (
                <Chip key={v} selected={vertical === v} onClick={() => setVertical(vertical === v ? null : v)} icon={<Icon aria-hidden className="size-4" />}>
                  {verticalLabel(v)}
                </Chip>
              );
            })}
          </ChipGroup>
        ) : null}
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div aria-live="polite" aria-busy={loading}>
        {loading && !items.length ? (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : items.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((s) => (
              <li key={s.merchant.id}>
                <ShopTile
                  variant="list"
                  href={`/shops/${s.merchant.slug}`}
                  shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl }}
                  subtitle={
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      {s.distanceMetres != null ? <span>{formatDistance(s.distanceMetres)}</span> : null}
                      {s.openNow === true ? <span className="text-success">Open now</span> : s.openNow === false ? <span>Closed now</span> : null}
                      {s.isMember && s.myBalance != null ? <span>{formatPoints(s.myBalance, s.terminology)}</span> : null}
                      {s.hasPromo ? <Badge tone="accent">Offer</Badge> : null}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            title={q ? copy.empty.mapSearch(q).title : copy.empty.noNeighbourhood.title}
            description={q ? copy.empty.mapSearch(q).body : copy.empty.noNeighbourhood.body}
            action={q ? <Button variant="tonal" onClick={() => setQ("")}>{copy.empty.mapSearch(q).action}</Button> : undefined}
          />
        )}
      </div>
    </div>
  );
}
