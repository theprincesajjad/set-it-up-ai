/**
 * Wave N promos (owner-shaped deals, customer Deals inbox, AI campaign helper). Owner CRUD keeps merchantApi.createPromoBody;
 * this file holds the vocabularies and the new endpoints' shapes.
 */
import { z } from "zod";
import { uuidSchema } from "./common.js";

/** The promo types an owner picks from. `kind` (the stamp effect) is derived: see PROMO_TYPE_DEFAULTS. */
export const PROMO_TYPES = ["double_stamps", "bonus_stamps", "door_crasher", "happy_hour", "seasonal", "comeback", "birthday", "custom"] as const;
export type PromoType = (typeof PROMO_TYPES)[number];

/** Who a promo is for. everyone = anyone (shown on the public shop page when audience is network). */
export const PROMO_SEGMENTS = ["everyone", "regulars", "lapsed", "new", "birthday"] as const;
export type PromoSegment = (typeof PROMO_SEGMENTS)[number];

/** Where it is announced. The Deals inbox always shows a running deal; push = app push, then web push. Never SMS. */
export const PROMO_CHANNELS = ["inbox", "push", "email"] as const;
export type PromoChannel = (typeof PROMO_CHANNELS)[number];

/** Card colours: keys of the design-token tile palette (bg-tile-*). The web maps them to tokens; no raw colours. */
export const PROMO_COLORS = ["peach", "mint", "butter", "lilac", "sky", "rose"] as const;
export type PromoColor = (typeof PROMO_COLORS)[number];

export const PROMO_HOLIDAYS = ["valentines", "diwali", "eid", "black_friday", "christmas", "lunar_new_year", "mothers_day", "fathers_day", "halloween", "canada_day", "back_to_school", "other"] as const;
export type PromoHoliday = (typeof PROMO_HOLIDAYS)[number];

/** Segment rules (server and copy agree): regulars = 3+ visits and seen in the last 60 days; lapsed = no visit in 60+ days; new = joined in the last 30 days. */
export const SEGMENT_RULES = { regularMinVisits: 3, regularWithinDays: 60, lapsedAfterDays: 60, newWithinDays: 30 } as const;

/** Frequency caps for marketing (deals): per shop per person. */
export const PROMO_CAPS = { perShopPerWeek: 2, quietStart: "21:00", quietEnd: "08:00", reminderLeadMinutes: 60 } as const;

export interface PromoTypeDefaults {
  kind: "offer" | "multiplier" | "bonus_points" | "discount" | "event";
  multiplierPct?: number;
  bonusPoints?: number;
  segment: PromoSegment;
  quantityCap?: number;
}
export const PROMO_TYPE_DEFAULTS: Record<PromoType, PromoTypeDefaults> = {
  double_stamps: { kind: "multiplier", multiplierPct: 200, segment: "everyone" },
  bonus_stamps: { kind: "bonus_points", bonusPoints: 1, segment: "everyone" },
  door_crasher: { kind: "offer", segment: "everyone", quantityCap: 20 },
  happy_hour: { kind: "multiplier", multiplierPct: 200, segment: "everyone" },
  seasonal: { kind: "offer", segment: "everyone" },
  comeback: { kind: "bonus_points", bonusPoints: 2, segment: "lapsed" },
  birthday: { kind: "bonus_points", bonusPoints: 2, segment: "birthday" },
  custom: { kind: "offer", segment: "everyone" },
};

// ---------------------------------------------------------------------------
// Owner: lifecycle and results
// ---------------------------------------------------------------------------
export const promoActionBody = z.object({ action: z.enum(["pause", "resume", "end_early"]) });
export type PromoAction = z.infer<typeof promoActionBody>["action"];

export const redeemPromoBody = z.object({
  /** The member at the counter (scan or search). */
  memberId: uuidSchema.optional(),
  /** Or the claim code the customer shows. */
  code: z.string().trim().min(4).max(16).optional(),
  amountCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
});

export interface PromoResults {
  promoId: string;
  sent: number;
  opened: number;
  claimed: number;
  redeemed: number;
  /** Sales recorded with the promo: counter redemptions plus purchases the promo boosted. */
  revenueCents: number;
  /** Skipped by the caps (frequency, quiet hours held until morning are not counted). */
  skippedByCap: number;
  remaining: number | null;
  byChannel: { push: number; webPush: number; email: number; inbox: number };
}

export interface PromoAudiencePreview {
  segment: PromoSegment;
  members: number;
  /** Members with express consent and not muted: the ones a notification can reach. */
  reachable: number;
}

// ---------------------------------------------------------------------------
// Customer: the Deals inbox
// ---------------------------------------------------------------------------
export interface DealDto {
  id: string;
  merchant: { id: string; name: string; slug: string; brandColor: string | null; vertical: string; logoUrl: string | null };
  memberId: string | null;
  title: string;
  body: string | null;
  imageUrl: string | null;
  color: PromoColor | null;
  promoType: PromoType;
  kind: "offer" | "multiplier" | "bonus_points" | "discount" | "event";
  multiplierPct: number | null;
  bonusPoints: number | null;
  percentOff: number | null;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string;
  endsAt: string | null;
  /** True when it applies right now (days and hours included). */
  activeNow: boolean;
  /** Starts in the future (a door crasher counting down). */
  upcoming: boolean;
  quantityCap: number | null;
  remaining: number | null;
  /** This person's claim (door crasher spot), if any. */
  claim: { code: string; status: "claimed" | "redeemed" } | null;
  /** Unread = delivered and not opened yet. */
  unread: boolean;
  /** Express consent for offers from this shop. */
  optedIn: boolean;
}
export interface DealsResponse {
  items: DealDto[];
}
export interface ClaimResponse {
  claim: { code: string; status: "claimed" | "redeemed" };
  remaining: number | null;
}

// ---------------------------------------------------------------------------
// AI campaign helper
// ---------------------------------------------------------------------------
export const PROMO_AI_GOALS = ["fill_quiet_day", "win_back", "new_service", "holiday", "door_crasher"] as const;
export type PromoAiGoal = (typeof PROMO_AI_GOALS)[number];

export const promoAiBody = z.object({
  goal: z.enum(PROMO_AI_GOALS),
  /** Optional owner hint, e.g. "Tuesday", "Diwali", "new gel extensions". Treated as data, never as instructions. */
  hint: z.string().trim().max(200).optional(),
  promoType: z.enum(PROMO_TYPES).optional(),
});
export type PromoAiBody = z.infer<typeof promoAiBody>;

/** What the model fills (and what the editor pre-fills). Every field stays editable. */
export interface PromoAiDraft {
  promoType: PromoType;
  title: string;
  body: string;
  notifyText: string;
  kind: "offer" | "multiplier" | "bonus_points" | "discount";
  multiplierPct: number | null;
  bonusPoints: number | null;
  percentOff: number | null;
  quantityCap: number | null;
  segment: PromoSegment;
  daysOfWeek: number[] | null;
  startTime: string | null;
  endTime: string | null;
  /** Days from today the deal should start and how many days it runs. */
  startInDays: number;
  durationDays: number;
  holiday: string | null;
}
export interface PromoAiResponse {
  generationId: string;
  draft: PromoAiDraft;
  usage: PromoAiUsage;
}
export interface PromoAiUsage {
  /** Plan allows it at all. */
  allowed: boolean;
  plan: string;
  usedThisMonth: number;
  limitThisMonth: number;
  /** Key configured (admin or env) and under the global cap. */
  available: boolean;
  reason: "ok" | "no_key" | "plan" | "shop_quota" | "token_quota" | "global_cap" | null;
}

// Admin /admin/ai
export const setAiKeyBody = z.object({ apiKey: z.string().trim().min(20).max(400) });
export const aiSettingsBody = z.object({
  model: z.string().trim().min(3).max(80).optional(),
  monthlySpendCapCents: z.number().int().min(0).max(10_000_000).optional(),
  shopGenerationsPerMonth: z.number().int().min(0).max(10_000).optional(),
  shopTokensPerMonth: z.number().int().min(0).max(100_000_000).optional(),
  freeGenerationsPerMonth: z.number().int().min(0).max(1_000).optional(),
});
export interface AiAdminSettings {
  key: { source: "admin" | "env" | "none"; masked: string | null; setAt: string | null; validatedAt: string | null };
  /** The master key (APP_ENCRYPTION_KEY) is configured; without it a key cannot be saved. */
  canStore: boolean;
  model: string;
  models: string[];
  monthlySpendCapCents: number;
  shopGenerationsPerMonth: number;
  shopTokensPerMonth: number;
  freeGenerationsPerMonth: number;
  /** Plans the helper is open to (config PROMO_AI_PLANS), "trial" included when trials are allowed. */
  plans: string[];
  month: { spendCents: number; calls: number; inputTokens: number; outputTokens: number };
  topShops: { merchantId: string; name: string; plan: string; generations: number; tokens: number; spendCents: number }[];
  fake: boolean;
}
