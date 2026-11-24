/**
 * Haptics (foundations.md § Native details). One helper so every screen feels the same:
 * - select: tab switch, capsule / chip toggle, keypad key
 * - tap: light impact on a primary button press
 * - success: stamp or points awarded, reward redeemed, booking or order confirmed
 * - warning: undo, queued offline
 * - error: a failed action (the error toast fires it too; the dedupe keeps it to one buzz)
 *
 * Never throws (web, old devices, no Taptic engine). `setHapticsEnabled(false)` turns every call off.
 */
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticKind = "select" | "tap" | "success" | "warning" | "error";

let enabled = true;
/** The last outcome buzz (success / warning / error) and when, so one action never buzzes twice. */
let lastOutcome: { kind: HapticKind; at: number } | null = null;
/** Outcomes of the same kind closer than this are one event (a toast plus the screen that raised it). */
export const OUTCOME_DEDUPE_MS = 400;

/** Turn haptics off (or back on) for the whole app. */
export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

export function hapticsEnabled() {
  return enabled;
}

const fire = (kind: HapticKind, p: () => Promise<unknown>) => {
  if (!enabled || Platform.OS === "web") return false;
  if (kind === "success" || kind === "warning" || kind === "error") {
    const now = Date.now();
    if (lastOutcome && lastOutcome.kind === kind && now - lastOutcome.at < OUTCOME_DEDUPE_MS) return false;
    lastOutcome = { kind, at: now };
  }
  try {
    p().catch(() => undefined);
  } catch {
    return false;
  }
  return true;
};

export const haptic = {
  select: () => fire("select", () => Haptics.selectionAsync()),
  tap: () => fire("tap", () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => fire("success", () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire("warning", () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire("error", () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

/** For tests: forget the last outcome. */
export function resetHapticsForTest() {
  lastOutcome = null;
  enabled = true;
}
