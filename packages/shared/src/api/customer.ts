/**
 * API contract for the "customer" area (routes/customer, /v1/me/...).
 * Endpoint docs: docs/engineering/api/customer.md.
 *
 * Also defines the loyalty display types (program summary, rewards, discount
 * cards, VIP, next-reward progress) reused by the staff and network contracts.
 */
import { z } from "zod";
import { birthdaySchema } from "../birthday.js";
import { uuidSchema } from "./common.js";

// ---------------------------------------------------------------------------
// Shared display types
// ---------------------------------------------------------------------------
export type EarnTypeDto = "per_dollar" | "per_visit" | "stamps";

export interface ProgramSummaryDto {
  name: string;
  earnType: EarnTypeDto;
  /** "points" | "stamps" | "stars" (merchant's wording). */
  terminology: string;
  pointsPerDollar: number;
  pointsPerVisit: number;
  minSpendCents: number;
  stampGoal: number;
  welcomeBonus: number;
  birthdayBonus: number;
  referralBonus: number;
  /** Null means points never expire. */
  expiryMonths: number | null;
  /** Human sentence to show next to every balance, e.g. "Points never expire." */
  expiryDisclosure: string;
  termsText: string | null;
}

export interface RewardDto {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardType: "amount_off" | "percent_off" | "free_item" | "custom";
  /** Cents for amount_off; whole percent for percent_off; 0 otherwise. */
  value: number;
  maxDiscountCents: number | null;
  imageUrl: string | null;
}

/** Reward plus whether the member can afford it now. */
export interface MemberRewardDto extends RewardDto {
  affordable: boolean;
  pointsNeeded: number;
}

export interface DiscountCardDto {
  id: string;
  name: string;
  percentOff: number;
  amountOffCents: number;
  terms: string | null;
  /** everyone | seniors | students | members_only | vip */
  eligibility: string;
}

export interface VipLevelDto {
  id: string;
  name: string;
  /** Hundredths: 150 = 1.5x earn. */
  multiplierPct: number;
  perks: string | null;
}

export interface NextRewardDto {
  rewardId: string;
  name: string;
  pointsCost: number;
  pointsNeeded: number;
  /** 0-100 */
  progressPct: number;
}

export interface ConsentDto {
  granted: boolean;
  grantedAt: string | null;
  /** Exact language the customer agreed to (CASL record). */
  text: string | null;
  source: string | null;
}

export interface MerchantBriefDto {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  logoUrl: string | null;
  brandColor: string | null;
  neighbourhoodId: string | null;
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------
/**
 * Suggested CASL express-consent wording. Clients should display exactly the
 * string they send back as `consent.text`; the server stores what it receives.
 */
export function marketingConsentText(merchantName: string): string {
  return `Yes, ${merchantName} may send me offers and news by text, email and push through Local Loyalty. I can unsubscribe any time by replying STOP or tapping unsubscribe.`;
}

export const consentSchema = z.object({
  /** Exact consent language shown to the customer. */
  text: z.string().trim().min(10).max(2000),
});
export type ConsentBody = z.infer<typeof consentSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
/** PATCH /v1/me — every field optional; send null to clear. */
export const updateProfileBody = z
  .object({
    name: z.string().trim().min(1).max(120).nullable(),
    email: z.email().max(254).nullable(),
    /** Month and day only, "MM-DD" (no year is ever stored). A legacy "YYYY-MM-DD" is accepted and the year dropped. */
    birthday: birthdaySchema.nullable(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, "Enter a Canadian postal code like M6R 2K3")
      .nullable(),
    homeNeighbourhoodId: uuidSchema.nullable(),
    // The shopper's language (en, hi, ur, pa). Pushes, texts, the wallet pass and the inbox follow it. en-CA is the legacy default.
    locale: z.enum(["en", "hi", "ur", "pa", "en-CA"]),
  })
  .partial();
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

/** DELETE /v1/me */
export const deleteAccountBody = z.object({ confirm: z.literal("DELETE") });
export type DeleteAccountBody = z.infer<typeof deleteAccountBody>;

/** POST /v1/me/memberships — provide merchantId or locationQrCode. */
export const joinBody = z
  .object({
    merchantId: uuidSchema.optional(),
    locationQrCode: z.string().trim().min(3).max(64).optional(),
    consent: consentSchema.optional(),
    referralCode: z.string().trim().min(4).max(32).optional(),
  })
  .refine((b) => !!b.merchantId !== !!b.locationQrCode, { message: "Provide merchantId or locationQrCode" });
export type JoinBody = z.infer<typeof joinBody>;

/** PATCH /v1/me/memberships/:memberId */
export const updateMembershipBody = z.object({ muted: z.boolean() });
export type UpdateMembershipBody = z.infer<typeof updateMembershipBody>;

/** POST /v1/me/memberships/:memberId/redeem */
export const customerRedeemBody = z.object({ rewardId: uuidSchema, idempotencyKey: z.string().min(8).max(128).optional() });
export type CustomerRedeemBody = z.infer<typeof customerRedeemBody>;

/** GET /v1/me/memberships/:memberId?historyLimit=&historyCursor= */
export const membershipDetailQuery = z.object({
  historyLimit: z.coerce.number().int().min(1).max(100).default(30),
  historyCursor: z.string().optional(),
});

/** POST /v1/me/push-tokens */
export const pushTokenBody = z.object({ token: z.string().min(10).max(500), platform: z.enum(["ios", "android", "web"]) });
export type PushTokenBody = z.infer<typeof pushTokenBody>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
export interface ProfileDto {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  memberCode: string;
  /** "MM-DD" */
  birthday: string | null;
  postalCode: string | null;
  homeNeighbourhood: { id: string; slug: string; name: string } | null;
  locale: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/** One shop in the wallet. */
export interface MembershipDto {
  /** merchant_members.id — use as :memberId in /v1/me/memberships/:memberId. */
  id: string;
  merchant: MerchantBriefDto;
  balance: number;
  lifetimePoints: number;
  visitCount: number;
  lastVisitAt: string | null;
  joinedAt: string;
  terminology: string;
  program: ProgramSummaryDto | null;
  /** Shown next to the balance (rule 6). */
  expiryDisclosure: string;
  /** Cheapest reward not yet affordable; null if none left to work toward. */
  nextReward: NextRewardDto | null;
  /** How many rewards the member can redeem right now. */
  rewardsAvailableCount: number;
  vip: VipLevelDto | null;
  muted: boolean;
  marketingConsent: ConsentDto;
}

/** GET /v1/me/memberships */
/**
 * Customer-facing features a shop has switched on (enabled = plan + rollout + overrides).
 * Apps show order-ahead / pickup / repair-ticket / pay entry points only when true.
 */
export interface CustomerFeaturesDto {
  orderAhead: boolean;
  pickupSlots: boolean;
  serviceTickets: boolean;
  /** Customers can book a drop-off time at this shop (absent from older servers: treat as off). */
  dropoffScheduling?: boolean;
  /** Customers can book a stylist and a time at this shop (absent from older servers: treat as off). */
  appointments?: boolean;
  /** Customers can join this shop's walk-in line (absent from older servers: treat as off). */
  walkinQueue?: boolean;
  /** Customers can book classes and join memberships at this studio (absent from older servers: treat as off). */
  classes?: boolean;
  inAppPayments: boolean;
  /**
   * Paid (Plus) loyalty-marketing features. When off, the API already hides the
   * content (promos, discount cards, VIP, referral/birthday bonuses); these flags
   * let apps hide the matching entry points too.
   */
  promos: boolean;
  discountCards: boolean;
  referrals: boolean;
  vipLevels: boolean;
  birthdayBonus: boolean;
  /**
   * Restaurant pack entry points (absent from older servers: treat as off). Halal and dietary
   * claims are the shop's own, so `dietaryTags` only says whether the shop has tagged its menu.
   */
  tiffin?: boolean;
  catering?: boolean;
  banquet?: boolean;
  whatsapp?: boolean;
  dietaryTags?: boolean;
}

export interface WalletResponse {
  items: (MembershipDto & { features: CustomerFeaturesDto })[];
  totals: { shops: number; rewardsAvailable: number };
}

export interface LedgerTxDto {
  id: string;
  type: string;
  source: string;
  points: number;
  description: string | null;
  amountCents: number | null;
  breakdown: string[];
  locationId: string | null;
  reversed: boolean;
  createdAt: string;
}

export interface RedemptionDto {
  id: string;
  rewardId: string;
  rewardName: string;
  /** 6-char code the customer shows to staff. */
  code: string;
  /** issued (waiting to be used) | used | void */
  status: "issued" | "used" | "void";
  discountCents: number | null;
  usedAt: string | null;
  /** App-issued codes expire 10 minutes after createdAt if not used (points are refunded). Null = no expiry. */
  expiresAt: string | null;
  createdAt: string;
}

/** GET /v1/me/memberships/:memberId */
export interface MembershipDetailResponse {
  membership: MembershipDto;
  rewards: MemberRewardDto[];
  discountCards: DiscountCardDto[];
  /** Redemption codes waiting to be shown at the counter. */
  openRedemptions: RedemptionDto[];
  history: { items: LedgerTxDto[]; nextCursor: string | null };
}

/** POST /v1/me/memberships */
export interface JoinResponse {
  membership: MembershipDto;
  created: boolean;
  /** Points granted on joining (welcome + referral bonus). */
  bonusPoints: number;
  /** reason "unavailable": the shop doesn't have referrals (a paid feature) switched on. */
  referral: { applied: boolean; reason?: "invalid" | "own_code" | "already_member" | "already_used" | "unavailable" } | null;
}

/** POST /v1/me/memberships/:memberId/redeem */
export interface CustomerRedeemResponse {
  redemption: RedemptionDto;
  balance: number;
  duplicate: boolean;
}

/** GET /v1/me/card */
export interface CardResponse {
  memberCode: string;
  /** Encode this string in the QR. Staff scanners accept it at any shop. */
  qrPayload: string;
  /** Pre-rendered QR as an SVG string (for web; native apps may render qrPayload themselves). */
  qrSvg: string;
  name: string | null;
}

/** GET|POST /v1/me/memberships/:memberId/referral */
export interface ReferralResponse {
  /** Single-use code: each friend who joins with it consumes it. POST mints a fresh one. */
  code: string;
  shareUrl: string;
  shareText: string;
  /** Points each person gets (0 if the merchant has no referral bonus). */
  bonusPoints: number;
  stats: { invited: number; rewarded: number };
}

/** The per-feature half of the export. Rows are the customer's own; tokens and secrets are left out. */
export interface DataExportModules {
  orders: unknown[];
  appointments: unknown[];
  /** Class studios: bookings, packs, memberships (with the agreement text) and the money for them. */
  classBookings?: unknown[];
  classPasses?: unknown[];
  classMemberships?: unknown[];
  classCharges?: unknown[];
  bookings: unknown[];
  rebookingNudges: unknown[];
  familyMembers: unknown[];
  myBarber: unknown[];
  pets: unknown[];
  foodCards: unknown[];
  vehicles: unknown[];
  tireSets: unknown[];
  washVisits: unknown[];
  tiffinSubscriptions: unknown[];
  cateringEvents: unknown[];
  hallBookings: unknown[];
  manualPayments: unknown[];
  whatsapp: { sessions: unknown[]; messages: unknown[] };
  phoneCalls: unknown[];
  reviews: unknown[];
  serviceTickets: unknown[];
  waitlist: unknown[];
  notificationPrefs: unknown[];
  notifications: unknown[];
  walletPasses: unknown[];
  doNotContact: unknown[];
}

/** GET /v1/me/export: everything we hold about the signed-in customer, every module (PIPEDA access request, Law 25 portability). */
export interface DataExportResponse extends DataExportModules {
  exportedAt: string;
  profile: ProfileDto;
  memberships: (MembershipDto & { transactions: LedgerTxDto[]; redemptions: RedemptionDto[] })[];
  /** What the customer agreed to, per shop: the exact wording, when and how. */
  consents: { merchantId: string; merchantName: string; text: string | null; at: string | null; source: string | null; muted: boolean }[];
  visits: { merchantId: string; locationId: string | null; amountCents: number | null; createdAt: string }[];
  referrals: { merchantId: string; code: string; role: "referrer" | "referee"; status: string; createdAt: string }[];
  pushTokens: { platform: string; createdAt: string }[];
  sessions: { userAgent: string | null; createdAt: string; expiresAt: string; revoked: boolean }[];
  invoices: unknown[];
  messages: { merchantId: string | null; channel: string; kind: string; body: string; createdAt: string }[];
}

// ---------------------------------------------------------------------------
// Notifications: inbox + preferences (docs/engineering/api/notifications.md)
// ---------------------------------------------------------------------------
export const NOTIFICATION_TYPES = [
  "points_earned",
  "reward_ready",
  "reward_expiring",
  "redeem_confirmed",
  "order_ready",
  "ticket_updated",
  "quote_sent",
  "booking_reminder",
  "promo_nearby",
  "passport_progress",
  "tiffin_update",
  "tiffin_menu",
  "catering_update",
  "hall_update",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["push", "sms", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Android notification channel ids the app creates (expo-notifications). */
export const ANDROID_CHANNELS = {
  points: { name: "Points and rewards", importance: "default" },
  orders: { name: "Orders and repairs", importance: "high" },
  offers: { name: "Offers nearby", importance: "low" },
} as const;
export type AndroidChannelId = keyof typeof ANDROID_CHANNELS;

export interface NotificationTypeInfo {
  type: NotificationType;
  /** marketing = CASL promotional (needs consent, honours quiet hours 9pm-8am). */
  kind: "transactional" | "marketing";
  androidChannel: AndroidChannelId;
  /** Settings-screen copy. */
  label: string;
  description: string;
  /** Channels this type can use at all (others are never sent, so don't show a toggle). */
  channels: NotificationChannel[];
  defaults: Record<NotificationChannel, boolean>;
}

const t = (
  type: NotificationType,
  kind: NotificationTypeInfo["kind"],
  androidChannel: AndroidChannelId,
  label: string,
  description: string,
  defaults: Partial<Record<NotificationChannel, boolean>>,
): NotificationTypeInfo => ({
  type,
  kind,
  androidChannel,
  label,
  description,
  channels: (Object.keys(defaults) as NotificationChannel[]).filter((c) => defaults[c] !== undefined),
  defaults: { push: false, sms: false, email: false, ...defaults },
});

/** Catalogue (server and app agree on this). Order = settings screen order. */
export const NOTIFICATION_CATALOG: readonly NotificationTypeInfo[] = [
  t("points_earned", "transactional", "points", "Points earned", "After a visit or purchase (at most one per shop every 10 minutes).", { push: true }),
  t("reward_ready", "transactional", "points", "Reward ready", "When you have enough for a reward.", { push: true, sms: true }),
  t("reward_expiring", "transactional", "points", "Points expiring", "A month before a shop's points expire (only shops that use expiry).", { push: true, sms: true, email: true }),
  t("redeem_confirmed", "transactional", "points", "Reward redeemed", "Confirmation when you redeem a reward.", { push: true }),
  t("order_ready", "transactional", "orders", "Orders", "Order accepted, ready for pickup or cancelled.", { push: true, sms: true }),
  t("ticket_updated", "transactional", "orders", "Repairs and invoices", "Status changes on a repair or service ticket, invoices and payments.", { push: true, sms: true }),
  t("quote_sent", "transactional", "orders", "Quotes", "When a shop sends you a quote to approve.", { push: true, sms: true, email: true }),
  t("booking_reminder", "transactional", "orders", "Pickup and drop-off reminders", "Reminders for times you booked.", { push: true, sms: true }),
  t("passport_progress", "transactional", "points", "Neighbourhood passport", "Progress on neighbourhood challenges and bonuses.", { push: true }),
  t("tiffin_update", "transactional", "orders", "Tiffin deliveries and billing", "Your tiffin is out for delivery or delivered, and when a payment fails.", { push: true, sms: true }),
  t("tiffin_menu", "transactional", "orders", "Tomorrow's tiffin menu", "What's cooking for tomorrow, sent the evening before. Off unless you turn it on.", { push: false }),
  t("catering_update", "transactional", "orders", "Catering and events", "Tasting times, your catering quote, deposit receipts and changes to your event.", { push: true, sms: true }),
  t("hall_update", "transactional", "orders", "Hall bookings", "Your hall hold, deposit and booking confirmation.", { push: true }),
  t("promo_nearby", "marketing", "offers", "Offers nearby", "Offers from shops you've joined, when you're close (at most one a day, never 9pm-8am).", { push: true }),
];

/**
 * Routine notifications: the high-frequency, low-urgency ones. A shopper on a street card visits several shops
 * a week, so their pushes are budgeted across all shops: at most ROUTINE_PUSHES_PER_DAY in a rolling 24 hours.
 * The inbox row is always written; only the push is skipped. Everything else (reward ready, redeem, orders,
 * expiry warnings) is never capped.
 */
export const ROUTINE_PUSH_TYPES: readonly NotificationType[] = ["points_earned", "passport_progress"];
export const ROUTINE_PUSHES_PER_DAY = 3;

export const notificationInfo = (type: NotificationType): NotificationTypeInfo => NOTIFICATION_CATALOG.find((x) => x.type === type)!;

export interface NotificationPrefDto {
  type: NotificationType;
  kind: "transactional" | "marketing";
  label: string;
  description: string;
  /** Only the channels the type supports. */
  channels: Partial<Record<NotificationChannel, boolean>>;
}

/** GET /v1/me/notification-prefs (and the PUT response) */
export interface NotificationPrefsResponse {
  items: NotificationPrefDto[];
  quietHours: { start: "21:00"; end: "08:00"; appliesTo: "marketing" };
  /** The rules the settings screen states in words (see notifications.ts in the API). */
  limits: { routinePushesPerDay: number; offersPerDay: number; pointsCollapseMinutes: number };
}

/** PUT /v1/me/notification-prefs — partial: only the listed type/channel pairs change. */
export const updateNotificationPrefsBody = z.object({
  prefs: z
    .array(z.object({ type: z.enum(NOTIFICATION_TYPES), channel: z.enum(NOTIFICATION_CHANNELS), enabled: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_TYPES.length * NOTIFICATION_CHANNELS.length),
});
export type UpdateNotificationPrefsBody = z.infer<typeof updateNotificationPrefsBody>;

/** Deep-link payload carried in push `data` and in inbox items. */
export interface NotificationData {
  /** Notification type (also used by the app to pick an icon). */
  type?: NotificationType;
  notificationId?: string;
  /** "shop" | "rewards" | "order" | "ticket" | "quote" | "campaign" | "card" | "inbox" */
  screen?: string;
  merchantId?: string;
  slug?: string;
  orderId?: string;
  ticketId?: string;
  quoteId?: string;
  campaignId?: string;
  /** App deep link (ll://shop/<slug>, ll://order/<id>, ...) or a web URL for quotes/invoices. */
  url?: string;
  [k: string]: unknown;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  merchant: { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null } | null;
  data: NotificationData;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** GET /v1/me/notifications?limit=&cursor=&unread=1 */
export const notificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
  unread: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});
export type NotificationsQuery = z.infer<typeof notificationsQuery>;

export interface NotificationsResponse {
  items: NotificationDto[];
  nextCursor: string | null;
  unreadCount: number;
}

/** POST /v1/me/notifications/:id/read and POST /v1/me/notifications/read-all */
export interface NotificationsReadResponse {
  unreadCount: number;
}
