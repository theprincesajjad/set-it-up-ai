/**
 * Notifications inbox + per-type preferences, on the customer notifications API
 * (packages/shared customerApi: GET /v1/me/notifications, POST …/:id/read, POST …/read-all,
 * GET/PUT /v1/me/notification-prefs). Screen-side helpers only; push registration lives in features/push.ts.
 *
 * If the API answers 404 (an older server), the inbox shows its empty state and the settings screen falls back
 * to the device-only switches, so nothing breaks.
 */
import { customerApi } from "@ll/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { router } from "expo-router";
import { isApiError } from "../../api/client";
import { api } from "../../state/api";
import { qk } from "../../state/query";
import { useSession } from "../../state/session";
import { openDeepLink } from "../deepLinks";

type Page = customerApi.NotificationsResponse;

export function useInbox() {
  const { status } = useSession();
  return useInfiniteQuery({
    queryKey: qk.notifications,
    enabled: status === "signedIn",
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.notifications.list({ limit: 30, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}

/** Unread count for the bell. Polls gently (60 s) and treats a missing API as zero. */
export function useUnreadCount(): number {
  const { status } = useSession();
  const q = useQuery({
    queryKey: qk.notificationsUnread,
    enabled: status === "signedIn",
    queryFn: async () => {
      try {
        return (await api.notifications.list({ limit: 1, unread: true })).unreadCount;
      } catch (e) {
        if (isApiError(e) && e.status === 404) return 0;
        throw e;
      }
    },
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  return q.data ?? 0;
}

function patchRead(data: InfiniteData<Page> | undefined, id: string | null, unreadCount: number): InfiniteData<Page> | undefined {
  if (!data) return data;
  const now = new Date().toISOString();
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      unreadCount,
      items: p.items.map((n) => (id === null || n.id === id ? { ...n, read: true, readAt: n.readAt ?? now } : n)),
    })),
  };
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | null) => (id ? api.notifications.read(id) : api.notifications.readAll()),
    onMutate: (id) => {
      // Optimistic: the dot goes the moment you tap.
      const prev = qc.getQueryData<InfiniteData<Page>>(qk.notifications);
      const unread = qc.getQueryData<number>(qk.notificationsUnread) ?? 0;
      const next = id === null ? 0 : Math.max(0, unread - 1);
      qc.setQueryData(qk.notifications, patchRead(prev, id, next));
      qc.setQueryData(qk.notificationsUnread, next);
      return { prev, unread };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.notifications, ctx.prev);
      if (ctx) qc.setQueryData(qk.notificationsUnread, ctx.unread);
    },
    onSuccess: (res) => qc.setQueryData(qk.notificationsUnread, res.unreadCount),
  });
}

/** Where a notification goes when tapped (its `data`), falling back to the shop. */
export function openNotification(n: customerApi.NotificationDto): void {
  const d = n.data ?? {};
  if (typeof d.url === "string" && d.url) return openDeepLink(d.url);
  const slug = (typeof d.slug === "string" && d.slug) || n.merchant?.slug;
  switch (d.screen) {
    case "rewards":
      return void router.push("/rewards");
    case "card":
      return void router.push("/card");
    case "order":
      if (typeof d.orderId === "string") return void router.push(`/orders/${d.orderId}`);
      break;
    case "ticket":
      if (typeof d.ticketId === "string") return void router.push(`/tickets/${d.ticketId}`);
      break;
    case "campaign":
      if (typeof d.campaignId === "string") return void router.push(`/campaigns/${d.campaignId}`);
      break;
    default:
      break;
  }
  if (slug) router.push(`/shop/${slug}`);
}

/** Inbox sections: today · this week · earlier. */
export function inboxSections(items: customerApi.NotificationDto[], now = new Date()): { title: string; data: customerApi.NotificationDto[] }[] {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = startOfDay - 6 * 24 * 60 * 60_000;
  const out = [
    { title: "today", data: [] as customerApi.NotificationDto[] },
    { title: "this week", data: [] as customerApi.NotificationDto[] },
    { title: "earlier", data: [] as customerApi.NotificationDto[] },
  ];
  for (const n of items) {
    const t = new Date(n.createdAt).getTime();
    (t >= startOfDay ? out[0]! : t >= weekAgo ? out[1]! : out[2]!).data.push(n);
  }
  return out.filter((s) => s.data.length > 0);
}

// ---------------------------------------------------------------- preferences

export function useNotificationPrefs() {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.notificationPrefs,
    enabled: status === "signedIn",
    queryFn: api.notifications.prefs,
    retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2,
    staleTime: 5 * 60_000,
  });
}

/** One switch = one type/channel pair. Optimistic, rolled back if the PUT fails. */
export function useSetNotificationPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { type: customerApi.NotificationType; channel: customerApi.NotificationChannel; enabled: boolean }) => api.notifications.updatePrefs({ prefs: [p] }),
    onMutate: (p) => {
      const prev = qc.getQueryData<customerApi.NotificationPrefsResponse>(qk.notificationPrefs);
      if (prev) {
        qc.setQueryData<customerApi.NotificationPrefsResponse>(qk.notificationPrefs, {
          ...prev,
          items: prev.items.map((x) => (x.type === p.type ? { ...x, channels: { ...x.channels, [p.channel]: p.enabled } } : x)),
        });
      }
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.notificationPrefs, ctx.prev);
    },
    onSuccess: (res) => qc.setQueryData(qk.notificationPrefs, res),
  });
}

/** Settings groups, in catalogue order. "Points and rewards" · "Orders and repairs" · "Offers". */
export const PREF_GROUPS: { title: string; channel: customerApi.AndroidChannelId; note?: string }[] = [
  { title: "Points and rewards", channel: "points" },
  { title: "Orders and repairs", channel: "orders" },
  { title: "Offers", channel: "offers", note: "Only from shops you've said yes to, at most one a day, never 9 pm to 8 am." },
];

export function groupPrefs(items: customerApi.NotificationPrefDto[]): { title: string; note?: string; items: customerApi.NotificationPrefDto[] }[] {
  return PREF_GROUPS.map((g) => ({
    title: g.title,
    note: g.note,
    items: items.filter((x) => customerApi.NOTIFICATION_CATALOG.find((c) => c.type === x.type)?.androidChannel === g.channel),
  })).filter((g) => g.items.length > 0);
}

export const CHANNEL_LABELS: Record<customerApi.NotificationChannel, string> = { push: "Push", sms: "Text", email: "Email" };
