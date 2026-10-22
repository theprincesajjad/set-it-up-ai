/**
 * Web fallback for push.ts (Expo web preview). Expo push tokens are native only,
 * so registration reports "unavailable" and the settings screen says so.
 */
import { openDeepLink } from "./deepLinks";

export { openDeepLink };

export type PushResult = "registered" | "denied" | "unavailable";

export function configureNotifications(): () => void {
  return () => undefined;
}

export async function registerForPush(): Promise<PushResult> {
  return "unavailable";
}

export async function pushPermissionDenied(): Promise<boolean> {
  return false;
}
