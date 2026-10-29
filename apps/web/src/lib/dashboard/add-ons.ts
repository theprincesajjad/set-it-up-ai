/**
 * phase-pro P5: add-ons at booking (docs/business/pro-value.md §3.2 P5). Copy helpers shared by the services page section,
 * the appointment sheet and the booking step.
 */
import type { MessageKey } from "@ll/shared";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The trade's usual extras, for the plan line and the empty state ("Nail art, removal, a French tip"). */
const EXAMPLES: Record<string, MessageKey> = {
  nails: "addon.examples.nails",
  brows_lashes: "addon.examples.brows",
  makeup: "addon.examples.makeup",
  salon: "addon.examples.salon",
  barber: "addon.examples.barber",
  pet: "addon.examples.pet",
};

export function addOnExamples(t: T, vertical: string | undefined): string {
  return t(EXAMPLES[vertical ?? ""] ?? "addon.examples.other");
}

/** "+$10 · +15 min", or "+$10" when it adds no time. */
export function addOnPriceTime(t: T, money: (cents: number) => string, duration: (min: number) => string, a: { priceCents: number; durationMin: number }): string {
  return a.durationMin > 0 ? t("addon.plusPriceTime", { price: money(a.priceCents), duration: duration(a.durationMin) }) : t("addon.plusPrice", { price: money(a.priceCents) });
}

/** Whole dollars from a text field ("12.5" → 1250). */
export const toCents = (v: string) => Math.round(Number(v || 0) * 100);
export const dollars = (cents: number) => (cents ? String(cents / 100) : "");
