"use client";
/**
 * Which look a customer page is drawn in: "clear" (the default, docs/design/v3.2-clear.md) or "warm" (Main Street Warm, a per-shop
 * setting). The pass, its tab bar and the map read it so the parts whose structure differs (the Wallet-style pass card, the glass bottom
 * sheet) render the right markup.
 *
 * The truth is `data-theme-style` on <html> (set before paint by the root script, a shop's <ThemeStyle>, or `?theme=`). The server
 * snapshot is the nearest <ThemeStyle> provider's value (Clear without one), so a Warm shop page renders Warm on the server and a page
 * whose attribute differs (a `?theme=` QA override) re-renders once after hydration, without a hydration warning.
 */
import { useSyncExternalStore } from "react";
import type { ThemeStyle } from "@ll/shared";
import { useThemeStyle } from "@/components/ui/ThemeStyle";

function read(): ThemeStyle {
  return document.documentElement.getAttribute("data-theme-style") === "warm" ? "warm" : "clear";
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-style"] });
  return () => mo.disconnect();
}

export function usePassStyle(): ThemeStyle {
  const ctx = useThemeStyle().style;
  return useSyncExternalStore(subscribe, read, () => ctx);
}
