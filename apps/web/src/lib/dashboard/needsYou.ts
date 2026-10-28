"use client";
/**
 * How many things need the shop right now, published by the Today page and read by the bell in the top bar.
 * Null until Today has loaded (the bell then shows no dot rather than a guess). Module state, one shop at a time.
 */
import { useSyncExternalStore } from "react";

let count: number | null = null;
const listeners = new Set<() => void>();

export function publishNeedsYou(n: number | null) {
  if (n === count) return;
  count = n;
  listeners.forEach((l) => l());
}

export function useNeedsYouCount(): number | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => count,
    () => null,
  );
}
