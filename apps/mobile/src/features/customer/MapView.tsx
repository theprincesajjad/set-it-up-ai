/**
 * react-native-maps wrapper with MapPins per system.md § MapPin. Falls back to
 * the list (onFail) when maps aren't configured: Android needs
 * GOOGLE_MAPS_API_KEY at build time (app.config.ts → extra.mapsEnabledAndroid);
 * iOS uses Apple Maps with no key.
 */
import type { networkApi } from "@ll/shared";
import Constants from "expo-constants";
import { Component, useMemo, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import RNMapView, { Marker } from "react-native-maps";
import { useTheme } from "../../theme";
import { Star, Text, verticalIcon } from "../../ui";

const TORONTO = { latitude: 43.6532, longitude: -79.3832 };

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

function Pin({ vertical, selected, member }: { vertical: string; selected: boolean; member: boolean }) {
  const { c, vertical: vfn } = useTheme();
  const v = vfn(vertical);
  const Icon = verticalIcon(v.icon);
  const size = selected ? 48 : 36;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[styles.pin, { width: size, height: size, borderRadius: size / 2, backgroundColor: v.accent, borderColor: "#FFFFFF" }]}>
        <Icon size={selected ? 24 : 18} color={v.onAccent} />
        {member ? (
          <View style={[styles.star, { backgroundColor: c.accent }]}>
            <Star size={10} color={c.onAccent} fill={c.onAccent} />
          </View>
        ) : null}
      </View>
      <View style={[styles.tip, { borderTopColor: v.accent }]} />
    </View>
  );
}

export function MapView({
  shops,
  user,
  selectedId,
  onSelect,
  onFail,
}: {
  shops: networkApi.ShopListItemDto[];
  user: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFail: () => void;
}) {
  const withCoords = useMemo(() => shops.filter((s) => s.location?.lat != null && s.location?.lng != null), [shops]);
  const center = user ? { latitude: user.lat, longitude: user.lng } : withCoords[0]?.location ? { latitude: withCoords[0].location.lat!, longitude: withCoords[0].location.lng! } : TORONTO;
  return (
    <MapBoundary onFail={onFail}>
      <RNMapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation={!!user}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onPress={() => onSelect(null)}
        accessibilityLabel="Map of shops"
      >
        {withCoords.map((s) => (
          <Marker
            key={s.merchant.id}
            coordinate={{ latitude: s.location!.lat!, longitude: s.location!.lng! }}
            onPress={() => onSelect(s.merchant.id)}
            tracksViewChanges={false}
            accessibilityLabel={`${s.merchant.name}${s.isMember ? ", member" : ""}`}
          >
            <Pin vertical={s.merchant.vertical} selected={s.merchant.id === selectedId} member={s.isMember} />
            {s.merchant.id === selectedId ? (
              <View style={styles.label}>
                <Text variant="caption">{s.merchant.name}</Text>
              </View>
            ) : null}
          </Marker>
        ))}
      </RNMapView>
    </MapBoundary>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: "center", justifyContent: "center", borderWidth: 2 },
  tip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
  star: { position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { backgroundColor: "#FFFFFF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 2 },
});
