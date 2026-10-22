/**
 * Explore map (native): react-native-maps with the Corner basemap. Android
 * (Google provider) takes `googleMapStyle` from @ll/design-tokens; Apple Maps
 * can't be restyled, so iOS uses `mutedStandard` with every point of interest
 * filtered out, which is the closest near-white map. Pins are <ShopPin> views.
 * Falls back to the list (onFail) when maps aren't configured: Android needs
 * GOOGLE_MAPS_API_KEY at build time (app.config.ts → extra.mapsEnabledAndroid).
 */
import { googleMapStyle } from "@ll/design-tokens";
import type { networkApi } from "@ll/shared";
import Constants from "expo-constants";
import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet } from "react-native";
import RNMapView, { Marker, type Region } from "react-native-maps";
import { labelHeight, labelPlan, labelWidth, pinPriority, pinSubtitle, type PinMembership } from "../../lib/explore";
import { useTheme } from "../../theme";
import { PIN_ANCHOR_X, PIN_WIDTH, pinLabel, ShopPin } from "./ShopPin";

export const TORONTO = { lat: 43.6532, lng: -79.3832 };

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
  /** Frame these points (after a filter narrows the shops). */
  fit: (points: { lat: number; lng: number }[]) => void;
}

export interface ExploreMapProps {
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
}

export const ExploreMap = forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMap({ shops, memberships, center, showsUser, selectedId, onSelect, onRegion, onFail, topInset, bottomInset }, ref) {
  const { scheme } = useTheme();
  const map = useRef<RNMapView>(null);
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);
  const [region, setRegion] = useState<Region>({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  const [size, setSize] = useState({ width: 390, height: 800 });
  // Which pins carry their name: project to screen (linear is fine at street zoom) and drop labels that would overlap.
  const labeled = useMemo(() => {
    const x0 = region.longitude - region.longitudeDelta / 2;
    const y0 = region.latitude + region.latitudeDelta / 2;
    return labelPlan(
      withCoords.map((s) => {
        const mem = memberships[s.merchant.id];
        return {
          id: s.merchant.id,
          x: ((s.location!.lng! - x0) / region.longitudeDelta) * size.width,
          y: ((y0 - s.location!.lat!) / region.latitudeDelta) * size.height,
          priority: pinPriority({ selected: s.merchant.id === selectedId, rewardReady: (mem?.rewardsAvailableCount ?? 0) > 0, member: !!mem, distanceMetres: s.distanceMetres }),
          w: labelWidth(s.merchant.name, pinSubtitle(s.merchant.vertical, mem ?? null).text), h: labelHeight(s.merchant.name),
        };
      }),
      { avoid: [{ x1: 0, y1: 0, x2: size.width, y2: topInset }, { x1: 0, y1: size.height - bottomInset, x2: size.width, y2: size.height }, { x1: size.width - 4, y1: 0, x2: size.width + 400, y2: size.height }, { x1: size.width - 72, y1: size.height - bottomInset - 64, x2: size.width, y2: size.height }] },
    );
  }, [withCoords, memberships, selectedId, region, size, topInset, bottomInset]);
  // Follow the centre (location / neighbourhood arriving later) until the user pans.
  const userMoved = useRef(false);
  useEffect(() => {
    if (!userMoved.current) map.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 0);
  }, [center.lat, center.lng]);
  useImperativeHandle(ref, () => ({
    focus: (lat, lng) => map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 320),
    fit: (points) => {
      if (points.length === 0) return;
      userMoved.current = true;
      map.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 40, bottom: 110, left: 40, right: 180 }, animated: true },
      );
    },
  }));
  return (
    <MapBoundary onFail={onFail}>
      <RNMapView
        ref={map}
        style={StyleSheet.absoluteFill}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        customMapStyle={googleMapStyle[scheme]}
        userInterfaceStyle={scheme}
        pointsOfInterestFilter={[]}
        showsUserLocation={showsUser}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        mapPadding={{ top: topInset, right: 0, bottom: bottomInset, left: 0 }}
        onPress={() => onSelect(null)}
        onPanDrag={() => {
          userMoved.current = true;
        }}
        onRegionChangeComplete={(r: Region) => {
          setRegion(r);
          onRegion({ lat: r.latitude, lng: r.longitude });
        }}
        accessibilityLabel="Map of shops"
      >
        {withCoords.map((s) => {
          const mem = memberships[s.merchant.id] ?? null;
          const selected = s.merchant.id === selectedId;
          const bare = !labeled.has(s.merchant.id);
          return (
            <Marker
              // tracksViewChanges is off for performance, so a changed look needs a fresh marker.
              key={`${s.merchant.id}-${selected ? 1 : 0}-${bare ? 1 : 0}`}
              coordinate={{ latitude: s.location!.lat!, longitude: s.location!.lng! }}
              onPress={(e) => {
                e.stopPropagation();
                onSelect(s.merchant.id);
              }}
              tracksViewChanges={false}
              anchor={{ x: PIN_ANCHOR_X / PIN_WIDTH, y: 0.5 }}
              zIndex={selected ? 10 : mem ? 2 : 1}
              accessibilityLabel={pinLabel(s, mem)}
            >
              <ShopPin shop={s} membership={mem} selected={selected} bare={bare} />
            </Marker>
          );
        })}
      </RNMapView>
    </MapBoundary>
  );
});
