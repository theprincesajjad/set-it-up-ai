import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Linking, Platform, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../../copy/en-CA";
import { useDeviceLocation } from "../../features/customer/location";
import { ExploreMap, mapsAvailable, TORONTO, type ExploreMapHandle } from "../../features/customer/MapView";
import { useProfile, useWallet } from "../../features/customer/queries";
import { formatPts } from "../../lib/award";
import { byDistance, EXPLORE_CATEGORIES, exploreSections, filterShops, movedEnough, stripHeader } from "../../lib/explore";
import { formatDistance, openStatus } from "../../lib/format";
import { perkHeadline, perkProgress } from "../../lib/perks";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { typo, useTheme } from "../../theme";
import { Badge, Banner, Button, Card, Chip, DetentSheet, EmptyState, IconButton, LocateFixed, MapPin, PerkCard, Search, Sheet, ShopLogo, SkeletonList, SlidersHorizontal, Text, verticalIcon } from "../../ui";

type Shop = networkApi.ShopListItemDto;
const PEEK = 196;

/** Peek card: logo, name, vertical icon · distance, Open/Closed chip, my balance or "Join". */
function ShopPeekCard({ s, width, onOpen }: { s: Shop; width: number; onOpen: () => void }) {
  const { c, vertical } = useTheme();
  const v = vertical(s.merchant.vertical);
  const Icon = verticalIcon(v.icon);
  const status = openStatus(s.location?.hours, s.openNow);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${s.merchant.name}. ${v.label}. ${formatDistance(s.distanceMetres)}. ${status?.label ?? ""}`} onPress={onOpen} style={{ width, paddingHorizontal: 16 }}>
      <Card padded={false}>
        <View style={styles.peek}>
          <ShopLogo shop={s.merchant} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="title" numberOfLines={1}>
              {s.merchant.name}
            </Text>
            <View style={styles.meta}>
              <Icon size={14} color={c.fgMuted} />
              <Text variant="bodySm" color="fgMuted" numberOfLines={1}>
                {[v.label, formatDistance(s.distanceMetres)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <View style={styles.meta}>
              {status ? <Badge tone={status.open ? "success" : "neutral"}>{status.label}</Badge> : null}
              {s.hasPromo ? <Badge tone="accent">Promo</Badge> : null}
            </View>
          </View>
          {s.isMember && s.myBalance != null ? (
            <View style={[styles.balance, { backgroundColor: c.accentSubtle }]}>
              <Text variant="bodyStrong" rawColor={c.onAccentSubtle} tabular>
                {formatPts(s.myBalance, s.terminology)}
              </Text>
            </View>
          ) : (
            <Button variant="tonal" size="sm" onPress={onOpen}>
              Join
            </Button>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

/** Explore (references.md § 1): Corner-style full-bleed map + 3-detent sheet; list when maps aren't configured. */
export default function Explore() {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { prefs, updatePrefs } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const [prompt, setPrompt] = useState(!prefs.locationPrompted);
  const [mapOk, setMapOk] = useState(mapsAvailable());
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [openNow, setOpenNow] = useState(false);
  const [hasPromo, setHasPromo] = useState(false);
  const [myShops, setMyShops] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detent, setDetent] = useState(0);
  const [areaH, setAreaH] = useState(height - 140);
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<ExploreMapHandle>(null);
  const peekList = useRef<FlatList<Shop>>(null);

  const hoodSlug = prefs.neighbourhoodSlug ?? profile.data?.homeNeighbourhood?.slug ?? null;
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
  const visible = useMemo(() => byDistance(filterShops(all, { category, openNow, hasPromo, myShops })), [all, category, openNow, hasPromo, myShops]);
  const sel = visible.find((s) => s.merchant.id === selected) ?? visible[0] ?? null;
  const perk = hood.data?.perks[0] ?? null;
  const progress = perk ? perkProgress(perk, wallet.data?.items ?? [], hood.data?.neighbourhood.id ?? null) : null;

  const directions = (s: Shop) => {
    if (!s.location) return;
    const dest = s.location.lat != null && s.location.lng != null ? `${s.location.lat},${s.location.lng}` : encodeURIComponent(s.location.address);
    void Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };
  const select = useCallback(
    (id: string | null, from: "map" | "card") => {
      setSelected(id);
      const s = visible.find((x) => x.merchant.id === id);
      if (!s) return;
      if (from === "map") {
        setDetent(0);
        const i = visible.indexOf(s);
        if (i >= 0) peekList.current?.scrollToIndex({ index: i, animated: true });
      }
      if (s.location?.lat != null && s.location.lng != null) mapRef.current?.focus(s.location.lat, s.location.lng);
    },
    [visible],
  );

  const filterChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      <Chip label="Open now" selected={openNow} onPress={() => setOpenNow((v) => !v)} />
      <Chip label="Has promo" selected={hasPromo} onPress={() => setHasPromo((v) => !v)} />
      <Chip label="My shops" selected={myShops} onPress={() => setMyShops((v) => !v)} />
    </ScrollView>
  );

  const shopRow = (s: Shop) => (
    <Pressable key={s.merchant.id} accessibilityRole="button" onPress={() => router.push(`/shop/${s.merchant.slug}`)} style={({ pressed }) => [styles.listRow, { borderBottomColor: c.border, opacity: pressed ? 0.88 : 1 }]}>
      <ShopLogo shop={s.merchant} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {s.merchant.name}
        </Text>
        <Text variant="bodySm" color="fgMuted" numberOfLines={1}>
          {[s.location?.address, formatDistance(s.distanceMetres)].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.meta}>
          {(() => {
            const st = openStatus(s.location?.hours, s.openNow);
            return st ? <Badge tone={st.open ? "success" : "neutral"}>{st.label}</Badge> : null;
          })()}
          {s.hasPromo ? <Badge tone="accent">Promo</Badge> : null}
        </View>
      </View>
      {s.isMember && s.myBalance != null ? (
        <Text variant="bodyStrong" color="fgBrand" tabular>
          {formatPts(s.myBalance, s.terminology)}
        </Text>
      ) : null}
    </Pressable>
  );

  const empty = q ? (
    <EmptyState icon={Search} title={t("empty.mapSearch.title", { query: q })} body={t("empty.mapSearch.body")} actionLabel="Clear search" onAction={() => setQ("")} />
  ) : (
    <EmptyState icon={MapPin} title={t("empty.noNeighbourhood.title")} body={t("empty.noNeighbourhood.body")} actionLabel="Suggest my street" onAction={() => router.push("/settings/suggest")} />
  );

  const sectioned = (
    <SectionList
      sections={exploreSections(visible)}
      keyExtractor={(s) => s.merchant.id}
      renderItem={({ item }) => <View style={{ paddingHorizontal: 16 }}>{shopRow(item)}</View>}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, backgroundColor: c.surfaceRaised }}>
          <Text variant="h3">{section.title}</Text>
        </View>
      )}
      ListEmptyComponent={shops.isLoading ? <View style={{ padding: 16 }}><SkeletonList rows={4} rowHeight={64} /></View> : empty}
      contentContainerStyle={{ paddingBottom: 24 }}
      stickySectionHeadersEnabled
    />
  );

  const searchPill = (
    <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Search size={20} color={c.fgMuted} />
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={hoodName ? `Search shops on ${hoodName}` : "Search shops or streets"}
        placeholderTextColor={c.fgMuted}
        accessibilityLabel="Search shops"
        returnKeyType="search"
        style={[typo("body"), { flex: 1, color: c.fg, paddingVertical: 10 }]}
      />
      <IconButton icon={SlidersHorizontal} label="Filters" onPress={() => setDetent(1)} />
    </View>
  );

  const categoryChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {EXPLORE_CATEGORIES.map((cat) => (
        <Chip key={cat.key} label={cat.label} selected={category === cat.key} onPress={() => setCategory(cat.key)} />
      ))}
    </ScrollView>
  );

  const locationPrompt = (
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
  );

  // ----------------------------------------------------------- list fallback (no maps configured / map failed)
  if (!mapOk) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.surfaceRaised }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{searchPill}</View>
        <View style={{ paddingVertical: 12, gap: 8 }}>
          {categoryChips}
          {filterChips}
        </View>
        {loc.status === "denied" ? (
          <Banner variant="info" actionLabel="Turn on" onAction={() => Linking.openSettings()}>
            {t("err.location.denied")}
          </Banner>
        ) : null}
        {perk && progress ? (
          <View style={{ paddingHorizontal: 16 }}>
            <PerkCard headline={perkHeadline(perk, hoodName)} {...progress} />
          </View>
        ) : null}
        <Text variant="title" style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {stripHeader(visible.length, hoodName)}
        </Text>
        {sectioned}
        {locationPrompt}
      </SafeAreaView>
    );
  }

  // ----------------------------------------------------------- map + sheet
  const detents = [PEEK, Math.round(areaH * 0.5), Math.round(areaH - insets.top - 64)];
  // No location or neighbourhood yet: centre on the shops themselves rather than downtown.
  const located = all.filter((x) => x.location?.lat != null && x.location?.lng != null);
  const centroid = located.length ? { lat: located.reduce((a, x) => a + x.location!.lat!, 0) / located.length, lng: located.reduce((a, x) => a + x.location!.lng!, 0) / located.length } : null;
  const center = origin ?? centroid ?? TORONTO;
  const showSearchArea = !!mapCenter && movedEnough(mapCenter, origin ?? TORONTO);

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }} onLayout={(e: LayoutChangeEvent) => setAreaH(e.nativeEvent.layout.height)}>
      <ExploreMap
        ref={mapRef}
        shops={visible}
        center={center}
        showsUser={loc.status === "granted"}
        selectedId={sel?.merchant.id ?? null}
        onSelect={(id) => (id ? select(id, "map") : setSelected(null))}
        onRegion={setMapCenter}
        onFail={() => setMapOk(false)}
        bottomInset={(detents[detent] ?? PEEK) + 8}
      />
      <SafeAreaView edges={["top"]} style={styles.top} pointerEvents="box-none">
        <View style={{ paddingHorizontal: 16 }}>{searchPill}</View>
        {showSearchArea ? (
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Chip
              label="Search this area"
              icon={Search}
              onPress={() => {
                if (mapCenter) setSearchCenter(mapCenter);
                setMapCenter(null);
              }}
            />
          </View>
        ) : null}
        {loc.status === "denied" ? (
          <View style={{ marginTop: 8 }}>
            <Banner variant="info" actionLabel="Turn on" onAction={() => Linking.openSettings()}>
              {t("err.location.denied")}
            </Banner>
          </View>
        ) : null}
      </SafeAreaView>

      {detent < 2 ? (
        <View style={[styles.floating, { bottom: (detents[detent] ?? PEEK) + 8 }]} pointerEvents="box-none">
          <View style={{ flex: 1 }}>{categoryChips}</View>
          <View style={[styles.recenter, { backgroundColor: c.surface, borderColor: c.border }]}>
            <IconButton
              icon={LocateFixed}
              label="Recenter on my location"
              onPress={async () => {
                const ok = loc.status === "granted" ? true : await loc.request();
                if (ok && loc.coords) {
                  setSearchCenter(null);
                  mapRef.current?.focus(loc.coords.lat, loc.coords.lng);
                }
              }}
            />
          </View>
        </View>
      ) : null}

      <DetentSheet
        detents={detents}
        index={detent}
        onIndexChange={setDetent}
        containerHeight={areaH}
        header={
          detent === 0 ? null : (
            <View style={{ gap: 10, paddingBottom: 8 }}>
              <Text variant="h3" style={{ paddingHorizontal: 16 }}>
                {stripHeader(visible.length, hoodName)}
              </Text>
              {filterChips}
            </View>
          )
        }
      >
        {detent === 0 ? (
          visible.length === 0 ? (
            <Text color="fgMuted" center style={{ padding: 16 }}>
              {shops.isLoading ? "Finding shops..." : q ? t("empty.mapSearch.title", { query: q }) : t("empty.noNeighbourhood.title")}
            </Text>
          ) : (
            <FlatList
              ref={peekList}
              data={visible}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(s) => s.merchant.id}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / width);
                const s = visible[i];
                if (s && s.merchant.id !== sel?.merchant.id) select(s.merchant.id, "card");
              }}
              renderItem={({ item }) => (
                <View>
                  <ShopPeekCard s={item} width={width} onOpen={() => router.push(`/shop/${item.merchant.slug}`)} />
                  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
                    <Button variant="secondary" size="sm" onPress={() => directions(item)}>
                      Directions
                    </Button>
                    <Button variant="ghost" size="sm" onPress={() => setDetent(1)}>
                      {`See all ${visible.length}`}
                    </Button>
                  </View>
                </View>
              )}
            />
          )
        ) : detent === 1 ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {perk && progress ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <PerkCard headline={perkHeadline(perk, hoodName)} {...progress} />
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 16 }}>{visible.length === 0 ? (shops.isLoading ? <SkeletonList rows={3} rowHeight={64} /> : empty) : visible.map(shopRow)}</View>
          </ScrollView>
        ) : (
          sectioned
        )}
      </DetentSheet>
      {locationPrompt}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 0, right: 0, top: 0, paddingTop: 8 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, paddingLeft: 16, minHeight: 52 },
  floating: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 16 },
  recenter: { borderRadius: 24, borderWidth: 1 },
  peek: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  balance: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
