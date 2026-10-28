/**
 * Activity (canvas Inbox.dc.html): lowercase large title "activity", "N new · Mark all read", sections
 * today / this week / earlier, 40 pt shop avatars (initials on the shop's colour, or the category object),
 * title + time, body, and an accent dot on unread rows. Used by the activity tab (left button = profile)
 * and the bell's pushed /notifications page (left button = back).
 */
import { customerApi } from "@ll/shared";
import { router } from "expo-router";
import { useMemo } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { shopInitials, readableOn } from "../../ui/ShopTile";
import { useLocale } from "../../lib/i18n";
import { useOnline } from "../../state/network";
import { disp, ui, useTheme } from "../../theme";
import { Awning, Bell, Button, CardTitle, ChevronLeftGlyph, EmptyState, ErrorState, Gift, hairline, IconTile, SkeletonRows, SlidersGlyph, Store, Text, Trophy, User, useTabBarSpace, WarmCard, type TileTone } from "../../ui";
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
          {shopInitials(m.name)}
        </Text>
      </View>
    );
  }
  // No logo or brand colour: a pastel IconTile by kind (passport = trophy, rewards = gift, a shop = its category glyph).
  const tone: TileTone = n.type === "passport_progress" ? "rose" : /reward|redeem/i.test(n.type) ? "butter" : /order|ticket/i.test(n.type) ? "sky" : "peach";
  const Icon = n.type === "passport_progress" ? Trophy : /reward|redeem/i.test(n.type) ? Gift : m ? Store : Bell;
  void c;
  return <IconTile icon={Icon} tone={tone} size={40} />;
}

function Row({ n, last, onPress }: { n: customerApi.NotificationDto; last: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const { locale, time, date } = useLocale();
  // English keeps the canvas style (bare 9:41, Tue, Oct 12); other languages use their own digits and month names.
  const when = locale === "en" ? inboxTime(n.createdAt) : new Date(n.createdAt).toDateString() === new Date().toDateString() ? time(n.createdAt) : date(n.createdAt, { month: "short", day: "numeric" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? "" : "• "}${n.title}. ${n.body}. ${when}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: c.line, borderBottomWidth: last ? 0 : hairline }, pressed ? { opacity: 0.7 } : null]}
    >
      <Lead n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={[ui(15, 600, 20), { flex: 1 }]} numberOfLines={2}>
            {n.title}
          </Text>
          <Text style={[ui(12, 400, 16), { paddingStart: 8, marginTop: 2 }]} rawColor={c.fgSubtle}>
            {when}
          </Text>
        </View>
        <Text style={[ui(14, 400, 19), { marginTop: 2 }]} rawColor={c.fgMuted} numberOfLines={3}>
          {n.body}
        </Text>
      </View>
      {n.read ? null : <View style={[styles.dot, { backgroundColor: c.brand }]} />}
    </Pressable>
  );
}

export function InboxScreen({ inTab }: { inTab: boolean }) {
  const { c, r } = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const online = useOnline();
  const { t } = useLocale();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = useMemo(() => (inbox.data?.pages ?? []).flatMap((p) => p.items), [inbox.data]);
  const unread = inbox.data?.pages[0]?.unreadCount ?? items.filter((n) => !n.read).length;
  const sections = inboxSections(items, new Date(), [t("sh.inbox.today"), t("sh.inbox.week"), t("sh.inbox.earlier")]);
  const missingApi = inbox.error && (inbox.error as { status?: number }).status === 404;
  const topPad = insets.top > 0 ? insets.top + 9 : 56;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: (inTab ? tabSpace : insets.bottom) + 24 }}
      refreshControl={<RefreshControl refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()} />}
    >
      <View style={{ height: insets.top > 0 ? insets.top : 0 }} />
      <Awning height={10} />
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top > 0 ? 8 : 16 }}>
      <View style={styles.bar}>
        {inTab ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("sh.you.title")} onPress={() => router.push("/you")} style={[styles.circle, { backgroundColor: r.card }]}>
            <User size={18} color={c.fg} strokeWidth={1.9} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={t("sh.card.close")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))} style={[styles.circle, { backgroundColor: r.card }]}>
            <ChevronLeftGlyph size={18} color={c.fg} />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={t("sh.inbox.settings")} onPress={() => router.push("/settings/notifications")} style={[styles.circle, { backgroundColor: r.card }]}>
          <SlidersGlyph size={18} color={c.fg} />
        </Pressable>
      </View>
      <Text style={[disp(34, 800, 40, -0.01), { marginTop: 16 }]} accessibilityRole="header">
        {t("sh.inbox.title")}
      </Text>
      <View style={styles.sub}>
        <Text style={ui(14, 400, 18)} rawColor={c.fgMuted}>
          {unread > 0 ? t("sh.inbox.newN", { n: unread }) : t("sh.inbox.caughtUp")}
        </Text>
        {unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => markRead.mutate(null)} hitSlop={8}>
            <Text style={ui(14, 600, 18)} rawColor={c.brand}>{t("sh.set.markAllRead")}</Text>
          </Pressable>
        ) : null}
      </View>

      {inbox.isLoading ? (
        <View style={{ marginTop: 24 }}>
          <SkeletonRows rows={5} trailing={false} />
        </View>
      ) : inbox.isError && !missingApi && items.length === 0 ? (
        <ErrorState offline={!online} message={online ? t("sh.inbox.loadFail") : t("sh.inbox.offline")} onRetry={() => void inbox.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState body={t("sh.set.inboxEmpty")} actionLabel={t("sh.inbox.settings")} onAction={() => router.push("/settings/notifications")} />
      ) : (
        sections.map((s) => (
          <WarmCard key={s.title} style={{ marginTop: 16 }}>
            <CardTitle title={s.title} />
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
          </WarmCard>
        ))
      )}
      {inbox.hasNextPage ? (
        <Button variant="secondary" loading={inbox.isFetchingNextPage} onPress={() => void inbox.fetchNextPage()} style={{ marginTop: 16 }}>
          {t("sh.inbox.older")}
        </Button>
      ) : null}
      {inTab ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={{ marginTop: 24, alignSelf: "flex-start" }} hitSlop={8}>
          <Text style={ui(14, 600, 18)} rawColor={c.brand}>{t("sh.inbox.history")}</Text>
        </Pressable>
      ) : null}
      {/* The budget, said out loud: a quiet phone never feels broken. */}
      {items.length > 0 ? (
        <Text style={[ui(12, 400, 16), { marginTop: 16 }]} rawColor={c.fgMuted}>
          {t("sh.inbox.budget", { n: customerApi.ROUTINE_PUSHES_PER_DAY })}
        </Text>
      ) : null}
      </View>
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
