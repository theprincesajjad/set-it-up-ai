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
import type { LngLatBoundsLike, Map as MlMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { networkApi } from "@ll/shared";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { clusterPins, densestGroup, labelledAnchors, type Box, type PinGroup } from "@/lib/mapCluster";
import { loadCornerStyle, mapMode, webglAvailable } from "./mapStyle";
import { MapCluster, MapPin } from "./MapPin";

export interface NetworkMapProps {
  items: networkApi.ShopListItemDto[];
  selected: string | null;
  onSelect: (id: string) => void;
  me?: { lat: number; lng: number } | null;
  onFail: (reason: string) => void;
  /** Bump to fit every shop in view (the floating "show all" control lives in ShopMap). */
  fitAllSignal?: number;
  /** Tap on empty map (closes the shop sheet). */
  onBackgroundTap?: () => void;
  /** Room for floating chrome: filters on top, rail / sheet at the bottom. */
  padding?: { top: number; bottom: number; left: number; right: number };
}

const TORONTO: [number, number] = [-79.4, 43.66];
/** Default room for the floating search + filters (top) and the category rail (bottom). */
const DEFAULT_PADDING = { top: 150, bottom: 170, left: 30, right: 150 };
/** Most labelled pins at once (Corner shows a handful of names, the rest are bubbles). */
const MAX_LABELS = 8;

/** Floating chrome (anything marked data-map-obstacle) in this map's screen coordinates. */
function chromeObstacles(root: HTMLElement | null): Box[] {
  if (!root) return [];
  const r0 = root.getBoundingClientRect();
  return Array.from(document.querySelectorAll<HTMLElement>("[data-map-obstacle]")).flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    return [{ x1: r.left - r0.left - 4, x2: r.right - r0.left + 4, y1: r.top - r0.top - 4, y2: r.bottom - r0.top + 4 }];
  });
}
const DEFAULT_ZOOM = 16;
const MIN_OPEN_ZOOM = 14.6;
type Located = networkApi.ShopListItemDto & { location: { lat: number; lng: number } };

function boundsOf(ml: typeof import("maplibre-gl"), pts: { lat: number; lng: number }[]): LngLatBoundsLike {
  const b = new ml.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  return b;
}

export default function NetworkMap({ items, selected, onSelect, me, onFail, fitAllSignal = 0, onBackgroundTap, padding = DEFAULT_PADDING }: NetworkMapProps) {
  const { t } = useLocaleOrEnglish();
  const PADDING = padding;
  const bgTap = useRef(onBackgroundTap);
  useEffect(() => {
    bgTap.current = onBackgroundTap;
  });
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const meMarker = useRef<Marker | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(14);
  const [els, setEls] = useState<Record<string, HTMLElement>>({});
  const [groups, setGroups] = useState<PinGroup[]>([]);
  const [labels, setLabels] = useState<Set<string>>(new Set());
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null) as Located[];
  const ll = (s: Located) => ({ lat: s.location.lat, lng: s.location.lng });
  /** Names show from street zoom up, wherever they fit (Corner); the selected pin always shows its name. */
  const showLabels = zoom >= 14.6 || located.length <= 6;
  const regroupRef = useRef<() => void>(() => {});
  useEffect(() => {
    regroupRef.current = () => {
      const m = map.current;
      if (!m) return;
      const pts = located.map((s) => {
        const p = m.project([s.location.lng, s.location.lat]);
        return { id: s.merchant.id, x: p.x, y: p.y, isMember: s.isMember, hasPromo: s.hasPromo };
      });
      const g = clusterPins(pts, { radius: 30, selected });
      setGroups(g);
      const byId = new Map(located.map((s) => [s.merchant.id, s]));
      // Label priority: selected, my shops, open now, live offers, the rest.
      const rank = (id: string) => {
        const s = byId.get(id);
        if (!s) return 9;
        return id === selected ? 0 : s.isMember ? 1 : s.openNow ? 2 : s.hasPromo ? 3 : 4;
      };
      setLabels(
        showLabels
          ? labelledAnchors(g, pts, (id) => byId.get(id)?.merchant.name ?? "", { obstacles: chromeObstacles(box.current), max: MAX_LABELS, rank, always: selected })
          : new Set(selected ? [selected] : []),
      );
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
    const ac = new AbortController();
    void Promise.all([import("maplibre-gl"), loadCornerStyle(mapMode(), undefined, ac.signal)]).then(([ml, style]) => {
      if (cancelled || !box.current) return;
      lib.current = ml;
      // The Corner basemap (cornerMapStyle on positron) is applied before the first paint: no flash of the stock style.
      const m = new ml.Map({ container: box.current, style: style as never, center: TORONTO, zoom: DEFAULT_ZOOM, attributionControl: false, dragRotate: false, pitchWithRotate: false });
      m.touchZoomRotate.disableRotation();
      // Attribution stays (OSM/OpenMapTiles licence) as a collapsed (i) tucked bottom-left, under the rail.
      m.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
      map.current = m;
      m.on("load", () => {
        loaded = true;
        clearTimeout(timer);
        setReady(true);
        setZoom(m.getZoom());
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        // Quieter blocks than positron's default so the places carry the colour (foundations.md "almost colourless").
        for (const l of m.getStyle().layers ?? []) {
          if (l.type === "fill" && /building/.test(l.id)) {
            try {
              m.setPaintProperty(l.id, "fill-opacity", 0.55);
            } catch {
              /* keep */
            }
          }
        }
      });
      m.on("click", () => bgTap.current?.());
      m.on("moveend", () => {
        setZoom(m.getZoom());
        regroupRef.current();
      });
      m.on("error", (e) => {
        if (!loaded && !cancelled) {
          clearTimeout(timer);
          failRef.current((e as { error?: Error }).error?.message ?? "style");
        }
      });
    }).catch(() => {
      if (!cancelled) failRef.current("load");
    });
    const ms = markers.current;
    return () => {
      cancelled = true;
      ac.abort();
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
        mk = new ml.Marker({ element: el, anchor: "left", offset: [-17, 0] }).setLngLat([s.location!.lng!, s.location!.lat!]).addTo(m);
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
      el.setAttribute("aria-label", t("wp.map.youHere"));
      el.className = "size-4 rounded-full border-[3px] border-[#FFFFFF] bg-location shadow-[0_0_0_10px_rgba(47,123,246,0.18),0_1px_3px_rgba(0,0,0,0.3)]";
      meMarker.current = new ml.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
    }
  }, [ready, me, t]);

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
    if (s && map.current) map.current.easeTo({ center: [s.location!.lng!, s.location!.lat!], duration: 300, offset: [0, -90] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!fitAllSignal || !m || !ml || !located.length) return;
    m.fitBounds(boundsOf(ml, located.map(ll)), { padding: PADDING, maxZoom: DEFAULT_ZOOM });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAllSignal]);

  return (
    <div className="absolute inset-0 [&_.maplibregl-ctrl-bottom-left]:z-[4] [&_.maplibregl-ctrl-attrib]:m-1.5! [&_.maplibregl-ctrl-attrib]:scale-90">
      {/* Inline style: maplibre-gl.css sets .maplibregl-map { position: relative } outside Tailwind layers. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label={t("ms.map.label")} />
      {Object.entries(els).map(([id, el]) => {
        const s = located.find((x) => x.merchant.id === id);
        const g = anchorOf.get(id);
        if (!s || (g && g.anchor !== id)) return null;
        const others = g ? g.members.length - 1 : 0;
        // A group led by one of my shops (or the selected one) keeps that pin; others become a bubble.
        if (others > 0 && !s.isMember && id !== selected) return createPortal(<MapCluster count={g!.members.length} onExpand={() => expand(g!)} />, el, id);
        return createPortal(<MapPin shop={s} selected={id === selected} onSelect={() => onSelect(id)} showLabel={labels.has(id)} compact={zoom < 14.6 && located.length > 6} moreCount={others} onExpand={g && others ? () => expand(g) : undefined} />, el, id);
      })}
    </div>
  );
}
