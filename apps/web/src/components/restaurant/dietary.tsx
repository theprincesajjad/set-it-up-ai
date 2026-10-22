"use client";
import type { MessageKey } from "@ll/shared";
import { useLocale } from "@/lib/i18n";
import { ChiliDots, Pill } from "./ui";

type Dietary = { halal?: boolean; zabihah?: boolean; vegetarian?: boolean; vegan?: boolean; jain?: boolean; glutenFree?: boolean; spice?: number; halalCertifier?: string };

/** Dietary pills (halal, zabihah, veg, vegan, Jain, gluten-free) plus chili dots. Halal is the shop's own claim. */
export function dietaryKeys(d: Dietary | null | undefined): MessageKey[] {
  if (!d) return [];
  return [d.zabihah ? "diet.zabihah" : d.halal ? "diet.halal" : null, d.vegan ? "diet.vegan" : d.vegetarian ? "diet.vegetarian" : null, d.jain ? "diet.jain" : null, d.glutenFree ? "diet.glutenFree" : null].filter((k): k is MessageKey => !!k);
}

export function DietaryPills({ dietary }: { dietary: Dietary | null | undefined }) {
  const { t } = useLocale();
  const keys = dietaryKeys(dietary);
  if (!keys.length && !dietary?.spice) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {keys.map((k) => (
        <Pill key={k}>{t(k)}</Pill>
      ))}
      {dietary?.spice ? <ChiliDots level={dietary.spice} /> : null}
    </span>
  );
}
