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
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
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
    /** Optional, for birthday rewards. Month and day only, "MM-DD": we never store the year (privacy policy). */
    birthday: text("birthday"),
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
    check("users_birthday_md_chk", sql`${t.birthday} is null or ${t.birthday} ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'`),
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
  (t) => [uniqueIndex("push_tokens_token_uq").on(t.token), index("push_tokens_user_idx").on(t.userId)],
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
    /** How many members the BIA has (the "of 74" on its overview). Entered by an admin. */
    biaMemberCount: integer("bia_member_count"),
    notes: text("notes"),
    /** Area plan (rep-admin): when the area opens, the day one person walks all its shops, who walks it, and the shop target (~30). */
    opensOn: date("opens_on"),
    streetDayOn: date("street_day_on"),
    streetDayRepId: uuid("street_day_rep_id").references(() => users.id),
    targetShops: integer("target_shops").notNull().default(30),
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
    /** Rep who signed the merchant (attribution only; no pay is calculated from it). */
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
    /** Pre-order planning (desi2): pots per weekday { mon: 12, ... } (falls back to preorderDailyCap), pots per pickup hour, and date overrides such as Eid. */
    preorderCapByWeekday: jsonb("preorder_cap_by_weekday").$type<Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", number>>>().notNull().default({}),
    preorderPerHourCap: integer("preorder_per_hour_cap"),
    preorderOverrides: jsonb("preorder_overrides").$type<{ from: string; to: string; cap: number; leadHours?: number; label: string }[]>().notNull().default([]),
    /** Busy mode: minutes added to every quoted wait while busy_until is in the future. */
    busyAddMinutes: integer("busy_add_minutes").notNull().default(0),
    busyUntil: ts("busy_until"),
    /** Cuisine / community tags (hyderabadi, punjabi, gujarati, ...) used to rank festivals for the shop. */
    cuisines: jsonb("cuisines").$type<string[]>().notNull().default([]),
    /** Moved lunar dates: { [festivalId]: { [year]: "YYYY-MM-DD" } }. */
    festivalOverrides: jsonb("festival_overrides").$type<Record<string, Record<string, string>>>().notNull().default({}),
    /** Shop-level halal certification, exactly as the owner states it (we never verify or badge). */
    halalCertification: jsonb("halal_certification").$type<HalalCertification>(),
    /** Which expiry reminders went out for the certificate's validUntil (60 and 30 days before). */
    halalReminders: jsonb("halal_reminders").$type<{ validUntil: string; d60?: string; d30?: string }>(),
    /** Pre-orders cancel free until this many hours before pickup; null = the item's notice period. */
    preorderCancelCutoffHours: integer("preorder_cancel_cutoff_hours"),
    /** Stripe Connect charge mode: destination (platform account) or direct (merchant is merchant of record). */
    chargeMode: text("charge_mode").notNull().default("destination"),
    /** WhatsApp Business phone number (E.164) connected for this shop. */
    whatsappNumber: text("whatsapp_number"),
    whatsappCreditsUsed: integer("whatsapp_credits_used").notNull().default(0),
    whatsappCreditsExtra: integer("whatsapp_credits_extra").notNull().default(0),
    /** Google review link for review requests. */
    googleReviewUrl: text("google_review_url"),
    /** Drop-off terms shown and acknowledged at intake (repair, alterations). Null = no terms step. */
    intakeTerms: text("intake_terms"),
    /** Days of warranty the shop gives on a repair (shown on the customer status page); null = none stated. */
    warrantyDays: integer("warranty_days"),
    /** Tip picker on invoices: null = by vertical default (on for salon-type shops, off for repair). */
    tipsEnabled: boolean("tips_enabled"),
    tipPresets: jsonb("tip_presets").$type<number[]>().notNull().default([15, 20, 25]),
    /** Send rebooking nudges automatically (service.rebooking). Off = the owner taps Send. */
    rebookAuto: boolean("rebook_auto").notNull().default(false),
    /** Rolling drop-off slots: slot length, drop-offs per slot, days kept open. */
    dropoffSlotMinutes: integer("dropoff_slot_minutes").notNull().default(30),
    dropoffCapacity: integer("dropoff_capacity").notNull().default(3),
    dropoffDaysAhead: integer("dropoff_days_ahead").notNull().default(14),
    /** Local dates (YYYY-MM-DD) the shop is closed for drop-offs; rolling slot generation skips them. */
    dropoffBlockedDates: jsonb("dropoff_blocked_dates").$type<string[]>().notNull().default([]),
    /** Pharmacies: when the pharmacist-owner confirmed the Schedule C setup (no earn or discount on Rx and pharmacy services, no health information entered), and who. */
    pharmacyConfirmedAt: ts("pharmacy_confirmed_at"),
    pharmacyConfirmedByName: text("pharmacy_confirmed_by_name"),
    pharmacyConfirmedByUserId: uuid("pharmacy_confirmed_by_user_id").references(() => users.id),
    /** Stripe Connect account state, synced from account.updated webhooks. */
    stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
    stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
    stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false),
    smsCreditsUsed: integer("sms_credits_used").notNull().default(0),
    /** Send a transactional SMS receipt after each counter award (off by default; costs SMS). */
    smsReceiptsEnabled: boolean("sms_receipts_enabled").notNull().default(false),
    /** Appointments: free cancel and reschedule until this many hours before the visit; later changes and no-shows can be charged the fee. */
    cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
    /** Appointments: no-show / late-cancel fee in cents (0 = none). Charged to the card the customer saved when booking. */
    noShowFeeCents: integer("no_show_fee_cents").notNull().default(0),
    /** Public API key hash for the merchant webhook/API integration. */
    apiKeyHash: text("api_key_hash"),
    /** How this shop gets paid by hand: { etransferEnabled, etransferEmail, instructions, startOnTrust, graceDays, cashEnabled } (tiffin/catering/banquet). */
    paymentSettings: jsonb("payment_settings").$type<Record<string, unknown>>().notNull().default({}),
    /** Registered for GST/HST? null = not asked yet (quotes still compute at the provincial rate). */
    taxRegistered: boolean("tax_registered"),
    /** GST/HST number (9 digits + RT0001); format-checked only, not verified with the CRA. */
    taxNumber: text("tax_number"),
    taxSmallSupplierNote: boolean("tax_small_supplier_note").notNull().default(false),
    /** Food safety (never blocks selling): food handler certificate expiry, health unit notice, and an opt-in customer badge. */
    foodHandlerExpiry: date("food_handler_expiry"),
    healthUnit: text("health_unit"),
    healthUnitNotifiedOn: date("health_unit_notified_on"),
    foodHandlerBadge: boolean("food_handler_badge").notNull().default(false),
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
    /** Pharmacy dispensary (Rx, pharmacy services, dispensing fees): locked off for earning and discounts, can't be renamed or deleted. Survives a rename. */
    dispensary: boolean("dispensary").notNull().default(false),
    externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
    /** Menu tab order (ascending, then name). */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Restaurant menus: the tab name in hi / ur / pa, { hi: { name } }. */
    translations: jsonb("translations").$type<Translations>().notNull().default({}),
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
    /** Stamp on scan: a scan or a one-match 4-digit entry stamps without a confirm tap. On for new café/bakery programs, off elsewhere; never applies to per_dollar. */
    counterAutoStamp: boolean("counter_auto_stamp").notNull().default(false),
    /** What one reward costs the shop (cents); optional, Reports uses it to estimate rewards owed. */
    rewardCostCents: integer("reward_cost_cents"),
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
  (t) => [uniqueIndex("wallet_passes_serial_uq").on(t.serialNumber), index("wallet_passes_user_idx").on(t.userId)],
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
    /** Degh: minutes from fire to ready (the kitchen fires at pickup minus this). */
    cookMinutes: integer("cook_minutes").notNull().default(0),
    /** Per-pot recipe for the pre-order shopping list (estimates, not measured). */
    recipe: jsonb("recipe").$type<{ riceKg?: number; meatKg?: number; meatKind?: string; extras?: { name: string; qty: number; unit: string }[] }>(),
    /** 86 button: hidden from menus and refused at checkout until this time. */
    soldOutUntil: ts("sold_out_until"),
    /** Size / spice / add-on groups for web ordering: the server prices from these ids. */
    options: jsonb("options").$type<ItemOptions>(),
    /** Grocers and butchers: sold by weight. unitPriceCents is per weightUnit; priceCents is the estimate for one portion of nominalWeightG. */
    weightUnit: text("weight_unit").$type<"kg" | "lb">(),
    unitPriceCents: integer("unit_price_cents"),
    nominalWeightG: integer("nominal_weight_g"),
    /** false = zero-rated basic grocery (raw meat, flour, rice): no GST/HST. */
    taxable: boolean("taxable").notNull().default(true),
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
    /** payment_intent.processing (bank debit in flight, takes days): set while unpaid, cleared when it succeeds or fails. */
    paymentProcessingAt: ts("payment_processing_at"),
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
    /** Guest allergy, shown as a full-width band on the kitchen ticket. */
    allergyNote: text("allergy_note"),
    /** Last "balance due at pickup" reminder sent to the guest (one per few hours). */
    balanceRemindedAt: ts("balance_reminded_at"),
    /** Butcher counter: when the weigh-in set the final price (grocery.counter_preorders). */
    weighedAt: ts("weighed_at"),
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
  /** Sold by weight: snapshot of the price per unit at order time; actualWeightG and weighedCents are set at the scale. */
  weightUnit: text("weight_unit").$type<"kg" | "lb">(),
  perUnitCents: integer("per_unit_cents"),
  actualWeightG: integer("actual_weight_g"),
  /** The line total after weighing (replaces unitPriceCents * quantity). */
  weighedCents: integer("weighed_cents"),
  /** false = zero-rated: not part of the taxable base. */
  taxable: boolean("taxable").notNull().default(true),
});

// ---------------------------------------------------------------------------
// Grocers and halal butchers (docs/research/grocers.md): weekly flyer deals and pantry (restock) reminders
// ---------------------------------------------------------------------------
export const groceryDeals = pgTable(
  "grocery_deals",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** each | kg | lb */
    priceUnit: text("price_unit").notNull().default("each"),
    packSizeG: integer("pack_size_g"),
    wasPriceCents: integer("was_price_cents"),
    memberOnly: boolean("member_only").notNull().default(false),
    limitPerCustomer: integer("limit_per_customer"),
    /** A season id from the grocer calendar (packages/shared/src/grocery.ts). */
    seasonId: text("season_id"),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("grocery_deals_merchant_idx").on(t.merchantId, t.startsOn, t.endsOn)],
);

/** A bulk staple the shop reminds about (20 lb atta, 20 lb basmati, ghee). */
export const pantryItems = pgTable(
  "pantry_items",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultIntervalDays: integer("default_interval_days").notNull().default(42),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("pantry_items_merchant_idx").on(t.merchantId)],
);

/**
 * One household's history with one staple. `remind` is the customer's yes (express consent, recorded with who asked and where);
 * the marketing consent on merchant_members is checked as well. `history` keeps the last purchase times (ISO) the cadence is learned from.
 */
export const pantryEntries = pgTable(
  "pantry_entries",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    pantryItemId: uuid("pantry_item_id").notNull().references(() => pantryItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    history: jsonb("history").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    lastBoughtAt: ts("last_bought_at").notNull(),
    intervalDays: integer("interval_days").notNull(),
    remind: boolean("remind").notNull().default(false),
    remindConsentAt: ts("remind_consent_at"),
    /** counter (the cashier asked) | pass (the customer switched it on) */
    remindConsentSource: text("remind_consent_source"),
    remindConsentBy: uuid("remind_consent_by").references(() => users.id, { onDelete: "set null" }),
    lastRemindedAt: ts("last_reminded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pantry_entries_item_user_uq").on(t.pantryItemId, t.userId), index("pantry_entries_merchant_idx").on(t.merchantId, t.remind)],
);

/** Every restock text, so Reports can say how many came back within 7 days. */
export const pantryReminders = pgTable(
  "pantry_reminders",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => pantryEntries.id, { onDelete: "cascade" }),
    sentAt: ts("sent_at").notNull().defaultNow(),
    /** sent | skipped */
    status: text("status").notNull().default("sent"),
  },
  (t) => [index("pantry_reminders_merchant_idx").on(t.merchantId, t.sentAt)],
);

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
    /** Condition chips ticked at intake ("Cracked screen", "Stains"). */
    intakeChecklist: jsonb("intake_checklist").$type<string[]>().notNull().default([]),
    /** When the customer accepted the shop's drop-off terms (null = no terms or not accepted). */
    termsAcceptedAt: ts("terms_accepted_at"),
    shelfLocation: text("shelf_location"),
    /** Set when status becomes ready; drives pickup reminders and "ready N days". */
    readyAt: ts("ready_at"),
    /** Public status link token (/t/<token>), created with the ticket. */
    statusToken: text("status_token"),
    /** Last pickup-reminder ladder day sent (0 = none; 3, 7, 30, 60). */
    pickupReminderDay: integer("pickup_reminder_day").notNull().default(0),
    /** 60 days after ready and still uncollected: shown to staff, never acted on automatically. */
    lienEligibleAt: ts("lien_eligible_at"),
    /** Staff recorded that they sent the notice required before sale (their decision, their paperwork). */
    lienNoticeSentAt: ts("lien_notice_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("service_tickets_merchant_idx").on(t.merchantId, t.status), index("service_tickets_user_idx").on(t.userId), uniqueIndex("service_tickets_status_token_uq").on(t.statusToken)],
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

/** Halal certification as the owner states it. `certifier` is printed only when present. */
export type HalalCertification = { certifier: string; certificateNo?: string; scope: "all_meat" | "some_dishes"; slaughter: "zabihah" | "machine" | "unspecified"; validUntil?: string; fileUrl?: string };

/** One group on a dish: single (radio) or multi (checkboxes). A "single" group with priceMode "absolute" sets the dish's price (size). */
export type ItemOptionGroup = { id: string; name: string; type: "single" | "multi"; required: boolean; priceMode: "delta" | "absolute"; options: { id: string; name: string; priceCents: number; serves?: number; note?: string; default?: boolean }[] };
export type ItemOptions = { groups: ItemOptionGroup[] };

export type LineItem = { description: string; quantity: number; unitPriceCents: number; kind?: "labour" | "part" | "fee" | "other"; categoryId?: string | null; serviceId?: string | null; /** false = no sales tax on this line (default true). */ taxable?: boolean };

/** How a quote was approved: customer link, phone call (name, phone, time recorded), or at the counter. */
export type QuoteAuthorization = { method: "link" | "phone" | "counter"; name: string; phone?: string | null; note?: string | null; at: string; staffId?: string | null };

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
    /** Deposit bank debit in flight (payment_intent.processing); cleared on success or failure. */
    depositProcessingAt: ts("deposit_processing_at"),
    depositPaidAt: ts("deposit_paid_at"),
    /** First time the customer opened the public link (the "opened, not approved" call-now signal). */
    firstViewedAt: ts("first_viewed_at"),
    authorizedBy: jsonb("authorized_by").$type<QuoteAuthorization>(),
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
    /** Bank debit in flight (payment_intent.processing); cleared on success or failure. */
    paymentProcessingAt: ts("payment_processing_at"),
    paidAt: ts("paid_at"),
    pointsEarned: integer("points_earned").notNull().default(0),
    /** Voluntary tip added at payment: not taxed, never earns points. */
    tipCents: integer("tip_cents").notNull().default(0),
    tipStaffId: uuid("tip_staff_id").references(() => users.id),
    /** Appointments: the visit this invoice bills (checkout through the calendar). */
    appointmentId: uuid("appointment_id"),
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

/**
 * Rebooking nudges (service.rebooking): one row per message sent, skip or snooze for a customer and service.
 * "Due" is computed from completed work and services.rebookAfterDays; this table is what stops repeat sends.
 */
export const rebookingNudges = pgTable(
  "rebooking_nudges",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    serviceId: uuid("service_id").notNull(),
    /** sent | skipped | snoozed */
    action: text("action").notNull(),
    channel: text("channel"),
    /** For snoozed: hide the row until this time. */
    until: ts("until"),
    /** Set when the customer booked or paid for the service after this nudge. */
    convertedAt: ts("converted_at"),
    createdAt: createdAt(),
  },
  (t) => [index("rebooking_nudges_merchant_idx").on(t.merchantId, t.userId, t.serviceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Appointments (Café & Retail: booking.appointments): salons, barbers, nails, threading, henna, bridal
// ---------------------------------------------------------------------------
/** A price-list entry. Backs appointment services (kind "appointment") and any shop's canned lines (kind "repair_line"). */
export const services = pgTable(
  "services",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    /** appointment | repair_line */
    kind: text("kind").notNull().default("appointment"),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(30),
    priceCents: integer("price_cents").notNull().default(0),
    priceFrom: boolean("price_from").notNull().default(false),
    depositCents: integer("deposit_cents").notNull().default(0),
    bufferMin: integer("buffer_min").notNull().default(0),
    /** A merchant category, so no-earn categories keep working. */
    categoryId: uuid("category_id").references(() => merchantCategories.id, { onDelete: "set null" }),
    rebookAfterDays: integer("rebook_after_days"),
    taxable: boolean("taxable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    translations: jsonb("translations").$type<Translations>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("services_merchant_kind_idx").on(t.merchantId, t.kind, t.active)],
);

/** Which staff do which service, with optional per-person duration and price. No rows for a service = anyone can. */
export const staffServices = pgTable(
  "staff_services",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    durationMin: integer("duration_min"),
    priceCents: integer("price_cents"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serviceId] }), index("staff_services_merchant_idx").on(t.merchantId)],
);

/** Weekly working hours in the shop's local time. Several rows per day are split shifts. */
export const staffHours = pgTable(
  "staff_hours",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 0 = Sunday ... 6 = Saturday */
    weekday: smallint("weekday").notNull(),
    startsLocal: time("starts_local").notNull(),
    endsLocal: time("ends_local").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("staff_hours_merchant_user_idx").on(t.merchantId, t.userId, t.weekday)],
);

export const staffTimeOff = pgTable(
  "staff_time_off",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("staff_time_off_merchant_user_idx").on(t.merchantId, t.userId, t.startsAt)],
);

export type AppointmentItemRow = { serviceId: string | null; name: string; durationMin: number; priceCents: number };

/**
 * One visit with one stylist. The migration adds a Postgres exclusion constraint (btree_gist) so a staff
 * member can't hold two overlapping active appointments: staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&
 * where status is booked, arrived or in_service. A violation surfaces as 409 slot_taken.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    /** The customer (null for a named walk-in with no phone). */
    userId: uuid("user_id").references(() => users.id),
    customerName: text("customer_name"),
    staffId: uuid("staff_id").references(() => users.id),
    /** The client asked for this stylist by name. */
    requestedStaff: boolean("requested_staff").notNull().default(false),
    /** online | staff | walk_in */
    source: text("source").notNull().default("staff"),
    items: jsonb("items").$type<AppointmentItemRow[]>().notNull().default([]),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    /** booked | arrived | in_service | completed | no_show | cancelled */
    status: text("status").notNull().default("booked"),
    /** A bridal party shares one group. */
    groupId: uuid("group_id"),
    notes: text("notes"),
    clientNote: text("client_note"),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositProcessingAt: ts("deposit_processing_at"),
    depositPaidAt: ts("deposit_paid_at"),
    /** Card on file for the no-show fee (saved by the deposit payment or a SetupIntent). */
    stripeCustomerId: text("stripe_customer_id"),
    cardSetupIntentId: text("card_setup_intent_id"),
    paymentMethodId: text("payment_method_id"),
    noShowFeeCents: integer("no_show_fee_cents"),
    feeChargedAt: ts("fee_charged_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    arrivedAt: ts("arrived_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    invoiceId: uuid("invoice_id"),
    reminder24SentAt: ts("reminder_24_sent_at"),
    reminder2SentAt: ts("reminder_2_sent_at"),
    rebookNudgeSentAt: ts("rebook_nudge_sent_at"),
    /** An online booking waiting for its deposit or card; unpaid holds are cancelled after this. */
    holdExpiresAt: ts("hold_expires_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("appointments_merchant_starts_idx").on(t.merchantId, t.startsAt),
    index("appointments_merchant_staff_starts_idx").on(t.merchantId, t.staffId, t.startsAt),
    index("appointments_user_starts_idx").on(t.userId, t.startsAt),
  ],
);

// ---------------------------------------------------------------------------
// Classes and memberships (docs/research/fitness-studios.md): yoga, pilates, boxing, dance and women-only studios
// ---------------------------------------------------------------------------
/** One row per studio: the cancel window, the late fee and the freeze and renewal rules. Defaults apply until a studio saves. */
export const classSettings = pgTable("class_settings", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
  /** Free cancel until this many hours before the class; later, the credit is used (and members pay lateFeeCents). */
  cancelWindowHours: integer("cancel_window_hours").notNull().default(12),
  /** Charged to a membership's saved card on a late cancel or no-show. 0 = no fee. */
  lateFeeCents: integer("late_fee_cents").notNull().default(0),
  /** The waitlist stops promoting this many minutes before the start. */
  waitlistCutoffMinutes: integer("waitlist_cutoff_minutes").notNull().default(120),
  /** Longest single freeze, in days. */
  freezeMaxDays: integer("freeze_max_days").notNull().default(30),
  /** Freezes allowed in a 12-month contract. */
  freezesPerYear: integer("freezes_per_year").notNull().default(2),
  /** Fixed-term renewal notice goes out this many days before the term ends (Ontario: 30 to 90). */
  renewalNoticeDays: integer("renewal_notice_days").notNull().default(60),
  /** Extra studio terms printed on the membership agreement and the booking sheet. */
  termsNote: text("terms_note"),
  /** Check-in awards the visit through the loyalty ledger. */
  awardOnCheckIn: boolean("award_on_check_in").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classTypes = pgTable(
  "class_types",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(60),
    capacity: integer("capacity").notNull().default(16),
    /** Women-only room: women instructor and members, no photos. Shown to customers before they book. */
    womenOnly: boolean("women_only").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    translations: jsonb("translations").$type<Translations>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_types_merchant_idx").on(t.merchantId, t.active)],
);

export const classSessions = pgTable(
  "class_sessions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    classTypeId: uuid("class_type_id").references(() => classTypes.id, { onDelete: "set null" }),
    /** Copied from the class type at creation so renaming a type does not rewrite history. */
    name: text("name").notNull(),
    instructorName: text("instructor_name"),
    room: text("room"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    capacity: integer("capacity").notNull(),
    womenOnly: boolean("women_only").notNull().default(false),
    /** scheduled | cancelled */
    status: text("status").notNull().default("scheduled"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    /** Weekly repeats made in one go share a series. */
    seriesId: uuid("series_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_sessions_merchant_starts_idx").on(t.merchantId, t.startsAt)],
);

/** What a studio sells: a single class, a pack (also the intro offer when introOnly) or a membership. */
export const classProducts = pgTable(
  "class_products",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    /** drop_in | pack | membership */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    /** Pack: classes included. */
    credits: integer("credits"),
    /** Pack: days the credits last after purchase (Ontario caps a prepaid fitness agreement at one year). */
    validDays: integer("valid_days"),
    /** Intro offer: only for someone with no earlier purchase or booking at the studio, once. */
    introOnly: boolean("intro_only").notNull().default(false),
    /** Membership: months in the term; null = month to month. */
    termMonths: integer("term_months"),
    /** Membership: classes in each billing month; null = unlimited. */
    classesPerMonth: integer("classes_per_month"),
    taxable: boolean("taxable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_products_merchant_idx").on(t.merchantId, t.kind, t.active)],
);

/** A bought pack or intro offer: credits that each book one class. */
export const classPasses = pgTable(
  "class_passes",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    productId: uuid("product_id").references(() => classProducts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    creditsTotal: integer("credits_total").notNull(),
    creditsLeft: integer("credits_left").notNull(),
    expiresAt: ts("expires_at").notNull(),
    introOffer: boolean("intro_offer").notNull().default(false),
    /** pending (awaiting payment) | active | used_up | expired | refunded */
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_passes_user_idx").on(t.userId, t.merchantId, t.status), index("class_passes_merchant_idx").on(t.merchantId, t.status)],
);

/**
 * A recurring membership. Billed one period at a time like tiffin: each period is one class_charges row (unique per
 * membership + period start) and the period only advances when that charge is paid. Renewals charge the saved method
 * off-session. The agreement the member accepted is stored verbatim: it is the "written copy" Ontario requires.
 */
export const classMemberships = pgTable(
  "class_memberships",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    productId: uuid("product_id").references(() => classProducts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** pending (awaiting first payment) | active | frozen | past_due | cancelled | expired */
    status: text("status").notNull().default("pending"),
    /** Price per period before tax, cents. */
    priceCents: integer("price_cents").notNull(),
    taxable: boolean("taxable").notNull().default(true),
    termMonths: integer("term_months"),
    classesPerMonth: integer("classes_per_month"),
    startDate: date("start_date").notNull(),
    /** Fixed term: the day the term ends. */
    termEndsOn: date("term_ends_on"),
    currentPeriodStart: date("current_period_start"),
    currentPeriodEnd: date("current_period_end"),
    nextBillingDate: date("next_billing_date"),
    frozenFrom: date("frozen_from"),
    frozenUntil: date("frozen_until"),
    freezesUsed: integer("freezes_used").notNull().default(0),
    /** The member asked to cancel; billing stops and the membership ends on this day. */
    cancelEffectiveOn: date("cancel_effective_on"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    /** member | studio | cooling_off */
    cancelledBy: text("cancelled_by"),
    /** The agreement text shown and accepted at sign-up, and when. */
    agreementText: text("agreement_text").notNull(),
    agreementAcceptedAt: ts("agreement_accepted_at"),
    /** Last day of the 10-day cooling-off right (full refund). */
    coolingOffEndsOn: date("cooling_off_ends_on"),
    renewalNoticeSentAt: ts("renewal_notice_sent_at"),
    /** The member told us not to renew when the fixed term ends. */
    declineRenewal: boolean("decline_renewal").notNull().default(false),
    stripeCustomerId: text("stripe_customer_id"),
    paymentMethodId: text("payment_method_id"),
    paymentMethodBrand: text("payment_method_brand"),
    paymentMethodLast4: text("payment_method_last4"),
    setupIntentId: text("setup_intent_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("class_memberships_merchant_idx").on(t.merchantId, t.status), index("class_memberships_user_idx").on(t.userId, t.merchantId), index("class_memberships_billing_idx").on(t.status, t.nextBillingDate)],
);

export const classBookings = pgTable(
  "class_bookings",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** held (waiting for a drop-in payment) | booked | waitlisted | attended | cancelled | late_cancelled | no_show */
    status: text("status").notNull().default("booked"),
    /** customer | staff */
    source: text("source").notNull().default("customer"),
    /** membership | pass | drop_in | comp. Null while waitlisted: nothing is used until a spot opens. */
    payWith: text("pay_with"),
    passId: uuid("pass_id").references(() => classPasses.id, { onDelete: "set null" }),
    membershipId: uuid("membership_id").references(() => classMemberships.id, { onDelete: "set null" }),
    /** The credit was handed back (cancelled in time, class cancelled, or the studio excused a late cancel). */
    creditReturned: boolean("credit_returned").notNull().default(false),
    holdExpiresAt: ts("hold_expires_at"),
    waitlistedAt: ts("waitlisted_at"),
    promotedAt: ts("promoted_at"),
    checkedInAt: ts("checked_in_at"),
    cancelledAt: ts("cancelled_at"),
    feeChargedAt: ts("fee_charged_at"),
    reminderSentAt: ts("reminder_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One live booking per person per class (a cancelled one does not count, so they can book again).
    uniqueIndex("class_bookings_live_uq").on(t.sessionId, t.userId).where(sql`${t.status} in ('held', 'booked', 'waitlisted', 'attended')`),
    index("class_bookings_session_idx").on(t.sessionId, t.status),
    index("class_bookings_user_idx").on(t.userId, t.merchantId),
  ],
);

/** Money moved for classes: membership periods, packs, drop-ins and late fees. */
export const classCharges = pgTable(
  "class_charges",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** membership | pack | drop_in | late_fee */
    kind: text("kind").notNull(),
    membershipId: uuid("membership_id").references(() => classMemberships.id, { onDelete: "set null" }),
    passId: uuid("pass_id").references(() => classPasses.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => classBookings.id, { onDelete: "set null" }),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    /** What the customer pays, tax included. */
    amountCents: integer("amount_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    /** pending | processing | paid | failed | refunded */
    status: text("status").notNull().default("pending"),
    /** card | cash | etransfer | comp: how a paid charge was settled. */
    paymentMethod: text("payment_method"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: ts("paid_at"),
    refundedAt: ts("refunded_at"),
    /** Automatic attempts on a membership period (the first day, then the second and the fifth day after). */
    attempts: integer("attempts").notNull().default(0),
    lastAttemptOn: date("last_attempt_on"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("class_charges_period_uq").on(t.membershipId, t.periodStart), index("class_charges_merchant_idx").on(t.merchantId, t.createdAt), index("class_charges_user_idx").on(t.userId)],
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
    /** From the marketing forms: a restaurant's preferred language (en | hi | ur | pa). */
    language: text("language"),
    /** BIA enquiries: the contact's role, the event date, the next board meeting and the BIA's member count. */
    contactRole: text("contact_role"),
    eventDate: date("event_date"),
    boardMeetingAt: date("board_meeting_at"),
    memberCount: integer("member_count"),
    /** Where the lead came from: website | street | phone | referral | bia. */
    source: text("source"),
    /** Pin dropped from the rep's phone at the door; used to order the street day. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Remote setup session booked with the owner (phone, whatsapp or video). */
    setupAt: ts("setup_at"),
    setupChannel: text("setup_channel"),
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
  /** Idempotency key from the rep's phone so an outcome queued offline is never recorded twice. */
  clientId: text("client_id"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("lead_activities_client_uq").on(t.clientId)]);

/** A timed, reasoned window in which an admin works inside a shop's dashboard (support). Writes made in it are audited. */
export const supportSessions = pgTable(
  "support_sessions",
  {
    id: id(),
    adminUserId: uuid("admin_user_id").notNull().references(() => users.id),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    endedAt: ts("ended_at"),
  },
  (t) => [index("support_sessions_merchant_idx").on(t.merchantId, t.startedAt)],
);

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
// Merchant onboarding milestones (activation funnel, nudges sent). One row per (merchant, key).
// ---------------------------------------------------------------------------
export const merchantMilestones = pgTable(
  "merchant_milestones",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    /** See MILESTONE_KEYS and NUDGE_KEYS in @ll/shared (onboarding.ts). */
    key: text("key").notNull(),
    reachedAt: ts("reached_at").notNull().defaultNow(),
    data: jsonb("data").$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("merchant_milestones_uq").on(t.merchantId, t.key), index("merchant_milestones_key_idx").on(t.key, t.reachedAt)],
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
    /** Charged with sales tax when the shop is registered for GST/HST (prepared meals generally are). */
    taxable: boolean("taxable").notNull().default(true),
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
    /** Stripe Customer for this user on the merchant's side (the connected account for direct charges, the platform otherwise). */
    stripeCustomerId: text("stripe_customer_id"),
    /** Saved payment method renewals charge off-session (pm_...); null until the first payment saves one. */
    paymentMethodId: text("payment_method_id"),
    /** Display only: "visa", "mastercard", ... or "bank" for PAD. */
    paymentMethodBrand: text("payment_method_brand"),
    paymentMethodLast4: text("payment_method_last4"),
    /** The open SetupIntent for "change card" (seti_...), resolved by the /pay/setup page. */
    setupIntentId: text("setup_intent_id"),
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
    items: jsonb("items").$type<{ name: string; description?: string; dietary?: DietaryTags; translations?: Record<string, { name?: string; description?: string }> }[]>().notNull().default([]),
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
    /** Sales tax included in amountCents (0 when the shop is not registered or the plan is not taxable). */
    taxCents: integer("tax_cents").notNull().default(0),
    /** pending | awaiting (hand-paid, instructions sent) | processing | paid | failed | refunded */
    status: text("status").notNull().default("pending"),
    /** Code the customer puts in the e-transfer message, e.g. JM-1023 (unique per shop). */
    referenceCode: text("reference_code"),
    /** card | pad | etransfer | cash: how a paid charge was settled. */
    paymentMethod: text("payment_method"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    paidAt: ts("paid_at"),
    /** Last day-1 / day-3 reminder sent for an awaiting charge (0, 1 or 3). */
    reminderStage: integer("reminder_stage").notNull().default(0),
    /** Hand-recorded money received so far (ledger sum minus voids) and the date the last receipt arrived. */
    paidCents: integer("paid_cents").notNull().default(0),
    receivedOn: date("received_on"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tiffin_charges_period_uq").on(t.subscriptionId, t.periodStart), uniqueIndex("tiffin_charges_reference_uq").on(t.merchantId, t.referenceCode)],
);

/**
 * Append-only ledger of payments recorded by hand (e-transfer, cash, cheque).
 * One row per receipt; a mistake is voided, never edited. These carry no platform fee.
 */
export const manualPayments = pgTable(
  "manual_payments",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    /** tiffin_charge | catering_deposit | catering_balance | hall_instalment */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    instalmentIndex: integer("instalment_index"),
    /** etransfer | cash | cheque | other */
    method: text("method").notNull(),
    amountCents: integer("amount_cents").notNull(),
    receivedOn: date("received_on").notNull(),
    bankReference: text("bank_reference"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
    voidedAt: ts("voided_at"),
    voidReason: text("void_reason"),
    voidedBy: uuid("voided_by").references(() => users.id),
  },
  (t) => [index("manual_payments_subject_idx").on(t.subjectType, t.subjectId), index("manual_payments_merchant_idx").on(t.merchantId, t.receivedOn)],
);

/** Tokenised link for a driver: one route, one day, no login. */
export const tiffinDriverLinks = pgTable(
  "tiffin_driver_links",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").notNull().references(() => tiffinRoutes.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    token: text("token").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    lastOpenedAt: ts("last_opened_at"),
    /** Last "running late" notice, so it goes out at most once per 15 minutes. */
    lastLateAt: ts("last_late_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tiffin_driver_links_token_uq").on(t.token), index("tiffin_driver_links_route_idx").on(t.routeId, t.date)],
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
    /** Deposit bank debit in flight (payment_intent.processing); cleared on success or failure. */
    depositProcessingAt: ts("deposit_processing_at"),
    depositPaidAt: ts("deposit_paid_at"),
    /** Deposit returned to the customer on cancel (cents, 0 = none) and when. */
    depositRefundCents: integer("deposit_refund_cents").notNull().default(0),
    depositRefundedAt: ts("deposit_refunded_at"),
    invoiceId: uuid("invoice_id"),
    hallBookingId: uuid("hall_booking_id"),
    /** Mandatory service charge in basis points of the subtotal; taxed like food (tips are not modelled). */
    serviceChargeBps: integer("service_charge_bps").notNull().default(0),
    /** Code the customer puts in the e-transfer message (unique per shop). */
    referenceCode: text("reference_code"),
    /** etransfer | cash | cheque | other | card: how the deposit came in, and when. */
    depositMethod: text("deposit_method"),
    depositReceivedOn: date("deposit_received_on"),
    /** First time the customer opened the quote link. */
    quoteOpenedAt: ts("quote_opened_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("catering_events_token_uq").on(t.approvalToken), index("catering_events_merchant_idx").on(t.merchantId, t.eventDate), uniqueIndex("catering_events_reference_uq").on(t.merchantId, t.referenceCode)],
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
  /** Applied automatically when a customer cancels after paying the deposit: first tier whose minDaysBefore the event is at least away wins; none after. */
  refundPolicy: jsonb("refund_policy").$type<{ tiers: { minDaysBefore: number; refundBps: number }[] }>().notNull().default({ tiers: [{ minDaysBefore: 30, refundBps: 10000 }, { minDaysBefore: 14, refundBps: 5000 }] }),
  /** Staged payment template [{ label, bps, dueOffsetDays }]; dueOffsetDays counts back from the event (0 = at hold). */
  paymentSchedule: jsonb("payment_schedule").$type<{ label: string; bps: number; dueOffsetDays: number }[]>(),
  /** Confirm a hold automatically when the first instalment is recorded. */
  autoConfirmOnFirstPayment: boolean("auto_confirm_on_first_payment").notNull().default(false),
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
    /** Deposit bank debit in flight (payment_intent.processing); cleared on success or failure. */
    depositProcessingAt: ts("deposit_processing_at"),
    depositPaidAt: ts("deposit_paid_at"),
    depositRefundCents: integer("deposit_refund_cents").notNull().default(0),
    depositRefundedAt: ts("deposit_refunded_at"),
    cateringEventId: uuid("catering_event_id"),
    notes: text("notes"),
    /** Code the customer puts in the e-transfer message (unique per shop). */
    referenceCode: text("reference_code"),
    /** Staged payments [{ label, amountCents, dueOn, paidAt }]; sums to totalCents. */
    schedule: jsonb("schedule").$type<{ label: string; amountCents: number; dueOn: string; paidAt: string | null }[]>(),
    /** Last payment-due / hold-expiry notice sent, so the job never repeats itself. */
    lastReminderKey: text("last_reminder_key"),
    createdAt: createdAt(),
  },
  (t) => [index("hall_bookings_hall_idx").on(t.hallId, t.startsAt), uniqueIndex("hall_bookings_reference_uq").on(t.merchantId, t.referenceCode)],
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
    /** A person took the chat over: the ordering assistant stays quiet until released. */
    takenOverAt: ts("taken_over_at"),
    takenOverBy: uuid("taken_over_by").references(() => users.id),
    /** "ALLERGY nuts" said in the chat; goes onto the order. */
    allergyNote: text("allergy_note"),
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
    /** The guest tapped the public Google review button. */
    googleClickedAt: ts("google_clicked_at"),
    /** The owner has dealt with this private feedback (replied, called or decided to leave it). */
    handledAt: ts("handled_at"),
    /** The owner's reply (channel: whatsapp | sms | email) and when it went out. */
    replyChannel: text("reply_channel"),
    replyBody: text("reply_body"),
    repliedAt: ts("replied_at"),
    /** One-use free-chai redemption offered with the reply. */
    offerRedemptionId: uuid("offer_redemption_id"),
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
    /** How this guest pays: link (pay link) | card (counter terminal) | cash. Null = link. */
    tender: text("tender"),
    /** open | paid */
    status: text("status").notNull().default("open"),
    payToken: text("pay_token").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paidAt: ts("paid_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("order_splits_token_uq").on(t.payToken), index("order_splits_order_idx").on(t.orderId)],
);

/** Guests waiting for a full day: one message when a pot frees up (desi2). */
export const preorderWaitlist = pgTable(
  "preorder_waitlist",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => catalogItems.id),
    /** Shop-local pickup day, YYYY-MM-DD. */
    date: date("date", { mode: "string" }).notNull(),
    userId: uuid("user_id").references(() => users.id),
    phone: text("phone").notNull(),
    name: text("name"),
    /** CASL: the wording the guest agreed to when joining. */
    consentText: text("consent_text").notNull(),
    createdAt: createdAt(),
    notifiedAt: ts("notified_at"),
  },
  (t) => [uniqueIndex("preorder_waitlist_uq").on(t.merchantId, t.date, t.phone), index("preorder_waitlist_day_idx").on(t.merchantId, t.date)],
);

/** Messages in a WhatsApp chat (inbound, outbound, assistant summaries) for the inbox. */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => whatsappSessions.id, { onDelete: "cascade" }),
    /** in | out */
    direction: text("direction").notNull(),
    /** text | template | order_summary */
    kind: text("kind").notNull().default("text"),
    body: text("body").notNull(),
    /** assistant | staff | system (outbound) */
    sender: text("sender"),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id),
    providerMessageId: text("provider_message_id"),
    createdAt: createdAt(),
  },
  (t) => [index("whatsapp_messages_session_idx").on(t.sessionId, t.createdAt)],
);

/** Busy-mode history: when the kitchen added minutes to every quote, and for how long. */
export const busyModeEvents = pgTable(
  "busy_mode_events",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    addMinutes: integer("add_minutes").notNull(),
    startedAt: ts("started_at").notNull(),
    until: ts("until"),
    endedAt: ts("ended_at"),
    byUserId: uuid("by_user_id").references(() => users.id),
  },
  (t) => [index("busy_mode_events_merchant_idx").on(t.merchantId, t.startedAt)],
);

/** Festival messages the owner scheduled or saved as drafts, so the planner can show what is already set. */
export const festivalSends = pgTable(
  "festival_sends",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    festivalId: text("festival_id").notNull(),
    year: integer("year").notNull(),
    templateId: text("template_id").notNull(),
    channel: text("channel").notNull(),
    /** draft | scheduled */
    status: text("status").notNull().default("draft"),
    scheduledAt: ts("scheduled_at"),
    messageId: uuid("message_id"),
    createdAt: createdAt(),
  },
  (t) => [index("festival_sends_merchant_idx").on(t.merchantId, t.festivalId, t.year)],
);

/** Dates the owner added to the festival planner ("Add my own date"): one occasion with its message texts. */
export const merchantOccasions = pgTable(
  "merchant_occasions",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** YYYY-MM-DD in the shop's local calendar. */
    date: text("date").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    sms: text("sms").notNull(),
    whatsapp: text("whatsapp").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("merchant_occasions_merchant_idx").on(t.merchantId, t.date)],
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

/**
 * Do-not-contact list, one row per phone number and channel. Written when someone replies STOP (SMS or
 * WhatsApp) and cleared by START. Every sender checks it (services/opt-out.ts). It is kept after account
 * deletion on purpose: it is the only way to keep honouring the request.
 */
export const commOptOuts = pgTable(
  "comm_opt_outs",
  {
    id: id(),
    /** E.164. */
    phone: text("phone").notNull(),
    /** sms | whatsapp */
    channel: text("channel").notNull(),
    /** The word they sent (STOP, ARRET ...), or "link" for the one-step unsubscribe page. */
    keyword: text("keyword"),
    /** sms_reply | whatsapp_reply | link */
    source: text("source").notNull().default("sms_reply"),
    optedOutAt: ts("opted_out_at").notNull().defaultNow(),
    /** Set by START: the number may be messaged again, subject to the usual consent rules. */
    resubscribedAt: ts("resubscribed_at"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("comm_opt_outs_uq").on(t.phone, t.channel)],
);

/**
 * After-commit outbox. A row is written in the same transaction as the thing that happened (a stamp, a
 * redemption, an adjustment), so a crash between "committed" and "notified" can never lose the side effects.
 * services/outbox.ts delivers them: a fast path right after the commit, and the `outbox.drain` job as the
 * durable retry. `dedupe_key` makes enqueueing idempotent; `order_key` (the member) plus `seq` give per-member order.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    /** Monotonic, for ordering within an order_key. */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    /** balance_change (more kinds can be added; each has a handler in services/outbox.ts). */
    kind: text("kind").notNull(),
    /** Events with the same key are delivered one at a time, oldest first (the member id). */
    orderKey: text("order_key").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    merchantId: uuid("merchant_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Handler steps already completed, so a retry never repeats a notification that went out. */
    stepsDone: jsonb("steps_done").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** pending | processing | done | dead */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    processedAt: ts("processed_at"),
  },
  (t) => [
    uniqueIndex("outbox_events_dedupe_uq").on(t.dedupeKey),
    // The claim reads the oldest unfinished event of each order key: only unfinished rows are in this index, so it stays small however many delivered rows are waiting to be cleaned up.
    index("outbox_events_open_idx").on(t.orderKey, t.seq).where(sql`${t.status} in ('pending', 'processing')`),
  ],
);

/**
 * Shared rate-limit counters, used only when RATE_LIMIT_STORE=postgres (several API instances). One fixed
 * window per key, started by the first hit; expired rows are swept by the `ratelimit.sweep` job.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").primaryKey(),
    hits: integer("hits").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("rate_limit_counters_expires_idx").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Sales and support assistant (apps/api/src/services/sales-agent): our own AI agent on the platform WhatsApp number
// and the marketing site's web chat. Prospects and owners, not shoppers: nothing here is a merchant's data.
// ---------------------------------------------------------------------------
export const salesAgentConversations = pgTable(
  "sales_agent_conversations",
  {
    id: id(),
    /** whatsapp | web */
    channel: text("channel").notNull(),
    /** WhatsApp: the sender's E.164 number. Web: sha256 of the session token (the token itself is never stored). */
    contactKey: text("contact_key").notNull(),
    /** A number we can text (WhatsApp sender, or one typed in the web chat). Cleared by retention. */
    phone: text("phone"),
    contactName: text("contact_name"),
    language: text("language").notNull().default("en"),
    /** open | handoff | human | closed */
    status: text("status").notNull().default("open"),
    /** Page path the web visitor started on. */
    page: text("page"),
    /** Counts user messages; an action runs only on a later turn than the one that asked for confirmation. */
    turn: integer("turn").notNull().default(0),
    /** The one action waiting for the user's yes: { id, tool, args, turn, summary }. */
    pendingAction: jsonb("pending_action").$type<{ id: string; tool: string; args: Record<string, unknown>; turn: number; summary: string } | null>(),
    /** Phone a code was sent to, until the user types it (checked in code, never by the model). */
    otpPhone: text("otp_phone"),
    otpSentAt: ts("otp_sent_at"),
    verifiedPhone: text("verified_phone"),
    verifiedUserId: uuid("verified_user_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: ts("verified_at"),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    handoffReason: text("handoff_reason"),
    handoffAt: ts("handoff_at"),
    takenOverBy: uuid("taken_over_by").references(() => users.id, { onDelete: "set null" }),
    takenOverAt: ts("taken_over_at"),
    callRequestAt: ts("call_request_at"),
    callRequestNote: text("call_request_note"),
    disclosedAt: ts("disclosed_at"),
    /** WhatsApp 24-hour window: the user's last inbound message. */
    lastInboundAt: ts("last_inbound_at"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sales_agent_conv_contact_uq").on(t.channel, t.contactKey), index("sales_agent_conv_status_idx").on(t.status, t.lastActivityAt), index("sales_agent_conv_activity_idx").on(t.lastActivityAt)],
);

export const salesAgentMessages = pgTable(
  "sales_agent_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id").notNull().references(() => salesAgentConversations.id, { onDelete: "cascade" }),
    /** user | assistant | human | system */
    role: text("role").notNull(),
    body: text("body").notNull(),
    /** Tools the assistant ran for this reply: name, masked input, ok, short summary, ms. */
    toolCalls: jsonb("tool_calls").$type<{ name: string; input: Record<string, unknown>; ok: boolean; summary: string; ms: number }[]>().notNull().default(sql`'[]'::jsonb`),
    /** up | down, set by an admin in the review console. */
    feedback: text("feedback"),
    /** Why the reply was replaced or flagged by a guardrail (price_mismatch, promise, ...). */
    guard: text("guard"),
    humanUserId: uuid("human_user_id").references(() => users.id, { onDelete: "set null" }),
    model: text("model"),
    usage: jsonb("usage").$type<Record<string, number> | null>(),
    providerMessageId: text("provider_message_id"),
    createdAt: createdAt(),
  },
  (t) => [index("sales_agent_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Barbershops, threading bars and beauty supply (docs/research/barbers-beauty.md): walk-in queue, chair-renter pay,
// "my barber", family members under one card
// ---------------------------------------------------------------------------
/** One row per shop that runs a walk-in line. Defaults apply until the shop saves. */
export const walkinQueues = pgTable("walkin_queues", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
  /** The line takes new people only while this is on. */
  open: boolean("open").notNull().default(false),
  /** Used for the wait estimate until the shop has its own history. */
  minutesPerCut: integer("minutes_per_cut").notNull().default(25),
  /** Send the "you're next" text. */
  textNext: boolean("text_next").notNull().default(true),
  /** The line stops taking people at this size. */
  maxWaiting: integer("max_waiting").notNull().default(30),
  /** Minutes a called person has to arrive before the barber skips them. */
  callHoldMinutes: integer("call_hold_minutes").notNull().default(5),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A parent's family member: a first name and the consent time, nothing else (no minor's data beyond a first name). */
export const familyMembers = pgTable(
  "family_members",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    /** The parent or guardian agreed (checked box) at this time. */
    consentAt: ts("consent_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("family_members_user_idx").on(t.userId)],
);

/** One person (or a family member) in a shop's walk-in line. */
export const queueEntries = pgTable(
  "queue_entries",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    /** The customer record (a guest gets one by phone, like the counter does). Family members use the parent's. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    familyMemberId: uuid("family_member_id").references(() => familyMembers.id, { onDelete: "set null" }),
    /** People who joined together (a parent and kids). */
    partyId: uuid("party_id"),
    /** First name only. */
    name: text("name").notNull(),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull().default("Cut"),
    durationMin: integer("duration_min").notNull().default(25),
    requestedStaffId: uuid("requested_staff_id").references(() => users.id, { onDelete: "set null" }),
    /** waiting | called | in_service | done | no_show | left */
    status: text("status").notNull().default("waiting"),
    /** join (phone) | tablet | staff */
    source: text("source").notNull().default("join"),
    /** Public status page (/line/<token>). */
    token: text("token").notNull(),
    /** Order in the line; a skip moves it later. */
    positionAt: ts("position_at").notNull().defaultNow(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    calledAt: ts("called_at"),
    calledStaffId: uuid("called_staff_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    appointmentId: uuid("appointment_id"),
    textConsent: boolean("text_consent").notNull().default(false),
    notifiedNextAt: ts("notified_next_at"),
    notifiedCalledAt: ts("notified_called_at"),
    skips: integer("skips").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("queue_entries_token_uq").on(t.token), index("queue_entries_merchant_status_idx").on(t.merchantId, t.status, t.positionAt), index("queue_entries_user_idx").on(t.userId)],
);

/** How a team member is paid, for the payouts report and who may see whose clients. No row = an employee with no split. */
export const staffPay = pgTable(
  "staff_pay",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** employee | commission | chair_rent */
    model: text("model").notNull().default("employee"),
    /** Commission: the share of services the shop keeps, in basis points (4000 = 40%). */
    shopShareBps: integer("shop_share_bps").notNull().default(0),
    /** Chair rent per week, in cents. Shown on the report, never collected. */
    rentCentsWeek: integer("rent_cents_week").notNull().default(0),
    /** This person sees only their own appointments, queue calls and payout row, and not the customer directory. */
    ownClientsOnly: boolean("own_clients_only").notNull().default(false),
    takesWalkIns: boolean("takes_walk_ins").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.userId] })],
);

/** "My barber": the customer's usual staff member at a shop. auto = from the last completed visit; chosen = the customer's pick. */
export const preferredStaff = pgTable(
  "preferred_staff",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    /** auto | chosen */
    source: text("source").notNull().default("auto"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.merchantId] }), index("preferred_staff_staff_idx").on(t.merchantId, t.staffId)],
);

// ---------------------------------------------------------------------------
// Pet care (docs/research/pet-care.md): pets under the owner, vaccine proof, groom cadence, daycare, food cards, report cards
// ---------------------------------------------------------------------------
/** A pet belongs to its owner (a user) and follows them across shops. No vet records, no diagnoses, no microchip. */
export const pets = pgTable(
  "pets",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** dog | cat | other */
    species: text("species").notNull().default("dog"),
    breed: text("breed"),
    /** small | medium | large | giant */
    sizeBand: text("size_band").notNull().default("medium"),
    /** short | double | curly | long_silky | wire | hairless */
    coat: text("coat").notNull().default("short"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pets_user_idx").on(t.userId)],
);

/** One row per pet and vaccine kind: an expiry date and an optional photo of the certificate (a stored upload path, shown by signed link). */
export const petVaccines = pgTable(
  "pet_vaccines",
  {
    id: id(),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    /** rabies | dhpp | bordetella | other */
    kind: text("kind").notNull(),
    expiresOn: date("expires_on").notNull(),
    proofUrl: text("proof_url"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("pet_vaccines_pet_kind_uq").on(t.petId, t.kind)],
);

/** What one shop knows about a pet: groom cadence, a handling note only that shop's team sees, and the daycare temperament check. */
export const petShop = pgTable(
  "pet_shop",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    groomEveryWeeks: integer("groom_every_weeks"),
    handlingNote: text("handling_note"),
    /** none | passed | declined */
    assessment: text("assessment").notNull().default("none"),
    assessedAt: ts("assessed_at"),
    assessedBy: uuid("assessed_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.petId] })],
);

/** A visit (groom or daycare day) and the report card sent for it. Counts as the last groom for the cadence when kind = groom. */
export const petVisits = pgTable(
  "pet_visits",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** groom | daycare */
    kind: text("kind").notNull().default("groom"),
    at: ts("at").notNull().defaultNow(),
    /** Report card (all optional). */
    mood: text("mood"),
    did: jsonb("did").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    note: text("note"),
    photoUrl: text("photo_url"),
    /** Public report-card page (/r/<token>); null until a card is sent. */
    token: text("token"),
    sentAt: ts("sent_at"),
    expiresAt: ts("expires_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pet_visits_token_uq").on(t.token), index("pet_visits_pet_idx").on(t.petId, t.at), index("pet_visits_merchant_idx").on(t.merchantId, t.at)],
);

/** A groom reminder text per pet and cycle (the visit it followed), so a pet is texted at most once per cycle. */
export const petNudges = pgTable(
  "pet_nudges",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    /** The groom visit this cycle follows. */
    sinceVisitId: uuid("since_visit_id").references(() => petVisits.id, { onDelete: "set null" }),
    /** sent | skipped */
    action: text("action").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("pet_nudges_pet_idx").on(t.merchantId, t.petId, t.createdAt)],
);

/** One row per pet shop: daycare numbers and the required vaccine list (the shop's policy; only rabies is the law) and the groom reminder switch. */
export const petSettings = pgTable("pet_settings", {
  merchantId: uuid("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
  capacity: integer("capacity").notNull().default(16),
  dogsPerStaff: integer("dogs_per_staff").notNull().default(15),
  staffOn: integer("staff_on").notNull().default(1),
  requiredVaccines: jsonb("required_vaccines").$type<string[]>().notNull().default(sql`'["rabies","dhpp","bordetella"]'::jsonb`),
  requireAssessment: boolean("require_assessment").notNull().default(true),
  dropInCents: integer("drop_in_cents").notNull().default(4800),
  /** Pack sizes the counter can sell: { days, priceCents, validDays }. */
  packs: jsonb("packs").$type<{ days: number; priceCents: number; validDays: number }[]>().notNull().default(sql`'[{"days":5,"priceCents":22000,"validDays":120},{"days":10,"priceCents":42000,"validDays":180}]'::jsonb`),
  /** Local closing time (HH:MM) and the grace minutes before a pickup counts as late. */
  closesAt: text("closes_at").notNull().default("18:00"),
  lateGraceMin: integer("late_grace_min").notNull().default(15),
  autoGroomReminders: boolean("auto_groom_reminders").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A prepaid pack of daycare days for an owner (sold by hand; a day is used at check-in). */
export const daycarePacks = pgTable(
  "daycare_packs",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    daysTotal: integer("days_total").notNull(),
    daysUsed: integer("days_used").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    purchasedAt: ts("purchased_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    soldBy: uuid("sold_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("daycare_packs_user_idx").on(t.merchantId, t.userId)],
);

/** A dog's day at daycare. */
export const daycareStays = pgTable(
  "daycare_stays",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Shop-local date (YYYY-MM-DD). */
    day: date("day").notNull(),
    /** expected | in | out | no_show | cancelled */
    status: text("status").notNull().default("expected"),
    packId: uuid("pack_id").references(() => daycarePacks.id, { onDelete: "set null" }),
    /** pack | drop_in */
    payKind: text("pay_kind").notNull().default("drop_in"),
    checkInAt: ts("check_in_at"),
    checkOutAt: ts("check_out_at"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overrideReason: text("override_reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("daycare_stays_pet_day_uq").on(t.merchantId, t.petId, t.day), index("daycare_stays_day_idx").on(t.merchantId, t.day)],
);

/** A food brand the shop runs a buy-N-get-1 card for. The shop sets the terms (in Canada the offer is the retailer's). */
export const foodPrograms = pgTable(
  "food_programs",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    /** Bags to buy; the next one is free. */
    buyCount: integer("buy_count").notNull().default(12),
    /** Bags count for this many months from the first of the cycle. */
    expiryMonths: integer("expiry_months").notNull().default(12),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("food_programs_merchant_idx").on(t.merchantId)],
);

/** A product on a card: the brand's line and bag size. Cards count per product so the free bag matches what was bought. */
export const foodSkus = pgTable(
  "food_skus",
  {
    id: id(),
    programId: uuid("program_id").notNull().references(() => foodPrograms.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bagGrams: integer("bag_grams").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("food_skus_program_idx").on(t.programId)],
);

/** One customer's card for one product. punches = bags bought in this cycle; given = free bags handed out. */
export const foodCards = pgTable(
  "food_cards",
  {
    id: id(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    programId: uuid("program_id").notNull().references(() => foodPrograms.id, { onDelete: "cascade" }),
    skuId: uuid("sku_id").notNull().references(() => foodSkus.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    petId: uuid("pet_id").references(() => pets.id, { onDelete: "set null" }),
    punches: integer("punches").notNull().default(0),
    given: integer("given").notNull().default(0),
    /** First bag of the current cycle; bags older than the program's expiry stop counting. */
    cycleStartedAt: ts("cycle_started_at").notNull().defaultNow(),
    lastBagAt: ts("last_bag_at").notNull().defaultNow(),
    dailyGrams: integer("daily_grams"),
    remind: boolean("remind").notNull().default(false),
    remindConsentAt: ts("remind_consent_at"),
    remindConsentSource: text("remind_consent_source"),
    remindConsentBy: uuid("remind_consent_by").references(() => users.id, { onDelete: "set null" }),
    lastRemindedAt: ts("last_reminded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("food_cards_user_sku_uq").on(t.userId, t.skuId), index("food_cards_merchant_idx").on(t.merchantId, t.remind)],
);

/** Every bag bought or given, for undo and the audit trail. */
export const foodEvents = pgTable(
  "food_events",
  {
    id: id(),
    cardId: uuid("card_id").notNull().references(() => foodCards.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    /** bag | free | undo */
    kind: text("kind").notNull(),
    qty: integer("qty").notNull().default(1),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("food_events_card_idx").on(t.cardId, t.at)],
);
