import { categoryLabels, layout, shadows } from "@ll/design-tokens";
import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Linking, Platform, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../../copy/en-CA";
import { useDeviceLocation } from "../../features/customer/location";
import { ExploreMap, mapsAvailable, TORONTO, type ExploreMapHandle } from "../../features/customer/MapView";
import { useProfile, useWallet } from "../../features/customer/queries";
import { ShopBody, useShopModel } from "../../features/customer/ShopBody";
import { useHideTabBar } from "../../features/tabBar";
import { AUDIENCE_LABELS, byDistance, exploreSections, filterShops, MAP_CATEGORIES, movedEnough, pinSubtitle, stripHeader, type Audience, type MapCategoryId, type PinMembership } from "../../lib/explore";
import { formatDistance } from "../../lib/format";
import { perkHeadline, perkProgress } from "../../lib/perks";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { typo, useTheme } from "../../theme";
import {
  Banner,
  Button,
  CategoryIcon,
  Chip,
  ChevronDown,
  DetentSheet,
  EmptyState,
  haptic,
  IconButton,
  List,
  ListRow,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  PerkCard,
  Search,
  Sheet,
  ShopTile,
  SkeletonList,
  Text,
  useTabBarSpace,
  X,
} from "../../ui";

type Shop = networkApi.ShopListItemDto;

/** Category rail: object icons with lowercase captions (Corner), right above the tab bar. */
function CategoryRail({ value, onChange, onMap }: { value: MapCategoryId; onChange: (c: MapCategoryId) => void; onMap: boolean }) {
  const { c } = useTheme();
  const halo = onMap ? { textShadowColor: c.bg, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityRole="tablist">
      {MAP_CATEGORIES.map((cat) => {
        const on = cat === value;
        return (
          <Pressable
            key={cat}
            accessibilityRole="tab"
            accessibilityLabel={categoryLabels[cat]}
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic.select();
              onChange(cat);
            }}
            style={({ pressed }) => [styles.railItem, { transform: pressed ? [{ scale: 0.94 }] : undefined }]}
          >
            <View style={[styles.railIcon, on ? { backgroundColor: c.bg, ...shadows.float.native } : null]}>
              <CategoryIcon category={cat} size={34} />
            </View>
            <Text variant="categoryLabel" color={on ? "fg" : "fgMuted"} style={halo}>
              {categoryLabels[cat]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Explore is home (foundations § Customer app): full-bleed near-white map, floating chrome, object pins, shop sheet. */
export default function Explore() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { prefs, updatePrefs } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [prompt, setPrompt] = useState(!prefs.locationPrompted);
  const [mapOk, setMapOk] = useState(mapsAvailable());
  const [listMode, setListMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<MapCategoryId>("all");
  const [openNow, setOpenNow] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [audience, setAudience] = useState<Audience>("all");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detent, setDetent] = useState(0);
  const [areaH, setAreaH] = useState(700);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<ExploreMapHandle>(null);

  const hoodSlug = prefs.neighbourhoodSlug ?? profile.data?.homeNeighbourhood?.slug ?? null;
  const hoods = useQuery({ queryKey: qk.neighbourhoods, queryFn: api.network.neighbourhoods, staleTime: 60 * 60_000 });
  const hood = useQuery({ queryKey: ["hood", hoodSlug ?? ""], queryFn: () => api.network.neighbourhood(hoodSlug!), enabled: !!hoodSlug, staleTime: 30 * 60_000 });
  const hoodName = hood.data?.neighbourhood.name ?? profile.data?.homeNeighbourhood?.name ?? null;
  const origin = searchCenter ?? loc.coords ?? (hood.data?.neighbourhood.centerLat != null && hood.data.neighbourhood.centerLng != null ? { lat: hood.data.neighbourhood.centerLat, lng: hood.data.neighbourhood.centerLng } : null);
  const params = {
    ...(origin ? { lat: origin.lat, lng: origin.lng } : hoodSlug ? { neighbourhood: hoodSlug } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    limit: 100,
  };
  const shops = useQuery({ queryKey: qk.shops(JSON.stringify(params)), queryFn: () => api.network.shops(params) });
  const all = shops.data?.items ?? [];
  // No neighbourhood picked yet: name the strip by where most of the shops around you are.
  const placeName = useMemo(() => {
    if (hoodName) return hoodName;
    const counts = new Map<string, number>();
    for (const x of all.slice(0, 20)) if (x.merchant.neighbourhoodId) counts.set(x.merchant.neighbourhoodId, (counts.get(x.merchant.neighbourhoodId) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return hoods.data?.items.find((h) => h.id === top)?.name ?? null;
  }, [hoodName, all, hoods.data]);

  const memberships = useMemo(() => {
    const out: Record<string, PinMembership> = {};
    for (const m of wallet.data?.items ?? []) {
      out[m.merchant.id] = { balance: m.balance, rewardsAvailableCount: m.rewardsAvailableCount, terminology: m.terminology, earnType: m.program?.earnType ?? null, stampGoal: m.program?.stampGoal ?? null };
    }
    return out;
  }, [wallet.data]);
  const readySet = useMemo(() => new Set(Object.entries(memberships).filter(([, m]) => m.rewardsAvailableCount > 0).map(([id]) => id)), [memberships]);
  const visible = useMemo(
    () => byDistance(filterShops(all, { category, openNow, audience, rewardsReady: readyOnly ? readySet : null })),
    [all, category, openNow, audience, readyOnly, readySet],
  );
  const sel = visible.find((s) => s.merchant.id === selected) ?? null;
  // A filter that narrows the shops frames what's left (rewards ready may be across the strip).
  const filterKey = `${category}|${openNow}|${audience}|${readyOnly}`;
  useEffect(() => {
    if (filterKey === "all|false|all|false") return;
    mapRef.current?.fit(visible.filter((s) => s.location?.lat != null && s.location?.lng != null).map((s) => ({ lat: s.location!.lat!, lng: s.location!.lng! })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);
  const model = useShopModel(sel?.merchant.slug ?? null);
  useHideTabBar(!!sel);
  const perk = hood.data?.perks[0] ?? null;
  const progress = perk ? perkProgress(perk, wallet.data?.items ?? [], hood.data?.neighbourhood.id ?? null) : null;

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      setDetent(0);
      const s = visible.find((x) => x.merchant.id === id);
      if (s) haptic.select();
      if (s?.location?.lat != null && s.location.lng != null) mapRef.current?.focus(s.location.lat, s.location.lng);
    },
    [visible],
  );

  const pickAudience = () => {
    const order: Audience[] = ["all", "mine", "new"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...order.map((a) => AUDIENCE_LABELS[a]), "Cancel"], cancelButtonIndex: order.length, title: "Show" },
        (i) => {
          const a = order[i];
          if (a) setAudience(a);
        },
      );
    } else setAudienceOpen(true);
  };

  const recenter = async () => {
    haptic.tap();
    const ok = loc.status === "granted" ? true : await loc.request();
    if (ok && loc.coords) {
      setSearchCenter(null);
      setMapCenter(null);
      mapRef.current?.focus(loc.coords.lat, loc.coords.lng);
    }
  };

  const filters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled">
      <Chip float={!listMode && mapOk} label={audience === "all" ? "my shops" : AUDIENCE_LABELS[audience]} trailingIcon={ChevronDown} selected={audience !== "all"} onPress={pickAudience} accessibilityLabel={`Show: ${AUDIENCE_LABELS[audience]}`} />
      <Chip float={!listMode && mapOk} label="open now" selected={openNow} onPress={() => setOpenNow((v) => !v)} />
      {readySet.size > 0 ? <Chip float={!listMode && mapOk} label="rewards ready" selected={readyOnly} onPress={() => setReadyOnly((v) => !v)} /> : null}
    </ScrollView>
  );

  const searchField = (
    <View style={[styles.searchField, { backgroundColor: c.bg }, shadows.float.native]}>
      <Search size={18} color={c.fgMuted} strokeWidth={2} />
      <TextInput
        autoFocus
        value={q}
        onChangeText={setQ}
        placeholder={placeName ? `Search ${placeName}` : "Search shops or streets"}
        placeholderTextColor={c.fgSubtle}
        accessibilityLabel="Search shops"
        returnKeyType="search"
        style={[typo("body"), { flex: 1, color: c.fg, paddingVertical: 8 }]}
      />
      <IconButton
        icon={X}
        label="Close search"
        size={32}
        onPress={() => {
          setQ("");
          setSearching(false);
        }}
      />
    </View>
  );

  const topRow = searching ? (
    <View style={styles.topRow}>{searchField}</View>
  ) : (
    <View style={styles.topRow}>
      <IconButton icon={Search} label="Search shops" variant="float" size={44} onPress={() => setSearching(true)} />
      <View style={{ flex: 1 }} />
      <View style={[styles.group, { backgroundColor: c.bg }, shadows.float.native]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Neighbourhood: ${placeName ?? "not set"}. Change`} onPress={() => setHoodOpen(true)} style={styles.groupItem}>
          <MapPin size={16} color={c.fg} strokeWidth={2} />
          <Text variant="mapLabel" numberOfLines={1} style={{ maxWidth: 150 }}>
            {(placeName ?? "your street").toLowerCase()}
          </Text>
        </Pressable>
        <View style={[styles.groupRule, { backgroundColor: c.line }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={listMode ? "Show map" : "Show list"} onPress={() => setListMode((v) => !v)} style={[styles.groupItem, { paddingHorizontal: 12 }]} disabled={!mapOk}>
          {listMode || !mapOk ? <MapIcon size={18} color={mapOk ? c.fg : c.fgSubtle} strokeWidth={2} /> : <List size={18} color={c.fg} strokeWidth={2} />}
        </Pressable>
      </View>
    </View>
  );

  const empty = q ? (
    <EmptyState icon={Search} title={t("empty.mapSearch.title", { query: q })} body={t("empty.mapSearch.body")} actionLabel="Clear search" onAction={() => setQ("")} />
  ) : audience !== "all" || openNow || readyOnly || category !== "all" ? (
    <EmptyState
      title="Nothing matches those filters"
      actionLabel="Clear filters"
      onAction={() => {
        setAudience("all");
        setOpenNow(false);
        setReadyOnly(false);
        setCategory("all");
      }}
    />
  ) : (
    <EmptyState icon={MapPin} title={t("empty.noNeighbourhood.title")} body={t("empty.noNeighbourhood.body")} actionLabel="Suggest my street" onAction={() => router.push("/settings/suggest")} />
  );

  const sheets = (
    <>
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
              size="lg"
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
              variant="ghost"
              size="lg"
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
        <Text color="fgMuted">We use your location only while the app is open, to sort shops by distance. Or pick your neighbourhood.</Text>
      </Sheet>
      <Sheet visible={audienceOpen} onClose={() => setAudienceOpen(false)} title="Show" scroll={false}>
        <View>
          {(["all", "mine", "new"] as Audience[]).map((a, i) => (
            <ListRow
              key={a}
              title={AUDIENCE_LABELS[a]}
              selected={audience === a}
              divider={i < 2}
              onPress={() => {
                setAudience(a);
                setAudienceOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
      <Sheet visible={hoodOpen} onClose={() => setHoodOpen(false)} title="Your neighbourhood">
        <View>
          {(hoods.data?.items ?? []).map((h, i, arr) => (
            <ListRow
              key={h.id}
              title={h.name}
              subtitle={`${h.shopCount} shops`}
              selected={h.slug === hoodSlug}
              divider={i < arr.length - 1}
              onPress={() => {
                updatePrefs({ neighbourhoodSlug: h.slug });
                void api.me.updateProfile({ homeNeighbourhoodId: h.id }).catch(() => undefined);
                setSearchCenter(null);
                setHoodOpen(false);
              }}
            />
          ))}
        </View>
        {hoods.data?.items.length === 0 ? <Text color="fgMuted">{t("empty.noNeighbourhood.body")}</Text> : null}
        {loc.status !== "granted" ? (
          <Button
            variant="secondary"
            iconStart={LocateFixed}
            onPress={async () => {
              updatePrefs({ locationPrompted: true });
              await loc.request();
              setHoodOpen(false);
            }}
          >
            Use my location
          </Button>
        ) : null}
      </Sheet>
    </>
  );

  const row = (s: Shop, i: number, n: number) => {
    const mem = memberships[s.merchant.id] ?? null;
    const sub = pinSubtitle(s.merchant.vertical, mem);
    return (
      <ShopTile
        key={s.merchant.id}
        variant="list"
        shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor, distanceM: s.distanceMetres }}
        subtitle={[sub.text, formatDistance(s.distanceMetres)].filter(Boolean).join(" · ")}
        rewardReady={sub.accent}
        divider={i < n - 1}
        onPress={() => router.push(`/shop/${s.merchant.slug}`)}
      />
    );
  };

  // ------------------------------------------------------------- list (toggle, or maps unavailable)
  if (!mapOk || listMode) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ paddingTop: 4 }}>{topRow}</View>
        <View style={{ paddingTop: 10 }}>{filters}</View>
        <View style={{ paddingTop: 6 }}>
          <CategoryRail value={category} onChange={setCategory} onMap={false} />
        </View>
        {loc.status === "denied" ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Banner variant="neutral" actionLabel="Turn on" onAction={() => Linking.openSettings()}>
              {t("err.location.denied")}
            </Banner>
          </View>
        ) : null}
        <SectionList
          sections={exploreSections(visible)}
          keyExtractor={(s) => s.merchant.id}
          renderItem={({ item, index, section }) => <View style={{ paddingHorizontal: 16 }}>{row(item, index, section.data.length)}</View>}
          renderSectionHeader={({ section }) => (
            <View style={[styles.listHeader, { backgroundColor: c.bg, borderBottomColor: c.line }]}>
              <Text variant="metaStrong" color="fgMuted">
                {section.title}
              </Text>
            </View>
          )}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 16 }}>
              <Text variant="largeTitle">{stripHeader(visible.length, placeName).toLowerCase()}</Text>
              {perk && progress ? <PerkCard headline={perkHeadline(perk, hoodName)} {...progress} /> : null}
            </View>
          }
          ListEmptyComponent={
            shops.isLoading ? (
              <View style={{ padding: 16 }}>
                <SkeletonList rows={5} rowHeight={56} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16 }}>{empty}</View>
            )
          }
          contentContainerStyle={{ paddingBottom: tabSpace + 16 }}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
        />
        {sheets}
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------- map
  const peekH = sel?.isMember ? 330 : 300;
  const detents = [peekH, Math.round(areaH - insets.top - 8)];
  const located = all.filter((x) => x.location?.lat != null && x.location?.lng != null);
  const centroid = located.length ? { lat: located.reduce((a, x) => a + x.location!.lat!, 0) / located.length, lng: located.reduce((a, x) => a + x.location!.lng!, 0) / located.length } : null;
  const center = origin ?? centroid ?? TORONTO;
  const showSearchArea = !sel && !!mapCenter && movedEnough(mapCenter, origin ?? TORONTO);
  const railH = 78;
  const chromeTop = insets.top + 8 + 44 + 10 + 34;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} onLayout={(e: LayoutChangeEvent) => setAreaH(e.nativeEvent.layout.height)}>
      <ExploreMap
        ref={mapRef}
        shops={visible}
        memberships={memberships}
        center={center}
        showsUser={loc.status === "granted"}
        selectedId={sel?.merchant.id ?? null}
        onSelect={(id) => (id ? select(id) : setSelected(null))}
        onRegion={setMapCenter}
        onFail={() => setMapOk(false)}
        topInset={chromeTop}
        bottomInset={sel ? (detents[detent] ?? peekH) + 8 : tabSpace + railH + 8}
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {topRow}
        <View style={{ paddingTop: 10 }}>{filters}</View>
        {showSearchArea ? (
          <View style={{ alignItems: "center", marginTop: 12 }} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                if (mapCenter) setSearchCenter(mapCenter);
                setMapCenter(null);
              }}
              style={[styles.searchHere, { backgroundColor: c.fg }, shadows.float.native]}
            >
              <Text variant="mapLabel" rawColor={c.bg}>
                search here
              </Text>
            </Pressable>
          </View>
        ) : null}
        {loc.status === "denied" ? (
          <View style={{ marginTop: 10, paddingHorizontal: 16 }}>
            <Banner variant="neutral" actionLabel="Turn on" onAction={() => Linking.openSettings()}>
              {t("err.location.denied")}
            </Banner>
          </View>
        ) : null}
        {!shops.isLoading && visible.length === 0 ? (
          <View style={{ marginTop: 12, marginHorizontal: 16, padding: 16, paddingVertical: 4, borderRadius: 16, backgroundColor: c.bg, ...shadows.float.native }}>{empty}</View>
        ) : null}
      </View>

      {!sel ? (
        <View style={[styles.bottom, { bottom: tabSpace }]} pointerEvents="box-none">
          <View style={styles.recenterRow} pointerEvents="box-none">
            <Pressable accessibilityRole="button" accessibilityLabel="Recenter on my location" onPress={recenter} style={({ pressed }) => [styles.recenter, { backgroundColor: c.fg, opacity: pressed ? 0.85 : 1 }, shadows.float.native]}>
              <LocateFixed size={20} color={c.bg} strokeWidth={2} />
            </Pressable>
          </View>
          <CategoryRail value={category} onChange={setCategory} onMap />
        </View>
      ) : null}

      {sel ? (
        <DetentSheet
          key={sel.merchant.id}
          detents={detents}
          index={detent}
          onIndexChange={setDetent}
          containerHeight={areaH}
          onDismiss={() => setSelected(null)}
          accessibilityLabel={sel.merchant.name}
          corner={<IconButton icon={X} label="Close shop" variant="secondary" size={32} onPress={() => setSelected(null)} />}
        >
          <ScrollView scrollEnabled={detent === detents.length - 1} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
            {model.shop.data ? (
              <>
                <ShopBody model={model} variant="sheet" peek={detent === 0} />
                {detent === 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => setDetent(1)} style={{ paddingTop: 16 }}>
                    <Text variant="metaStrong" color="fgMuted">
                      Swipe up for rewards and hours
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <SkeletonList rows={3} rowHeight={44} />
            )}
          </ScrollView>
        </DetentSheet>
      ) : null}
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 0, right: 0, top: 0 },
  topRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10, minHeight: 44 },
  group: { flexDirection: "row", alignItems: "center", height: layout.chrome, borderRadius: 999 },
  groupItem: { flexDirection: "row", alignItems: "center", gap: 6, height: layout.chrome, paddingHorizontal: 14 },
  groupRule: { width: StyleSheet.hairlineWidth * 2, height: 20 },
  searchField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: layout.chrome, borderRadius: 999, paddingLeft: 14, paddingRight: 6 },
  filters: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  searchHere: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0 },
  recenterRow: { alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 6 },
  recenter: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  rail: { gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
  railItem: { alignItems: "center", gap: 2, minWidth: 56, paddingTop: 2 },
  railIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  listHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: 0 },
});
