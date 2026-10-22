/**
 * Push registration (expo-notifications → POST /v1/me/push-tokens).
 * Asked only after the pre-permission sheet ("Know when you've earned a
 * reward"), never cold. Taps open the deep link in the payload (ll://...).
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { api } from "../state/api";
import { KEYS, setJson } from "../state/storage";

export function configureNotifications(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as { url?: string; deepLink?: string } | undefined;
    const url = data?.url ?? data?.deepLink;
    if (typeof url === "string") openDeepLink(url);
  });
  return () => sub.remove();
}

/** ll://shop/<slug> → /shop/<slug>, ll://card → /card, etc. */
export function openDeepLink(url: string): void {
  const path = url.replace(/^ll:\/\//, "/").replace(/^https?:\/\/[^/]+/, "");
  const map: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^\/shop\/([^/?#]+)/, (m) => `/shop/${m[1]}`],
    [/^\/s\/([^/?#]+)/, (m) => `/shop/${m[1]}`],
    [/^\/card/, () => "/card"],
    [/^\/rewards/, () => "/rewards"],
    [/^\/ticket\/([^/?#]+)/, (m) => `/tickets/${m[1]}`],
    [/^\/order\/([^/?#]+)/, (m) => `/orders/${m[1]}`],
    [/^\/campaign\/([^/?#]+)/, (m) => `/campaigns/${m[1]}`],
    [/^\/(?:q|quote)\/([^/?#]+)/, (m) => `/quote/${m[1]}`],
  ];
  for (const [re, to] of map) {
    const m = path.match(re);
    if (m) {
      router.push(to(m) as never);
      return;
    }
  }
}

export type PushResult = "registered" | "denied" | "unavailable";

export async function registerForPush(): Promise<PushResult> {
  if (!Device.isDevice) return "unavailable";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Points and orders", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return "denied";
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return "unavailable"; // needs EAS_PROJECT_ID (docs/engineering/mobile.md)
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.me.registerPushToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
  await setJson(KEYS.pushToken, { token });
  return "registered";
}

export async function pushPermissionDenied(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return !p.granted && !p.canAskAgain;
}
