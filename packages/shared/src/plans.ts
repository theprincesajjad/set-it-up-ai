/**
 * Plans and feature gating.
 *
 * Business rules (see docs/business/pricing.md, Pricing v2, founder decision Oct 2026):
 *  1. Loyalty + reporting on it are free forever. FREE_FOREVER = the loyalty
 *     program (points, visits, stamps, items, rewards, welcome bonus, manual
 *     adjustments, no-earn categories), being findable on the network, the
 *     wallet pass, the customer directory and basic reports. No fee on loyalty,
 *     unlimited members. (Unlimited staff and locations are kept free per the
 *     founder's earlier instruction; whether they stay free is an open question.)
 *  2. Everything else is on Pro ($39), Service ($99) or the restaurant pack. Trade tools
 *     ship "ga": a new shop subscribes and uses them at once (founder decision 2026-10-27).
 *     Only network-wide extras (FeatureDef.networkGated: sponsored promos and listings, map pins,
 *     BIA campaigns, nearby push) ship "hidden" until the network has 100 shops; an admin
 *     override still unlocks them early for a pilot shop.
 *  3. Invariant: a FREE_FOREVER feature is never gated (admins can't hide it and
 *     it can't move to a paid plan; tests enforce this). Pre-launch we moved
 *     promos, marketing, VIP/birthday/referrals, discount cards, CSV and
 *     integrations to paid once (Pricing v2); after launch, free stays free.
 *  4. Network perks ("visit 3 shops" bonuses) are a platform/BIA lever, not a
 *     merchant feature: admins configure them and they run network-wide
 *     regardless of a merchant's plan.
 */

export const PLAN_IDS = ["free", "plus", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLAN_RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2 };

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in cents (CAD). */
  priceCents: number;
  /** Annual price in cents (CAD), ~2 months free. */
  annualPriceCents: number;
  blurb: string;
  bestFor: string[];
  smsPerMonth: number;
}

/** The fee on online orders for Free shops, in basis points. Defined first so the Free blurb and FEES cannot disagree. */
const ORDER_BPS_FREE = 150;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    annualPriceCents: 0,
    blurb: `One bookable calendar with online booking, deposits and reminders, and your loyalty program, the network listing, wallet pass and reports. No subscription and no fee on loyalty. Online orders on Free carry ${Number((ORDER_BPS_FREE / 100).toFixed(2))}%.`,
    bestFor: ["Every shop"],
    // Reserved for transactional texts (confirmations and reminders to clients with no app, pass or email); then email.
    smsPerMonth: 30,
  },
  plus: {
    id: "plus",
    name: "Pro",
    priceCents: 3900,
    annualPriceCents: 39000,
    blurb: "Unlimited bookable calendars, 4 promos a month to your regulars, rebooking nudges, VIP levels, email and text marketing, POS auto-award, customer exports, order-ahead, and class schedules with packs and memberships.",
    bestFor: ["Cafés", "Bakeries", "Retail", "Grocers", "Salons", "Barbers", "Yoga & fitness studios"],
    smsPerMonth: 500,
  },
  pro: {
    id: "pro",
    name: "Service",
    priceCents: 9900,
    annualPriceCents: 99000,
    blurb: "Everything in Pro, plus service tickets, quote approvals, deposits, invoices and scheduling.",
    bestFor: ["Repair", "Auto", "Alterations", "Print shops"],
    smsPerMonth: 1500,
  },
};

/**
 * Headline platform fee on deposits and invoices (basis points), shown in billing and Connect status.
 * Online orders on paid plans carry no platform fee; the full rule set is FEES / computeFees.
 */
export const PLATFORM_PAYMENT_FEE_BPS = 100;

// ---------------------------------------------------------------------------
// Restaurant pack (docs/business/combined-strategy.md): a separate ladder for
// restaurants. Any tier includes Pro; Growth adds tiffin, catering,
// pot pre-orders, festival campaigns and WhatsApp; Pro adds banquet, kitchen
// display, multilingual staff screens and the rest.
// ---------------------------------------------------------------------------
export const RESTAURANT_TIERS = ["starter", "growth", "pro"] as const;
export type RestaurantTier = (typeof RESTAURANT_TIERS)[number];
export const RESTAURANT_TIER_RANK: Record<RestaurantTier, number> = { starter: 0, growth: 1, pro: 2 };

export interface RestaurantPlan {
  tier: RestaurantTier;
  name: string;
  priceCents: number;
  annualPriceCents: number;
  blurb: string;
  whatsappPerMonth: number;
}

export const RESTAURANT_PLANS: Record<RestaurantTier, RestaurantPlan> = {
  starter: { tier: "starter", name: "Restaurant Starter", priceCents: 9900, annualPriceCents: 99000, blurb: "Commission-free ordering, your own ordering page, halal and dietary tags, WhatsApp order updates and review requests.", whatsappPerMonth: 300 },
  growth: { tier: "growth", name: "Restaurant Growth", priceCents: 19900, annualPriceCents: 199000, blurb: "Everything in Starter plus tiffin subscriptions, catering, biryani pot pre-orders, festival campaigns and WhatsApp ordering and marketing.", whatsappPerMonth: 1000 },
  pro: { tier: "pro", name: "Restaurant Pro", priceCents: 34900, annualPriceCents: 349000, blurb: "Everything in Growth plus banquet booking, kitchen display, staff screens in your team's language, cash discount pricing, split bills and analytics.", whatsappPerMonth: 3000 },
};

/** Founding offer: first 20 restaurants per corridor, 50% off for 12 months, then 25% off for life. */
export const FOUNDING_OFFER = { firstYearPct: 50, lifetimePct: 25, slotsPerCorridor: 20 } as const;

export const ADD_ON_IDS = ["whatsapp_1000", "extra_location", "banquet_module", "phone_ai"] as const;
export type AddOnId = (typeof ADD_ON_IDS)[number];
export const ADD_ONS: Record<AddOnId, { id: AddOnId; name: string; priceCents: number; unit: "month" | "pack" }> = {
  whatsapp_1000: { id: "whatsapp_1000", name: "1,000 WhatsApp messages", priceCents: 4900, unit: "pack" },
  extra_location: { id: "extra_location", name: "Extra restaurant location", priceCents: 4900, unit: "month" },
  banquet_module: { id: "banquet_module", name: "Banquet module (Growth)", priceCents: 9900, unit: "month" },
  phone_ai: { id: "phone_ai", name: "Phone ordering assistant", priceCents: 7900, unit: "month" },
};

/**
 * Feature keys an add-on unlocks for merchants on at least the Growth tier
 * (Pro already includes them). Restaurant Growth + banquet_module = banquet booking.
 */
export const ADD_ON_UNLOCKS: Partial<Record<AddOnId, readonly FeatureKey[]>> = {
  banquet_module: ["restaurant.banquet"],
  phone_ai: ["restaurant.phone_ai"],
};

/** WhatsApp messages granted per whatsapp_1000 pack (per billing period). */
export const WHATSAPP_PACK_MESSAGES = 1000;

/**
 * Platform fees on payments (combined strategy). Orders: 0% for shops on a
 * paid plan or restaurant pack ("commission-free"), 1.5% for Free shops, plus
 * an optional $0.49 customer service fee. Deposits, invoices and tiffin billing: 1%.
 * Card processing (Stripe) is passed through at cost on top.
 */
export const FEES = {
  orderBpsFree: ORDER_BPS_FREE,
  orderBpsPaid: 0,
  customerServiceFeeCents: 49,
  depositInvoiceBps: 100,
  tiffinBps: 100,
  /** Checkout taken through the appointment calendar (counter or in person): 0%, card processing at cost. Online deposits still pay depositInvoiceBps. */
  appointmentCheckoutBps: 0,
  /**
   * Class bookings paid online (drop-ins, packs, intro offers), membership billing (the monthly auto-renew charge) and
   * late-cancel or no-show fees charged to a saved card: 1%, card processing at cost. Front-desk payments recorded by
   * hand (cash, e-transfer) carry none. Same rate as tiffin billing: recurring billing is where we do the work.
   */
  classBps: 100,
} as const;

export const ROLLOUT_STAGES = ["hidden", "beta", "ga"] as const;
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

export interface FeatureDef {
  key: FeatureKey;
  name: string;
  description: string;
  minPlan: PlanId;
  /**
   * Default rollout stage at launch. Free features ship "ga". Paid features
   * ship "hidden" and are flipped by an admin once the network threshold is hit.
   */
  defaultStage: RolloutStage;
  /**
   * Suggested number of active network merchants before flipping to GA
   * (see docs/finance/unit-economics.md: Pro verticals unlock earliest).
   */
  unlockAtMerchants: number;
  /** Which "phase" of the roadmap introduces it. */
  phase: 1 | 2 | 3;
  /** Restaurant pack features: enabled by the merchant's restaurant tier, not by plan. */
  pack?: "restaurant";
  packTier?: RestaurantTier;
  /**
   * Only for shops of this vertical (grocers and butchers: "grocery"). A café or a Starter restaurant on the same plan never gets
   * it, so a plan feature built for one trade cannot open another trade's paid module. An admin override still wins.
   */
  vertical?: string | readonly string[];
  /**
   * Platform lever (e.g. network perks): configured by admins/BIAs and applied
   * network-wide regardless of a merchant's plan. Not a merchant plan feature,
   * so it is not part of FREE_FOREVER.
   */
  platform?: boolean;
  /**
   * Network-wide extra (sponsored promos and listings, map pins as ads, BIA campaigns, nearby push): it only works once the
   * network is big enough, so it waits for the 100-shop gate and ships "hidden" until an admin flips it.
   * Founder decision, 2026-10-27 ("Trade tools self-serve"): every OTHER paid feature is a trade tool and ships "ga",
   * so a new shop can subscribe to it right away. Set automatically for phase 3; set it by hand with `network(...)`.
   */
  networkGated?: boolean;
  /**
   * Verticals that get this feature without a paid plan (pharmacist appointments are free for pharmacies; the shop
   * still needs the vertical, an admin override still wins). Everyone else needs `minPlan`.
   */
  freeForVerticals?: readonly string[];
  /**
   * Only on an annual paid subscription (ANNUAL_INCLUDES_WEBSITE): the plan alone is not enough, the merchant must also be
   * annualSiteEntitled (merchants.annual_site_entitled, synced from subscriptions.interval === "year"). An admin override still wins.
   */
  requiresAnnual?: boolean;
}

/** Active shops before a network-wide extra opens (the 100-shop gate). */
export const NETWORK_GATE_SHOPS = 100;

export const FEATURE_KEYS = [
  // ---- Free forever (Phase 1): loyalty + reporting ----
  "loyalty.points",
  "loyalty.visits",
  "loyalty.stamps",
  "loyalty.items",
  "loyalty.rewards_catalog",
  "loyalty.welcome_bonus",
  "loyalty.manual_adjust",
  "loyalty.no_earn_categories",
  "network.listing",
  "wallet.passes",
  "customers.directory",
  "reports.basic",
  "staff.unlimited",
  "locations.unlimited",
  // ---- Platform lever (admin/BIA-configured, runs regardless of merchant plan) ----
  "network.perks",
  // ---- Plus ----
  "promos.basic",
  "promos.double_points",
  "loyalty.vip_levels",
  "loyalty.birthday_bonus",
  "loyalty.referrals",
  "discount_cards",
  "marketing.email",
  "marketing.sms",
  "marketing.automations",
  "promos.push_nearby",
  "customers.csv_export",
  "customers.csv_import",
  "integrations.pos_auto_award",
  "integrations.webhooks",
  "reports.advanced",
  "orders.order_ahead",
  "orders.pickup_status",
  "payments.in_app",
  "booking.pickup_slots",
  "booking.appointments",
  "service.rebooking",
  // Built-in website builder (workstream G): Pro on the annual plan only (FeatureDef.requiresAnnual).
  "site.builder",
  // Yoga, pilates, boxing, dance and women-only studios (docs/research/fitness-studios.md): sold inside Pro, no pack.
  "booking.classes",
  "booking.walkin_queue",
  "staff.payouts",
  "memberships.recurring",
  // Grocers and halal butchers (docs/research/grocers.md): sold inside Pro, no pack.
  "grocery.flyer",
  "grocery.counter_preorders",
  "grocery.pantry_reminders",
  "grocery.whatsapp_orders",
  // Groomers, dog daycare and pet food stores (docs/research/pet-care.md): sold inside Pro, no pack.
  "pets.profiles",
  "pets.daycare",
  "pets.food_cards",
  "pets.report_cards",
  // Car washes, garages and tire shops (docs/research/auto-care.md): sold inside Pro, no pack. Estimates ride the Pro service tickets.
  "auto.vehicles",
  "auto.tires",
  "auto.wash",
  // ---- Pro (everything in Plus, plus) ----
  "service.tickets",
  "service.quote_approval",
  "service.deposits",
  "service.invoices",
  "booking.dropoff_scheduling",
  "staff.permissions",
  // ---- Restaurant pack (Starter / Growth / Pro), sold separately from Plus/Pro ----
  "restaurant.commission_free",
  "restaurant.website",
  "restaurant.dietary_tags",
  "restaurant.multilingual_menu",
  "restaurant.whatsapp_notifications",
  "restaurant.reviews",
  "restaurant.tiffin",
  "restaurant.catering",
  "restaurant.degh_preorders",
  "restaurant.festival_campaigns",
  "restaurant.whatsapp_ordering",
  "restaurant.whatsapp_marketing",
  "restaurant.banquet",
  "restaurant.kds",
  "restaurant.multilingual_staff",
  "restaurant.dual_pricing",
  "restaurant.split_bills",
  "restaurant.phone_ai",
  "restaurant.analytics",
  // ---- Network monetization (Phase 3, merchant self-serve, paid per campaign) ----
  "ads.sponsored_listing",
  "ads.sponsored_promo",
  "ads.map_pin",
  "campaigns.neighbourhood",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Marks a feature as a network-wide extra (see FeatureDef.networkGated). */
const network = (d: FeatureDef): FeatureDef => ({ ...d, networkGated: true });

/**
 * One rule for every feature, including ones added later: a feature is a trade tool (ships "ga", no gate) unless it is
 * networkGated (phase 3 or marked with network()). Network-gated features ship "hidden" and wait for NETWORK_GATE_SHOPS.
 */
const settle = (d: FeatureDef): FeatureDef => {
  const networkGated = d.networkGated ?? d.phase === 3;
  return {
    ...d,
    networkGated,
    defaultStage: networkGated ? "hidden" : "ga",
    unlockAtMerchants: networkGated ? d.unlockAtMerchants || NETWORK_GATE_SHOPS : 0,
  };
};

const f = (
  key: FeatureKey,
  name: string,
  description: string,
  minPlan: PlanId,
  phase: 1 | 2 | 3,
  unlockAtMerchants = 0,
): FeatureDef => ({
  key,
  name,
  description,
  minPlan,
  phase,
  unlockAtMerchants,
  defaultStage: minPlan === "free" && phase === 1 ? "ga" : "hidden",
});

/** Restaurant pack feature: ships "ga" (only reachable by buying the pack). */
const r = (key: FeatureKey, name: string, description: string, packTier: RestaurantTier): FeatureDef => ({
  key,
  name,
  description,
  minPlan: "plus",
  phase: 2,
  unlockAtMerchants: 0,
  defaultStage: "ga",
  pack: "restaurant",
  packTier,
});

export const FEATURES: Record<FeatureKey, FeatureDef> = Object.fromEntries(
  [
    // ---- Free forever: loyalty + reporting ----
    f("loyalty.points", "Points per dollar", "Earn points for every dollar spent.", "free", 1),
    f("loyalty.visits", "Points per visit", "Earn a fixed number of points per visit.", "free", 1),
    f("loyalty.stamps", "Stamp cards", "Buy N, get one free, digitally.", "free", 1),
    f("loyalty.items", "Points per item", "Bonus points for specific items or categories.", "free", 1),
    f("loyalty.rewards_catalog", "Rewards catalog", "Multiple reward tiers: $ off, % off, free item.", "free", 1),
    f("loyalty.welcome_bonus", "Welcome bonus", "Points when a customer joins.", "free", 1),
    f("loyalty.manual_adjust", "Manual adjustments", "Add or remove points with an audit trail.", "free", 1),
    f("loyalty.no_earn_categories", "No-earn categories", "Exclude categories (e.g. prescriptions) from earning.", "free", 1),
    f("network.listing", "Network listing", "Appear on the neighbourhood map and feed.", "free", 1),
    f("wallet.passes", "Apple & Google Wallet", "One network pass customers add without an app.", "free", 1),
    f("customers.directory", "Customer directory", "Every member, balance, visit history.", "free", 1),
    f("reports.basic", "Reports", "Visits, members, rewards and redemptions.", "free", 1),
    f("staff.unlimited", "Unlimited staff", "Every staff member gets their own login.", "free", 1),
    f("locations.unlimited", "Unlimited locations", "One program across all your locations.", "free", 1),
    // ---- Platform lever: configured by admins / BIAs, runs for every shop ----
    { ...f("network.perks", "Network perks", "Neighbourhood-wide perks like 'visit 3 shops' bonuses, run by the network.", "free", 1), platform: true },
    // ---- Plus ----
    f("promos.basic", "Promos", "Post offers with start and end dates.", "plus", 2, 100),
    f("promos.double_points", "Bonus point promos", "Double points days, bonus points on items.", "plus", 2, 100),
    f("loyalty.vip_levels", "VIP levels", "Status levels with earn multipliers.", "plus", 2, 100),
    f("loyalty.birthday_bonus", "Birthday reward", "Automatic birthday points.", "plus", 2, 100),
    f("loyalty.referrals", "Referrals", "Customer invites a friend; both earn.", "plus", 2, 100),
    f("discount_cards", "Digital discount cards", "Show-to-save cards with exclusions.", "plus", 2, 100),
    f("marketing.email", "Email & push campaigns", "Email and push opted-in members (CASL compliant).", "plus", 2, 100),
    f("marketing.sms", "SMS campaigns", "Text opted-in members. Included SMS each month.", "plus", 2, 100),
    f("marketing.automations", "Automations", "Win-back, we-miss-you and reward-ready messages.", "plus", 2, 100),
    network(f("promos.push_nearby", "Nearby push promos", "Push offers to network members near your shop.", "plus", 2, 100)),
    f("customers.csv_export", "CSV export", "Export your customers and activity.", "plus", 2, 100),
    f("customers.csv_import", "Import & migrate", "Bring members from another loyalty app.", "plus", 2, 100),
    f("integrations.pos_auto_award", "POS auto-award", "Award points automatically from Square, Clover and more.", "plus", 2, 100),
    f("integrations.webhooks", "Webhooks & API", "Outgoing webhooks, Zapier/Make and the merchant REST API.", "plus", 2, 100),
    f("reports.advanced", "Advanced reports", "Cohorts, retention, network overlap.", "plus", 2, 100),
    f("orders.order_ahead", "Order-ahead", "Menu, pickup time and in-app checkout.", "plus", 2, 100),
    f("orders.pickup_status", "Pickup status", "'Ready' push and SMS notifications.", "plus", 2, 100),
    f("payments.in_app", "In-app payments", "Card payments via Stripe. No platform fee on online orders; 1% on deposits and invoices.", "plus", 2, 100),
    f("booking.pickup_slots", "Pickup slots", "Customers pick a pickup time.", "plus", 2, 100),
    // Free for one bookable calendar (FREE_BOOKABLE_CALENDARS, solo-pro-launch.md §3.1); unlimited calendars on Pro. Not FREE_FOREVER (phase 2): the calendar cap is its only gate.
    { ...f("booking.appointments", "Appointments", "Calendar, services and prices, online booking, deposits, reminders and no-show protection. One bookable calendar on Free, unlimited on Pro.", "free", 2), freeForVerticals: ["pharmacy"] as const },
    f("service.rebooking", "Rebooking and pickup reminders", "Nudge regulars when they are due, and remind customers to collect finished repairs.", "plus", 2, 100),
    { ...f("site.builder", "Website", "A website built from your bookings, services, prices, loyalty, promos, reviews and map pin, with AI copy, hosting and one .ca domain. Included with the annual plan.", "plus", 2), requiresAnnual: true },
    f("booking.classes", "Classes", "Class schedule with capacity and waitlist, drop-ins, class packs and intro offers, late-cancel fees and door check-in for yoga, pilates, boxing, dance and women-only studios.", "plus", 2, 100),
    f("booking.walkin_queue", "Walk-in line", "A live line for walk-ins: join from a phone or a tablet at the door, a wait estimate, a text when next, and the barber picks who is next.", "plus", 2, 100),
    f("staff.payouts", "Barber payouts and chair rental", "Per-barber services, tips, commission, rent and take-home for the week, and a renter who sees only their own clients.", "plus", 2, 100),
    f("memberships.recurring", "Memberships", "Monthly and fixed-term memberships billed automatically to the card on file, with freezes, renewal notices and Ontario-compliant cancellation.", "plus", 2, 100),
    ...[
    f("grocery.flyer", "Weekly flyer", "Weekly deals on your shop page, by text and as WhatsApp copy, tied to Diwali, Eid and Lunar New Year.", "plus", 2, 100),
    f("grocery.counter_preorders", "Butcher counter pre-orders", "Pre-orders by weight with deposits, pick-up hours, a weigh-in at the scale and qurbani bookings for Eid al-Adha.", "plus", 2, 100),
    f("grocery.pantry_reminders", "Pantry reminders", "A text when a member who asked is about to run out of a bulk staple such as a 20 lb bag of atta.", "plus", 2, 100),
    f("grocery.whatsapp_orders", "WhatsApp list orders", "Answer WhatsApp order lists inside the 24 hour window and turn them into pick-up orders with a pay link.", "plus", 2, 100),
    ].map((d): FeatureDef => ({ ...d, vertical: "grocery" })),
    ...[
    f("pets.profiles", "Pets and groom rebooking", "Pets under the owner with breed, size and coat, vaccine expiry dates with a photo of the certificate, a groom cadence per pet and a reminder text when a pet is due.", "plus", 2, 100),
    f("pets.daycare", "Daycare check-in", "A day count against capacity and dogs per staff, a check-in that stops expired vaccines, prepaid packs and late-pickup minutes.", "plus", 2, 100),
    f("pets.food_cards", "Pet food cards", "A buy-12-get-1 card per brand and bag size that cannot be redeemed early, and a text before a bag runs out.", "plus", 2, 100),
    f("pets.report_cards", "Report cards", "A text with a private photo page after a groom or a daycare day.", "plus", 2, 100),
    ].map((d): FeatureDef => ({ ...d, vertical: "pet" })),
    { ...f("auto.vehicles", "Vehicles and service reminders", "Cars under the owner with year, make, model and an optional plate, odometer readings, service intervals by km or months whichever comes first, and a reminder text when a car is due.", "plus", 2, 100), vertical: ["repair_auto", "car_wash"] as const },
    { ...f("auto.tires", "Tire season and storage", "A capacity plan for the fall and spring swap windows, customer swap booking that refuses a full day, and a tire storage record with rack, tread and a pickup text.", "plus", 2, 100), vertical: ["repair_auto"] as const },
    { ...f("auto.wash", "Wash check-in", "Check a member in by plate, QR or phone with one wash a day, punch cards for non-members and a list of members who stopped coming.", "plus", 2, 100), vertical: ["car_wash"] as const },
    // ---- Pro (includes everything in Plus) ----
    f("service.tickets", "Service tickets", "Intake, item details, photos, status timeline.", "pro", 2, 40),
    f("service.quote_approval", "Quote approval", "Send quotes; customers approve in-app with e-signature log.", "pro", 2, 40),
    f("service.deposits", "Deposits", "Collect a deposit on approval.", "pro", 2, 40),
    f("service.invoices", "Invoices", "Final invoices, paid in-app.", "pro", 2, 40),
    f("booking.dropoff_scheduling", "Drop-off scheduling", "Slots and reminders for drop-offs.", "pro", 2, 40),
    f("staff.permissions", "Staff permissions", "Granular roles per staff member.", "pro", 2, 40),
    // ---- Phase 3: paid per campaign ----
    r("restaurant.commission_free", "Commission-free ordering", "0% platform commission on online orders.", "starter"),
    r("restaurant.website", "Branded ordering site", "Your own menu and ordering page with your name on it.", "starter"),
    r("restaurant.dietary_tags", "Halal & dietary tags", "Zabihah halal, halal, vegetarian, vegan, Jain and spice level per item, filterable.", "starter"),
    r("restaurant.multilingual_menu", "Multilingual menu", "Menu in English, Hindi, Urdu and Punjabi.", "starter"),
    r("restaurant.whatsapp_notifications", "WhatsApp order updates", "Order confirmations and 'ready' messages on WhatsApp.", "starter"),
    r("restaurant.reviews", "Review requests", "Ask happy customers for a Google review after pickup.", "starter"),
    r("restaurant.tiffin", "Tiffin subscriptions", "Weekly and monthly meal plans with skip, pause, family plans, routes and automatic billing.", "growth"),
    r("restaurant.catering", "Catering & events", "Per-head quotes, deposits, tasting appointments and event timelines.", "growth"),
    r("restaurant.degh_preorders", "Biryani pot pre-orders", "Reserve full pots for Friday and Sunday with deposits and cut-offs.", "growth"),
    r("restaurant.festival_campaigns", "Festival campaigns", "Ramadan, Eid, Diwali, Vaisakhi and Navratri campaigns ready to send.", "growth"),
    r("restaurant.whatsapp_ordering", "WhatsApp ordering", "Customers order in WhatsApp and pay by secure link.", "growth"),
    r("restaurant.whatsapp_marketing", "WhatsApp marketing", "Send campaigns to opted-in customers on WhatsApp.", "growth"),
    r("restaurant.banquet", "Banquet hall booking", "Hall calendar, packages and deposits for parties and weddings.", "pro"),
    r("restaurant.kds", "Kitchen display", "Tickets on a kitchen screen by station, in each cook's language.", "pro"),
    r("restaurant.multilingual_staff", "Multilingual staff app", "Counter and kitchen screens in Hindi, Urdu and Punjabi.", "pro"),
    r("restaurant.dual_pricing", "Cash discount pricing", "Show a cash price and a card price (not in Quebec).", "pro"),
    r("restaurant.split_bills", "Split bills", "Split large family bills by item or evenly.", "pro"),
    r("restaurant.phone_ai", "Phone ordering assistant", "Takes phone orders in Urdu, Hindi, Punjabi and English.", "pro"),
    r("restaurant.analytics", "Restaurant analytics", "Dish, tiffin and catering performance.", "pro"),
    f("ads.sponsored_listing", "Sponsored listing", "Top of the neighbourhood feed and search.", "free", 3, 300),
    f("ads.sponsored_promo", "Sponsored promo", "Boost a promo across the network.", "free", 3, 300),
    f("ads.map_pin", "Featured map pin", "Highlighted pin on the network map.", "free", 3, 300),
    f("campaigns.neighbourhood", "Neighbourhood campaigns", "BIA-run street-wide points events.", "free", 3, 100),
  ].map((d) => [d.key, settle(d)]),
) as Record<FeatureKey, FeatureDef>;

/**
 * Free-forever feature keys: the loyalty program and reporting on it. Tests
 * guarantee these stay on Free, ship "ga" and can never be gated (admins can't
 * hide them).
 */
export const FREE_FOREVER: readonly FeatureKey[] = FEATURE_KEYS.filter(
  (k) => FEATURES[k].minPlan === "free" && FEATURES[k].phase === 1 && !FEATURES[k].platform,
);

/** Paid plan features (Plus or Pro), in display order. Restaurant pack features are listed separately. */
export const PAID_FEATURES: readonly FeatureKey[] = FEATURE_KEYS.filter((k) => FEATURES[k].minPlan !== "free" && !FEATURES[k].pack);

/** Restaurant pack features, in display order. */
export const RESTAURANT_FEATURES: readonly FeatureKey[] = FEATURE_KEYS.filter((k) => FEATURES[k].pack === "restaurant");

export interface FeatureContext {
  plan: PlanId;
  /** Current rollout stage of the feature (from DB, falls back to default). */
  stage: RolloutStage;
  /** Merchant has opted into betas. */
  betaOptIn?: boolean;
  /** Explicit per-merchant override (admin grant), wins over everything except hidden-free. */
  override?: boolean | null;
  /** The merchant's restaurant pack tier, if they bought it. */
  restaurantTier?: RestaurantTier | null;
  /** The merchant's vertical, for features that belong to one trade (FeatureDef.vertical). */
  vertical?: string | null;
  /** Active add-on ids (merchant_add_ons). banquet_module / phone_ai unlock their feature on Growth. */
  addOns?: readonly string[];
  /** On an annual paid subscription (merchants.annual_site_entitled), for FeatureDef.requiresAnnual features. */
  annualSiteEntitled?: boolean;
}

/**
 * Is a feature available to a merchant?
 *  - hidden: nobody (unless explicitly overridden by an admin, e.g. pilot shops)
 *  - beta: only merchants that opted in AND have the plan
 *  - ga: everyone on the plan
 */
export function isFeatureEnabled(key: FeatureKey, ctx: FeatureContext): boolean {
  const def = FEATURES[key];
  if (ctx.override === true) return true;
  if (ctx.override === false) return false;
  if (ctx.stage === "hidden") return false;
  if (def.vertical && !(typeof def.vertical === "string" ? ctx.vertical === def.vertical : !!ctx.vertical && def.vertical.includes(ctx.vertical))) return false;
  if (def.pack === "restaurant") {
    if (!ctx.restaurantTier) return false;
    if (RESTAURANT_TIER_RANK[ctx.restaurantTier] < RESTAURANT_TIER_RANK[def.packTier!] && !unlockedByAddOn(key, ctx)) return false;
  } else if (PLAN_RANK[effectivePlan(ctx.plan, ctx.restaurantTier)] < PLAN_RANK[def.minPlan] && !(ctx.vertical && def.freeForVerticals?.includes(ctx.vertical))) return false;
  if (def.requiresAnnual && !(ANNUAL_INCLUDES_WEBSITE && ctx.annualSiteEntitled)) return false;
  if (ctx.stage === "beta") return ctx.betaOptIn === true;
  return true;
}

/** Growth (or higher) merchants with the matching add-on get the feature without Pro. */
function unlockedByAddOn(key: FeatureKey, ctx: FeatureContext): boolean {
  if (!ctx.addOns?.length || !ctx.restaurantTier || RESTAURANT_TIER_RANK[ctx.restaurantTier] < RESTAURANT_TIER_RANK.growth) return false;
  return ctx.addOns.some((id) => ADD_ON_UNLOCKS[id as AddOnId]?.includes(key));
}

/** Any restaurant tier includes everything in Pro (ordering, promos, marketing, POS sync). */
export function effectivePlan(plan: PlanId, restaurantTier?: RestaurantTier | null): PlanId {
  return restaurantTier && PLAN_RANK[plan] < PLAN_RANK.plus ? "plus" : plan;
}

/** Is the paid plan itself purchasable yet? True once any feature on it is GA. */
export function isPlanAvailable(
  plan: PlanId,
  stages: Partial<Record<FeatureKey, RolloutStage>>,
): boolean {
  if (plan === "free") return true;
  return FEATURE_KEYS.some(
    (k) => FEATURES[k].minPlan === plan && !FEATURES[k].pack && (stages[k] ?? FEATURES[k].defaultStage) !== "hidden",
  );
}

/** What a shop has to do to get a feature. One answer for the pricing page, billing, gate cards and the sales assistant. */
export type FeatureOffer =
  | { kind: "network"; unlockAtMerchants: number }
  | { kind: "restaurant"; tier: RestaurantTier; name: string; priceCents: number }
  /** interval "year": only the annual subscription unlocks it (FeatureDef.requiresAnnual); priceCents is then the annual price. */
  | { kind: "plan"; plan: "plus" | "pro"; name: string; priceCents: number; interval?: "year" }
  | { kind: "free" };

export function featureOffer(key: FeatureKey): FeatureOffer {
  const d = FEATURES[key];
  if (d.networkGated) return { kind: "network", unlockAtMerchants: d.unlockAtMerchants };
  if (d.pack === "restaurant") {
    const p = RESTAURANT_PLANS[d.packTier ?? "starter"];
    return { kind: "restaurant", tier: p.tier, name: p.name, priceCents: p.priceCents };
  }
  if (d.minPlan === "free") return { kind: "free" };
  const plan = PLANS[d.minPlan];
  if (d.requiresAnnual) return { kind: "plan", plan: d.minPlan as "plus" | "pro", name: plan.name, priceCents: plan.annualPriceCents, interval: "year" };
  return { kind: "plan", plan: d.minPlan as "plus" | "pro", name: plan.name, priceCents: plan.priceCents };
}

// ---- phase-solo: A ----
// Solo pro packaging (docs/business/solo-pro-launch.md §3, docs/business/pricing.md "Solo pro packaging"). Other
// workstreams read these; never hard-code the numbers.

/** Bookable calendars (staff with online booking hours) on Free. Paid plans and restaurant tiers: unlimited. */
export const FREE_BOOKABLE_CALENDARS = 1;

/** Bookable calendars a plan allows; null = unlimited. */
export function bookableCalendarLimit(plan: PlanId, restaurantTier?: RestaurantTier | null): number | null {
  return effectivePlan(plan, restaurantTier) === "free" ? FREE_BOOKABLE_CALENDARS : null;
}

/** Texts a month on Free, reserved for transactional texts (confirmations, reminders); after that the reminder goes by email. */
export const FREE_REMINDER_SMS_PER_MONTH = PLANS.free.smsPerMonth;

/** Paid plans: each text over the monthly allowance, in cents (CAD). Free never goes over; it falls back to email. */
export const SMS_OVERAGE_CENTS = 4;

/** Promos to your regulars (app push and email, no texts) on Pro monthly; unused promos do not roll over. */
export const PROMOS_PER_MONTH_PLUS = 4;
/** Promos on the annual plan, used whenever the shop likes within the subscription year. */
export const PROMOS_PER_YEAR_ANNUAL = 48;

/** The annual paid plan includes the built-in website (feature "site.builder", one .ca domain). */
export const ANNUAL_INCLUDES_WEBSITE = true;
/** Website builder AI caps (workstream G enforces them server-side, reset with the billing period). */
export const SITE_AI_GENERATIONS_PER_MONTH = 10;
export const SITE_AI_EDITS_PER_MONTH = 40;

export type BillingInterval = "month" | "year";

export interface PromoAllowanceInput {
  plan: PlanId;
  restaurantTier?: RestaurantTier | null;
  /** The active paid subscription's interval; null/undefined on Free. */
  interval?: BillingInterval | null;
  /** merchants.promos_sent_count and merchants.promos_sent_period_start. */
  sentCount: number;
  sentPeriodStart: Date | string | null;
  /** Start of the current billing period (month or year). The counter resets when this is later than sentPeriodStart. */
  periodStart: Date | string;
}

export interface PromoAllowance {
  /** 0 on Free. */
  limit: number;
  used: number;
  remaining: number;
  /** "month" (Pro monthly), "year" (annual) or null (Free, no promos). */
  period: BillingInterval | null;
  periodStart: string;
}

/** How many promos a shop can still send this billing period. One answer for the API (send gate) and the UI (counter). */
export function promoAllowance(m: PromoAllowanceInput): PromoAllowance {
  const paid = effectivePlan(m.plan, m.restaurantTier) !== "free";
  const period: BillingInterval | null = paid ? (m.interval === "year" ? "year" : "month") : null;
  const limit = period === "year" ? PROMOS_PER_YEAR_ANNUAL : period === "month" ? PROMOS_PER_MONTH_PLUS : 0;
  const start = new Date(m.periodStart);
  const sentStart = m.sentPeriodStart ? new Date(m.sentPeriodStart) : null;
  const used = sentStart && sentStart.getTime() >= start.getTime() ? Math.max(0, m.sentCount) : 0;
  return { limit, used, remaining: Math.max(0, limit - used), period, periodStart: start.toISOString() };
}

/** Trades the founding solo price is for (beauty pros and barbershops). Vertical ids from verticals.ts (nails, brows_lashes, makeup land with workstream B). */
export const SOLO_VERTICALS = ["nails", "brows_lashes", "makeup", "salon", "barber"] as const;

export interface FoundingSoloConfig {
  /** Founder proposal, not yet confirmed (solo-pro-launch.md §8.3): on by default, FOUNDING_SOLO_ENABLED=false turns it off. */
  enabled: boolean;
  /** First-year annual price in cents (CAD); renews at PLANS.plus.annualPriceCents. */
  priceCents: number;
  slots: number;
  verticals: readonly string[];
}

/** Founding solo price: the first 200 beauty pros and barbershops on the annual plan pay $290 for year one, then $390. */
export const FOUNDING_SOLO: FoundingSoloConfig = { enabled: true, priceCents: 29000, slots: 200, verticals: SOLO_VERTICALS };

/**
 * The founding config with env overrides (FOUNDING_SOLO_ENABLED, FOUNDING_SOLO_PRICE_CENTS, FOUNDING_SOLO_SLOTS), so the
 * founder can change or strike the offer without a release. Pass process.env (API or a server component).
 */
export function foundingSoloConfig(env: Record<string, string | undefined> = {}): FoundingSoloConfig {
  const off = /^(0|false|off|no)$/i.test(env.FOUNDING_SOLO_ENABLED?.trim() ?? "");
  const int = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v != null && v.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : d;
  };
  return {
    enabled: FOUNDING_SOLO.enabled && !off,
    priceCents: int(env.FOUNDING_SOLO_PRICE_CENTS, FOUNDING_SOLO.priceCents),
    slots: int(env.FOUNDING_SOLO_SLOTS, FOUNDING_SOLO.slots),
    verticals: FOUNDING_SOLO.verticals,
  };
}

/** Spots left on the founding solo price, given how many shops already took it (merchants.founding_solo). */
export function foundingSoloSpotsLeft(taken: number, cfg: FoundingSoloConfig = FOUNDING_SOLO): number {
  return cfg.enabled ? Math.max(0, cfg.slots - Math.max(0, taken)) : 0;
}

/** Can this shop take the founding price on an annual Pro checkout? */
export function isFoundingSoloEligible(
  m: { vertical: string | null | undefined; foundingSolo?: boolean },
  taken: number,
  cfg: FoundingSoloConfig = FOUNDING_SOLO,
): boolean {
  if (!cfg.enabled || m.foundingSolo) return false;
  return !!m.vertical && cfg.verticals.includes(m.vertical) && foundingSoloSpotsLeft(taken, cfg) > 0;
}
/** "Powered by Local Loyalty" shows on the booking and shop pages of Free shops only (solo-pro-launch.md §3.2). */
export function showsPoweredBy(plan: PlanId, restaurantTier?: RestaurantTier | null): boolean {
  return effectivePlan(plan, restaurantTier) === "free";
}
// ---- end phase-solo: A ----
