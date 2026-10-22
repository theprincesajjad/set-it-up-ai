/**
 * Local Loyalty database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 *  - All money is integer cents (CAD). All points are integers.
 *  - Points live in a double-entry ledger (ledger_* tables). Every
 *    ledger_transaction has entries that sum to zero. A member's balance is the
 *    sum of entries on their member account; merchant_members.balance is a cache
 *    updated in the same DB transaction and can be rebuilt from the ledger.
 *  - Merchants only ever see their own members (enforced in the API layer by
 *    scoping every query by merchant_id).
 *  - Customers are users. One user = one network identity across every shop.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const platformRole = pgEnum("platform_role", ["none", "rep", "admin"]);
export const staffRole = pgEnum("staff_role", ["owner", "manager", "staff"]);
export const planId = pgEnum("plan_id", ["free", "plus", "pro"]);
export const merchantStatus = pgEnum("merchant_status", ["onboarding", "active", "paused", "closed"]);
export const earnType = pgEnum("earn_type", ["per_dollar", "per_visit", "stamps"]);
export const rewardType = pgEnum("reward_type", ["amount_off", "percent_off", "free_item", "custom"]);
export const joinSource = pgEnum("join_source", ["qr", "phone", "pos", "wallet", "referral", "app", "import", "web", "campaign"]);
export const txType = pgEnum("tx_type", [
  "earn",
  "redeem",
  "adjust",
  "welcome_bonus",
  "birthday_bonus",
  "referral_bonus",
  "promo_bonus",
  "network_bonus",
  "campaign_bonus",
  "reversal",
  "expire",
  "import",
]);
export const txSource = pgEnum("tx_source", ["dashboard", "staff_app", "customer_app", "square", "clover", "shopify", "lightspeed", "toast", "api", "system", "import"]);
export const ledgerAccountKind = pgEnum("ledger_account_kind", ["member", "merchant_issued", "merchant_redeemed", "network_issued"]);
export const promoKind = pgEnum("promo_kind", ["offer", "multiplier", "bonus_points", "discount", "event"]);
export const promoStatus = pgEnum("promo_status", ["draft", "scheduled", "live", "ended", "archived"]);
export const rolloutStage = pgEnum("rollout_stage", ["hidden", "beta", "ga"]);
export const integrationProvider = pgEnum("integration_provider", [
  "square",
  "clover",
  "shopify",
  "lightspeed",
  "toast",
  "stripe",
  "twilio",
  "google_business",
  "mailchimp",
  "webhook",
  "whatsapp",
]);
export const integrationStatus = pgEnum("integration_status", ["pending", "connected", "error", "disconnected"]);
export const messageChannel = pgEnum("message_channel", ["sms", "email", "push"]);
export const restaurantTier = pgEnum("restaurant_tier", ["starter", "growth", "pro"]);
export const messageStatus = pgEnum("message_status", ["draft", "scheduled", "sending", "sent", "failed", "cancelled"]);
export const orderStatus = pgEnum("order_status", ["pending", "accepted", "preparing", "ready", "picked_up", "cancelled", "refunded"]);
export const paymentStatus = pgEnum("payment_status", ["unpaid", "requires_action", "authorized", "paid", "refunded", "failed"]);
export const ticketStatus = pgEnum("ticket_status", [
  "intake",
  "diagnosing",
  "quote_sent",
  "approved",
  "declined",
  "in_progress",
  "waiting_parts",
  "ready",
  "picked_up",
  "cancelled",
]);
export const quoteStatus = pgEnum("quote_status", ["draft", "sent", "approved", "declined", "expired", "superseded"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "open", "paid", "void"]);
export const adPlacement = pgEnum("ad_placement", ["feed_top", "search_top", "map_pin", "promo_boost", "nearby_push"]);
export const adStatus = pgEnum("ad_status", ["draft", "pending_review", "active", "paused", "ended", "rejected"]);
export const neighbourhoodStatus = pgEnum("neighbourhood_status", ["scouting", "pilot", "live"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled", "incomplete"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email"),
    phone: text("phone"), // E.164
    name: text("name"),
    passwordHash: text("password_hash"),
    platformRole: platformRole("platform_role").notNull().default("none"),
    birthday: date("birthday"), // optional, for birthday rewards
    postalCode: text("postal_code"),
    homeNeighbourhoodId: uuid("home_neighbourhood_id"),
    locale: text("locale").notNull().default("en-CA"),
    phoneVerifiedAt: ts("phone_verified_at"),
    emailVerifiedAt: ts("email_verified_at"),
    /** Short code printed on wallet pass/QR; maps to this customer network-wide. */
    memberCode: text("member_code").notNull(),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_uq").on(t.phone),
    uniqueIndex("users_member_code_uq").on(t.memberCode),
  ],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: id(),
    target: text("target").notNull(), // phone (E.164) or email
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull().default("login"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_target_idx").on(t.target)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(), // ios | android | web
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_tokens_token_uq").on(t.token)],
);

// ---------------------------------------------------------------------------
// Network geography
// ---------------------------------------------------------------------------
export const neighbourhoods = pgTable(
  "neighbourhoods",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull().default("Toronto"),
    province: text("province").notNull().default("ON"),
    status: neighbourhoodStatus("status").notNull().default("scouting"),
    centerLat: doublePrecision("center_lat"),
    centerLng: doublePrecision("center_lng"),
    radiusMetres: integer("radius_metres").notNull().default(1200),
    biaName: text("bia_name"),
    biaContactName: text("bia_contact_name"),
    biaContactEmail: text("bia_contact_email"),
    biaContactPhone: text("bia_contact_phone"),
    storefrontEstimate: integer("storefront_estimate"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("neighbourhoods_slug_uq").on(t.slug)],
);

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
export const merchants = pgTable(
  "merchants",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    vertical: text("vertical").notNull(), // see @ll/shared VERTICALS
    description: text("description"),
    neighbourhoodId: uuid("neighbourhood_id").references(() => neighbourhoods.id),
    status: merchantStatus("status").notNull().default("onboarding"),
    plan: planId("plan").notNull().default("free"),
    betaOptIn: boolean("beta_opt_in").notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    instagram: text("instagram"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    brandColor: text("brand_color"),
    timezone: text("timezone").notNull().default("America/Toronto"),
    /** Rep who signed the merchant (for commission + activation bonus). */
    repUserId: uuid("rep_user_id").references(() => users.id),
    /** Set when the merchant hits the activation threshold (25 active members). */
    activatedAt: ts("activated_at"),
    onboardingStep: text("onboarding_step").notNull().default("profile"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeAccountId: text("stripe_account_id"), // Stripe Connect (payments, Plus/Pro)
    /** Restaurant pack tier (null = not a restaurant pack customer). */
    restaurantTier: restaurantTier("restaurant_tier"),
    /** Founding-restaurant offer (50% off year 1, 25% for life). */
    foundingOffer: boolean("founding_offer").notNull().default(false),
    /** Languages the shop's menu and staff screens are offered in (BCP-47: en, hi, ur, pa). */
    languages: jsonb("languages").$type<string[]>().notNull().default(["en"]),
    /** Cash discount (dual pricing) in basis points off the card price; 0 = off. Not allowed in Quebec. */
    cashDiscountBps: integer("cash_discount_bps").notNull().default(0),
    /** Max degh pots (pre-order-only units) per pickup day; null = no cap. */
    preorderDailyCap: integer("preorder_daily_cap"),
    /** Stripe Connect charge mode: destination (platform account) or direct (merchant is merchant of record). */
    chargeMode: text("charge_mode").notNull().default("destination"),
    /** WhatsApp Business phone number (E.164) connected for this shop. */
    whatsappNumber: text("whatsapp_number"),
    whatsappCreditsUsed: integer("whatsapp_credits_used").notNull().default(0),
    whatsappCreditsExtra: integer("whatsapp_credits_extra").notNull().default(0),
    /** Google review link for review requests. */
    googleReviewUrl: text("google_review_url"),
    /** Stripe Connect account state, synced from account.updated webhooks. */
    stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
    stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false),
    smsCreditsUsed: integer("sms_credits_used").notNull().default(0),
    /** Send a transactional SMS receipt after each counter award (off by default; costs SMS). */
    smsReceiptsEnabled: boolean("sms_receipts_enabled").notNull().default(false),
    /** Public API key hash for the merchant webhook/API integration. */
    apiKeyHash: text("api_key_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("merchants_slug_uq").on(t.slug), index("merchants_neighbourhood_idx").on(t.neighbourhoodId)],
);

/** Unlimited locations, free. */
export const locations = pgTable(
  "locations",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull().default("Toronto"),
    postalCode: text("postal_code"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: text("phone"),
    /** { mon: [["09:00","17:00"]], ... } */
    hours: jsonb("hours").$type<Record<string, [string, string][]>>(),
    /** Short code printed on the counter QR stand. */
    qrCode: text("qr_code").notNull(),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("locations_merchant_idx").on(t.merchantId), uniqueIndex("locations_qr_uq").on(t.qrCode)],
);

export const merchantStaff = pgTable(
  "merchant_staff",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: staffRole("role").notNull().default("staff"),
    /** 4–6 digit PIN for fast switching on a shared counter device (hashed). */
    pinHash: text("pin_hash"),
    /** Granular permissions (Pro). Null = role defaults. */
    permissions: jsonb("permissions").$type<string[]>(),
    /** Staff app / kitchen ticket language (en, hi, ur, pa). */
    locale: text("locale").notNull().default("en"),
    /** Kitchen station this person works (KDS filter), e.g. "tandoor", "curry", "chai". */
    station: text("station"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.userId] })],
);

/** Product/service categories. earnEligible=false is the no-earn rule (e.g. prescriptions). */
export const merchantCategories = pgTable(
  "merchant_categories",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    earnEligible: boolean("earn_eligible").notNull().default(true),
    discountEligible: boolean("discount_eligible").notNull().default(true),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("merchant_categories_merchant_idx").on(t.merchantId)],
);

// ---------------------------------------------------------------------------
// Loyalty program
// ---------------------------------------------------------------------------
export const loyaltyPrograms = pgTable(
  "loyalty_programs",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    earnType: earnType("earn_type").notNull().default("per_dollar"),
    pointsPerDollar: integer("points_per_dollar").notNull().default(1),
    pointsPerVisit: integer("points_per_visit").notNull().default(0),
    minSpendCents: integer("min_spend_cents").notNull().default(0),
    stampGoal: integer("stamp_goal").notNull().default(0),
    terminology: text("terminology").notNull().default("points"),
    welcomeBonus: integer("welcome_bonus").notNull().default(0),
    birthdayBonus: integer("birthday_bonus").notNull().default(0),
    referralBonus: integer("referral_bonus").notNull().default(0),
    /**
     * Points never expire by default. If a merchant enables expiry it must be
     * >= 12 months of inactivity and is disclosed on every balance screen.
     */
    expiryMonths: integer("expiry_months"),
    /** Per-member cooldown between visit awards, to stop double-scans. */
    visitCooldownMinutes: integer("visit_cooldown_minutes").notNull().default(30),
    termsText: text("terms_text"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("loyalty_programs_merchant_uq").on(t.merchantId)],
);

export const rewards = pgTable(
  "rewards",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    pointsCost: integer("points_cost").notNull(),
    rewardType: rewardType("reward_type").notNull(),
    /** cents for amount_off; whole percent for percent_off; 0 otherwise. */
    value: integer("value").notNull().default(0),
    maxDiscountCents: integer("max_discount_cents"),
    catalogItemId: uuid("catalog_item_id"),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("rewards_merchant_idx").on(t.merchantId)],
);

export const vipLevels = pgTable(
  "vip_levels",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lifetime points needed to reach this level. */
    thresholdPoints: integer("threshold_points").notNull(),
    /** Earn multiplier in hundredths (150 = 1.5x). */
    multiplierPct: integer("multiplier_pct").notNull().default(100),
    perks: text("perks"),
    createdAt: createdAt(),
  },
  (t) => [index("vip_levels_merchant_idx").on(t.merchantId)],
);

/** Show-to-save cards (e.g. 10% off front store, not valid on prescriptions). */
export const discountCards = pgTable(
  "discount_cards",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    percentOff: integer("percent_off").notNull().default(0),
    amountOffCents: integer("amount_off_cents").notNull().default(0),
    terms: text("terms"),
    /** Who qualifies: everyone, seniors, students, members_only, vip */
    eligibility: text("eligibility").notNull().default("members_only"),
    excludedCategoryIds: jsonb("excluded_category_ids").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("discount_cards_merchant_idx").on(t.merchantId)],
);

// ---------------------------------------------------------------------------
// Members (a customer's relationship with one merchant)
// ---------------------------------------------------------------------------
export const merchantMembers = pgTable(
  "merchant_members",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedVia: joinSource("joined_via").notNull().default("phone"),
    joinedLocationId: uuid("joined_location_id").references(() => locations.id),
    /** Cached balance; rebuildable from ledger. */
    balance: integer("balance").notNull().default(0),
    lifetimePoints: integer("lifetime_points").notNull().default(0),
    visitCount: integer("visit_count").notNull().default(0),
    totalSpendCents: bigint("total_spend_cents", { mode: "number" }).notNull().default(0),
    lastVisitAt: ts("last_visit_at"),
    vipLevelId: uuid("vip_level_id").references(() => vipLevels.id),
    /** CASL express consent for promotional messages from THIS merchant. */
    marketingConsentAt: ts("marketing_consent_at"),
    marketingConsentSource: text("marketing_consent_source"),
    marketingConsentText: text("marketing_consent_text"),
    /** Customer muted this shop (no promos, still earns). */
    muted: boolean("muted").notNull().default(false),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    referredByMemberId: uuid("referred_by_member_id"),
    lastBirthdayBonusYear: integer("last_birthday_bonus_year"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("merchant_members_uq").on(t.merchantId, t.userId),
    index("merchant_members_user_idx").on(t.userId),
    index("merchant_members_last_visit_idx").on(t.merchantId, t.lastVisitAt),
  ],
);

// ---------------------------------------------------------------------------
// Double-entry points ledger
// ---------------------------------------------------------------------------
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    kind: ledgerAccountKind("kind").notNull(),
    memberId: uuid("member_id").references(() => merchantMembers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_accounts_member_uq").on(t.memberId),
    uniqueIndex("ledger_accounts_merchant_kind_uq").on(t.merchantId, t.kind).where(sql`${t.memberId} is null`),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => merchantMembers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    type: txType("type").notNull(),
    source: txSource("source").notNull(),
    /** Signed points delta for the member (+earn, -redeem). Mirrors the member entry. */
    points: integer("points").notNull(),
    /** Purchase amount that produced the earn, if any. */
    amountCents: integer("amount_cents"),
    eligibleCents: integer("eligible_cents"),
    description: text("description"),
    breakdown: jsonb("breakdown").$type<string[]>(),
    /** Client-generated key so retries (offline queue, webhooks) never double-award. */
    idempotencyKey: text("idempotency_key"),
    externalRef: text("external_ref"),
    staffUserId: uuid("staff_user_id").references(() => users.id),
    reversesTransactionId: uuid("reverses_transaction_id"),
    reversedAt: ts("reversed_at"),
    promoId: uuid("promo_id"),
    rewardId: uuid("reward_id"),
    campaignId: uuid("campaign_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_tx_idem_uq").on(t.merchantId, t.idempotencyKey),
    index("ledger_tx_member_idx").on(t.memberId, t.createdAt),
    index("ledger_tx_merchant_idx").on(t.merchantId, t.createdAt),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    transactionId: uuid("transaction_id").notNull().references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => ledgerAccounts.id),
    /** Signed. Entries of a transaction sum to zero. */
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_entries_tx_idx").on(t.transactionId), index("ledger_entries_account_idx").on(t.accountId)],
);

export const visits = pgTable(
  "visits",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => merchantMembers.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    transactionId: uuid("transaction_id").references(() => ledgerTransactions.id),
    neighbourhoodId: uuid("neighbourhood_id"),
    source: txSource("source").notNull(),
    amountCents: integer("amount_cents"),
    createdAt: createdAt(),
  },
  (t) => [
    index("visits_merchant_idx").on(t.merchantId, t.createdAt),
    index("visits_user_idx").on(t.userId, t.createdAt),
    index("visits_neighbourhood_idx").on(t.neighbourhoodId, t.createdAt),
  ],
);

/** A redeemed reward. Code can be shown at the counter or applied at the POS. */
export const redemptions = pgTable(
  "redemptions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => merchantMembers.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id").notNull().references(() => rewards.id),
    transactionId: uuid("transaction_id").references(() => ledgerTransactions.id),
    code: text("code").notNull(),
    status: text("status").notNull().default("issued"), // issued | used | void
    discountCents: integer("discount_cents"),
    usedAt: ts("used_at"),
    externalRef: text("external_ref"),
    /** App-issued codes expire if not used (a job voids them and refunds the points). Null = no expiry. */
    expiresAt: ts("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("redemptions_code_uq").on(t.merchantId, t.code), index("redemptions_member_idx").on(t.memberId)],
);

export const referrals = pgTable(
  "referrals",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    referrerMemberId: uuid("referrer_member_id").notNull().references(() => merchantMembers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    refereeUserId: uuid("referee_user_id").references(() => users.id),
    status: text("status").notNull().default("pending"), // pending | joined | rewarded
    rewardedAt: ts("rewarded_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("referrals_code_uq").on(t.code)],
);

// ---------------------------------------------------------------------------
// Promos & network
// ---------------------------------------------------------------------------
export const promos = pgTable(
  "promos",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    imageUrl: text("image_url"),
    kind: promoKind("kind").notNull().default("offer"),
    /** For multiplier promos: hundredths (200 = double points). */
    multiplierPct: integer("multiplier_pct"),
    bonusPoints: integer("bonus_points"),
    percentOff: integer("percent_off"),
    itemId: uuid("item_id"),
    categoryId: uuid("category_id"),
    /** Recurring days of week (0=Sun) and time window, e.g. Tuesday double points. */
    daysOfWeek: jsonb("days_of_week").$type<number[]>(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    audience: text("audience").notNull().default("network"), // network | members | vip
    status: promoStatus("status").notNull().default("draft"),
    viewCount: integer("view_count").notNull().default(0),
    claimCount: integer("claim_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("promos_merchant_idx").on(t.merchantId), index("promos_window_idx").on(t.startsAt, t.endsAt)],
);

/** Neighbourhood-wide perks, e.g. bonus when a customer visits their 3rd shop on the strip. */
export const networkPerks = pgTable("network_perks", {
  id: id(),
  neighbourhoodId: uuid("neighbourhood_id").references(() => neighbourhoods.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** distinct_merchants: visit N distinct shops within windowDays */
  ruleType: text("rule_type").notNull().default("distinct_merchants"),
  threshold: integer("threshold").notNull().default(3),
  windowDays: integer("window_days").notNull().default(30),
  bonusPoints: integer("bonus_points").notNull().default(50),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const networkPerkAwards = pgTable(
  "network_perk_awards",
  {
    id: id(),
    perkId: uuid("perk_id").notNull().references(() => networkPerks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    transactionId: uuid("transaction_id").references(() => ledgerTransactions.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("network_perk_awards_uq").on(t.perkId, t.userId)],
);

/** BIA-run street-wide events ("Passport week", "Points weekend"). Paid per campaign. */
export const campaigns = pgTable("campaigns", {
  id: id(),
  neighbourhoodId: uuid("neighbourhood_id").notNull().references(() => neighbourhoods.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("passport"), // passport | points_weekend | multiplier
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  /** passport: visit N shops to enter prize draw */
  goalVisits: integer("goal_visits").notNull().default(5),
  bonusPoints: integer("bonus_points").notNull().default(0),
  multiplierPct: integer("multiplier_pct"),
  prize: text("prize"),
  priceCents: integer("price_cents").notNull().default(0),
  paidAt: ts("paid_at"),
  status: text("status").notNull().default("draft"), // draft | scheduled | live | ended | cancelled
  createdBy: uuid("created_by").references(() => users.id),
  /** Prize draw result (admin). Only masked contact details are ever returned by the API. */
  winnerUserId: uuid("winner_user_id").references(() => users.id),
  drawnAt: ts("drawn_at"),
  createdAt: createdAt(),
});

/** BIA managers: users who may run neighbourhood campaigns for one neighbourhood (platform admins can for all). */
export const neighbourhoodManagers = pgTable(
  "neighbourhood_managers",
  {
    neighbourhoodId: uuid("neighbourhood_id").notNull().references(() => neighbourhoods.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.neighbourhoodId, t.userId] }), index("neighbourhood_managers_user_idx").on(t.userId)],
);

export const campaignMerchants = pgTable(
  "campaign_merchants",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.merchantId] })],
);

export const campaignProgress = pgTable(
  "campaign_progress",
  {
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    merchantIds: jsonb("merchant_ids").$type<string[]>().notNull().default([]),
    completedAt: ts("completed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Messaging (CASL: only to members with marketing consent and not muted)
// ---------------------------------------------------------------------------
export const messages = pgTable(
  "messages",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    channel: messageChannel("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    /** Segment definition: { kind: "all" | "lapsed" | "vip" | "reward_ready" | "tag", ... } */
    segment: jsonb("segment").$type<Record<string, unknown>>().notNull().default({ kind: "all" }),
    automation: text("automation"), // null | win_back | reward_ready | birthday | welcome
    status: messageStatus("status").notNull().default("draft"),
    scheduledAt: ts("scheduled_at"),
    sentAt: ts("sent_at"),
    recipientCount: integer("recipient_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("messages_merchant_idx").on(t.merchantId)],
);

export const messageDeliveries = pgTable(
  "message_deliveries",
  {
    id: id(),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    channel: messageChannel("channel").notNull(),
    to: text("to").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull().default("marketing"), // marketing | transactional
    status: text("status").notNull().default("queued"), // queued | sent | delivered | failed
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("message_deliveries_message_idx").on(t.messageId)],
);

// ---------------------------------------------------------------------------
// Wallet passes (one network pass per customer; Apple + Google)
// ---------------------------------------------------------------------------
export const walletPasses = pgTable(
  "wallet_passes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // apple | google
    serialNumber: text("serial_number").notNull(),
    authToken: text("auth_token").notNull(),
    lastUpdatedAt: ts("last_updated_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wallet_passes_serial_uq").on(t.serialNumber)],
);

export const walletDeviceRegistrations = pgTable(
  "wallet_device_registrations",
  {
    id: id(),
    deviceLibraryId: text("device_library_id").notNull(),
    pushToken: text("push_token").notNull(),
    passId: uuid("pass_id").notNull().references(() => walletPasses.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wallet_device_reg_uq").on(t.deviceLibraryId, t.passId)],
);

// ---------------------------------------------------------------------------
// Customer notifications (inbox + per-user preferences). See docs/engineering/api/notifications.md
// ---------------------------------------------------------------------------
/** Overrides only: a missing row means the type/channel default (services/notifications.ts). */
export const userNotificationPrefs = pgTable(
  "user_notification_prefs",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** points_earned | reward_ready | reward_expiring | redeem_confirmed | order_ready | ticket_updated | quote_sent | booking_reminder | promo_nearby | passport_progress */
    type: text("type").notNull(),
    channel: text("channel").notNull(), // push | sms | email
    enabled: boolean("enabled").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("user_notification_prefs_uq").on(t.userId, t.type, t.channel)],
);

/** Every notification we decided to send a customer (the in-app inbox), whatever channel carried it. */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Deep link payload, e.g. { screen: "shop", merchantId, slug, url: "ll://shop/<slug>" }. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** Channels that carried it: ["push", "sms", "email", "wallet"]. */
    channels: jsonb("channels").$type<string[]>().notNull().default([]),
    /** Expo push tickets [{ id, token }] awaiting receipt checks (DeviceNotRegistered cleanup). */
    pushTickets: jsonb("push_tickets").$type<{ id: string; token: string }[]>(),
    receiptsCheckedAt: ts("receipts_checked_at"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_user_type_idx").on(t.userId, t.type, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Plans, subscriptions and feature rollout
// ---------------------------------------------------------------------------
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    plan: planId("plan").notNull(),
    /** Set when this subscription is for the restaurant pack. */
    restaurantTier: restaurantTier("restaurant_tier"),
    status: subscriptionStatus("status").notNull(),
    interval: text("interval").notNull().default("month"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_merchant_idx").on(t.merchantId), uniqueIndex("subscriptions_stripe_uq").on(t.stripeSubscriptionId)],
);

/** Global rollout stage per feature key (see @ll/shared FEATURES). */
export const featureRollouts = pgTable("feature_rollouts", {
  key: text("key").primaryKey(),
  stage: rolloutStage("stage").notNull(),
  note: text("note"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const featureOverrides = pgTable(
  "feature_overrides",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.key] })],
);

/** "Notify me" interest in a coming-soon (hidden/beta) feature; one row per merchant + feature. */
export const featureInterest = pgTable(
  "feature_interest",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("feature_interest_uq").on(t.merchantId, t.featureKey), index("feature_interest_key_idx").on(t.featureKey)],
);

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    status: integrationStatus("status").notNull().default("pending"),
    externalAccountId: text("external_account_id"),
    /** AES-GCM encrypted JSON: { accessToken, refreshToken, expiresAt } */
    credentialsEnc: text("credentials_enc"),
    /** Provider-specific settings: location mapping, award rules, webhook url... */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integrations_merchant_provider_uq").on(t.merchantId, t.provider),
    index("integrations_external_idx").on(t.provider, t.externalAccountId),
  ],
);

/** Inbound webhook log; unique (provider, external_id) makes processing idempotent. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    merchantId: uuid("merchant_id"),
    payload: jsonb("payload").notNull(),
    processedAt: ts("processed_at"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    /** received | processed | unmatched | claimed | refunded | ignored | duplicate | failed */
    status: text("status").notNull().default("received"),
    /** Provider purchase id (order/sale id) this event resolved to; several events can share one. */
    purchaseRef: text("purchase_ref"),
    /** Normalized PurchaseEvent (connectors) kept so unmatched purchases can be claimed later. */
    purchase: jsonb("purchase").$type<Record<string, unknown>>(),
    /** Receipt code a customer can enter to claim an unmatched purchase. */
    claimCode: text("claim_code"),
    locationId: uuid("location_id"),
    memberId: uuid("member_id"),
    transactionId: uuid("transaction_id"),
    claimedAt: ts("claimed_at"),
    nextAttemptAt: ts("next_attempt_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("webhook_events_uq").on(t.provider, t.externalId),
    index("webhook_events_merchant_status_idx").on(t.merchantId, t.status),
    index("webhook_events_claim_idx").on(t.merchantId, t.claimCode),
  ],
);

/** Delivery queue for outbound merchant webhooks (signed, retried with backoff). */
export const outboundWebhookDeliveries = pgTable(
  "outbound_webhook_deliveries",
  {
    id: id(),
    webhookId: uuid("webhook_id").notNull().references(() => outboundWebhooks.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** pending | delivered | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: ts("delivered_at"),
    createdAt: createdAt(),
  },
  (t) => [index("outbound_deliveries_due_idx").on(t.status, t.nextAttemptAt), index("outbound_deliveries_webhook_idx").on(t.webhookId, t.createdAt)],
);

/** Outgoing webhooks the merchant registers (Zapier, Make, custom). */
export const outboundWebhooks = pgTable("outbound_webhooks", {
  id: id(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  /** Optional label (e.g. "Zapier: new member"), and who created it (dashboard | zapier | make | api). */
  description: text("description"),
  createdVia: text("created_via").notNull().default("dashboard"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Commerce (Plus): catalog + order-ahead
// ---------------------------------------------------------------------------
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => merchantCategories.id),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    imageUrl: text("image_url"),
    /** [{ name: "Size", options: [{ name: "Large", priceCents: 50 }] }] */
    modifiers: jsonb("modifiers").$type<{ name: string; options: { name: string; priceCents: number }[] }[]>().notNull().default([]),
    available: boolean("available").notNull().default(true),
    orderable: boolean("orderable").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
    /** Halal / dietary attributes (restaurant pack). */
    dietary: jsonb("dietary").$type<DietaryTags>().notNull().default({}),
    /** { hi: { name, description }, ur: {...}, pa: {...} } */
    translations: jsonb("translations").$type<Translations>().notNull().default({}),
    /** Only orderable as a pre-order (biryani pots / degh, trays). */
    preorderOnly: boolean("preorder_only").notNull().default(false),
    leadTimeHours: integer("lead_time_hours").notNull().default(0),
    /** How many people it serves (pots, trays, catering). */
    serves: integer("serves"),
    /** Kitchen station for KDS routing. */
    station: text("station"),
    /** Deposit required for pre-orders, basis points of the item price. */
    depositBps: integer("deposit_bps").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("catalog_items_merchant_idx").on(t.merchantId)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    number: integer("number").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    pickupAt: ts("pickup_at"),
    notes: text("notes"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    paymentStatus: paymentStatus("payment_status").notNull().default("unpaid"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    redemptionId: uuid("redemption_id"),
    pointsEarned: integer("points_earned").notNull().default(0),
    readyAt: ts("ready_at"),
    pickedUpAt: ts("picked_up_at"),
    /** in_app (Stripe PaymentIntent) | at_pickup (paid at the counter). */
    paymentMethod: text("payment_method").notNull().default("at_pickup"),
    /** Client retry key; unique per customer. */
    idempotencyKey: text("idempotency_key"),
    paidAt: ts("paid_at"),
    cancelReason: text("cancel_reason"),
    /** pickup | preorder (degh pots) | tiffin | catering | banquet */
    kind: text("kind").notNull().default("pickup"),
    /** app | web | whatsapp | phone | counter */
    channel: text("channel").notNull().default("app"),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaidAt: ts("deposit_paid_at"),
    customerFeeCents: integer("customer_fee_cents").notNull().default(0),
    cashDiscountCents: integer("cash_discount_cents").notNull().default(0),
    /** Kitchen display: when the ticket was fired / bumped. */
    firedAt: ts("fired_at"),
    bumpedAt: ts("bumped_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_merchant_idx").on(t.merchantId, t.createdAt),
    index("orders_user_idx").on(t.userId),
    uniqueIndex("orders_user_idem_uq").on(t.userId, t.idempotencyKey),
    uniqueIndex("orders_merchant_number_uq").on(t.merchantId, t.number),
  ],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  modifiers: jsonb("modifiers").$type<{ name: string; option: string; priceCents: number }[]>().notNull().default([]),
  categoryId: uuid("category_id"),
  station: text("station"),
  /** KDS: queued | cooking | ready */
  kitchenStatus: text("kitchen_status").notNull().default("queued"),
  notes: text("notes"),
});

// ---------------------------------------------------------------------------
// Service (Pro): tickets, quotes, deposits, invoices, scheduling
// ---------------------------------------------------------------------------
export const serviceTickets = pgTable(
  "service_tickets",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    number: integer("number").notNull(),
    /** device | vehicle | garment | other */
    itemKind: text("item_kind").notNull().default("device"),
    /** { make, model, serial, imei, vin, plate, mileage, colour, ... } */
    itemDetails: jsonb("item_details").$type<Record<string, string>>().notNull().default({}),
    issue: text("issue").notNull(),
    intakeNotes: text("intake_notes"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    status: ticketStatus("status").notNull().default("intake"),
    assignedStaffId: uuid("assigned_staff_id").references(() => users.id),
    promisedAt: ts("promised_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_tickets_merchant_idx").on(t.merchantId, t.status), index("service_tickets_user_idx").on(t.userId)],
);

export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: id(),
    ticketId: uuid("ticket_id").notNull().references(() => serviceTickets.id, { onDelete: "cascade" }),
    status: ticketStatus("status"),
    note: text("note"),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(true),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_events_ticket_idx").on(t.ticketId)],
);

export type DietaryTags = { halal?: boolean; zabihah?: boolean; vegetarian?: boolean; vegan?: boolean; jain?: boolean; glutenFree?: boolean; spice?: 0 | 1 | 2 | 3; allergens?: string[]; halalCertifier?: string };
export type Translations = Record<string, { name?: string; description?: string }>;

export type LineItem = { description: string; quantity: number; unitPriceCents: number; kind?: "labour" | "part" | "fee" | "other"; categoryId?: string | null };

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    ticketId: uuid("ticket_id").notNull().references(() => serviceTickets.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull(),
    diagnosis: text("diagnosis"),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    depositCents: integer("deposit_cents").notNull().default(0),
    status: quoteStatus("status").notNull().default("draft"),
    /** Public token for the approve link sent by SMS (no login needed). */
    approvalToken: text("approval_token").notNull(),
    expiresAt: ts("expires_at"),
    sentAt: ts("sent_at"),
    respondedAt: ts("responded_at"),
    /** E-signature log: typed name, IP, user agent, timestamp. */
    signatureName: text("signature_name"),
    signatureIp: text("signature_ip"),
    signatureUserAgent: text("signature_user_agent"),
    declineReason: text("decline_reason"),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositPaidAt: ts("deposit_paid_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quotes_token_uq").on(t.approvalToken), index("quotes_ticket_idx").on(t.ticketId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    ticketId: uuid("ticket_id").references(() => serviceTickets.id),
    cateringEventId: uuid("catering_event_id"),
    hallBookingId: uuid("hall_booking_id"),
    number: integer("number").notNull(),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    depositAppliedCents: integer("deposit_applied_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    status: invoiceStatus("status").notNull().default("draft"),
    payToken: text("pay_token").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: ts("paid_at"),
    pointsEarned: integer("points_earned").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invoices_pay_token_uq").on(t.payToken), index("invoices_merchant_idx").on(t.merchantId)],
);

export const bookingSlots = pgTable(
  "booking_slots",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    kind: text("kind").notNull().default("pickup"), // pickup | dropoff | appointment
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index("booking_slots_merchant_idx").on(t.merchantId, t.startsAt),
    uniqueIndex("booking_slots_uq").on(t.merchantId, t.locationId, t.kind, t.startsAt),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    slotId: uuid("slot_id").notNull().references(() => bookingSlots.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    ticketId: uuid("ticket_id").references(() => serviceTickets.id),
    orderId: uuid("order_id").references(() => orders.id),
    status: text("status").notNull().default("booked"), // booked | cancelled | completed | no_show
    reminderSentAt: ts("reminder_sent_at"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("bookings_slot_idx").on(t.slotId)],
);

/** Per-merchant counters for human-friendly order/ticket/invoice numbers. */
export const merchantCounters = pgTable(
  "merchant_counters",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.name] })],
);

// ---------------------------------------------------------------------------
// Network advertising (Phase 3)
// ---------------------------------------------------------------------------
export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    placement: adPlacement("placement").notNull(),
    promoId: uuid("promo_id").references(() => promos.id),
    neighbourhoodIds: jsonb("neighbourhood_ids").$type<string[]>().notNull().default([]),
    radiusMetres: integer("radius_metres"),
    headline: text("headline").notNull(),
    body: text("body"),
    imageUrl: text("image_url"),
    /** Pricing: flat daily rate or CPM, cents. */
    pricingModel: text("pricing_model").notNull().default("daily"), // daily | cpm | cpc
    rateCents: integer("rate_cents").notNull(),
    budgetCents: integer("budget_cents").notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    status: adStatus("status").notNull().default("draft"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    attributedVisits: integer("attributed_visits").notNull().default(0),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** pending | paid | invoiced | refunded | failed */
    paymentStatus: text("payment_status").notNull().default("pending"),
    paidAt: ts("paid_at"),
    /** Admin review (approve / reject with reason). */
    reviewNote: text("review_note"),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    /** Daily-rate campaigns: flight days already accrued (or skipped while paused). */
    accruedDays: integer("accrued_days").notNull().default(0),
    /** completed | budget_exhausted | cancelled */
    endedReason: text("ended_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("ad_campaigns_status_idx").on(t.status, t.placement), index("ad_campaigns_merchant_idx").on(t.merchantId, t.createdAt)],
);

export const adEvents = pgTable(
  "ad_events",
  {
    id: id(),
    adCampaignId: uuid("ad_campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    kind: text("kind").notNull(), // impression | click | visit
    /** For kind=visit: the attributed visit. */
    visitId: uuid("visit_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ad_events_campaign_idx").on(t.adCampaignId, t.createdAt),
    index("ad_events_user_idx").on(t.userId, t.adCampaignId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Sales / onboarding (rep console)
// ---------------------------------------------------------------------------
export const leads = pgTable(
  "leads",
  {
    id: id(),
    neighbourhoodId: uuid("neighbourhood_id").references(() => neighbourhoods.id),
    businessName: text("business_name").notNull(),
    vertical: text("vertical"),
    address: text("address"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    /** new | contacted | visit_booked | signed | activated | lost */
    stage: text("stage").notNull().default("new"),
    currentLoyalty: text("current_loyalty"), // e.g. "paper punch card", "SoPoints"
    assignedRepId: uuid("assigned_rep_id").references(() => users.id),
    merchantId: uuid("merchant_id").references(() => merchants.id),
    nextActionAt: ts("next_action_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leads_rep_idx").on(t.assignedRepId, t.stage), index("leads_neighbourhood_idx").on(t.neighbourhoodId)],
);

export const leadActivities = pgTable("lead_activities", {
  id: id(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  repUserId: uuid("rep_user_id").references(() => users.id),
  kind: text("kind").notNull(), // call | email | visit | note
  outcome: text("outcome"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id"),
    merchantId: uuid("merchant_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    data: jsonb("data"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_merchant_idx").on(t.merchantId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Restaurant pack: tiffin, catering, banquet, WhatsApp, reviews, phone, splits
// ---------------------------------------------------------------------------
export const tiffinPlans = pgTable(
  "tiffin_plans",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    translations: jsonb("translations").$type<Translations>().notNull().default({}),
    /** weekly | monthly */
    cadence: text("cadence").notNull().default("monthly"),
    /** Delivery/pickup days, 0=Sun..6=Sat. */
    daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
    mealsPerDay: integer("meals_per_day").notNull().default(1),
    /** Price per cadence period for one serving, cents. */
    priceCents: integer("price_cents").notNull(),
    /** Extra servings (family plans) cost this much each per period. */
    extraServingCents: integer("extra_serving_cents").notNull().default(0),
    maxServings: integer("max_servings").notNull().default(6),
    dietary: jsonb("dietary").$type<DietaryTags>().notNull().default({}),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    pickupAllowed: boolean("pickup_allowed").notNull().default(true),
    deliveryAllowed: boolean("delivery_allowed").notNull().default(true),
    /** Skips/pauses must be made this many hours before the meal day. */
    cutoffHours: integer("cutoff_hours").notNull().default(24),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("tiffin_plans_merchant_idx").on(t.merchantId)],
);

export const tiffinRoutes = pgTable("tiffin_routes", {
  id: id(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  /** Postal-code prefixes this route covers, e.g. ["L4T", "L4W"]. */
  areas: jsonb("areas").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const tiffinSubscriptions = pgTable(
  "tiffin_subscriptions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => tiffinPlans.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** pending (awaiting first payment) | active | paused | past_due | cancelled */
    status: text("status").notNull().default("pending"),
    servings: integer("servings").notNull().default(1),
    /** delivery | pickup */
    fulfilment: text("fulfilment").notNull().default("delivery"),
    address: text("address"),
    addressNotes: text("address_notes"),
    postalCode: text("postal_code"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    routeId: uuid("route_id").references(() => tiffinRoutes.id),
    stopOrder: integer("stop_order"),
    dietaryNotes: text("dietary_notes"),
    startDate: date("start_date").notNull(),
    pausedUntil: date("paused_until"),
    currentPeriodStart: date("current_period_start"),
    currentPeriodEnd: date("current_period_end"),
    nextBillingDate: date("next_billing_date"),
    /** Price per period for this subscription (plan price + extra servings + delivery), cents. */
    priceCents: integer("price_cents").notNull(),
    /** card | pad (pre-authorized debit) */
    paymentMethod: text("payment_method").notNull().default("card"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tiffin_subs_merchant_idx").on(t.merchantId, t.status), index("tiffin_subs_user_idx").on(t.userId)],
);

export const tiffinMenus = pgTable(
  "tiffin_menus",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => tiffinPlans.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    items: jsonb("items").$type<{ name: string; description?: string; dietary?: DietaryTags }[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tiffin_menus_uq").on(t.merchantId, t.planId, t.date)],
);

export const tiffinSkips = pgTable(
  "tiffin_skips",
  {
    subscriptionId: uuid("subscription_id").notNull().references(() => tiffinSubscriptions.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.date] })],
);

export const tiffinDeliveries = pgTable(
  "tiffin_deliveries",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => tiffinSubscriptions.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").references(() => tiffinRoutes.id),
    date: date("date").notNull(),
    servings: integer("servings").notNull().default(1),
    /** scheduled | skipped | out_for_delivery | delivered | picked_up | missed */
    status: text("status").notNull().default("scheduled"),
    stopOrder: integer("stop_order"),
    deliveredAt: ts("delivered_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tiffin_deliveries_uq").on(t.subscriptionId, t.date), index("tiffin_deliveries_day_idx").on(t.merchantId, t.date)],
);

export const tiffinCharges = pgTable(
  "tiffin_charges",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => tiffinSubscriptions.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Credit for skipped meals applied to this charge. */
    creditCents: integer("credit_cents").notNull().default(0),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    /** pending | paid | failed | refunded */
    status: text("status").notNull().default("pending"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tiffin_charges_period_uq").on(t.subscriptionId, t.periodStart)],
);

export const cateringEvents = pgTable(
  "catering_events",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    number: integer("number").notNull(),
    /** wedding | walima | mehndi | engagement | birthday | aqiqah | corporate | religious | other */
    eventType: text("event_type").notNull().default("other"),
    eventDate: date("event_date").notNull(),
    startTime: text("start_time"),
    headcount: integer("headcount").notNull(),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    /** delivery | pickup | onsite (staffed) | banquet (our hall) */
    service: text("service").notNull().default("delivery"),
    /** inquiry | tasting | quoted | confirmed | completed | cancelled */
    status: text("status").notNull().default("inquiry"),
    menu: jsonb("menu").$type<{ catalogItemId?: string; name: string; perHeadCents?: number; quantity?: number; unitPriceCents?: number }[]>().notNull().default([]),
    perHeadCents: integer("per_head_cents").notNull().default(0),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    depositBps: integer("deposit_bps").notNull().default(3000),
    depositCents: integer("deposit_cents").notNull().default(0),
    dietaryNotes: text("dietary_notes"),
    notes: text("notes"),
    tastingAt: ts("tasting_at"),
    approvalToken: text("approval_token").notNull(),
    quoteSentAt: ts("quote_sent_at"),
    approvedAt: ts("approved_at"),
    signatureName: text("signature_name"),
    signatureIp: text("signature_ip"),
    signatureUserAgent: text("signature_user_agent"),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositPaidAt: ts("deposit_paid_at"),
    invoiceId: uuid("invoice_id"),
    hallBookingId: uuid("hall_booking_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("catering_events_token_uq").on(t.approvalToken), index("catering_events_merchant_idx").on(t.merchantId, t.eventDate)],
);

export const halls = pgTable("halls", {
  id: id(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  description: text("description"),
  /** Room hire per booking, cents. */
  baseCents: integer("base_cents").notNull().default(0),
  /** [{ name, perHeadCents, includes: string[] }] */
  packages: jsonb("packages").$type<{ name: string; perHeadCents: number; includes: string[] }[]>().notNull().default([]),
  depositBps: integer("deposit_bps").notNull().default(2500),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const hallBookings = pgTable(
  "hall_bookings",
  {
    id: id(),
    hallId: uuid("hall_id").notNull().references(() => halls.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    eventType: text("event_type").notNull().default("other"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    headcount: integer("headcount").notNull(),
    packageName: text("package_name"),
    /** hold | confirmed | cancelled | completed */
    status: text("status").notNull().default("hold"),
    holdExpiresAt: ts("hold_expires_at"),
    totalCents: integer("total_cents").notNull().default(0),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositPaidAt: ts("deposit_paid_at"),
    cateringEventId: uuid("catering_event_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("hall_bookings_hall_idx").on(t.hallId, t.startsAt)],
);

export const whatsappSessions = pgTable(
  "whatsapp_sessions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    userId: uuid("user_id").references(() => users.id),
    /** browsing | cart | checkout | awaiting_payment | done */
    state: text("state").notNull().default("browsing"),
    language: text("language").notNull().default("en"),
    cart: jsonb("cart").$type<{ catalogItemId: string; quantity: number }[]>().notNull().default([]),
    orderId: uuid("order_id"),
    /** WhatsApp customer-service window: free-form replies allowed for 24h after this. */
    lastInboundAt: ts("last_inbound_at"),
    marketingOptInAt: ts("marketing_opt_in_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("whatsapp_sessions_uq").on(t.merchantId, t.phone)],
);

export const reviewRequests = pgTable(
  "review_requests",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    orderId: uuid("order_id"),
    /** sms | email | push | whatsapp */
    channel: text("channel").notNull(),
    token: text("token").notNull(),
    /** Private 1–5 rating from our page; 4–5 are sent on to Google. */
    rating: integer("rating"),
    feedback: text("feedback"),
    sentAt: ts("sent_at"),
    clickedAt: ts("clicked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("review_requests_token_uq").on(t.token), index("review_requests_merchant_idx").on(t.merchantId)],
);

export const phoneCalls = pgTable(
  "phone_calls",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    fromPhone: text("from_phone").notNull(),
    language: text("language"),
    transcript: text("transcript"),
    draftOrder: jsonb("draft_order").$type<{ items: { catalogItemId?: string; name: string; quantity: number }[]; pickupAt?: string; notes?: string }>(),
    orderId: uuid("order_id"),
    /** received | drafted | confirmed | failed */
    status: text("status").notNull().default("received"),
    providerCallId: text("provider_call_id"),
    createdAt: createdAt(),
  },
  (t) => [index("phone_calls_merchant_idx").on(t.merchantId, t.createdAt)],
);

export const orderSplits = pgTable(
  "order_splits",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    tipCents: integer("tip_cents").notNull().default(0),
    itemIds: jsonb("item_ids").$type<string[]>().notNull().default([]),
    /** open | paid */
    status: text("status").notNull().default("open"),
    payToken: text("pay_token").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("order_splits_token_uq").on(t.payToken), index("order_splits_order_idx").on(t.orderId)],
);

export const merchantAddOns = pgTable(
  "merchant_add_ons",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    addOnId: text("add_on_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** active | cancelled */
    status: text("status").notNull().default("active"),
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.addOnId] })],
);
