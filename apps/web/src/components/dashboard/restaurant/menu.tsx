"use client";
/**
 * Small pieces for the menu & dietary editor and anything else that shows an item's dietary tags:
 * spice as dots, tag chips, and the helpers that turn a catalog item into a list line.
 * Halal claims are the shop's own: the certifier is shown as given, never as ours.
 */
import type { commerceApi } from "@ll/shared";
import { cn } from "@/lib/cn";

export type Dietary = NonNullable<commerceApi.CatalogItemDto["dietary"]>;

export const SPICE_LABELS = ["No heat", "Mild", "Medium", "Hot"] as const;

/** Spice 0 to 3 as three dots (filled = heat). Spoken as "Spice level: Medium". */
export function SpiceDots({ level, className }: { level: number; className?: string }) {
  return (
    <span role="img" aria-label={`Spice level: ${SPICE_LABELS[level] ?? level}`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3].map((n) => (
        <span key={n} aria-hidden className={cn("size-1.5 rounded-full", n <= level ? "bg-fg" : "bg-bg-muted ring-1 ring-inset ring-line-strong/60")} />
      ))}
    </span>
  );
}

/** The dietary tags on one item, as the words a cook would say. */
export function dietTags(d: Dietary | undefined | null): string[] {
  if (!d) return [];
  const out: string[] = [];
  if (d.zabihah) out.push("Zabihah");
  else if (d.halal) out.push("Halal");
  if (d.vegan) out.push("Vegan");
  else if (d.vegetarian) out.push("Veg");
  if (d.jain) out.push("Jain");
  if (d.glutenFree) out.push("Gluten-free");
  return out;
}

/** Tag chips + spice dots for a list row. Quiet: hairline capsules, no colour. */
export function DietChips({ dietary, className }: { dietary: Dietary | undefined | null; className?: string }) {
  const tags = dietTags(dietary);
  const spice = dietary?.spice ?? 0;
  if (!tags.length && !spice) return <span className={cn("text-meta text-fg-subtle", className)}>No tags</span>;
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tags.map((t) => (
        <span key={t} className="inline-flex h-5 items-center rounded-full border border-line px-2 text-caption text-fg">
          {t}
        </span>
      ))}
      {spice ? <SpiceDots level={spice} /> : null}
    </span>
  );
}

export const COMMON_ALLERGENS = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Sesame", "Fish", "Shellfish", "Mustard"] as const;
export const STATION_PRESETS = ["tandoor", "curry", "grill", "chai", "sweets", "fry"] as const;

/** "tandoor" -> "Tandoor". Stations are free text from the shop. */
export const stationLabel = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
