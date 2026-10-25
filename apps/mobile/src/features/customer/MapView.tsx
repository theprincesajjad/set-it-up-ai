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
import { labelHeight, labelWidth, pinPlan, pinPriority, pinSubtitleL, type PinMembership } from "../../lib/explore";
import { useLocale } from "../../lib/i18n";
import { useTheme } from "../../theme";
import { ClusterPin, PIN_ANCHOR_X, PIN_WIDTH, pinLabel, ShopPin } from "./ShopPin";

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
  /** Screen rects of floating chrome (container coords): no pin is drawn under them. */
  chrome: { x1: number; y1: number; x2: number; y2: number }[];
}

export const ExploreMap = forwardRef<ExploreMapHandle, ExploreMapProps>(function ExploreMap({ shops, memberships, center, showsUser, selectedId, onSelect, onRegion, onFail, topInset, bottomInset, chrome }, ref) {
  const { scheme } = useTheme();
  const L = useLocale();
  const map = useRef<RNMapView>(null);
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);
  const [region, setRegion] = useState<Region>({ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  const [size, setSize] = useState({ width: 390, height: 800 });
  // Follow the centre (location / neighbourhood arriving later) until the user pans.
  const userMoved = useRef(false);
  // Pins, clusters and labels (lib/explore pinPlan): project to screen (linear is fine at street zoom).
  const layout = useMemo(() => {
    const x0 = region.longitude - region.longitudeDelta / 2;
    const y0 = region.latitude + region.latitudeDelta / 2;
    return pinPlan(
      withCoords.map((s) => {
        const mem = memberships[s.merchant.id];
        return {
          id: s.merchant.id,
          x: ((s.location!.lng! - x0) / region.longitudeDelta) * size.width,
          y: ((y0 - s.location!.lat!) / region.latitudeDelta) * size.height,
          priority: pinPriority({ selected: s.merchant.id === selectedId, rewardReady: (mem?.rewardsAvailableCount ?? 0) > 0, member: !!mem, openNow: s.openNow, distanceMetres: s.distanceMetres }),
          w: labelWidth(s.merchant.name, pinSubtitleL(L, s.merchant.vertical, mem ?? null, s).text),
          h: labelHeight(s.merchant.name),
        };
      }),
      { chrome, labelAvoid: [{ x1: size.width - 4, y1: -1e4, x2: size.width + 1e4, y2: 1e4 }, { x1: -1e4, y1: -1e4, x2: 4, y2: 1e4 }] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCoords, memberships, selectedId, region, size, JSON.stringify(chrome), L.locale]);
  const fitIds = (ids: string[]) => {
    const pts = withCoords.filter((s) => ids.includes(s.merchant.id));
    userMoved.current = true;
    map.current?.fitToCoordinates(
      pts.map((s) => ({ latitude: s.location!.lat!, longitude: s.location!.lng! })),
      { edgePadding: { top: topInset + 40, bottom: bottomInset + 40, left: 60, right: 160 }, animated: true },
    );
  };
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
        accessibilityLabel={L.t("ms.map.label")}
      >
        {withCoords.map((s) => {
          const mem = memberships[s.merchant.id] ?? null;
          const selected = s.merchant.id === selectedId;
          if (layout.hidden.has(s.merchant.id) && !selected) return null;
          const cluster = selected ? undefined : layout.clusters.get(s.merchant.id);
          const coordinate = { latitude: s.location!.lat!, longitude: s.location!.lng! };
          const anchor = { x: PIN_ANCHOR_X / PIN_WIDTH, y: 0.5 };
          if (cluster) {
            return (
              <Marker
                key={`c-${s.merchant.id}-${cluster.members.length}`}
                coordinate={coordinate}
                anchor={anchor}
                tracksViewChanges={false}
                zIndex={5}
                onPress={(e) => {
                  e.stopPropagation();
                  fitIds(cluster.members);
                }}
                accessibilityLabel={L.t("ms.map.shopsHere", { n: cluster.members.length })}
              >
                <ClusterPin count={cluster.members.length} />
              </Marker>
            );
          }
          const bare = !layout.labeled.has(s.merchant.id);
          const side = layout.left.has(s.merchant.id) ? "left" : "right";
          return (
            <Marker
              // tracksViewChanges is off for performance, so a changed look needs a fresh marker.
              key={`${s.merchant.id}-${selected ? 1 : 0}-${bare ? 1 : 0}-${side}`}
              coordinate={coordinate}
              onPress={(e) => {
                e.stopPropagation();
                onSelect(s.merchant.id);
              }}
              tracksViewChanges={false}
              anchor={anchor}
              zIndex={selected ? 10 : mem ? 2 : 1}
              accessibilityLabel={pinLabel(L, s, mem)}
            >
              <ShopPin shop={s} membership={mem} selected={selected} bare={bare} side={side} />
            </Marker>
          );
        })}
      </RNMapView>
    </MapBoundary>
  );
});
