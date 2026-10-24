import type { Appearance } from "@stripe/stripe-js";

/** Page colours the Payment Element sits on (design tokens: bg, fg, fg-muted, line) in each scheme. */
const LIGHT = { colorBackground: "#FFFFFF", colorPrimary: "#0B0B0C", colorText: "#0B0B0C", colorTextSecondary: "#6B6B70", colorDanger: "#B42318" } as const;
const DARK = { colorBackground: "#161618", colorPrimary: "#F5F5F4", colorText: "#F5F5F4", colorTextSecondary: "#A1A1A8", colorDanger: "#F97066" } as const;

/** True when the page renders dark: an explicit data-theme wins, otherwise the OS setting (same rule as the tokens). */
export function prefersDark(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark") return true;
  if (forced === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Stripe Elements appearance that follows the page: light text on the dark page, dark text on the light one. */
export function stripeAppearance(dark: boolean = prefersDark()): Appearance {
  return { theme: dark ? "night" : "stripe", variables: { ...(dark ? DARK : LIGHT), borderRadius: "10px", fontFamily: "Inter, system-ui, sans-serif" } };
}
