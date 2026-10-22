/**
 * Activity (canvas Inbox.dc.html): lowercase large title "activity", "N new · Mark all read", sections
 * today / this week / earlier, 40 pt shop avatars (initials on the shop's colour, or the category object),
 * title + time, body, and an accent dot on unread rows. Used by the activity tab (left button = profile)
 * and the bell's pushed /notifications page (left button = back).
 */
import type { customerApi } from "@ll/shared";
import { router } from "expo-router";
import { useMemo } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { shopInitials, readableOn } from "../../ui/ShopTile";
import { useOnline } from "../../state/network";
import { disp, ui, useTheme } from "../../theme";
import { Button, categorySource, ChevronLeftGlyph, EmptyState, ErrorState, hairline, SkeletonRows, SlidersGlyph, Text, User, useTabBarSpace } from "../../ui";
import { inboxSections, openNotification, useInbox, useMarkRead } from "./inbox";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9:41" today, "Tue" this week, "Oct 12" before (canvas times are bare, no am/pm). */
export function inboxTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfDay) return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.getTime() >= startOfDay - 6 * 86_400_000) return DAYS[d.getDay()]!;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

function Lead({ n }: { n: customerApi.NotificationDto }) {
  const { c } = useTheme();
  // Street-wide news (the passport) is the neighbourhood's, not one shop's: the star object on grey.
  const m = n.type === "passport_progress" ? null : n.merchant;
  if (m?.logoUrl) return <Image source={{ uri: m.logoUrl }} style={styles.av} accessibilityIgnoresInvertColors />;
  if (m && m.brandColor && HEX.test(m.brandColor)) {
    return (
      <View style={[styles.av, { backgroundColor: m.brandColor }]}>
        <Text style={disp(14, 800, 17)} rawColor={readableOn(m.brandColor)} allowFontScaling={false}>
          {shopInitials(m.name).toLowerCase()}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.av, { backgroundColor: c.bgSubtle }]}>
      <Image source={categorySource(n.type === "passport_progress" ? "all" : "services")} style={{ width: 24, height: 24 }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

function Row({ n, last, onPress }: { n: customerApi.NotificationDto; last: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}. ${inboxTime(n.createdAt)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.line, borderBottomWidth: last ? 0 : hairline }, pressed ? { opacity: 0.7 } : null]}
    >
      <Lead n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={[ui(15, 600, 20), { flex: 1 }]} numberOfLines={2}>
            {n.title}
          </Text>
          <Text style={[ui(12, 400, 16), { paddingLeft: 8, marginTop: 2 }]} rawColor={c.fgSubtle}>
            {inboxTime(n.createdAt)}
          </Text>
        </View>
        <Text style={[ui(14, 400, 19), { marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={3}>
          {n.body}
        </Text>
      </View>
      {n.read ? null : <View style={[styles.dot, { backgroundColor: c.accent }]} />}
    </Pressable>
  );
}

export function InboxScreen({ inTab }: { inTab: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const online = useOnline();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = useMemo(() => (inbox.data?.pages ?? []).flatMap((p) => p.items), [inbox.data]);
  const unread = inbox.data?.pages[0]?.unreadCount ?? items.filter((n) => !n.read).length;
  const sections = inboxSections(items);
  const missingApi = inbox.error && (inbox.error as { status?: number }).status === 404;
  const topPad = insets.top > 0 ? insets.top + 9 : 56;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: topPad, paddingHorizontal: 20, paddingBottom: (inTab ? tabSpace : insets.bottom) + 24 }}
      refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()} />}
    >
      <View style={styles.bar}>
        {inTab ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push("/you")} style={[styles.circle, { backgroundColor: c.bgSubtle }]}>
            <User size={18} color={c.fg} strokeWidth={1.9} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))} style={[styles.circle, { backgroundColor: c.bgSubtle }]}>
            <ChevronLeftGlyph size={18} color={c.fg} />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Notification settings" onPress={() => router.push("/settings/notifications")} style={[styles.circle, { backgroundColor: c.bgSubtle }]}>
          <SlidersGlyph size={18} color={c.fg} />
        </Pressable>
      </View>
      <Text style={[disp(34, 800, 40, -0.01), { marginTop: 16 }]} accessibilityRole="header">
        activity
      </Text>
      <View style={styles.sub}>
        <Text style={ui(14, 400, 18)} rawColor={c.fgMuted}>
          {unread > 0 ? `${unread} new` : "all caught up"}
        </Text>
        {unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => markRead.mutate(null)} hitSlop={8}>
            <Text style={ui(14, 600, 18)}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {inbox.isLoading ? (
        <View style={{ marginTop: 24 }}>
          <SkeletonRows rows={5} trailing={false} />
        </View>
      ) : inbox.isError && !missingApi && items.length === 0 ? (
        <ErrorState offline={!online} message={online ? "Your activity didn't load." : "You're offline. Activity loads when you're back."} onRetry={() => void inbox.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState body="Nothing yet. Points, rewards and order updates from your shops land here." actionLabel="Notification settings" onAction={() => router.push("/settings/notifications")} />
      ) : (
        sections.map((s) => (
          <View key={s.title}>
            <Text style={[disp(13, 700, 16), styles.sec, { borderBottomColor: c.line }]} rawColor={c.fgMuted} accessibilityRole="header">
              {s.title}
            </Text>
            {s.data.map((n, i) => (
              <Row
                key={n.id}
                n={n}
                last={i === s.data.length - 1}
                onPress={() => {
                  if (!n.read) markRead.mutate(n.id);
                  openNotification(n);
                }}
              />
            ))}
          </View>
        ))
      )}
      {inbox.hasNextPage ? (
        <Button variant="secondary" loading={inbox.isFetchingNextPage} onPress={() => void inbox.fetchNextPage()} style={{ marginTop: 16 }}>
          Show older
        </Button>
      ) : null}
      {inTab ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={{ marginTop: 24, alignSelf: "flex-start" }} hitSlop={8}>
          <Text style={ui(14, 600, 18)}>Points history</Text>
        </Pressable>
      ) : null}
    </ScrollView>
      {inTab ? (
        // Soft white fade behind the tab bar (as on Discover).
        <Svg pointerEvents="none" style={styles.fade} width="100%" height={120}>
          <Defs>
            <LinearGradient id="inboxFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.bg} stopOpacity={0} />
              <Stop offset="0.55" stopColor={c.bg} stopOpacity={1} />
              <Stop offset="1" stopColor={c.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#inboxFade)" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sub: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  sec: { paddingBottom: 8, borderBottomWidth: hairline, marginTop: 24 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 14 },
  av: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
