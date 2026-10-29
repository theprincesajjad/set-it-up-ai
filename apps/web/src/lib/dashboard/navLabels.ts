/**
 * Sidebar row labels in the four languages. `nav.ts` keeps the English label (tests and e2e read it); the shell looks the
 * words up here by that label and falls back to the English text for a label it does not know.
 */
import type { MessageKey } from "@ll/shared";

export const NAV_LABEL_KEYS: Record<string, MessageKey> = {
  Home: "shell.nav.home",
  Today: "shell.nav.today",
  Counter: "shell.nav.counter",
  Customers: "shell.nav.customers",
  Rewards: "shell.nav.rewards",
  "Program & rewards": "shell.nav.programRewards",
  Promos: "shell.nav.promos",
  "Discount cards": "shell.nav.discountCards",
  Messages: "shell.nav.messages",
  "Texts & email": "shell.nav.textsEmail",
  Reports: "shell.nav.reports",
  Ads: "shell.nav.ads",
  "Street campaigns": "shell.nav.streetCampaigns",
  "Locations & QR kit": "shell.nav.locations",
  Settings: "shell.nav.settings",
  Staff: "shell.nav.staff",
  "POS & integrations": "shell.nav.integrations",
  "Billing & plans": "shell.nav.billing",
  Orders: "shell.nav.orders",
  Tickets: "shell.nav.tickets",
  Invoices: "shell.nav.invoices",
  "Walk-in line": "shell.nav.walkIn",
  Calendar: "shell.nav.calendar",
  Pets: "shell.nav.pets",
  "Groom rebooking": "shell.nav.groomRebooking",
  "Daycare today": "shell.nav.daycare",
  "Food cards": "shell.nav.foodCards",
  "Wash desk": "shell.nav.wash",
  Vehicles: "shell.nav.vehicles",
  "Service reminders": "shell.nav.serviceReminders",
  "Tire season": "shell.nav.tireSeason",
  "Class schedule": "shell.nav.classes",
  "Door check-in": "shell.nav.door",
  "Desk sale": "shell.nav.deskSale",
  "Memberships & passes": "shell.nav.memberships",
  "Services & prices": "shell.nav.services",
  "Price list": "shell.nav.priceList",
  "Menu and prices": "shell.nav.catalog",
  Rebooking: "shell.nav.rebooking",
  "Drop-off slots": "shell.nav.dropoffSlots",
  "Pickup & drop-off": "shell.nav.pickupSlots",
  "Pharmacy rules": "shell.nav.pharmacy",
  Payouts: "shell.nav.payouts",
  "Kitchen display": "shell.nav.kitchen",
  "Phone orders": "shell.nav.phoneOrders",
  "Pre-orders": "shell.nav.preorders",
  "Catering & banquet": "shell.nav.catering",
  Catering: "shell.nav.cateringOnly",
  Banquet: "shell.nav.banquet",
  Tiffin: "shell.nav.tiffin",
  "Menu & dietary": "shell.nav.menuDietary",
  WhatsApp: "shell.nav.whatsapp",
  Reviews: "shell.nav.reviews",
  Festivals: "shell.nav.festivals",
  "More for restaurants": "shell.nav.moreRestaurants",
  "Butcher counter": "shell.nav.butcher",
  "Weekly flyer": "shell.nav.flyer",
  "Pantry reminders": "shell.nav.pantry",
  // phase-solo D
  Inbox: "shell.nav.inbox",
  Website: "shell.nav.site",
};

/** The word for a row in the active language, or the English label when there is none. */
export function navLabel(t: (key: MessageKey) => string, label: string): string {
  const key = NAV_LABEL_KEYS[label];
  return key ? t(key) : label;
}
