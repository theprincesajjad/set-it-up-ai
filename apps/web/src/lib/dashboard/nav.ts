/**
 * Merchant dashboard navigation (merchant-dashboard.md "Shell", foundations.md "Merchant dashboard").
 * Pure so it is unit-tested: locked / unreleased features never appear in navigation.
 *
 * Pricing v2 (packages/shared/src/plans.ts): Free = the loyalty program + reporting on it.
 * Every dashboard section that depends on a paid feature lists its keys in NAV_FEATURES and is
 * shown only when at least one of them is enabled for the shop (plan + rollout + admin override).
 */
import { ADD_ONS, FEATURES, RESTAURANT_PLANS, type AddOnId, type FeatureKey, type PlanId } from "@ll/shared";
import { isAppointmentLed } from "./people";

export type StaffRole = "owner" | "manager" | "staff" | "instructor";

/**
 * The five sidebar sections, in this order, for every trade (v3 shell, strategy 4.1). Only the entries of `run`
 * differ between trades: `today` (Home, Counter), `run` (the trade's own modules), `customers` (Customers, Rewards,
 * Promos, Messages), `grow` (Reports, Ads, Street campaigns) and `shop` (Locations & QR kit, Settings and what sits under it).
 */
export const NAV_SECTIONS = ["today", "run", "customers", "grow", "shop"] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];
/** Kept so older imports compile: a nav entry's group is now its section. */
export type NavGroup = NavSection;

/** Lowercase heading over a sidebar section (English; the shell translates through `shell.section.*`). */
export const NAV_GROUP_LABELS: Record<NavSection, string> = { today: "today", run: "run", customers: "customers", grow: "grow", shop: "shop" };

export interface NavEntry {
  key: string;
  href: string;
  label: string;
  group: NavSection;
  exact?: boolean;
  /** Restaurants: a count shown after the label (new orders, calls to check, chats waiting). */
  badge?: "orders" | "phone" | "whatsapp";
  /** Key of the entry this one sits under (Staff, POS & integrations and Billing sit under Settings). */
  parent?: string;
}

/** Entries in section order (stable inside a section), as the sidebar draws them. */
export function inSectionOrder<T extends { group: NavSection }>(entries: T[]): T[] {
  return NAV_SECTIONS.flatMap((s) => entries.filter((e) => e.group === s));
}

/** The five sections for the sidebar. Always all five keys in order; `run` (or any section) can be empty. */
export function navSections(entries: NavEntry[]): { key: NavSection; entries: NavEntry[] }[] {
  return NAV_SECTIONS.map((key) => ({ key, entries: entries.filter((e) => e.group === key) }));
}

/**
 * Nav key → the paid feature keys that unlock it (any one is enough). Sections not listed here
 * are free forever (home, counter, customers, program, reports, locations, staff, integrations
 * (Google Business Profile), billing, settings).
 */
export const NAV_FEATURES: Record<string, readonly FeatureKey[]> = {
  promos: ["promos.basic", "promos.double_points", "promos.push_nearby"],
  "discount-cards": ["discount_cards"],
  messages: ["marketing.email", "marketing.sms", "marketing.automations"],
  orders: ["orders.order_ahead", "orders.pickup_status", "payments.in_app"],
  tickets: ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices"],
  catalog: ["orders.order_ahead"],
  calendar: ["booking.appointments"],
  // Barbershops, threading bars (docs/research/barbers-beauty.md): the walk-in line and the payouts report.
  queue: ["booking.walkin_queue"],
  payouts: ["staff.payouts"],
  // Groomers, daycare and pet food stores (docs/research/pet-care.md).
  pets: ["pets.profiles"],
  "groom-rebooking": ["pets.profiles"],
  daycare: ["pets.daycare"],
  "food-cards": ["pets.food_cards"],
  // Car washes, garages and tire shops (docs/research/auto-care.md).
  vehicles: ["auto.vehicles"],
  "service-reminders": ["auto.vehicles"],
  "tire-season": ["auto.tires"],
  wash: ["auto.wash"],
  // Class studios (docs/research/fitness-studios.md): schedule + roster, offers + members, door check-in.
  classes: ["booking.classes"],
  "class-offers": ["booking.classes", "memberships.recurring"],
  "class-door": ["booking.classes"],
  invoices: ["service.invoices"],
  rebooking: ["service.rebooking"],
  // Appointment services for salons; the same table is the repair shop's price list.
  services: ["booking.appointments", "service.tickets"],
  slots: ["booking.pickup_slots", "booking.dropoff_scheduling"],
  ads: ["ads.sponsored_listing", "ads.sponsored_promo", "ads.map_pin"],
  campaigns: ["campaigns.neighbourhood"],
  // Grocers and butchers (docs/research/grocers.md).
  "grocery-butcher": ["grocery.counter_preorders"],
  "grocery-flyer": ["grocery.flyer"],
  "grocery-pantry": ["grocery.pantry_reminders"],
  "grocery-whatsapp": ["grocery.whatsapp_orders"],
};

/**
 * Paid keys that don't get their own sidebar entry but gate parts of a free page
 * (shown only when enabled): VIP / birthday / referrals on Program, CSV on Customers,
 * cohorts + network overlap on Reports, staff permissions on Staff, and the paid connectors on
 * Integrations (the page itself stays: Google Business Profile is free).
 */
export const IN_PAGE_FEATURES: readonly FeatureKey[] = [
  "loyalty.vip_levels",
  "loyalty.birthday_bonus",
  "loyalty.referrals",
  "customers.csv_export",
  "customers.csv_import",
  "reports.advanced",
  "staff.permissions",
  "integrations.pos_auto_award",
  "integrations.webhooks",
  // Pet shops: report cards are a button on a pet's page and on the daycare day.
  "pets.report_cards",
  // ---- phase-solo: G ---- the website builder page is open to every owner (build and preview); this key gates Publish there.
  "site.builder",
];

/**
 * Restaurant pack pages (restaurant-pack-brief.md): `/m/[id]/restaurant/<slug>`. `feature` is the `restaurant.*` key the
 * page gates on (same key the page's RestaurantGate checks); banquet and phone orders are also unlocked by add-ons, which
 * the merchant's enabled-features list already folds in. The menu page is "Dietary & languages" so it never reads as a
 * duplicate of the commerce "Menu & catalog" entry.
 */
export const RESTAURANT_NAV: readonly { slug: string; label: string; feature: FeatureKey; /** Works on every tier (phone orders: the manual path). */ alwaysOn?: boolean }[] = [
  { slug: "menu", label: "Dietary & languages", feature: "restaurant.dietary_tags" },
  { slug: "preorders", label: "Pre-orders", feature: "restaurant.degh_preorders" },
  { slug: "tiffin", label: "Tiffin", feature: "restaurant.tiffin" },
  { slug: "catering", label: "Catering", feature: "restaurant.catering" },
  { slug: "banquet", label: "Banquet", feature: "restaurant.banquet" },
  { slug: "kitchen", label: "Kitchen display", feature: "restaurant.kds" },
  { slug: "whatsapp", label: "WhatsApp", feature: "restaurant.whatsapp_notifications" },
  { slug: "reviews", label: "Reviews", feature: "restaurant.reviews" },
  { slug: "festivals", label: "Festivals", feature: "restaurant.festival_campaigns" },
  { slug: "phone-orders", label: "Phone orders", feature: "restaurant.phone_ai", alwaysOn: true },
];

/** Page listing the restaurant modules a shop has not unlocked (one sidebar entry instead of one per module). */
export const RESTAURANT_MORE = { slug: "more", label: "More for restaurants" } as const;

/** Add-ons that also unlock a restaurant feature on Growth (ADD_ON_UNLOCKS in plans.ts), by nav slug. */
const SLUG_ADD_ON: Record<string, AddOnId> = { banquet: "banquet_module", "phone-orders": "phone_ai" };

/** What unlocks a locked restaurant module: the tier that includes it and, where one exists, the add-on. */
export function restaurantUnlock(slug: string): { name: string; description: string; tier: string; tierPriceCents: number; addOn: { name: string; priceCents: number } | null } {
  const r = RESTAURANT_NAV.find((x) => x.slug === slug)!;
  const def = FEATURES[r.feature];
  const plan = RESTAURANT_PLANS[def.packTier ?? "starter"];
  const add = SLUG_ADD_ON[slug] ? ADD_ONS[SLUG_ADD_ON[slug]!] : null;
  return { name: r.label, description: def.description, tier: plan.name, tierPriceCents: plan.priceCents, addOn: add && plan.tier === "pro" ? { name: add.name.replace(/ \(Growth\)/, ""), priceCents: add.priceCents } : null };
}

/** Restaurant modules split by entitlement (enabled = merchant's enabled feature keys, add-ons included). */
export function restaurantModules(enabled: Set<FeatureKey>) {
  return {
    unlocked: RESTAURANT_NAV.filter((r) => r.alwaysOn || enabled.has(r.feature)),
    locked: RESTAURANT_NAV.filter((r) => !r.alwaysOn && !enabled.has(r.feature)),
  };
}

export const hasRestaurantFeature = (enabled: Set<FeatureKey>) => [...enabled].some((k) => k.startsWith("restaurant."));

export function enabledSet(features: { key: string; enabled: boolean }[]): Set<FeatureKey> {
  return new Set(features.filter((f) => f.enabled).map((f) => f.key as FeatureKey));
}

/** Is a nav section unlocked for this shop? Free sections always are. */
export function navUnlocked(key: string, enabled: Set<FeatureKey>): boolean {
  const keys = NAV_FEATURES[key];
  return !keys || keys.some((k) => enabled.has(k));
}

/**
 * Verticals whose first-run path is the loyalty card, counter and messages (cafés, bakeries, retail, grocery,
 * pharmacy, florists, pet shops). Their sidebar hides the service, pickup-slot and ordering sections unless the
 * shop is on Pro or a restaurant tier.
 */
export const LOYALTY_FIRST_VERTICALS: readonly string[] = ["cafe", "bakery", "bookstore", "retail", "grocery", "pharmacy", "florist", "pet", "beauty_supply"];
/** Discount cards (show-to-save front-store cards) only make sense for these. */
export const DISCOUNT_CARD_VERTICALS: readonly string[] = ["pharmacy", "retail", "beauty_supply"];
/** Grocers and halal butchers (docs/research/grocers.md): butcher counter, weekly flyer, pantry reminders, WhatsApp list orders. */
export const GROCERY_FEATURES: readonly FeatureKey[] = ["grocery.counter_preorders", "grocery.flyer", "grocery.pantry_reminders", "grocery.whatsapp_orders"];
export const hasGroceryFeature = (enabled: Set<FeatureKey>) => GROCERY_FEATURES.some((k) => enabled.has(k));
/** Appointment businesses (staff calendar) and drop-off repair businesses (tickets). */
export const APPOINTMENT_VERTICALS: readonly string[] = ["salon", "barber", "spa"];
/** Class studios (yoga, pilates, boxing, dance, gyms): they live in the class schedule, not in orders, tickets or pickup slots. */
export const STUDIO_VERTICALS: readonly string[] = ["fitness"];
export const REPAIR_VERTICALS: readonly string[] = ["repair_electronics", "repair_auto", "alterations", "dry_cleaning", "print_shop"];
/** Car washes run on plans, punch cards and the wash desk, not on the food-and-retail counter. */
export const WASH_VERTICALS: readonly string[] = ["car_wash"];
/** Sections a loyalty-first shop only sees on Pro or a restaurant tier. */
const PRO_ONLY_FOR_LOYALTY_FIRST: readonly string[] = ["tickets", "slots", "orders", "catalog"];

/** What the sidebar needs to know about the shop beyond its enabled features. */
export interface ShopNavContext {
  vertical?: string;
  plan?: PlanId;
  /** Current rollout stage per feature key; ads and street campaigns stay hidden until their stage is "ga". */
  stages?: Partial<Record<FeatureKey, string>>;
  /** The shop is on an open street. Street campaigns are a street's thing: a shop with no street never sees the item. */
  onOpenStreet?: boolean;
  /**
   * phase-solo D: one bookable calendar and nobody else on the team (a solo pro). Staff leaves the sidebar; Settings carries an
   * "Add a second chair" plan line instead. Undefined (not known yet) keeps Staff.
   */
  soloCalendar?: boolean;
}

/** Is the whole Phase 3 section live (any of its keys at stage ga)? Unknown stages count as live (no gate). */
function stageGa(key: string, stages: ShopNavContext["stages"]): boolean {
  if (!stages) return true;
  return (NAV_FEATURES[key] ?? []).some((k) => stages[k] === "ga");
}

/** Vertical and rollout gating on top of feature gating (cafes-retail.md 7.8). Pure; `shop` omitted = feature gating only. */
export function navVisible(key: string, enabled: Set<FeatureKey>, shop?: ShopNavContext): boolean {
  // The pharmacy rules page (what is locked, the pharmacist-owner confirmation, retention) exists for pharmacies only.
  if (key === "pharmacy") return shop?.vertical === "pharmacy";
  if (!navUnlocked(key, enabled)) return false;
  if (!shop) return true;
  // Salons, barbers and spas live in the calendar: no repair tickets unless they also bought the Service plan. Repair shops get no calendar.
  if (key === "tickets" && shop.vertical && APPOINTMENT_VERTICALS.includes(shop.vertical) && !enabled.has("service.tickets")) return false;
  if (key === "calendar" && shop.vertical && REPAIR_VERTICALS.includes(shop.vertical)) return false;
  // A studio's sidebar is classes, members and the door; the café and repair sections stay out of its way unless it bought them.
  if (shop.vertical && STUDIO_VERTICALS.includes(shop.vertical) && ["orders", "catalog", "slots", "discount-cards"].includes(key) && !hasRestaurantFeature(enabled)) return false;
  if (key === "tickets" && shop.vertical && STUDIO_VERTICALS.includes(shop.vertical) && !enabled.has("service.tickets")) return false;
  // Order-ahead and the menu/catalog are the food-and-retail counter; repair and appointment shops run on tickets, invoices and the calendar (service-businesses.md 4.1).
  if ((key === "orders" || key === "catalog") && shop.vertical && !hasRestaurantFeature(enabled) && [...APPOINTMENT_VERTICALS, ...REPAIR_VERTICALS, ...WASH_VERTICALS].includes(shop.vertical)) return false;
  // Pet shops rebook by each dog's own cadence (Groom rebooking); the per-service Rebooking page would sit empty beside it. Groom rebooking is for shops that groom, so it follows the calendar.
  if (key === "rebooking" && shop.vertical === "pet") return false;
  if (key === "groom-rebooking" && !enabled.has("booking.appointments")) return false;
  if ((key === "ads" || key === "campaigns") && !stageGa(key, shop.stages)) return false;
  if (key === "campaigns" && shop.onOpenStreet === false) return false;
  if (key === "discount-cards" && shop.vertical && !DISCOUNT_CARD_VERTICALS.includes(shop.vertical)) return false;
  if (key === "staff" && shop.soloCalendar === true) return false;
  if (PRO_ONLY_FOR_LOYALTY_FIRST.includes(key) && shop.vertical && LOYALTY_FIRST_VERTICALS.includes(shop.vertical)) {
    return shop.plan === "pro" || hasRestaurantFeature(enabled) || (shop.vertical === "grocery" && hasGroceryFeature(enabled));
  }
  return true;
}

/** Settings, and the pages that sit under it until Settings carries them as tabs (workstream D): Staff, POS & integrations, Billing & plans. */
const UNDER_SETTINGS = ["staff", "integrations", "billing"];

/**
 * The sidebar for one shop, in section order: `today`, `run`, `customers`, `grow`, `shop`. Every trade returns the same five
 * sections; only the entries of `run` (and which of the others are unlocked) differ. Owners and managers also get Settings,
 * with Staff, POS & integrations and Billing under it.
 */
export function buildMerchantNav(base: string, role: StaffRole, enabled: Set<FeatureKey>, shop?: ShopNavContext): NavEntry[] {
  const entries = buildNavEntries(base, role, enabled, shop);
  if (role === "owner" || role === "manager") {
    const at = entries.findIndex((e) => e.key === "staff");
    const settings: NavEntry = { key: "settings", href: `${base}/settings`, label: "Settings", group: "shop" };
    entries.splice(at < 0 ? entries.length : at, 0, settings);
  }
  return inSectionOrder(entries.map((e) => (UNDER_SETTINGS.includes(e.key) && (role === "owner" || role === "manager") ? { ...e, parent: "settings" } : e)));
}

function buildNavEntries(base: string, role: StaffRole, enabled: Set<FeatureKey>, shop?: ShopNavContext): NavEntry[] {
  const home: NavEntry = { key: "home", href: base, label: role === "staff" ? "Today" : "Home", group: "today", exact: true };
  const counter: NavEntry = { key: "counter", href: `${base}/counter`, label: "Counter", group: "today" };
  // Front-desk staff run the day from the calendar (appointment shops), so it is the one extra section they get.
  const calendar: NavEntry = { key: "calendar", href: `${base}/calendar`, label: "Calendar", group: "run" };
  // Front-desk staff also get the class schedule and the door at a studio.
  const classes: NavEntry = { key: "classes", href: `${base}/classes`, label: "Class schedule", group: "run" };
  const door: NavEntry = { key: "class-door", href: `${base}/classes/door`, label: "Door check-in", group: "run" };
  // Desk staff sell a drop-in or a pack here; owners and managers see the full Memberships & passes page at the same address.
  const deskSale: NavEntry = { key: "class-offers", href: `${base}/classes/offers`, label: "Desk sale", group: "run" };
  const queue: NavEntry = { key: "queue", href: `${base}/queue`, label: "Walk-in line", group: "run" };
  const payouts: NavEntry = { key: "payouts", href: `${base}/payouts`, label: "Payouts", group: "run" };
  // Pet shops: pets and groom rebooking, the daycare day, food cards (pets.ts nav entries).
  const pet = (key: string, href: string, label: string, group: NavSection): NavEntry => ({ key, href: `${base}${href}`, label, group });
  const petEntries: NavEntry[] = [
    pet("pets", "/pets", "Pets", "run"),
    pet("groom-rebooking", "/groom-rebooking", "Groom rebooking", "run"),
    pet("daycare", "/daycare", "Daycare today", "run"),
    pet("food-cards", "/food-cards", "Food cards", "run"),
  ];
  // Car washes, garages and tire shops: vehicles, service reminders, tire season and the wash desk (auto.ts nav entries).
  const autoEntries: NavEntry[] = [
    pet("wash", "/wash", "Wash desk", "run"),
    pet("vehicles", "/vehicles", "Vehicles", "run"),
    pet("service-reminders", "/service-reminders", "Service reminders", "run"),
    pet("tire-season", "/tire-season", "Tire season", "run"),
  ];
  // An instructor teaches: their classes and the check-in for them, nothing else.
  if (role === "instructor") return [classes, door].filter((e) => navVisible(e.key, enabled, shop)).map((e) => ({ ...e, group: "run" as NavSection }));
  if (role === "staff") {
    const run = (e: NavEntry): NavEntry => ({ ...e, group: "run" });
    return [
      home,
      counter,
      ...petEntries.filter((e) => navUnlocked(e.key, enabled)).map(run),
      ...autoEntries.filter((e) => navUnlocked(e.key, enabled)).map(run),
      ...(enabled.has("booking.walkin_queue") ? [run(queue)] : []),
      ...(enabled.has("staff.payouts") ? [run(payouts)] : []),
      ...(enabled.has("booking.appointments") && navVisible("calendar", enabled, shop) ? [run(calendar)] : []),
      // phase-solo D: at a beauty pro's, barber's or salon, staff see their clients (a private renter only their own).
      ...(isAppointmentLed(shop?.vertical, enabled.has("booking.appointments")) ? [{ key: "customers", href: `${base}/customers`, label: "Customers", group: "run" as NavSection }] : []),
      ...[classes, door, deskSale].filter((e) => navVisible(e.key, enabled, shop)).map(run),
      ...(shop?.vertical === "grocery" && enabled.has("grocery.counter_preorders") ? [run({ key: "grocery-butcher", href: `${base}/grocery/butcher`, label: "Butcher counter", group: "run" })] : []),
    ];
  }
  // Restaurants get one sidebar grouped by when it is used (restaurantNav below); everyone else keeps the flat list.
  if (hasRestaurantFeature(enabled)) return buildRestaurantNav(base, role, enabled, shop);
  // Grocers and butchers: sell ahead (butcher counter, flyer), talk to customers (WhatsApp, pantry reminders), loyalty (grocery-nav below).
  if (shop?.vertical === "grocery" && hasGroceryFeature(enabled)) return buildGroceryNav(base, role, enabled, shop);

  const items: NavEntry[] = [
    home,
    counter,
    { key: "customers", href: `${base}/customers`, label: "Customers", group: "customers" },
    // phase-solo D: one thread per customer, Instagram DMs read-only; free on every plan. Appointment-led shops (the calendar is on).
    ...(isAppointmentLed(shop?.vertical, enabled.has("booking.appointments")) ? [{ key: "inbox", href: `${base}/inbox`, label: "Inbox", group: "customers" as NavSection }] : []),
    { key: "program", href: `${base}/program`, label: "Rewards", group: "customers" },
    { key: "promos", href: `${base}/promos`, label: "Promos", group: "customers" },
    { key: "discount-cards", href: `${base}/discount-cards`, label: "Discount cards", group: "customers" },
    { key: "messages", href: `${base}/messages`, label: "Messages", group: "customers" },
    { key: "reports", href: `${base}/reports`, label: "Reports", group: "grow" },
    { key: "orders", href: `${base}/orders`, label: "Orders", group: "run" },
    { key: "tickets", href: `${base}/tickets`, label: "Tickets", group: "run" },
    { key: "invoices", href: `${base}/invoices`, label: "Invoices", group: "run" },
    queue,
    calendar,
    ...petEntries,
    ...autoEntries,
    payouts,
    classes,
    { key: "class-offers", href: `${base}/classes/offers`, label: "Memberships & passes", group: "run" },
    door,
    { key: "services", href: `${base}/services`, label: enabled.has("service.tickets") && !enabled.has("booking.appointments") ? "Price list" : "Services & prices", group: "run" },
    { key: "catalog", href: `${base}/catalog`, label: "Menu and prices", group: "run" },
    { key: "rebooking", href: `${base}/rebooking`, label: "Rebooking", group: "run" },
    { key: "slots", href: `${base}/slots`, label: enabled.has("service.tickets") && enabled.has("booking.dropoff_scheduling") ? "Drop-off slots" : "Pickup & drop-off", group: "run" },
    { key: "ads", href: `${base}/ads`, label: "Ads", group: "grow" },
    { key: "campaigns", href: `${base}/campaigns`, label: "Street campaigns", group: "grow" },
    // phase-solo G (added by D, who owns the nav): the website builder, ungated so monthly shops can preview; owners and managers only.
    ...(role === "owner" || role === "manager" ? [{ key: "site", href: `${base}/site`, label: "Website", group: "grow" as NavSection }] : []),
    { key: "pharmacy", href: `${base}/pharmacy`, label: "Pharmacy rules", group: "run" },
    { key: "locations", href: `${base}/locations`, label: "Locations & QR kit", group: "shop" },
    { key: "staff", href: `${base}/staff`, label: "Staff", group: "shop" },
    { key: "integrations", href: `${base}/integrations`, label: "POS & integrations", group: "shop" },
    { key: "billing", href: `${base}/billing`, label: "Billing & plans", group: "shop" },
  ];
  return items.filter((i) => navVisible(i.key, enabled, shop) && (i.key !== "billing" || role === "owner"));
}

/**
 * Restaurant sidebar (docs/research/desi-restaurants.md, frame 01): five groups by when you use them. Locked modules fold into
 * "More for restaurants". Catering and banquet share one entry; the Menu & catalog and pickup-slot sections give way to
 * "Menu & dietary", and the service sections stay out of a restaurant's way.
 */
function buildRestaurantNav(base: string, role: StaffRole, enabled: Set<FeatureKey>, shop?: ShopNavContext): NavEntry[] {
  const { unlocked, locked } = restaurantModules(enabled);
  const has = (slug: string) => unlocked.some((r) => r.slug === slug);
  const r = (slug: string, label: string, group: NavSection, badge?: NavEntry["badge"], href?: string): NavEntry => ({ key: `restaurant-${slug}`, href: href ?? `${base}/restaurant/${slug}`, label, group, ...(badge ? { badge } : {}) });
  const out: NavEntry[] = [{ key: "home", href: base, label: "Home", group: "today", exact: true }];
  if (navVisible("orders", enabled, shop)) out.push({ key: "orders", href: `${base}/orders`, label: "Orders", group: "run", badge: "orders" });
  if (has("kitchen")) out.push(r("kitchen", "Kitchen display", "run"));
  if (has("phone-orders")) out.push(r("phone-orders", "Phone orders", "run", "phone"));
  if (has("preorders")) out.push(r("preorders", "Pre-orders", "run"));
  if (has("catering")) out.push(r("catering", "Catering & banquet", "run"));
  else if (has("banquet")) out.push(r("banquet", "Catering & banquet", "run"));
  if (has("tiffin")) out.push(r("tiffin", "Tiffin", "run"));
  if (has("menu")) out.push(r("menu", "Menu & dietary", "run"));
  if (has("whatsapp")) out.push(r("whatsapp", "WhatsApp", "run", "whatsapp"));
  if (has("reviews")) out.push(r("reviews", "Reviews", "run"));
  if (has("festivals")) out.push(r("festivals", "Festivals", "run"));
  const loyalty: NavEntry[] = [
    { key: "customers", href: `${base}/customers`, label: "Customers", group: "customers" },
    { key: "program", href: `${base}/program`, label: "Program & rewards", group: "customers" },
    { key: "promos", href: `${base}/promos`, label: "Promos", group: "customers" },
    { key: "discount-cards", href: `${base}/discount-cards`, label: "Discount cards", group: "customers" },
    // Loyalty texts and email; WhatsApp has its own entry above, so the two inboxes read as two things.
    { key: "messages", href: `${base}/messages`, label: "Texts & email", group: "customers" },
    { key: "reports", href: `${base}/reports`, label: "Reports", group: "grow" },
  ];
  out.push(...loyalty.filter((i) => navVisible(i.key, enabled, shop)));
  if (locked.length) out.push({ key: "restaurant-more", href: `${base}/restaurant/${RESTAURANT_MORE.slug}`, label: RESTAURANT_MORE.label, group: "run" });
  const tools: NavEntry[] = [
    { key: "counter", href: `${base}/counter`, label: "Counter", group: "today" },
    { key: "ads", href: `${base}/ads`, label: "Ads", group: "grow" },
    { key: "campaigns", href: `${base}/campaigns`, label: "Street campaigns", group: "grow" },
    { key: "locations", href: `${base}/locations`, label: "Locations & QR kit", group: "shop" },
    { key: "staff", href: `${base}/staff`, label: "Staff", group: "shop" },
    { key: "integrations", href: `${base}/integrations`, label: "POS & integrations", group: "shop" },
    { key: "billing", href: `${base}/billing`, label: "Billing & plans", group: "shop" },
  ];
  out.push(...tools.filter((i) => navVisible(i.key, enabled, shop) && (i.key !== "billing" || role === "owner")));
  return out;
}

/**
 * Grocer sidebar (docs/research/grocers.md, frame D1): the counter first, then what they sell ahead of time (the butcher counter with
 * its pre-orders and Eid plan, the weekly flyer, orders), who they talk to (WhatsApp list orders, pantry reminders, messages) and the
 * loyalty program. The repair, appointment and class sections stay out of the way.
 */
function buildGroceryNav(base: string, role: StaffRole, enabled: Set<FeatureKey>, shop?: ShopNavContext): NavEntry[] {
  const g = (slug: string, label: string, group: NavSection): NavEntry => ({ key: `grocery-${slug}`, href: `${base}/grocery/${slug}`, label, group });
  const out: NavEntry[] = [
    { key: "home", href: base, label: "Home", group: "today", exact: true },
    { key: "counter", href: `${base}/counter`, label: "Counter", group: "today" },
  ];
  if (enabled.has("grocery.counter_preorders")) out.push(g("butcher", "Butcher counter", "run"));
  if (enabled.has("grocery.flyer")) out.push(g("flyer", "Weekly flyer", "run"));
  if (navVisible("orders", enabled, shop)) out.push({ key: "orders", href: `${base}/orders`, label: "Orders", group: "run" });
  if (navVisible("catalog", enabled, shop) && !enabled.has("grocery.counter_preorders")) out.push({ key: "catalog", href: `${base}/catalog`, label: "Menu and prices", group: "run" });
  if (enabled.has("grocery.whatsapp_orders")) out.push(g("whatsapp", "WhatsApp", "run"));
  if (enabled.has("grocery.pantry_reminders")) out.push(g("pantry", "Pantry reminders", "run"));
  const rest: NavEntry[] = [
    { key: "messages", href: `${base}/messages`, label: "Messages", group: "customers" },
    { key: "customers", href: `${base}/customers`, label: "Customers", group: "customers" },
    { key: "program", href: `${base}/program`, label: "Rewards", group: "customers" },
    { key: "promos", href: `${base}/promos`, label: "Promos", group: "customers" },
    { key: "reports", href: `${base}/reports`, label: "Reports", group: "grow" },
    { key: "ads", href: `${base}/ads`, label: "Ads", group: "grow" },
    { key: "campaigns", href: `${base}/campaigns`, label: "Street campaigns", group: "grow" },
    { key: "locations", href: `${base}/locations`, label: "Locations & QR kit", group: "shop" },
    { key: "staff", href: `${base}/staff`, label: "Staff", group: "shop" },
    { key: "integrations", href: `${base}/integrations`, label: "POS & integrations", group: "shop" },
    { key: "billing", href: `${base}/billing`, label: "Billing & plans", group: "shop" },
  ];
  out.push(...rest.filter((i) => navVisible(i.key, enabled, shop) && (i.key !== "billing" || role === "owner")));
  return out;
}

/** Which nav keys a role may open directly (route guard for staff deep links). */
export function canOpen(role: StaffRole, key: string, /** phase-solo D: staff at an appointment-led shop may open Customers (their own clients). */ people?: { appointmentLed: boolean }): boolean {
  if (role === "instructor") return key === "home" || key === "classes" || key === "class-door";
  if (role === "staff" && key === "customers") return !!people?.appointmentLed;
  if (role === "staff") return key === "home" || key === "counter" || key === "calendar" || key === "queue" || key === "payouts" || key === "pets" || key === "groom-rebooking" || key === "daycare" || key === "food-cards" || key === "wash" || key === "vehicles" || key === "service-reminders" || key === "tire-season" || key === "classes" || key === "class-door" || key === "class-offers" || key === "grocery";
  if (key === "billing") return role === "owner";
  return true;
}

/**
 * Routes that draw full-bleed, with no sidebar, top bar or bottom bar (Figma 15:2 and 15:130): the staff counter and the class door desk.
 * They are used at the till, on a tablet, by one hand; the page keeps its own way back (the PIN chip and "Exit counter").
 * `rest` is the path under `/m/{id}`, for example "/counter" or "/classes/door".
 */
export const BARE_ROUTES: readonly string[] = ["/counter", "/classes/door"];

/** True when the pathname (under the shop's `base`) is one of the chrome-free routes, or inside one. */
export function isBareRoute(pathname: string, base: string): boolean {
  if (!pathname.startsWith(`${base}/`)) return false;
  const rest = pathname.slice(base.length);
  return BARE_ROUTES.some((r) => rest === r || rest.startsWith(`${r}/`));
}
