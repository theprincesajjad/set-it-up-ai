/**
 * Push wiring for the customer app (owned by the notifications/API team).
 *
 *  - Android channels "points", "orders", "offers" (customerApi.ANDROID_CHANNELS). The server
 *    sets `channelId` on every push (points_earned/reward_* → points, orders/repairs → orders,
 *    promo_nearby → offers), so customers can mute offers in Android settings without losing orders.
 *  - registerForCustomerPush(): creates the channels, then the usual permission + Expo token
 *    registration (features/push.ts → POST /v1/me/push-tokens).
 *  - Taps: every push carries `data` { type, notificationId, screen, url, merchantId, slug, orderId, ... }
 *    (docs/engineering/api/notifications.md). useNotificationTaps() routes taps (including the tap
 *    that cold-started the app) and marks the inbox item read.
 *
 * Wiring (UI team): in app/_layout.tsx call `useNotificationTaps()` once, instead of the tap
 * listener inside features/push.ts configureNotifications(); and call registerForCustomerPush()
 * where registerForPush() is called today. No screens here.
 */
import { customerApi } from "@ll/shared";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { apiClient } from "../../state/api";
import { tiffinRoute } from "../../lib/restaurant";
import { openDeepLink } from "../deepLinks";
import { registerForPush, type PushResult } from "../push";

const IMPORTANCE = {
  low: Notifications.AndroidImportance.LOW,
  default: Notifications.AndroidImportance.DEFAULT,
  high: Notifications.AndroidImportance.HIGH,
} as const;

/** Create the Android notification channels (no-op elsewhere). Safe to call repeatedly. */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  for (const [id, c] of Object.entries(customerApi.ANDROID_CHANNELS)) {
    await Notifications.setNotificationChannelAsync(id, {
      name: c.name,
      importance: IMPORTANCE[c.importance],
      ...(id === "offers" ? { sound: null, vibrationPattern: null, enableVibrate: false } : {}),
    });
  }
}

/** Channels first (so the very first push lands in the right one), then permission + token. */
export async function registerForCustomerPush(): Promise<PushResult> {
  await setupNotificationChannels().catch(() => undefined);
  return registerForPush();
}

/** Where a push / inbox item goes. Returns the router path, or null if it only has a URL. */
export function routeForNotification(data: customerApi.NotificationData | undefined | null): string | null {
  const d = data ?? {};
  const s = (k: string) => (typeof d[k] === "string" && (d[k] as string)) || null;
  // Tiffin pushes carry the subscription id (no `screen`): delivery, billing and tomorrow's menu all open the subscription.
  const tiffin = tiffinRoute(d);
  if (tiffin) return tiffin;
  switch (d.screen) {
    case "order":
      return s("orderId") ? `/orders/${s("orderId")}` : null;
    case "ticket":
      return s("ticketId") ? `/tickets/${s("ticketId")}` : null;
    case "campaign":
      return s("campaignId") ? `/campaigns/${s("campaignId")}` : null;
    case "rewards":
      return "/rewards";
    case "card":
      return "/card";
    case "inbox":
      return "/notifications";
    case "shop":
      return s("slug") ? `/shop/${s("slug")}` : null;
    default:
      return s("slug") ? `/shop/${s("slug")}` : null;
  }
}

/** Open a notification's target: the app deep link (`url`) first, then screen/ids. */
export function openNotificationData(data: customerApi.NotificationData | undefined | null): void {
  const url = data && typeof data.url === "string" ? data.url : null;
  if (url) return openDeepLink(url);
  const to = routeForNotification(data);
  if (to) router.push(to as never);
}

async function markRead(id: unknown): Promise<void> {
  if (typeof id !== "string" || !id) return;
  await apiClient.post(`/v1/me/notifications/${encodeURIComponent(id)}/read`).catch(() => undefined);
}

function handleResponse(resp: Notifications.NotificationResponse | null | undefined, seen: Set<string>) {
  if (!resp) return;
  const key = resp.notification.request.identifier;
  if (seen.has(key)) return;
  seen.add(key);
  const data = resp.notification.request.content.data as customerApi.NotificationData | undefined;
  void markRead(data?.notificationId);
  openNotificationData(data);
}

/**
 * Route notification taps (warm and cold start) and mark them read. Mount once, in the root layout,
 * after the router is ready.
 */
export function useNotificationTaps(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const seen = new Set<string>();
    try {
      handleResponse(Notifications.getLastNotificationResponse(), seen);
    } catch {
      /* not available (web / tests) */
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handleResponse(r, seen));
    return () => sub.remove();
  }, []);
}
