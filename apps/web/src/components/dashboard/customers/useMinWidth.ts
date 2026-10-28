"use client";
import { useSyncExternalStore } from "react";

/** true from `px` wide up (matchMedia); false on the server and before hydration. */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(`(min-width: ${px}px)`);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}
