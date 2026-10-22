"use client";
/**
 * Real vector map for /map (maplibre-gl, loaded only on the client and only when the map view
 * opens). Pins are React components portalled into maplibre markers. Calls `onFail` when WebGL
 * is missing or the style/tiles can't load, so the page falls back to the list.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { networkApi } from "@ll/shared";
import { MAP_STYLE_URL, muteStyle, webglAvailable } from "./mapStyle";
import { MapPin } from "./MapPin";

export interface NetworkMapProps {
  items: networkApi.ShopListItemDto[];
  selected: string | null;
  onSelect: (id: string) => void;
  me?: { lat: number; lng: number } | null;
  onFail: (reason: string) => void;
}

const TORONTO: [number, number] = [-79.4, 43.66];

export default function NetworkMap({ items, selected, onSelect, me, onFail }: NetworkMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(14);
  const [els, setEls] = useState<Record<string, HTMLElement>>({});
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null);

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
      const m = new ml.Map({ container: box.current, style: MAP_STYLE_URL, center: TORONTO, zoom: 14, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
      m.touchZoomRotate.disableRotation();
      map.current = m;
      m.on("load", () => {
        loaded = true;
        clearTimeout(timer);
        muteStyle(m);
        setReady(true);
        setZoom(m.getZoom());
      });
      m.on("zoomend", () => setZoom(m.getZoom()));
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
      const b = new ml.LngLatBounds();
      located.forEach((s) => b.extend([s.location!.lng!, s.location!.lat!]));
      if (me) b.extend([me.lng, me.lat]);
      m.fitBounds(b, { padding: { top: 72, bottom: 200, left: 48, right: 48 }, maxZoom: 16, duration: 0 });
    }
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
        return s ? createPortal(<MapPin shop={s} selected={id === selected} onSelect={() => onSelect(id)} showLabel={zoom >= 17 || located.length <= 6} compact={zoom < 16 && located.length > 6} />, el, id) : null;
      })}
      <button
        type="button"
        aria-label="Show all shops"
        title="Show all shops"
        onClick={() => {
          const m = map.current;
          const ml = lib.current;
          if (!m || !ml || !located.length) return;
          const b = new ml.LngLatBounds();
          located.forEach((s) => b.extend([s.location!.lng!, s.location!.lat!]));
          m.fitBounds(b, { padding: { top: 72, bottom: 200, left: 48, right: 48 }, maxZoom: 16 });
        }}
        className="absolute end-3 top-3 z-[2] inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg shadow-md focus-visible:focus-ring"
      >
        <LocateFixed aria-hidden className="size-5" />
      </button>
    </div>
  );
}
