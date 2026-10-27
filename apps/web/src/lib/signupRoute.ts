/**
 * Where a new owner lands after signup, by trade (founder decision 2026-10-27, trade tools self-serve; docs/audits/main-street-self-serve.md).
 *  - restaurant, tiffin, caterer, banquet hall: the restaurant plan screen, with the right tier marked, then a menu-first setup.
 *  - salon, barber, repair, pet, auto, studio, grocer: their own setup step (services, hours and tax, classes, price list).
 *  - pharmacy: the pharmacist's rules. Everyone else: the first stamp.
 * A plan button on /pricing wins: the checkout for that plan opens straight away from the billing page.
 */
import { tradeSetupFor, type RestaurantTier } from "@ll/shared";

export const RESTAURANT_VERTICALS: readonly string[] = ["restaurant", "restaurant_south_asian", "tiffin", "caterer", "banquet_hall", "bar"];

/** Tiffin and catering need Growth ($199), a banquet hall needs Pro ($349), a restaurant starts on Starter ($99). */
export function recommendedRestaurantTier(vertical: string): RestaurantTier {
  if (vertical === "tiffin" || vertical === "caterer") return "growth";
  if (vertical === "banquet_hall") return "pro";
  return "starter";
}

export function afterSignupPath(base: string, vertical: string, plan?: string | null): string {
  if (plan) return `${base}/billing?subscribe=${plan}`;
  if (RESTAURANT_VERTICALS.includes(vertical)) return `${base}/billing?welcome=restaurant&tier=${recommendedRestaurantTier(vertical)}`;
  if (vertical === "pharmacy") return `${base}/setup?step=pharmacy_rules`;
  return `${base}/setup?step=${tradeSetupFor(vertical) ? "trade_setup" : "first_stamp"}`;
}
