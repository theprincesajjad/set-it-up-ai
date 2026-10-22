import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AppState } from "react-native";

/**
 * While the screen is focused: brightness to max and keep awake (staff are
 * scanning). Restores the previous brightness on blur or backgrounding.
 */
export function useBrightScreen(tag: string, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let previous: number | null = null;
      let active = true;
      const up = async () => {
        try {
          if (previous === null) previous = await Brightness.getBrightnessAsync();
          if (active) await Brightness.setBrightnessAsync(1);
        } catch {
          // brightness unavailable (simulator): ignore
        }
      };
      const restore = async () => {
        try {
          if (previous !== null) await Brightness.setBrightnessAsync(previous);
        } catch {
          // ignore
        }
      };
      void up();
      void activateKeepAwakeAsync(tag).catch(() => undefined);
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void up();
        else void restore();
      });
      return () => {
        active = false;
        sub.remove();
        void restore();
        void deactivateKeepAwake(tag).catch(() => undefined);
      };
    }, [tag, enabled]),
  );
}
