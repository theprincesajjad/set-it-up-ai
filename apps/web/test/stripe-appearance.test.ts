import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersDark, stripeAppearance } from "@/lib/stripeAppearance";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
});

describe("Stripe Payment Element appearance", () => {
  it("uses dark text on the light page and light text on the dark page", () => {
    expect(stripeAppearance(false)).toMatchObject({ theme: "stripe", variables: { colorText: "#0B0B0C", colorBackground: "#FFFFFF" } });
    expect(stripeAppearance(true)).toMatchObject({ theme: "night", variables: { colorText: "#F5F5F4", colorTextSecondary: "#A1A1A8" } });
  });

  it("follows the OS scheme unless the page forces a theme", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), media: q }));
    expect(prefersDark()).toBe(true);
    document.documentElement.setAttribute("data-theme", "light");
    expect(prefersDark()).toBe(false);
    document.documentElement.setAttribute("data-theme", "dark");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(prefersDark()).toBe(true);
  });
});
