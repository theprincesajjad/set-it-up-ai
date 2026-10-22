import type { customerApi } from "@ll/shared";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { inboxSections, openNotification, useInbox, useMarkRead } from "../features/customer/inbox";
import { formatTime, relativeTime } from "../lib/format";
import { useOnline } from "../state/network";
import { useTheme } from "../theme";
import {
  Award,
  BadgePercent,
  Button,
  CircleCheck,
  Clock3,
  EmptyState,
  ErrorState,
  FileText,
  Gift,
  IconButton,
  PackageCheck,
  Screen,
  Section,
  Settings,
  ShopLogo,
  SkeletonRows,
  Text,
  Trophy,
  Wrench,
  type LucideIcon,
} from "../ui";

const TYPE_ICON: Record<customerApi.NotificationType, LucideIcon> = {
  points_earned: Award,
  reward_ready: Gift,
  reward_expiring: Clock3,
  redeem_confirmed: CircleCheck,
  order_ready: PackageCheck,
  ticket_updated: Wrench,
  quote_sent: FileText,
  booking_reminder: Clock3,
  promo_nearby: BadgePercent,
  passport_progress: Trophy,
};

/** "2:31 pm" today, "3 days ago" this week, "Oct 12" before. */
function when(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const dayStart = new Date(new Date(now).toDateString()).getTime();
  if (t >= dayStart) return formatTime(iso);
  return relativeTime(iso, now);
}

function Row({ n, divider, onPress }: { n: customerApi.NotificationDto; divider: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const Icon = TYPE_ICON[n.type] ?? Gift;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}. ${n.body}. ${when(n.createdAt)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: c.bgSubtle } : null]}
    >
      <View style={styles.lead}>
        {n.merchant ? <ShopLogo shop={{ name: n.merchant.name, logoUrl: n.merchant.logoUrl, brandColor: n.merchant.brandColor, vertical: "other" }} size={44} /> : <Icon size={22} color={c.fg} strokeWidth={1.75} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleLine}>
          <Text variant={n.read ? "body" : "bodyStrong"} style={{ flex: 1 }} numberOfLines={2}>
            {n.title}
          </Text>
          <Text variant="meta" color="fgMuted" tabular>
            {when(n.createdAt)}
          </Text>
        </View>
        <Text variant="meta" color="fgMuted" numberOfLines={3}>
          {n.body}
        </Text>
      </View>
      {/* Unread = a small black dot (blue is the location dot only; accent is points). */}
      <View style={[styles.dot, { backgroundColor: n.read ? "transparent" : c.fg }]} />
      {divider ? <View style={[styles.divider, { backgroundColor: c.line }]} /> : null}
    </Pressable>
  );
}

/** Inbox (Corner bell): grouped by day, unread in bold with a dot, tap opens what it's about. */
export default function Notifications() {
  const online = useOnline();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const items = useMemo(() => (inbox.data?.pages ?? []).flatMap((p) => p.items), [inbox.data]);
  const unread = inbox.data?.pages[0]?.unreadCount ?? items.filter((n) => !n.read).length;
  const sections = inboxSections(items);
  const missingApi = inbox.error && (inbox.error as { status?: number }).status === 404;

  return (
    <Screen
      back
      title="Notifications"
      largeTitle
      refreshing={inbox.isRefetching}
      onRefresh={() => void inbox.refetch()}
      trailing={<IconButton icon={Settings} label="Notification settings" variant="secondary" size={36} onPress={() => router.push("/settings/notifications")} />}
      subtitle={
        unread > 0 ? (
          <View style={styles.subtitle}>
            <Text variant="meta" color="fgMuted" tabular>{`${unread} unread`}</Text>
            <Button variant="ghost" size="sm" onPress={() => markRead.mutate(null)} style={{ marginRight: -4 }}>
              Mark all read
            </Button>
          </View>
        ) : null
      }
    >
      {inbox.isLoading ? (
        <SkeletonRows rows={6} trailing={false} />
      ) : inbox.isError && !missingApi && items.length === 0 ? (
        <ErrorState offline={!online} message={online ? "Your notifications didn't load." : "You're offline. Notifications load when you're back."} onRetry={() => void inbox.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState body="Nothing yet. Points, rewards and order updates from your shops land here." actionLabel="Notification settings" onAction={() => router.push("/settings/notifications")} />
      ) : (
        sections.map((s) => (
          <Section key={s.title} title={s.title}>
            {s.data.map((n, i) => (
              <Row
                key={n.id}
                n={n}
                divider={i < s.data.length - 1}
                onPress={() => {
                  if (!n.read) markRead.mutate(n.id);
                  openNotification(n);
                }}
              />
            ))}
          </Section>
        ))
      )}
      {inbox.hasNextPage ? (
        <Button variant="secondary" loading={inbox.isFetchingNextPage} onPress={() => void inbox.fetchNextPage()}>
          Show older
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  lead: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  titleLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  divider: { position: "absolute", left: 56, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  subtitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
});
