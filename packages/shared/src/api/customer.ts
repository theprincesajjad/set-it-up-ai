/**
 * API contract for the "customer" area (routes/customer, /v1/me/...).
 * Endpoint docs: docs/engineering/api/customer.md.
 *
 * Also defines the loyalty display types (program summary, rewards, discount
 * cards, VIP, next-reward progress) reused by the staff and network contracts.
 */
import { z } from "zod";
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
    birthday: z.iso.date().nullable(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, "Enter a Canadian postal code like M6R 2K3")
      .nullable(),
    homeNeighbourhoodId: uuidSchema.nullable(),
    locale: z.enum(["en-CA", "fr-CA"]),
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
  inAppPayments: boolean;
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
  referral: { applied: boolean; reason?: "invalid" | "own_code" | "already_member" | "already_used" } | null;
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

/** GET /v1/me/export — everything we hold about the signed-in customer (PIPEDA access request). */
export interface DataExportResponse {
  exportedAt: string;
  profile: ProfileDto;
  memberships: (MembershipDto & { transactions: LedgerTxDto[]; redemptions: RedemptionDto[] })[];
  visits: { merchantId: string; locationId: string | null; amountCents: number | null; createdAt: string }[];
  referrals: { merchantId: string; code: string; role: "referrer" | "referee"; status: string; createdAt: string }[];
  pushTokens: { platform: string; createdAt: string }[];
  sessions: { userAgent: string | null; createdAt: string; expiresAt: string; revoked: boolean }[];
  orders: unknown[];
  serviceTickets: unknown[];
  invoices: unknown[];
  messages: { merchantId: string | null; channel: string; kind: string; body: string; createdAt: string }[];
}
