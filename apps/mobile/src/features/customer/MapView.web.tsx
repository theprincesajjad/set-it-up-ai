/**
 * Web version of MapView.tsx (Expo web preview / screenshots). Same props and
 * handle, drawn with maplibre-gl on OpenFreeMap's Positron vector tiles
 * (no API key), recoloured to the muted paper palette. Pins are the same
 * <ShopPin> React Native views, portalled into maplibre DOM markers.
 * If the style can't load (offline, blocked), onFail switches Explore to the list.
 */
import type { networkApi } from "@ll/shared";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, StyleSheet, View } from "react-native";
import { ShopPin } from "./ShopPin";

export const TORONTO = { lat: 43.6532, lng: -79.3832 };

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function mapsAvailable(): boolean {
  return process.env.EXPO_PUBLIC_DISABLE_MAPS !== "1";
}

/** Recolour Positron to the app's muted basemap (same palette as MUTED_STYLE in MapView.tsx). */
function mute(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    try {
      if (layer.type === "background") map.setPaintProperty(id, "background-color", "#F3EDE3");
      else if (layer.type === "fill" && /water/.test(id)) map.setPaintProperty(id, "fill-color", "#CFE0F0");
      else if (layer.type === "fill" && /park|wood|grass|landcover|landuse_(park|cemetery)/.test(id)) map.setPaintProperty(id, "fill-color", "#D6E8DE");
      else if (layer.type === "fill" && /building/.test(id)) map.setPaintProperty(id, "fill-color", "#EBE3D6");
      else if (layer.type === "line" && /highway|road|street|path|minor|major/.test(id) && !/casing|outline/.test(id)) map.setPaintProperty(id, "line-color", "#FFFFFF");
      else if (layer.type === "symbol" && /poi/.test(id)) map.setLayoutProperty(id, "visibility", "none");
      else if (layer.type === "symbol") map.setPaintProperty(id, "text-color", "#655A4C");
    } catch {
      // layer without that property: ignore
    }
  }
}

export interface ExploreMapHandle {
  focus: (lat: number, lng: number) => void;
}

type Props = {
  shops: networkApi.ShopListItemDto[];
  center: { lat: number; lng: number };
  showsUser: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRegion: (center: { lat: number; lng: number }) => void;
  onFail: () => void;
  bottomInset: number;
};

export const ExploreMap = forwardRef<ExploreMapHandle, Props>(function ExploreMap({ shops, center, showsUser, selectedId, onSelect, onRegion, onFail, bottomInset }, ref) {
  const host = useRef<HTMLElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMoved = useRef(false);
  const [ready, setReady] = useState(false);
  const [els, setEls] = useState<Record<string, HTMLElement>>({});
  const cb = useRef({ onSelect, onRegion, onFail });
  cb.current = { onSelect, onRegion, onFail };
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);

  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => map.current?.easeTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 15), duration: 320 }),
  }));

  // Create the map once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let loaded = false;
    const m = new maplibregl.Map({
      container: el,
      style: STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 15.4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on("load", () => {
      loaded = true;
      mute(m);
      setReady(true);
    });
    m.on("error", () => {
      if (!loaded) cb.current.onFail();
    });
    m.on("click", (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest?.(".ll-pin")) return;
      cb.current.onSelect(null);
    });
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
    map.current?.setPadding({ top: 120, right: 0, bottom: bottomInset, left: 0 });
  }, [bottomInset, ready]);

  // One DOM marker per shop; the pin itself is rendered with a portal.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const next: Record<string, HTMLElement> = {};
    const markers: maplibregl.Marker[] = [];
    for (const s of withCoords) {
      const el = document.createElement("div");
      el.className = "ll-pin";
      markers.push(new maplibregl.Marker({ element: el, anchor: "top", offset: [0, -20] }).setLngLat([s.location!.lng!, s.location!.lat!]).addTo(m));
      next[s.merchant.id] = el;
    }
    setEls(next);
    return () => markers.forEach((mk) => mk.remove());
  }, [withCoords, ready]);

  useEffect(() => {
    for (const [id, el] of Object.entries(els)) el.style.zIndex = id === selectedId ? "3" : "1";
  }, [els, selectedId]);

  // "You are here" dot.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !showsUser || typeof navigator === "undefined" || !navigator.geolocation) return;
    let mk: maplibregl.Marker | null = null;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const dot = document.createElement("div");
        Object.assign(dot.style, { width: "16px", height: "16px", borderRadius: "8px", background: "#1D5FA8", border: "2px solid #fff", boxShadow: "0 0 0 10px rgba(29,95,168,0.18)" });
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${s.merchant.name}${s.isMember && s.myBalance != null ? `, ${s.myBalance} ${s.terminology}` : ""}${s.hasPromo ? ", has a promo" : ""}`}
            onPress={() => cb.current.onSelect(s.merchant.id)}
          >
            <ShopPin shop={s} selected={s.merchant.id === selectedId} />
          </Pressable>,
          el,
          s.merchant.id,
        );
      })}
    </View>
  );
});
