/**
 * Lets a tab screen hide the floating tab bar (Explore hides it while a shop
 * sheet is up, like Corner). Tiny external store, no dependency.
 */
import { useEffect, useSyncExternalStore } from "react";

let hidden = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  if (hidden === v) return;
  hidden = v;
  listeners.forEach((l) => l());
};

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden,
    () => hidden,
  );
}

/** Hide the tab bar while `when` is true (and on unmount, show it again). */
export function useHideTabBar(when: boolean) {
  useEffect(() => {
    set(when);
    return () => set(false);
  }, [when]);
}
