/**
 * Haptics (foundations.md § Native details): a light tick on tab / selection,
 * success on award and redeem, warning on undo. Never throws (web, old devices).
 */
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const safe = (p: () => Promise<unknown>) => {
  if (Platform.OS === "web") return;
  p().catch(() => undefined);
};

export const haptic = {
  /** Tab switch, capsule toggle, keypad key. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Button press that commits something small. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Points awarded, reward redeemed, code verified. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Undo, offline queue, soft errors. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
