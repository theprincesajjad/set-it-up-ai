"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in server-rendered HTML and while React is hydrating, true once the page's script is running. A form button that is disabled until
 * then cannot submit natively (a GET to the page itself, which wipes what was typed and the link's own context) before its handler exists.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
