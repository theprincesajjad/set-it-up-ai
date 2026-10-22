import { verticalCategory, type VerticalCategory } from "@ll/design-tokens";
import type { networkApi } from "@ll/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnreadCount } from "../../features/customer/inbox";
import { useDeviceLocation } from "../../features/customer/location";
import { useCampaigns, useProfile, useWallet } from "../../features/customer/queries";
import { DISCOVER_MODE_LABELS, DISCOVER_ROWS, discoverMeta, discoverRows, heroCopy, miniMapPoints, shortHood, type DiscoverMode } from "../../lib/discover";
import { openStatus } from "../../lib/format";
import { useLocale } from "../../lib/i18n";
import { shopMatchesHalal } from "../../lib/restaurant";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { disp, ui, useTheme } from "../../theme";
import { BellGlyph, categorySource, ChevronDownGlyph, floatShadow, haptic, ListRow, shadow, Sheet, Skeleton, Text, useTabBarSpace } from "../../ui";

type Shop = networkApi.ShopListItemDto;

/** Category objects floating in the hero (canvas positions, rotations and sizes). */
const HERO_OBJECTS: { cat: VerticalCategory; left: number; top: number; size: number; rotate: string }[] = [
  { cat: "coffee", left: 206, top: 58, size: 88, rotate: "-8deg" },
  { cat: "bakery", left: 286, top: 132, size: 76, rotate: "10deg" },
  { cat: "beauty", left: 228, top: 176, size: 58, rotate: "-14deg" },
];

const CHIP_ORDER: VerticalCategory[] = ["coffee", "bakery", "services", "repair", "eat", "shops", "beauty"];

/** canvas y for the status-bar-relative chrome: the artboard assumes a 47 pt status bar. */
function useCanvasTop() {
  const insets = useSafeAreaInsets();
  return (y: number) => (insets.top > 0 ? insets.top + (y - 47) : y);
}

function Pill({ label, selected, chevron, onPress }: { label: string; selected: boolean; chevron?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: selected ? c.fg : c.bgSubtle, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={disp(14, 700, 18)} rawColor={selected ? c.bg : c.fg}>
        {label}
      </Text>
      {chevron ? <ChevronDownGlyph size={12} strokeWidth={2.4} color={selected ? c.bg : c.fg} /> : null}
    </Pressable>
  );
}

/**
 * Discover (canvas Discover.dc.html, Hypelist feed): black hero for the live neighbourhood campaign
 * with floating category objects, the chip row, a "near you" map card and horizontal rows of shops
 * by category. Data from campaigns, network shops and the wallet. No upgrade prompts.
 */
export default function Discover() {
  const { c } = useTheme();
  const top = useCanvasTop();
  const { width } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  const { prefs } = useSession();
  const profile = useProfile();
  const wallet = useWallet();
  const unread = useUnreadCount();
  const loc = useDeviceLocation(prefs.locationPrompted);
  const campaigns = useCampaigns(loc.coords?.lat, loc.coords?.lng);
  const [mode, setMode] = useState<DiscoverMode>("forYou");
  const [modeOpen, setModeOpen] = useState(false);
  const [category, setCategory] = useState<VerticalCategory | null>(null);
  /** Dietary filter: GET /v1/network/shops?halal=1 ("has halal food") or halal=all ("everything is halal"), the shop's own tags. */
  const [halal, setHalal] = useState<"1" | "all" | null>(null);
  const [dietOpen, setDietOpen] = useState(false);
  const { t: tr } = useLocale();

  const hoodSlug = prefs.neighbourhoodSlug ?? profile.data?.homeNeighbourhood?.slug ?? null;
  const hood = useQuery({ queryKey: ["hood", hoodSlug ?? ""], queryFn: () => api.network.neighbourhood(hoodSlug!), enabled: !!hoodSlug, staleTime: 30 * 60_000 });
  const live = (campaigns.data?.items ?? []).find((x) => x.status === "live") ?? null;
  const origin = loc.coords ?? (hood.data?.neighbourhood.centerLat != null && hood.data.neighbourhood.centerLng != null ? { lat: hood.data.neighbourhood.centerLat, lng: hood.data.neighbourhood.centerLng } : null);
  const params = { ...(origin ? { lat: origin.lat, lng: origin.lng } : hoodSlug ? { neighbourhood: hoodSlug } : {}), ...(halal ? { halal } : {}), limit: 100 };
  const shops = useQuery({ queryKey: qk.shops(JSON.stringify(params)), queryFn: () => api.network.shops(params) });
  // TODO(api): the ?halal= param is live on GET /v1/network/shops; this client-side pass only covers servers that ignore it.
  const all = useMemo(() => (shops.data?.items ?? []).filter((s) => !halal || shopMatchesHalal(s, halal)), [shops.data, halal]);
  const hoodName = shortHood(hood.data?.neighbourhood.name ?? profile.data?.homeNeighbourhood?.name ?? live?.neighbourhood.name ?? null);
  const ready = useMemo(() => new Set((wallet.data?.items ?? []).filter((m) => m.rewardsAvailableCount > 0).map((m) => m.merchant.id)), [wallet.data]);
  const rows = useMemo(() => discoverRows(all, { hood: hoodName, ready, mode, category }), [all, hoodName, ready, mode, category]);
  // Chip order follows the canvas (coffee · bakeries · services · repair …); only categories with shops.
  const chips = CHIP_ORDER.map((id) => DISCOVER_ROWS.find((r) => r.id === id)!).filter((r) => all.some((s) => verticalCategory(s.merchant.vertical) === r.id));
  const hero = live ? heroCopy({ ...live, progress: live.progress }) : null;

  // "near you": the user (or the strip's centre) in the middle, the three nearest shops around it.
  const cardW = width - 32;
  const near = all.filter((s) => s.location?.lat != null && s.location?.lng != null).slice(0, 2);
  const centre = origin ?? (near[0] ? { lat: near[0].location!.lat!, lng: near[0].location!.lng! } : null);
  // The location dot sits a little left of centre (canvas: x 150 of 358), so the "open map" pill never covers a pin.
  const dotX = Math.round(cardW / 2 - 29);
  const pins = centre ? miniMapPoints(centre, near.map((s) => ({ id: s.merchant.id, lat: s.location!.lat!, lng: s.location!.lng! })), { w: dotX * 2, h: 132, margin: 30, marginX: 32, minR: 36 }) : [];

  const card = (s: Shop) => {
    const loc0 = s.location;
    const status = openStatus((loc0?.hours ?? null) as never, s.openNow);
    const isReady = ready.has(s.merchant.id);
    return (
      <Pressable key={s.merchant.id} accessibilityRole="button" accessibilityLabel={`${s.merchant.name}${isReady ? ". Reward ready" : ""}`} onPress={() => router.push(`/shop/${s.merchant.slug}`)} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.tile, { backgroundColor: c.bgSubtle }]}>
          <Image source={categorySource(verticalCategory(s.merchant.vertical))} style={{ width: 76, height: 76 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          {isReady ? (
            <View style={[styles.ready, { backgroundColor: c.accentSoft }]}>
              <Text style={ui(12, 600, 16)} rawColor={c.accentText}>
                reward ready
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[disp(15, 700, 19), { marginTop: 10 }]} numberOfLines={1}>
          {s.merchant.name.toLowerCase()}
        </Text>
        <Text style={[ui(12, 400, 16), { marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={1}>
          {discoverMeta(s, status)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace + 24 }} showsVerticalScrollIndicator={false}>
        {/* Hero: black, the live campaign. */}
        <Pressable
          accessibilityRole={live ? "button" : undefined}
          accessibilityLabel={hero ? `${hero.eyebrow}. ${hero.headline}${hero.progress ? `. ${hero.progress.value} of ${hero.progress.max}` : ""}` : undefined}
          disabled={!live}
          onPress={() => live && router.push(`/campaigns/${live.id}`)}
          style={[styles.hero, { height: top(340) }]}
        >
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice">
            <Path d="M150 -20 L 230 360" stroke="#1D1D20" strokeWidth={10} strokeLinecap="round" fill="none" />
            <Path d="M-20 90 L 410 60" stroke="#1D1D20" strokeWidth={10} strokeLinecap="round" fill="none" />
            <Path d="M-20 190 L 410 166" stroke="#1D1D20" strokeWidth={10} strokeLinecap="round" fill="none" />
            <Path d="M-20 290 L 410 266" stroke="#1D1D20" strokeWidth={10} strokeLinecap="round" fill="none" />
          </Svg>
          {HERO_OBJECTS.map((o) => (
            <Image key={o.cat} source={categorySource(o.cat)} style={{ position: "absolute", left: o.left + (width - 390), top: top(o.top), width: o.size, height: o.size, transform: [{ rotate: o.rotate }] }} resizeMode="contain" accessibilityIgnoresInvertColors />
          ))}
          <View style={[styles.heroTop, { top: top(58) }]}>
            <Text style={disp(15, 800, 18)} rawColor="#FFFFFF">
              local loyalty
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} onPress={() => router.navigate("/activity")} style={styles.heroBell}>
              <BellGlyph size={18} color="#FFFFFF" />
              {unread > 0 ? <View style={[styles.heroDot, { backgroundColor: c.accent }]} /> : null}
            </Pressable>
          </View>
          <View style={styles.heroCopy}>
            {hero ? (
              <>
                <Text style={ui(12, 600, 16)} rawColor="#FF7A45" numberOfLines={1}>
                  {hero.eyebrow}
                </Text>
                <Text style={[disp(32, 800, 34, -0.01), { marginTop: 8 }]} rawColor="#FFFFFF" accessibilityRole="header">
                  {hero.headline}
                </Text>
              </>
            ) : (
              <>
                <Text style={ui(12, 600, 16)} rawColor="#FF7A45">
                  {hoodName ? `${hoodName} · ${all.length} shops` : "near you"}
                </Text>
                <Text style={[disp(32, 800, 34, -0.01), { marginTop: 8 }]} rawColor="#FFFFFF" accessibilityRole="header">
                  one card for every shop on the street
                </Text>
              </>
            )}
          </View>
          {hero?.progress ? (
            <View style={styles.heroBar}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(hero.progress.value / hero.progress.max) * 100}%`, backgroundColor: "#FF5A1F" }]} />
              </View>
              <Text style={[ui(12, 600, 16), { fontVariant: ["tabular-nums"] }]} rawColor="#FFFFFF">{`${hero.progress.value} / ${hero.progress.max}`}</Text>
            </View>
          ) : null}
        </Pressable>

        {/* Chips: black "for you ▾", grey categories. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={styles.chips}>
          <Pill label={DISCOVER_MODE_LABELS[mode]} selected={!category} chevron onPress={() => (category ? setCategory(null) : setModeOpen(true))} />
          <Pill label={halal === "all" ? tr("rest.filter.allHalal") : tr("diet.halal").toLowerCase()} selected={!!halal} chevron onPress={() => setDietOpen(true)} />
          {chips.map((r) => (
            <Pill key={r.id} label={r.chip} selected={category === r.id} onPress={() => setCategory(category === r.id ? null : r.id)} />
          ))}
        </ScrollView>

        {/* near you */}
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <View style={styles.headRow}>
            <Text style={disp(20, 800, 24)} accessibilityRole="header">
              near you
            </Text>
            <Text style={ui(13, 400, 17)} rawColor={c.fgMuted}>{`${all.length} ${all.length === 1 ? "shop" : "shops"}`}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={() => router.navigate("/map")} style={[styles.mapCard, { backgroundColor: "#F1F1EF" }]}>
            <Svg width={cardW} height={120} style={StyleSheet.absoluteFill}>
              <Path d={`M${cardW * 0.335} -10 L ${cardW * 0.475} 130`} stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" fill="none" />
              <Path d={`M-10 40 L ${cardW + 12} 26`} stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" fill="none" />
              <Path d={`M-10 92 L ${cardW + 12} 80`} stroke="#FFFFFF" strokeWidth={9} strokeLinecap="round" fill="none" />
            </Svg>
            {pins.map((p) => {
              const s = near.find((x) => x.merchant.id === p.id)!;
              return (
                <View key={p.id} style={[styles.miniPin, { left: p.x - 15, top: p.y - 15 }, shadow("0 2px 8px rgba(0,0,0,.12)")]}>
                  <Image source={categorySource(verticalCategory(s.merchant.vertical))} style={{ width: 20, height: 20 }} resizeMode="contain" accessibilityIgnoresInvertColors />
                </View>
              );
            })}
            {/* You are here: above the pins (canvas: the blue dot, 5.5 pt with a 2 pt white ring). */}
            {centre ? <View style={[styles.youDot, { left: dotX - 7.5, top: 66 - 7.5 }]} /> : null}
            <View style={[styles.openMap, { backgroundColor: c.bg }, floatShadow]}>
              <Text style={ui(13, 600, 17)}>open map</Text>
            </View>
          </Pressable>
        </View>

        {/* Rows by category. */}
        {shops.isLoading ? (
          <View style={{ paddingHorizontal: 16, marginTop: 26, gap: 12 }}>
            <Skeleton width={200} height={24} radius={6} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Skeleton width={168} height={184} radius={16} />
              <Skeleton width={168} height={184} radius={16} />
            </View>
          </View>
        ) : null}
        {rows.map((r, i) => (
          <View key={r.id} style={{ marginTop: i === 0 ? 10 : 28 }}>
            <Text style={[disp(20, 800, 24), { paddingHorizontal: 16 }]} accessibilityRole="header">
              {r.title}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowCards}>
              {r.shops.slice(0, 12).map(card)}
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      {/* Soft white fade behind the tab bar. */}
      <Svg pointerEvents="none" style={styles.fade} width="100%" height={120}>
        <Defs>
          <LinearGradient id="discoverFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.bg} stopOpacity={0} />
            <Stop offset="0.55" stopColor={c.bg} stopOpacity={1} />
            <Stop offset="1" stopColor={c.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#discoverFade)" />
      </Svg>

      <Sheet visible={dietOpen} onClose={() => setDietOpen(false)} title={tr("rest.filter.dietary")} scroll={false}>
        <View>
          {([null, "1", "all"] as const).map((m, i, arr) => (
            <ListRow
              key={String(m)}
              title={m === null ? tr("rest.filter.any") : m === "1" ? tr("rest.filter.hasHalal") : tr("rest.filter.allHalal")}
              subtitle={m === null ? undefined : tr("diet.shopClaim")}
              selected={halal === m}
              divider={i < arr.length - 1}
              onPress={() => {
                setHalal(m);
                setDietOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet visible={modeOpen} onClose={() => setModeOpen(false)} title="Show" scroll={false}>
        <View>
          {(Object.keys(DISCOVER_MODE_LABELS) as DiscoverMode[]).map((m, i, arr) => (
            <ListRow
              key={m}
              title={DISCOVER_MODE_LABELS[m].charAt(0).toUpperCase() + DISCOVER_MODE_LABELS[m].slice(1)}
              selected={mode === m}
              divider={i < arr.length - 1}
              onPress={() => {
                setMode(m);
                setModeOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: "#0B0B0C", overflow: "hidden" },
  heroTop: { position: "absolute", left: 20, right: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroBell: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroDot: { position: "absolute", top: 7, right: 8, width: 7, height: 7, borderRadius: 4 },
  heroCopy: { position: "absolute", left: 20, bottom: 56, maxWidth: 240 },
  heroBar: { position: "absolute", left: 20, right: 20, bottom: 24, flexDirection: "row", alignItems: "center", gap: 10 },
  track: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  fill: { height: 4, borderRadius: 999 },
  chips: { gap: 8, paddingHorizontal: 16 },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  mapCard: { marginTop: 12, height: 120, borderRadius: 16, overflow: "hidden" },
  miniPin: { position: "absolute", width: 30, height: 30, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  openMap: { position: "absolute", left: 12, bottom: 12, height: 32, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center" },
  rowCards: { gap: 12, paddingHorizontal: 16, marginTop: 12 },
  card: { width: 168 },
  tile: { height: 184, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  ready: { position: "absolute", left: 10, top: 10, height: 24, paddingHorizontal: 9, borderRadius: 999, justifyContent: "center" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  youDot: { position: "absolute", width: 15, height: 15, borderRadius: 7.5, backgroundColor: "#2F7BF6", borderWidth: 2, borderColor: "#FFFFFF" },
});
