/**
 * Push registration (expo-notifications → POST /v1/me/push-tokens).
 * Asked only after the pre-permission sheet ("Know when you've earned a
 * reward"), never cold. Taps: features/customer/notifications.ts useNotificationTaps().
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../state/api";
import { KEYS, setJson } from "../state/storage";
import { openDeepLink } from "./deepLinks";

export { openDeepLink };

export function configureNotifications(): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  // Taps are routed by useNotificationTaps() (features/customer/notifications.ts), mounted in app/_layout.tsx.
  return () => undefined;
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
