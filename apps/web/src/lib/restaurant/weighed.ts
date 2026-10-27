/** Weighed lines on a butcher or grocer's menu: sold by the kg or lb, priced after the scale. Pure and client-safe. */
import { GRAMS_PER_LB } from "@ll/shared";
import type { commerceApi } from "@ll/shared";

type Item = Pick<commerceApi.CatalogItemDto, "weightUnit" | "unitPriceCents" | "nominalWeightG" | "preorderOnly">;

/** A cut sold by weight and ordered ahead (not a whole-animal booking, which is pre-order only). */
export const isWeighedLine = (i: Item): boolean => !!i.weightUnit && !!i.unitPriceCents && !i.preorderOnly;

/** "500 g", "1 kg", "1.5 kg", "2 lb": what one estimate portion weighs, in the shop's unit. */
export function portionLabel(grams: number, unit: "kg" | "lb"): string {
  if (unit === "lb") {
    const lb = Math.round((grams / GRAMS_PER_LB) * 10) / 10;
    return `${lb} lb`;
  }
  return grams < 1000 ? `${Math.round(grams)} g` : `${Math.round((grams / 1000) * 100) / 100} kg`;
}

/** Whole-number days when the notice is a whole number of days (336 hours is 14 days), else null. */
export const noticeDays = (hours: number): number | null => (hours >= 48 && hours % 24 === 0 ? hours / 24 : null);
