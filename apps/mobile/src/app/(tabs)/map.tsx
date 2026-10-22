import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../../copy/en-CA";
import { useDeviceLocation } from "../../features/customer/location";
import { MapView, mapsAvailable } from "../../features/customer/MapView";
import { formatDistance, openStatus } from "../../lib/format";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { typo, useTheme } from "../../theme";
import { Banner, Button, Chip, EmptyState, IconButton, LocateFixed, MapPin, Search, SegmentedControl, Sheet, ShopTile, SkeletonList, Text } from "../../ui";

const VERTICAL_CHIPS = [
  { key: "", label: "All" },
  { key: "cafe", label: "Cafés" },
  { key: "restaurant", label: "Restaurants" },
  { key: "bakery", label: "Bakeries" },
  { key: "grocery", label: "Grocery" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "salon", label: "Salons" },
  { key: "barber", label: "Barbers" },
  { key: "repair_auto", label: "Auto" },
  { key: "repair_electronics", label: "Phone repair" },
  { key: "retail", label: "Shops" },
];

/** 4. Map: full-bleed map + list sheet, or the list view when maps aren't configured / location is off. */
export default function MapScreen() {
  const { c } = useTheme();
  const { prefs, updatePrefs } = useSession();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [prompt, setPrompt] = useState(!prefs.locationPrompted);
  const [view, setView] = useState<"map" | "list">(mapsAvailable() ? "map" : "list");
  const [q, setQ] = useState("");
  const [vertical, setVertical] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const params = {
    ...(loc.coords ? { lat: loc.coords.lat, lng: loc.coords.lng } : prefs.neighbourhoodSlug ? { neighbourhood: prefs.neighbourhoodSlug } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(vertical ? { vertical } : {}),
    limit: 100,
  };
  const shops = useQuery({ queryKey: qk.shops(JSON.stringify(params)), queryFn: () => api.network.shops(params) });
  const items = shops.data?.items ?? [];
  const sel = useMemo(() => items.find((s) => s.merchant.id === selected) ?? null, [items, selected]);

  const directions = (s: networkApi.ShopListItemDto) => {
    if (!s.location) return;
    const { lat, lng, address } = s.location;
    const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(address);
    void Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };

  const list = (
    <View style={{ gap: 4 }}>
      {shops.isLoading ? (
        <SkeletonList rows={4} rowHeight={64} />
      ) : items.length === 0 ? (
        q ? (
          <EmptyState icon={Search} title={t("empty.mapSearch.title", { query: q })} body={t("empty.mapSearch.body")} actionLabel="Clear search" onAction={() => setQ("")} />
        ) : (
          <EmptyState icon={MapPin} title={t("empty.noNeighbourhood.title")} body={t("empty.noNeighbourhood.body")} actionLabel="Suggest my street" onAction={() => router.push("/settings/suggest")} />
        )
      ) : (
        items.map((s) => (
          <ShopTile
            key={s.merchant.id}
            variant="list"
            selected={s.merchant.id === selected}
            shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, distanceM: s.distanceMetres }}
            subtitle={[s.location?.address, s.distanceMetres != null ? formatDistance(s.distanceMetres, true) : null].filter(Boolean).join(" · ")}
            openLabel={openStatus(s.location?.hours, s.openNow)}
            balance={s.isMember && s.myBalance != null ? { value: s.myBalance, terminology: s.terminology } : null}
            onPress={() => router.push(`/shop/${s.merchant.slug}`)}
          />
        ))
      )}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Search size={20} color={c.fgMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search shops or streets"
            placeholderTextColor={c.fgMuted}
            accessibilityLabel="Search shops or streets"
            returnKeyType="search"
            style={[typo("body"), { flex: 1, color: c.fg, paddingVertical: 10 }]}
          />
        </View>
        {mapsAvailable() ? (
          <View style={{ width: 150 }}>
            <SegmentedControl
              accessibilityLabel="View"
              options={[
                { value: "map", label: "Map" },
                { value: "list", label: "List" },
              ]}
              value={view}
              onChange={setView}
            />
          </View>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
        {VERTICAL_CHIPS.map((v) => (
          <Chip key={v.key || "all"} label={v.label} selected={vertical === v.key} onPress={() => setVertical(v.key)} />
        ))}
      </ScrollView>
      {loc.status === "denied" ? (
        <Banner variant="info" actionLabel="Turn on" onAction={() => Linking.openSettings()}>
          {t("err.location.denied")}
        </Banner>
      ) : null}

      {view === "map" ? (
        <View style={{ flex: 1 }}>
          <MapView shops={items} user={loc.coords} selectedId={selected} onSelect={setSelected} onFail={() => setView("list")} />
          <View style={[styles.fab, { backgroundColor: c.surface, borderColor: c.border }]}>
            <IconButton icon={LocateFixed} label="Show my location" onPress={() => (loc.status === "granted" ? loc.refresh() : loc.request())} />
          </View>
          <View style={[styles.peek, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
            {sel ? (
              <View style={{ gap: 8 }}>
                <ShopTile
                  variant="compact"
                  shop={{ name: sel.merchant.name, vertical: sel.merchant.vertical, logoUrl: sel.merchant.logoUrl, distanceM: sel.distanceMetres }}
                  openLabel={openStatus(sel.location?.hours, sel.openNow)}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button variant="secondary" style={{ flex: 1 }} onPress={() => directions(sel)}>
                    Directions
                  </Button>
                  <Button style={{ flex: 1 }} onPress={() => router.push(`/shop/${sel.merchant.slug}`)}>
                    View shop
                  </Button>
                </View>
              </View>
            ) : (
              <Button variant="ghost" onPress={() => setView("list")}>
                {`${items.length} shops nearby · See list`}
              </Button>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>{list}</ScrollView>
      )}

      <Sheet
        visible={prompt}
        onClose={() => {
          setPrompt(false);
          updatePrefs({ locationPrompted: true });
        }}
        title="See shops near you"
        scroll={false}
        footer={
          <>
            <Button
              fullWidth
              onPress={async () => {
                setPrompt(false);
                updatePrefs({ locationPrompted: true });
                await loc.request();
              }}
            >
              Allow while using
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onPress={() => {
                setPrompt(false);
                updatePrefs({ locationPrompted: true });
              }}
            >
              Not now
            </Button>
          </>
        }
      >
        <Text color="fgMuted">We use your location only while the app is open, to sort shops by distance. Or pick your neighbourhood on Home.</Text>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, minHeight: 48 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  fab: { position: "absolute", right: 16, bottom: 136, borderRadius: 24, borderWidth: 1 },
  peek: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, minHeight: 96 },
});
