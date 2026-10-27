/**
 * The short, lowercase kind of place shown in the italic line under a shop name ("café", "phone repair").
 * Same words as the app (apps/mobile/src/lib/explore.ts placeKind), so a shop reads the same everywhere;
 * the long vertical labels ("Pharmacy (front store)", "Phone / computer repair") are for settings and admin.
 */
const KINDS: Record<string, string> = {
  cafe: "café",
  restaurant: "restaurant",
  bakery: "bakery",
  bar: "pub",
  grocery: "market",
  pharmacy: "pharmacy",
  retail: "shop",
  bookstore: "bookshop",
  florist: "florist",
  pet: "pet shop",
  salon: "salon",
  barber: "barber",
  spa: "spa",
  fitness: "studio",
  repair_electronics: "phone repair",
  repair_auto: "auto shop",
  car_wash: "car wash",
  alterations: "tailor",
  dry_cleaning: "dry cleaner",
  print_shop: "print shop",
  other: "shop",
};

export function placeKind(vertical: string | null | undefined): string {
  return (vertical && KINDS[vertical]) || "shop";
}
