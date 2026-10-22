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
import { Component, forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import RNMapView, { Marker, type Region } from "react-native-maps";
import { formatNumber } from "../../lib/award";
import { useTheme } from "../../theme";
import { ShopLogo, Text } from "../../ui";

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

function shortLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function Pin({ shop, selected }: { shop: networkApi.ShopListItemDto; selected: boolean }) {
  const { c } = useTheme();
  const size = selected ? 52 : 40;
  return (
    <View style={{ alignItems: "center", width: 96 }}>
      <View style={[styles.ring, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }, selected ? { borderColor: c.brand } : null]}>
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
          <ShopLogo shop={shop.merchant} size={size} />
        </View>
        {shop.isMember && shop.myBalance != null ? (
          <View style={[styles.badge, { backgroundColor: c.accent }]}>
            <Text variant="caption" rawColor={c.onAccent} tabular style={{ fontFamily: "Figtree_700Bold" }}>
              {formatNumber(shop.myBalance)}
            </Text>
          </View>
        ) : null}
        {shop.hasPromo ? <View style={[styles.promoDot, { backgroundColor: c.brand }]} /> : null}
      </View>
      <View style={[styles.label, { backgroundColor: selected ? c.brand : "#FFFFFFE6" }]}>
        <Text variant="caption" rawColor={selected ? c.onBrand : "#1F1B16"} numberOfLines={1}>
          {shortLabel(shop.merchant.name)}
        </Text>
      </View>
    </View>
  );
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
  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 320),
  }));
  return (
    <MapBoundary onFail={onFail}>
      <RNMapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        customMapStyle={MUTED_STYLE}
        showsUserLocation={showsUser}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        mapPadding={{ top: 120, right: 0, bottom: bottomInset, left: 0 }}
        onPress={() => onSelect(null)}
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
            <Pin shop={s} selected={s.merchant.id === selectedId} />
          </Marker>
        ))}
      </RNMapView>
    </MapBoundary>
  );
});

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -6, right: -10, minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  promoDot: { position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#FFFFFF" },
  label: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, maxWidth: 96 },
});
