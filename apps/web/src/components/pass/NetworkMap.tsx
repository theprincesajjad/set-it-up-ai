"use client";
/**
 * Real vector map for /map (maplibre-gl, loaded only on the client and only when the map view
 * opens). Pins are React components portalled into maplibre markers. Calls `onFail` when WebGL
 * is missing or the style/tiles can't load, so the page falls back to the list.
 *
 * Opens on the densest strip at street zoom (15.5–16) with padding for the chips + peek card.
 * Overlapping pins are collapsed by a screen-space collision pass (`lib/mapCluster.ts`) after
 * every zoom: my shops win and keep their pin (with a "+N" badge), other groups become a count
 * bubble; tapping either zooms in on that group.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";
import type { LngLatBoundsLike, Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { networkApi } from "@ll/shared";
import { clusterPins, densestGroup, type PinGroup } from "@/lib/mapCluster";
import { MAP_STYLE_URL, muteStyle, webglAvailable } from "./mapStyle";
import { MapCluster, MapPin } from "./MapPin";

export interface NetworkMapProps {
  items: networkApi.ShopListItemDto[];
  selected: string | null;
  onSelect: (id: string) => void;
  me?: { lat: number; lng: number } | null;
  onFail: (reason: string) => void;
}

const TORONTO: [number, number] = [-79.4, 43.66];
/** Room for the "show all" button (top) and the chips + peek card (bottom). */
const PADDING = { top: 72, bottom: 220, left: 48, right: 48 };
const DEFAULT_ZOOM = 16;
const MIN_OPEN_ZOOM = 15.5;
type Located = networkApi.ShopListItemDto & { location: { lat: number; lng: number } };

function boundsOf(ml: typeof import("maplibre-gl"), pts: { lat: number; lng: number }[]): LngLatBoundsLike {
  const b = new ml.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  return b;
}

export default function NetworkMap({ items, selected, onSelect, me, onFail }: NetworkMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(14);
  const [els, setEls] = useState<Record<string, HTMLElement>>({});
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null) as Located[];
  const ll = (s: Located) => ({ lat: s.location.lat, lng: s.location.lng });
  const showLabels = zoom >= 17 || located.length <= 6;
  const regroupRef = useRef<() => void>(() => {});
  useEffect(() => {
    regroupRef.current = () => {
      const m = map.current;
      if (!m) return;
      const pts = located.map((s) => {
        const p = m.project([s.location.lng, s.location.lat]);
        return { id: s.merchant.id, x: p.x, y: p.y, isMember: s.isMember, hasPromo: s.hasPromo };
      });
      setGroups(clusterPins(pts, { radius: showLabels ? 52 : 44, selected }));
    };
  });

  useEffect(() => {
    if (!webglAvailable()) {
      failRef.current("webgl");
      return;
    }
    let cancelled = false;
    let loaded = false;
    const timer = setTimeout(() => {
      if (!loaded && !cancelled) failRef.current("timeout");
    }, 12000);
    void import("maplibre-gl").then((ml) => {
      if (cancelled || !box.current) return;
      lib.current = ml;
      const m = new ml.Map({ container: box.current, style: MAP_STYLE_URL, center: TORONTO, zoom: DEFAULT_ZOOM, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
      m.touchZoomRotate.disableRotation();
      map.current = m;
      m.on("load", () => {
        loaded = true;
        clearTimeout(timer);
        muteStyle(m);
        setReady(true);
        setZoom(m.getZoom());
      });
      m.on("zoomend", () => {
        setZoom(m.getZoom());
        regroupRef.current();
      });
      m.on("error", (e) => {
        if (!loaded && !cancelled) {
          clearTimeout(timer);
          failRef.current((e as { error?: Error }).error?.message ?? "style");
        }
      });
    }).catch(() => failRef.current("load"));
    const ms = markers.current;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ms.forEach((mk) => mk.remove());
      ms.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Sync markers with the shop list.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    const next: Record<string, HTMLElement> = {};
    const keep = new Set(located.map((s) => s.merchant.id));
    for (const [id, mk] of markers.current) if (!keep.has(id)) {
      mk.remove();
      markers.current.delete(id);
    }
    for (const s of located) {
      let mk = markers.current.get(s.merchant.id);
      if (!mk) {
        const el = document.createElement("div");
        mk = new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([s.location!.lng!, s.location!.lat!]).addTo(m);
        // The pin inside is the button; the marker wrapper must not be a second (nested) one.
        for (const a of ["role", "aria-label", "tabindex"]) el.removeAttribute(a);
        markers.current.set(s.merchant.id, mk);
      } else mk.setLngLat([s.location!.lng!, s.location!.lat!]);
      next[s.merchant.id] = mk.getElement();
    }
    setEls(next);
    if (located.length) {
      // Open on the densest strip (plus me, when I'm on it) at street zoom, not the whole city.
      const dense = densestGroup([...located.map(ll), ...(me ? [me] : [])]);
      const cam = m.cameraForBounds(boundsOf(ml, dense), { padding: PADDING, maxZoom: DEFAULT_ZOOM });
      if (cam?.center) m.jumpTo({ center: cam.center, zoom: Math.min(DEFAULT_ZOOM, Math.max(MIN_OPEN_ZOOM, cam.zoom ?? DEFAULT_ZOOM)) });
      setZoom(m.getZoom());
    }
    regroupRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items, me]);

  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    meMarker.current?.remove();
    if (me) {
      const el = document.createElement("div");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "You are here");
      el.className = "size-4 rounded-full border-2 border-[#FFFFFF] bg-info shadow-[0_0_0_12px_rgba(29,95,168,0.2)]";
      meMarker.current = new ml.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
    }
  }, [ready, me]);

  // Selection changes priority (the selected pin always stays visible).
  useEffect(() => {
    if (ready) regroupRef.current();
  }, [ready, selected]);

  // Only group anchors are drawn; the other members' marker elements are hidden.
  const anchorOf = new Map<string, PinGroup>();
  for (const g of groups) for (const id of g.members) anchorOf.set(id, g);
  useEffect(() => {
    const shown = new Set(groups.map((g) => g.anchor));
    for (const [id, mk] of markers.current) mk.getElement().style.display = groups.length && !shown.has(id) ? "none" : "";
  }, [groups]);

  const expand = (g: PinGroup) => {
    const m = map.current;
    const ml = lib.current;
    if (!m || !ml) return;
    const pts = located.filter((s) => g.members.includes(s.merchant.id)).map(ll);
    if (m.getZoom() >= 18.5 || !pts.length) return onSelect(g.anchor);
    const cam = m.cameraForBounds(boundsOf(ml, pts), { padding: PADDING, maxZoom: 19 });
    const target = Math.min(19, Math.max((cam?.zoom ?? 0), m.getZoom() + 1.5));
    m.easeTo({ center: cam?.center ?? [pts[0]!.lng, pts[0]!.lat], zoom: target, duration: 350 });
  };

  useEffect(() => {
    for (const [id, mk] of markers.current) mk.getElement().style.zIndex = id === selected ? "3" : "1";
    const s = located.find((x) => x.merchant.id === selected);
    if (s && map.current) map.current.easeTo({ center: [s.location!.lng!, s.location!.lat!], duration: 300, offset: [0, -60] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="absolute inset-0">
      {/* Inline style: maplibre-gl.css sets .maplibregl-map { position: relative } outside Tailwind layers. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Map of shops" />
      {Object.entries(els).map(([id, el]) => {
        const s = located.find((x) => x.merchant.id === id);
        const g = anchorOf.get(id);
        if (!s || (g && g.anchor !== id)) return null;
        const others = g ? g.members.length - 1 : 0;
        // A group led by one of my shops (or the selected one) keeps that pin; others become a bubble.
        if (others > 0 && !s.isMember && id !== selected) return createPortal(<MapCluster count={g!.members.length} onExpand={() => expand(g!)} />, el, id);
        return createPortal(<MapPin shop={s} selected={id === selected} onSelect={() => onSelect(id)} showLabel={showLabels} compact={zoom < 16 && located.length > 6} moreCount={others} onExpand={g && others ? () => expand(g) : undefined} />, el, id);
      })}
      <button
        type="button"
        aria-label="Show all shops"
        title="Show all shops"
        onClick={() => {
          const m = map.current;
          const ml = lib.current;
          if (!m || !ml || !located.length) return;
          m.fitBounds(boundsOf(ml, located.map(ll)), { padding: PADDING, maxZoom: DEFAULT_ZOOM });
        }}
        className="absolute end-3 top-3 z-[2] inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-md focus-visible:focus-ring"
      >
        <LocateFixed aria-hidden className="size-5" />
      </button>
    </div>
  );
}
