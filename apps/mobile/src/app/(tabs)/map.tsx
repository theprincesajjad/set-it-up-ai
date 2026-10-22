import { categoryLabels, layout } from "@ll/design-tokens";
import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Linking, Platform, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../../copy/en-CA";
import { useDeviceLocation } from "../../features/customer/location";
import { ExploreMap, mapsAvailable, TORONTO, type ExploreMapHandle } from "../../features/customer/MapView";
import { useProfile, useWallet } from "../../features/customer/queries";
import { ShopBody, ShopCardCta, useShopModel } from "../../features/customer/ShopBody";
import { useUnreadCount } from "../../features/customer/inbox";
import { useHideTabBar } from "../../features/tabBar";
import { AUDIENCE_LABELS, byDistance, exploreSections, filterShops, MAP_CATEGORIES, movedEnough, pinSubtitle, stripHeader, type Audience, type MapCategoryId, type PinMembership } from "../../lib/explore";
import { shortHood } from "../../lib/discover";
import { formatDistance } from "../../lib/format";
import { useLocale } from "../../lib/i18n";
import { perkHeadline, perkProgress } from "../../lib/perks";
import { shopMatchesHalal } from "../../lib/restaurant";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { disp, typo, useTheme } from "../../theme";
import {
  Banner,
  BellGlyph,
  Button,
  CategoryIcon,
  ChevronDownGlyph,
  ChevronLeftGlyph,
  CloseGlyph,
  DetentSheet,
  EmptyState,
  floatShadow,
  hairline,
  haptic,
  IconButton,
  List,
  ListRow,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  PerkCard,
  RecenterGlyph,
  Search,
  SearchGlyph,
  shadow,
  Sheet,
  ShopTile,
  SkeletonRows,
  SkeletonShop,
  ErrorState,
  Text,
  useTabBarBottom,
  useTabBarSpace,
  X,
} from "../../ui";

type Shop = networkApi.ShopListItemDto;

/**
 * Category rail (canvas Main.dc.html): 46 pt white circles holding 30 pt objects, 12 pt lowercase Bricolage
 * captions; the selected one gets a 2 pt black ring and a black caption.
 */
function CategoryRail({ value, onChange, onMap }: { value: MapCategoryId; onChange: (c: MapCategoryId) => void; onMap: boolean }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} accessibilityRole="tablist" style={{ overflow: "visible" }}>
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
            <View
              style={[
                styles.railIcon,
                { backgroundColor: c.bg },
                on
                  ? [shadow(`0 0 0 2px ${c.fg}`, {}), Platform.OS === "web" ? null : { borderWidth: 2, borderColor: c.fg }]
                  : onMap
                    ? shadow("0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.08)")
                    : { backgroundColor: c.bgSubtle },
              ]}
            >
              <CategoryIcon category={cat} size={30} />
            </View>
            <Text style={disp(12, 700, 15)} rawColor={on ? c.fg : c.fgMuted}>
              {categoryLabels[cat]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A white filter capsule over the map (canvas: 36 pt, Bricolage 700 14, float shadow); black when on. */
function MapChip({ label, selected, onPress, chevron, dot, float, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; chevron?: boolean; dot?: boolean; float: boolean; accessibilityLabel?: string }) {
  const { c } = useTheme();
  const fg = selected ? c.bg : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.mapChip, { backgroundColor: selected ? c.fg : float ? c.bg : c.bgSubtle, opacity: pressed ? 0.85 : 1 }, float ? floatShadow : null]}
    >
      {dot ? <View style={[styles.openDot, { backgroundColor: c.positive }]} /> : null}
      <Text style={disp(14, 700, 18)} rawColor={fg}>
        {label}
      </Text>
      {chevron ? <ChevronDownGlyph size={12} strokeWidth={2.4} color={fg} /> : null}
    </Pressable>
  );
}

/** Explore is home (foundations § Customer app): full-bleed near-white map, floating chrome, object pins, shop sheet. */
export default function Explore() {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  const tabBarBottom = useTabBarBottom();
  // The artboard's top chrome sits at y 56 under a 47 pt status bar.
  const topY = insets.top > 0 ? insets.top + 9 : 56;
  const { prefs, updatePrefs } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const { t: tr } = useLocale();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [prompt, setPrompt] = useState(!prefs.locationPrompted);
  const [mapOk, setMapOk] = useState(mapsAvailable());
  const [listMode, setListMode] = useState(false);
  const params0 = useLocalSearchParams<{ search?: string }>();
  const [searching, setSearching] = useState(params0.search === "1");
  useEffect(() => {
    if (params0.search === "1") setSearching(true);
  }, [params0.search]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<MapCategoryId>("all");
  const [openNow, setOpenNow] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  /** Halal food filter: GET /v1/network/shops?halal=1 (the shop's own tags); older servers ignore it, so visible shops are filtered here too. */
  const [halal, setHalal] = useState(false);
  const [audience, setAudience] = useState<Audience>("all");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detent, setDetent] = useState(0);
  const [areaH, setAreaH] = useState(700);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<ExploreMapHandle>(null);
  const unread = useUnreadCount();

  const hoodSlug = prefs.neighbourhoodSlug ?? profile.data?.homeNeighbourhood?.slug ?? null;
  const hoods = useQuery({ queryKey: qk.neighbourhoods, queryFn: api.network.neighbourhoods, staleTime: 60 * 60_000 });
  const hood = useQuery({ queryKey: ["hood", hoodSlug ?? ""], queryFn: () => api.network.neighbourhood(hoodSlug!), enabled: !!hoodSlug, staleTime: 30 * 60_000 });
  const hoodName = hood.data?.neighbourhood.name ?? profile.data?.homeNeighbourhood?.name ?? null;
  const origin = searchCenter ?? loc.coords ?? (hood.data?.neighbourhood.centerLat != null && hood.data.neighbourhood.centerLng != null ? { lat: hood.data.neighbourhood.centerLat, lng: hood.data.neighbourhood.centerLng } : null);
  const params = {
    ...(origin ? { lat: origin.lat, lng: origin.lng } : hoodSlug ? { neighbourhood: hoodSlug } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(halal ? { halal: "1" as const } : {}),
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
    () => byDistance(filterShops(all, { category, openNow, audience, rewardsReady: readyOnly ? readySet : null })).filter((s) => !halal || shopMatchesHalal(s, "1")),
    [all, category, openNow, audience, readyOnly, readySet, halal],
  );
  const sel = visible.find((s) => s.merchant.id === selected) ?? null;
  // A filter that narrows the shops frames what's left (rewards ready may be across the strip).
  const filterKey = `${category}|${openNow}|${audience}|${readyOnly}|${halal}`;
  useEffect(() => {
    if (filterKey === "all|false|all|false|false") return;
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
    },
    [visible],
  );
  // Focus after the render that sets the sheet's map padding, so the pin lands in the free area above it.
  const selLat = sel?.location?.lat;
  const selLng = sel?.location?.lng;
  useEffect(() => {
    if (selLat != null && selLng != null) mapRef.current?.focus(selLat, selLng);
  }, [sel?.merchant.id, selLat, selLng]);

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

  const float = !listMode && mapOk;
  const filters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyboardShouldPersistTaps="handled" style={{ overflow: "visible" }}>
      <MapChip float={float} label={audience === "all" ? "my shops" : AUDIENCE_LABELS[audience]} chevron selected={audience !== "all"} onPress={pickAudience} accessibilityLabel={`Show: ${AUDIENCE_LABELS[audience]}`} />
      <MapChip float={float} label="open now" dot selected={openNow} onPress={() => setOpenNow((v) => !v)} />
      {readySet.size > 0 ? <MapChip float={float} label="rewards ready" selected={readyOnly} onPress={() => setReadyOnly((v) => !v)} /> : null}
      <MapChip float={float} label={tr("diet.halal").toLowerCase()} selected={halal} onPress={() => setHalal((v) => !v)} accessibilityLabel={tr("rest.filter.halal.a11y")} />
    </ScrollView>
  );

  const searchField = (
    <View style={[styles.searchField, { backgroundColor: c.bg }, floatShadow]}>
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
      <Pressable accessibilityRole="button" accessibilityLabel="Search shops" onPress={() => setSearching(true)} style={({ pressed }) => [styles.round, { backgroundColor: c.bg, opacity: pressed ? 0.85 : 1 }, floatShadow]}>
        <SearchGlyph size={20} color={c.fg} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {listMode || !mapOk ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Show map" disabled={!mapOk} onPress={() => setListMode(false)} style={({ pressed }) => [styles.round, { backgroundColor: c.bgSubtle, opacity: pressed ? 0.6 : mapOk ? 1 : 0.4 }]}>
          <MapIcon size={20} color={c.fg} strokeWidth={1.9} />
        </Pressable>
      ) : null}
      {/* Grouped capsule (Corner): the neighbourhood ▾ · the bell with an accent dot while something is unread. */}
      <View style={[styles.group, { backgroundColor: c.bg }, floatShadow]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Neighbourhood: ${placeName ?? "not set"}. Change`} onPress={() => setHoodOpen(true)} style={styles.groupItem}>
          <Text style={[disp(15, 800, 18), { maxWidth: 170 }]} numberOfLines={1}>
            {shortHood(placeName) || "your street"}
          </Text>
          <ChevronDownGlyph size={14} color={c.fg} />
        </Pressable>
        <View style={[styles.groupRule, { backgroundColor: c.line }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onPress={() => {
            haptic.select();
            router.push("/notifications");
          }}
          style={({ pressed }) => [styles.bell, { opacity: pressed ? 0.6 : 1 }]}
        >
          <BellGlyph size={20} color={c.fg} />
          {unread > 0 ? <View style={[styles.bellDot, { backgroundColor: c.accent, borderColor: c.bg }]} /> : null}
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
        setHalal(false);
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
        {mapOk ? (
          <Button
            variant="secondary"
            iconStart={List}
            accessibilityLabel="Show list"
            onPress={() => {
              setHoodOpen(false);
              setListMode(true);
            }}
          >
            Show as a list
          </Button>
        ) : null}
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
              {/* Count in the display face, the place under it: no widow on long neighbourhood names. */}
              <View style={{ gap: 2 }}>
                <Text variant="largeTitle" tabular>{`${visible.length} ${visible.length === 1 ? "shop" : "shops"}`}</Text>
                <Text variant="body" color="fgMuted">
                  {stripHeader(visible.length, placeName).replace(/^\d+ shops? /, "").toLowerCase()}
                </Text>
              </View>
              {perk && progress ? <PerkCard headline={perkHeadline(perk, hoodName)} {...progress} /> : null}
            </View>
          }
          ListEmptyComponent={
            shops.isLoading ? (
              <View style={{ paddingHorizontal: 16 }}>
                <SkeletonRows rows={6} trailing={false} />
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
  // Canvas ShopSheet: the sheet's top edge sits at y 252 (592 pt tall on an 844 pt phone).
  const fullH = Math.round(areaH - insets.top - 8);
  const peekH = Math.min(592, fullH - 120);
  const detents = [peekH, fullH];
  const located = all.filter((x) => x.location?.lat != null && x.location?.lng != null);
  const centroid = located.length ? { lat: located.reduce((a, x) => a + x.location!.lat!, 0) / located.length, lng: located.reduce((a, x) => a + x.location!.lng!, 0) / located.length } : null;
  const center = origin ?? centroid ?? TORONTO;
  const showSearchArea = !sel && !!mapCenter && movedEnough(mapCenter, origin ?? TORONTO);
  // Canvas geometry: rail captions end 31 pt above the tab bar; the recenter circle sits 16 pt above the rail.
  const railBottom = tabBarBottom + 60 + 31;
  const railH = 67;
  // Floating chrome is an obstacle for pins too (lib/explore pinPlan): the top controls + filter row,
  // the rail + tab bar (or the shop sheet), and the recenter button.
  const chromeTop = topY + 44 + 12 + 36 + 8;
  const bottomChrome = sel ? (detents[detent] ?? peekH) : railBottom + railH;
  const chrome = [
    { x1: -1e4, y1: -1e4, x2: 1e4, y2: chromeTop },
    { x1: -1e4, y1: areaH - bottomChrome, x2: 1e4, y2: 1e4 },
    ...(sel ? [] : [{ x1: width - 68, y1: areaH - bottomChrome - 66, x2: 1e4, y2: 1e4 }]),
  ];

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
        chrome={chrome}
        topInset={sel ? topY + 52 : Math.max(150, chromeTop + 40)}
        bottomInset={sel ? (detents[detent] ?? peekH) + 24 : Math.max(200, bottomChrome + 40)}
      />

      {sel ? (
        // Shop sheet up (canvas ShopSheet): the map chrome gives way to one round back button.
        <View style={[styles.top, { paddingTop: topY, paddingHorizontal: 16 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to map" onPress={() => setSelected(null)} style={({ pressed }) => [styles.round, { backgroundColor: c.bg, opacity: pressed ? 0.85 : 1 }, floatShadow]}>
            <ChevronLeftGlyph size={20} color={c.fg} />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.top, { paddingTop: topY }, sel ? { display: "none" } : null]} pointerEvents="box-none">
        {topRow}
        <View style={{ paddingTop: 12 }}>{filters}</View>
        {showSearchArea ? (
          <View style={{ alignItems: "center", marginTop: 12 }} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                if (mapCenter) setSearchCenter(mapCenter);
                setMapCenter(null);
              }}
              style={[styles.searchHere, { backgroundColor: c.fg }, floatShadow]}
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
          <View style={{ marginTop: 12, marginHorizontal: 16, padding: 16, paddingVertical: 4, borderRadius: 16, backgroundColor: c.bg, ...floatShadow }}>{empty}</View>
        ) : null}
      </View>

      {!sel ? (
        // White fade behind the rail and tab bar (canvas: 220 pt, map → 92% white at 42% → white at 70%).
        <Svg pointerEvents="none" style={[styles.fade, { height: 220 + (tabBarBottom - 26) }]} width="100%" height={220 + (tabBarBottom - 26)}>
          <Defs>
            <LinearGradient id="railFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={isDark ? c.bg : "#F1F1EF"} stopOpacity={0} />
              <Stop offset="0.42" stopColor={c.bg} stopOpacity={0.92} />
              <Stop offset="0.7" stopColor={c.bg} stopOpacity={1} />
              <Stop offset="1" stopColor={c.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#railFade)" />
        </Svg>
      ) : null}
      {!sel ? (
        <View style={[styles.bottom, { bottom: railBottom }]} pointerEvents="box-none">
          <View style={styles.recenterRow} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Recenter on my location"
              onPress={recenter}
              style={({ pressed }) => [styles.recenter, { backgroundColor: c.fg, opacity: pressed ? 0.85 : 1 }, shadow("0 2px 10px rgba(0,0,0,.22)", { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 5 })]}
            >
              <RecenterGlyph size={18} color={c.bg} />
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
          corner={
            <Pressable accessibilityRole="button" accessibilityLabel="Close shop" onPress={() => setSelected(null)} style={({ pressed }) => [styles.close, { backgroundColor: c.bgSubtle, opacity: pressed ? 0.7 : 1 }]}>
              <CloseGlyph size={16} color={c.fg} />
            </Pressable>
          }
          footer={<ShopCardCta model={model} />}
        >
          <ScrollView scrollEnabled={detent === detents.length - 1} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: insets.bottom + (model.membership ? 110 : 24) }}>
            {model.shop.data ? <ShopBody model={model} variant="sheet" peek={detent === 0} /> : model.shop.isError ? <ErrorState message="This shop didn't load." onRetry={() => void model.shop.refetch()} /> : <SkeletonShop />}
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
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  group: { flexDirection: "row", alignItems: "center", height: layout.chrome, borderRadius: 999, paddingLeft: 14, paddingRight: 6, gap: 8 },
  groupItem: { flexDirection: "row", alignItems: "center", gap: 8, height: layout.chrome },
  groupRule: { width: hairline, height: 20, marginHorizontal: 2 },
  bell: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  bellDot: { position: "absolute", top: 6, right: 7, width: 8, height: 8, borderRadius: 4, borderWidth: 2, boxSizing: "content-box" },
  searchField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: layout.chrome, borderRadius: 999, paddingLeft: 14, paddingRight: 6 },
  filters: { gap: 8, paddingHorizontal: 16 },
  mapChip: { height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6 },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  searchHere: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  recenterRow: { alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 16 },
  recenter: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rail: { gap: 2, paddingHorizontal: 10 },
  railItem: { alignItems: "center", gap: 6, width: 56 },
  railIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  listHeader: { paddingTop: 24, paddingBottom: 8, borderBottomWidth: hairline, marginHorizontal: 16 },
});
