/**
 * Web version of MapView.tsx (Expo web preview / screenshots). Same props and
 * handle, drawn with maplibre-gl on OpenFreeMap's Positron vector tiles
 * (no API key), restyled with `cornerMapStyle` from @ll/design-tokens: the
 * near-white Corner basemap (no POIs, small grey street labels). Pins are the
 * same <ShopPin> React Native views, portalled into maplibre DOM markers.
 * If the style can't load (offline, blocked), onFail switches Explore to the list.
 */
import { cornerMapStyle, MAP_BASE_STYLE_URL, type MapMode } from "@ll/design-tokens";
import type { networkApi } from "@ll/shared";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, StyleSheet, View } from "react-native";
import { labelHeight, labelPlan, labelWidth, pinPriority, pinSubtitle, type PinMembership } from "../../lib/explore";
import { useTheme } from "../../theme";
import { PIN_ANCHOR_X, PIN_WIDTH, pinLabel, ShopPin } from "./ShopPin";

export const TORONTO = { lat: 43.6532, lng: -79.3832 };

export function mapsAvailable(): boolean {
  return process.env.EXPO_PUBLIC_DISABLE_MAPS !== "1";
}

async function loadStyle(mode: MapMode): Promise<maplibregl.StyleSpecification> {
  const res = await fetch(MAP_BASE_STYLE_URL);
  if (!res.ok) throw new Error(`style ${res.status}`);
  const base = (await res.json()) as maplibregl.StyleSpecification;
  return cornerMapStyle(base as never, mode) as unknown as maplibregl.StyleSpecification;
}

export interface ExploreMapHandle {
  focus: (lat: number, lng: number) => void;
  /** Frame these points (after a filter narrows the shops). */
  fit: (points: { lat: number; lng: number }[]) => void;
}

type Props = {
  shops: networkApi.ShopListItemDto[];
  memberships: Record<string, PinMembership>;
  center: { lat: number; lng: number };
  showsUser: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRegion: (center: { lat: number; lng: number }) => void;
  onFail: () => void;
  topInset: number;
  bottomInset: number;
};

export const ExploreMap = forwardRef<ExploreMapHandle, Props>(function ExploreMap({ shops, memberships, center, showsUser, selectedId, onSelect, onRegion, onFail, topInset, bottomInset }, ref) {
  const { scheme, c } = useTheme();
  const host = useRef<HTMLElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMoved = useRef(false);
  const [ready, setReady] = useState(false);
  const [els, setEls] = useState<Record<string, HTMLElement>>({});
  const [labeled, setLabeled] = useState<Set<string> | null>(null);
  const plan = useRef<() => void>(() => undefined);
  const cb = useRef({ onSelect, onRegion, onFail });
  cb.current = { onSelect, onRegion, onFail };
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);

  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => map.current?.easeTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 15), duration: 320 }),
    fit: (points) => {
      const m = map.current;
      if (!m || points.length === 0) return;
      if (points.length === 1) return void m.easeTo({ center: [points[0]!.lng, points[0]!.lat], zoom: 16, duration: 320 });
      const b = new maplibregl.LngLatBounds();
      for (const p of points) b.extend([p.lng, p.lat]);
      m.fitBounds(b, { padding: { top: 40, bottom: 40, left: 40, right: 180 }, maxZoom: 16.5, duration: 320 });
    },
  }));

  // Create the map once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let loaded = false;
    const m = new maplibregl.Map({
      container: el,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": scheme === "dark" ? "#121214" : "#F2F2F0" } }] },
      center: [center.lng, center.lat],
      zoom: 15.6,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    loadStyle(scheme)
      .then((style) => {
        m.setStyle(style);
        m.once("idle", () => {
          loaded = true;
          setReady(true);
        });
      })
      .catch(() => cb.current.onFail());
    m.on("error", () => {
      if (!loaded) cb.current.onFail();
    });
    m.on("click", (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest?.(".ll-pin")) return;
      cb.current.onSelect(null);
    });
    m.on("moveend", () => plan.current());
    m.on("moveend", (e) => {
      // Only user pans count ("Search this area"), not our own easeTo.
      if (!(e as { originalEvent?: Event }).originalEvent) return;
      userMoved.current = true;
      const c = m.getCenter();
      cb.current.onRegion({ lat: c.lat, lng: c.lng });
    });
    const timeout = setTimeout(() => {
      if (!loaded) cb.current.onFail();
    }, 12_000);
    return () => {
      clearTimeout(timeout);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the centre (location / neighbourhood arriving later) until the user pans.
  useEffect(() => {
    if (!userMoved.current) map.current?.jumpTo({ center: [center.lng, center.lat] });
  }, [center.lat, center.lng]);

  useEffect(() => {
    map.current?.setPadding({ top: topInset, right: 0, bottom: bottomInset, left: 0 });
  }, [topInset, bottomInset, ready]);

  // Which pins carry their name: no two labels overlap (recomputed after every move).
  plan.current = () => {
    const m = map.current;
    if (!m) return;
    const pts = withCoords.map((s) => {
      const p = m.project([s.location!.lng!, s.location!.lat!]);
      const mem = memberships[s.merchant.id];
      return { id: s.merchant.id, x: p.x, y: p.y, priority: pinPriority({ selected: s.merchant.id === selectedId, rewardReady: (mem?.rewardsAvailableCount ?? 0) > 0, member: !!mem, distanceMetres: s.distanceMetres }), w: labelWidth(s.merchant.name, pinSubtitle(s.merchant.vertical, mem ?? null).text), h: labelHeight(s.merchant.name) };
    });
    const { width, height } = m.getContainer().getBoundingClientRect();
    setLabeled(labelPlan(pts, { avoid: [{ x1: 0, y1: 0, x2: width, y2: topInset }, { x1: 0, y1: height - bottomInset, x2: width, y2: height }, { x1: width - 4, y1: 0, x2: width + 400, y2: height }, { x1: width - 72, y1: height - bottomInset - 64, x2: width, y2: height }] }));
  };
  useEffect(() => {
    if (ready) plan.current();
  }, [ready, withCoords, selectedId, memberships, topInset, bottomInset]);

  // One DOM marker per shop; the pin itself is rendered with a portal.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const next: Record<string, HTMLElement> = {};
    const markers: maplibregl.Marker[] = [];
    for (const s of withCoords) {
      const el = document.createElement("div");
      el.className = "ll-pin";
      // The bubble's centre sits on the coordinate; the name runs to the right of it.
      markers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [-PIN_ANCHOR_X, 0] }).setLngLat([s.location!.lng!, s.location!.lat!]).addTo(m));
      next[s.merchant.id] = el;
    }
    setEls(next);
    return () => markers.forEach((mk) => mk.remove());
  }, [withCoords, ready]);

  useEffect(() => {
    for (const [id, el] of Object.entries(els)) el.style.zIndex = id === selectedId ? "3" : memberships[id] ? "2" : "1";
  }, [els, selectedId, memberships]);

  // "You are here" dot.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !showsUser || typeof navigator === "undefined" || !navigator.geolocation) return;
    let mk: maplibregl.Marker | null = null;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const dot = document.createElement("div");
        Object.assign(dot.style, { width: "16px", height: "16px", borderRadius: "50%", boxSizing: "border-box", background: c.location, border: "3px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" });
        mk = new maplibregl.Marker({ element: dot }).setLngLat([p.coords.longitude, p.coords.latitude]).addTo(m);
      },
      () => undefined,
    );
    return () => {
      mk?.remove();
    };
  }, [showsUser, ready]);

  return (
    <View style={StyleSheet.absoluteFill} accessibilityLabel="Map of shops">
      {/* maplibre adds .maplibregl-map { position: relative } to its container, so it gets its own 100% box. */}
      <View ref={host as never} style={{ width: "100%", height: "100%" }} />
      {withCoords.map((s) => {
        const el = els[s.merchant.id];
        if (!el) return null;
        return createPortal(
          <Pressable accessibilityRole="button" accessibilityLabel={pinLabel(s, memberships[s.merchant.id] ?? null)} onPress={() => cb.current.onSelect(s.merchant.id)} style={{ width: PIN_WIDTH }}>
            <ShopPin shop={s} membership={memberships[s.merchant.id] ?? null} selected={s.merchant.id === selectedId} bare={!!labeled && !labeled.has(s.merchant.id)} />
          </Pressable>,
          el,
          s.merchant.id,
        );
      })}
    </View>
  );
});
