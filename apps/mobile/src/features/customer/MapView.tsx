/**
 * Explore map (references.md § 1, Corner-style): react-native-maps with a
 * muted style, round logo pins with a white ring + short label, a marigold
 * balance badge for my shops and a pine dot for a live promo. Falls back to
 * the list (onFail) when maps aren't configured: Android needs
 * GOOGLE_MAPS_API_KEY at build time (app.config.ts → extra.mapsEnabledAndroid);
 * iOS uses Apple Maps (mutedStandard) with no key.
 */
import type { networkApi } from "@ll/shared";
import Constants from "expo-constants";
import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";
import RNMapView, { Marker, type Region } from "react-native-maps";
import { ShopPin } from "./ShopPin";

export const TORONTO = { lat: 43.6532, lng: -79.3832 };

/** Google muted basemap: stone greys, pine parks, lake water, POIs off except transit (system.md § MapPin). */
const MUTED_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#F3EDE3" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#655A4C" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FAF6EF" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#D6E8DE" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#FBF8F2" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#E7DFD2" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#CFE0F0" }] },
];

export function mapsAvailable(): boolean {
  if (process.env.EXPO_PUBLIC_DISABLE_MAPS === "1") return false;
  if (Platform.OS === "ios") return true;
  const extra = Constants.expoConfig?.extra as { mapsEnabledAndroid?: boolean } | undefined;
  return Platform.OS === "android" && !!extra?.mapsEnabledAndroid;
}

class MapBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface ExploreMapHandle {
  focus: (lat: number, lng: number) => void;
}

export const ExploreMap = forwardRef<
  ExploreMapHandle,
  {
    shops: networkApi.ShopListItemDto[];
    center: { lat: number; lng: number };
    showsUser: boolean;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onRegion: (center: { lat: number; lng: number }) => void;
    onFail: () => void;
    bottomInset: number;
  }
>(function ExploreMap({ shops, center, showsUser, selectedId, onSelect, onRegion, onFail, bottomInset }, ref) {
  const map = useRef<RNMapView>(null);
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);
  // Follow the centre (location / neighbourhood arriving later) until the user pans.
  const userMoved = useRef(false);
  useEffect(() => {
    if (!userMoved.current) map.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 0);
  }, [center.lat, center.lng]);
  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 320),
  }));
  return (
    <MapBoundary onFail={onFail}>
      <RNMapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        customMapStyle={MUTED_STYLE}
        showsUserLocation={showsUser}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        mapPadding={{ top: 120, right: 0, bottom: bottomInset, left: 0 }}
        onPress={() => onSelect(null)}
        onPanDrag={() => {
          userMoved.current = true;
        }}
        onRegionChangeComplete={(r: Region) => onRegion({ lat: r.latitude, lng: r.longitude })}
        accessibilityLabel="Map of shops"
      >
        {withCoords.map((s) => (
          <Marker
            key={s.merchant.id}
            coordinate={{ latitude: s.location!.lat!, longitude: s.location!.lng! }}
            onPress={(e) => {
              e.stopPropagation();
              onSelect(s.merchant.id);
            }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.35 }}
            accessibilityLabel={`${s.merchant.name}${s.isMember && s.myBalance != null ? `, ${s.myBalance} ${s.terminology}` : ""}${s.hasPromo ? ", has a promo" : ""}`}
          >
            <ShopPin shop={s} selected={s.merchant.id === selectedId} />
          </Marker>
        ))}
      </RNMapView>
    </MapBoundary>
  );
});
