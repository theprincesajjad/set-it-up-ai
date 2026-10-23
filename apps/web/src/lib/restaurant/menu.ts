/** Menu filters and sections for the customer menu (frame 11): dietary chips, "Without nuts", category tabs with Degh last. Pure. */
import { restaurantWebApi } from "@ll/shared";
import type { Item } from "./order";

export interface Filters {
  halal: boolean;
  veg: boolean;
  vegan: boolean;
  jain: boolean;
  glutenFree: boolean;
  /** Hides every dish whose allergens include peanut or tree nut. */
  withoutNuts: boolean;
}
export const NO_FILTERS: Filters = { halal: false, veg: false, vegan: false, jain: false, glutenFree: false, withoutNuts: false };
export const isFiltering = (f: Filters) => Object.values(f).some(Boolean);

/** Same rules as the API's matchesDiet: halal includes zabihah, vegetarian includes vegan and Jain. Untagged dishes never pass a dietary chip. */
export function matches(i: Pick<Item, "dietary">, f: Filters): boolean {
  const d = i.dietary ?? {};
  if (f.halal && !(d.halal || d.zabihah)) return false;
  if (f.veg && !(d.vegetarian || d.vegan || d.jain)) return false;
  if (f.vegan && !d.vegan) return false;
  if (f.jain && !d.jain) return false;
  if (f.glutenFree && !d.glutenFree) return false;
  if (f.withoutNuts && restaurantWebApi.dishAllergens(d.allergens).some((a) => a === "peanut" || a === "tree_nut")) return false;
  return true;
}

export interface Section {
  id: string;
  name: string;
  items: Item[];
  /** The pre-order dishes (degh, trays): always the last tab. */
  preorder?: boolean;
}

/** Categories in menu order, then uncategorised dishes, then Degh (every pre-order-only dish) last. Empty sections are dropped. */
export function buildSections(menu: { categories: { id: string; name: string; items: Item[] }[]; uncategorized: Item[] }, labels: { more: string; degh: string }): Section[] {
  const regular = (items: Item[]) => items.filter((i) => !i.preorderOnly);
  const degh = [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized].filter((i) => i.preorderOnly);
  const out: Section[] = [
    ...menu.categories.map((c) => ({ id: c.id, name: c.name, items: regular(c.items) })),
    { id: "more", name: labels.more, items: regular(menu.uncategorized) },
    { id: "degh", name: labels.degh, items: degh, preorder: true },
  ];
  return out.filter((s) => s.items.length > 0);
}

/** Does any dish carry this kind of tag? Chips for tags nobody uses would only ever empty the menu. */
export function available(items: Item[]) {
  const any = (fn: (d: NonNullable<Item["dietary"]>) => unknown) => items.some((i) => i.dietary && fn(i.dietary));
  return {
    halal: any((d) => d.halal || d.zabihah),
    veg: any((d) => d.vegetarian || d.vegan || d.jain),
    vegan: any((d) => d.vegan),
    jain: any((d) => d.jain),
    glutenFree: any((d) => d.glutenFree),
    /** The shop tags allergens at all: "Without nuts" only means something then (an untagged dish proves nothing, so this is the shop's own claim). */
    nuts: items.some((i) => i.dietary?.allergens?.length),
  };
}
