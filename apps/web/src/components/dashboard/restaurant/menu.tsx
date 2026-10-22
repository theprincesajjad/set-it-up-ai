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

const isHalal = (d: Dietary | undefined | null) => !!(d && (d.halal || d.zabihah));

/**
 * The halal certifier every halal item shares, so a list can say it once ("Halal items certified by X").
 * Null when there is none, or when halal items name different certifiers (or some name none): then each row shows its own.
 */
export function sharedCertifier(items: { dietary?: Dietary | null }[]): string | null {
  const halal = items.filter((i) => isHalal(i.dietary));
  const names = new Set(halal.map((i) => i.dietary?.halalCertifier?.trim() ?? ""));
  const only = names.size === 1 ? [...names][0]! : "";
  return halal.length && only ? only : null;
}

/** A row's own certifier: shown only when it is not already said once in the list header. */
export function rowCertifier(d: Dietary | undefined | null, shared: string | null): string | null {
  const c = isHalal(d) ? d?.halalCertifier?.trim() : undefined;
  return c && c !== shared ? c : null;
}

export const COMMON_ALLERGENS = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Sesame", "Fish", "Shellfish", "Mustard"] as const;
export const STATION_PRESETS = ["tandoor", "curry", "grill", "chai", "sweets", "fry"] as const;

/** "tandoor" -> "Tandoor". Stations are free text from the shop. */
export const stationLabel = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
