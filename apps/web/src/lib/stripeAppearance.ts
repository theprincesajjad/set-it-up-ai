import type { Appearance } from "@stripe/stripe-js";
import { rolesV3 } from "@ll/design-tokens";

/**
 * Page colours the Payment Element sits on, read from the v3 role values in @ll/design-tokens (background, foreground,
 * muted-foreground, destructive) so Stripe's iframe cannot drift from the page. Stripe takes literal colours, not CSS variables.
 */
const pick = (r: typeof rolesV3.light) => ({ colorBackground: r.background, colorPrimary: r.primary, colorText: r.foreground, colorTextSecondary: r.mutedForeground, colorDanger: r.destructive }) as const;
const LIGHT = pick(rolesV3.light);
const DARK = pick(rolesV3.dark);

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
