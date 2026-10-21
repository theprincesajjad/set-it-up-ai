/**
 * Plans and feature gating.
 *
 * Business rules (non-negotiable, see docs/business/model.md):
 *  1. Every loyalty feature is on the Free plan, forever. No transaction fee,
 *     unlimited locations, unlimited members, unlimited staff for loyalty.
 *  2. Paid features (Plus / Pro) are rolled out only after the network has
 *     enough merchants. Until a feature's rollout stage is "ga" (or "beta" for
 *     opted-in merchants) it is hidden from everyone, paying or not.
 *  3. A feature that ships on Free can never move to a paid plan.
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

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    annualPriceCents: 0,
    blurb: "Loyalty, promos and the network. Free forever, no transaction fees.",
    bestFor: ["Every merchant"],
    smsPerMonth: 0,
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceCents: 3900,
    annualPriceCents: 39000,
    blurb: "Order-ahead, pickup, push promos to nearby members and SMS.",
    bestFor: ["Cafés", "Restaurants", "Bakeries", "Retail"],
    smsPerMonth: 500,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 7900,
    annualPriceCents: 79000,
    blurb: "Service tickets, quote approvals, deposits, invoices and scheduling.",
    bestFor: ["Repair", "Auto", "Alterations", "Print shops"],
    smsPerMonth: 1500,
  },
};

/** Platform fee on payments processed in-app (basis points). Free plan has no payments. */
export const PLATFORM_PAYMENT_FEE_BPS = 75;

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
}

export const FEATURE_KEYS = [
  // ---- Free forever (Phase 1) ----
  "loyalty.points",
  "loyalty.visits",
  "loyalty.stamps",
  "loyalty.items",
  "loyalty.rewards_catalog",
  "loyalty.vip_levels",
  "loyalty.welcome_bonus",
  "loyalty.birthday_bonus",
  "loyalty.referrals",
  "loyalty.manual_adjust",
  "loyalty.no_earn_categories",
  "discount_cards",
  "promos.basic",
  "promos.double_points",
  "network.listing",
  "network.perks",
  "wallet.passes",
  "customers.directory",
  "customers.csv_export",
  "customers.csv_import",
  "reports.basic",
  "staff.unlimited",
  "locations.unlimited",
  "integrations.pos_auto_award",
  "integrations.webhooks",
  "marketing.email",
  // ---- Plus (Phase 2) ----
  "orders.order_ahead",
  "orders.pickup_status",
  "promos.push_nearby",
  "marketing.sms",
  "marketing.automations",
  "payments.in_app",
  "reports.advanced",
  "booking.pickup_slots",
  // ---- Pro (Phase 2) ----
  "service.tickets",
  "service.quote_approval",
  "service.deposits",
  "service.invoices",
  "booking.dropoff_scheduling",
  "staff.permissions",
  // ---- Network monetization (Phase 3, merchant self-serve, paid per campaign) ----
  "ads.sponsored_listing",
  "ads.sponsored_promo",
  "ads.map_pin",
  "campaigns.neighbourhood",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

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

export const FEATURES: Record<FeatureKey, FeatureDef> = Object.fromEntries(
  [
    f("loyalty.points", "Points per dollar", "Earn points for every dollar spent.", "free", 1),
    f("loyalty.visits", "Points per visit", "Earn a fixed number of points per visit.", "free", 1),
    f("loyalty.stamps", "Stamp cards", "Buy N, get one free, digitally.", "free", 1),
    f("loyalty.items", "Points per item", "Bonus points for specific items or categories.", "free", 1),
    f("loyalty.rewards_catalog", "Rewards catalog", "Multiple reward tiers: $ off, % off, free item.", "free", 1),
    f("loyalty.vip_levels", "VIP levels", "Status levels with earn multipliers.", "free", 1),
    f("loyalty.welcome_bonus", "Welcome bonus", "Points when a customer joins.", "free", 1),
    f("loyalty.birthday_bonus", "Birthday reward", "Automatic birthday points.", "free", 1),
    f("loyalty.referrals", "Referrals", "Customer invites a friend; both earn.", "free", 1),
    f("loyalty.manual_adjust", "Manual adjustments", "Add or remove points with an audit trail.", "free", 1),
    f("loyalty.no_earn_categories", "No-earn categories", "Exclude categories (e.g. prescriptions) from earning.", "free", 1),
    f("discount_cards", "Digital discount cards", "Show-to-save cards with exclusions.", "free", 1),
    f("promos.basic", "Promos", "Post offers with start and end dates.", "free", 1),
    f("promos.double_points", "Bonus point promos", "Double points days, bonus points on items.", "free", 1),
    f("network.listing", "Network listing", "Appear on the neighbourhood map and feed.", "free", 1),
    f("network.perks", "Network perks", "Neighbourhood-wide perks like 'visit 3 shops' bonuses.", "free", 1),
    f("wallet.passes", "Apple & Google Wallet", "One network pass customers add without an app.", "free", 1),
    f("customers.directory", "Customer directory", "Every member, balance, visit history.", "free", 1),
    f("customers.csv_export", "CSV export", "Export your customers and activity.", "free", 1),
    f("customers.csv_import", "Import & migrate", "Bring members from another loyalty app.", "free", 1),
    f("reports.basic", "Reports", "Visits, members, redemptions, promo results.", "free", 1),
    f("staff.unlimited", "Unlimited staff", "Every staff member gets their own login.", "free", 1),
    f("locations.unlimited", "Unlimited locations", "One program across all your locations.", "free", 1),
    f("integrations.pos_auto_award", "POS auto-award", "Award points automatically from Square, Clover and more.", "free", 1),
    f("integrations.webhooks", "Webhooks & API", "Connect anything with outgoing webhooks.", "free", 1),
    f("marketing.email", "Email campaigns", "Email opted-in members (CASL compliant).", "free", 1),
    f("orders.order_ahead", "Order-ahead", "Menu, pickup time and in-app checkout.", "plus", 2, 100),
    f("orders.pickup_status", "Pickup status", "'Ready' push and SMS notifications.", "plus", 2, 100),
    f("promos.push_nearby", "Nearby push promos", "Push offers to network members near your shop.", "plus", 2, 100),
    f("marketing.sms", "SMS campaigns", "Text opted-in members. Included SMS each month.", "plus", 2, 100),
    f("marketing.automations", "Automations", "Win-back, we-miss-you and reward-ready messages.", "plus", 2, 100),
    f("payments.in_app", "In-app payments", "Card payments via Stripe; 0.75% platform fee.", "plus", 2, 100),
    f("reports.advanced", "Advanced reports", "Cohorts, retention, network overlap.", "plus", 2, 100),
    f("booking.pickup_slots", "Pickup slots", "Customers pick a pickup time.", "plus", 2, 100),
    f("service.tickets", "Service tickets", "Intake, item details, photos, status timeline.", "pro", 2, 40),
    f("service.quote_approval", "Quote approval", "Send quotes; customers approve in-app with e-signature log.", "pro", 2, 40),
    f("service.deposits", "Deposits", "Collect a deposit on approval.", "pro", 2, 40),
    f("service.invoices", "Invoices", "Final invoices, paid in-app.", "pro", 2, 40),
    f("booking.dropoff_scheduling", "Drop-off scheduling", "Slots and reminders for drop-offs.", "pro", 2, 40),
    f("staff.permissions", "Staff permissions", "Granular roles per staff member.", "pro", 2, 40),
    f("ads.sponsored_listing", "Sponsored listing", "Top of the neighbourhood feed and search.", "free", 3, 300),
    f("ads.sponsored_promo", "Sponsored promo", "Boost a promo across the network.", "free", 3, 300),
    f("ads.map_pin", "Featured map pin", "Highlighted pin on the network map.", "free", 3, 300),
    f("campaigns.neighbourhood", "Neighbourhood campaigns", "BIA-run street-wide points events.", "free", 3, 100),
  ].map((d) => [d.key, d]),
) as Record<FeatureKey, FeatureDef>;

/** Free-forever feature keys. A test guarantees these never move to a paid plan. */
export const FREE_FOREVER: readonly FeatureKey[] = FEATURE_KEYS.filter(
  (k) => FEATURES[k].minPlan === "free" && FEATURES[k].phase === 1,
);

export interface FeatureContext {
  plan: PlanId;
  /** Current rollout stage of the feature (from DB, falls back to default). */
  stage: RolloutStage;
  /** Merchant has opted into betas. */
  betaOptIn?: boolean;
  /** Explicit per-merchant override (admin grant), wins over everything except hidden-free. */
  override?: boolean | null;
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
  if (PLAN_RANK[ctx.plan] < PLAN_RANK[def.minPlan]) return false;
  if (ctx.stage === "beta") return ctx.betaOptIn === true;
  return true;
}

/** Is the paid plan itself purchasable yet? True once any feature on it is GA. */
export function isPlanAvailable(
  plan: PlanId,
  stages: Partial<Record<FeatureKey, RolloutStage>>,
): boolean {
  if (plan === "free") return true;
  return FEATURE_KEYS.some(
    (k) => FEATURES[k].minPlan === plan && (stages[k] ?? FEATURES[k].defaultStage) !== "hidden",
  );
}
