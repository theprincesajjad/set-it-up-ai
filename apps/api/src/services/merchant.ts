/**
 * Merchant core: signup, vertical templates, profile, onboarding checklist,
 * features, API key, QR kit. Used by the merchant dashboard routes and the
 * rep console (done-for-you setup).
 */
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import QRCode from "qrcode";
import {
  auditLogs,
  discountCards,
  locations,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchantStaff,
  merchants,
  neighbourhoods,
  rewards,
  type DbOrTx,
  type Tx,
} from "@ll/db";
import {
  FEATURE_KEYS,
  FEATURES,
  PLAN_IDS,
  VERTICAL_TEMPLATES,
  isPlanAvailable,
  normalizePhone,
  type PlanId,
  type Vertical,
  type merchantApi,
} from "@ll/shared";
import type { AppContext } from "../context.js";
import { randomCode, randomToken, sha256 } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import { getMerchantFeatures, getRolloutStages } from "./features.js";
import { writeAudit } from "./admin-audit.js";

export type Merchant = typeof merchants.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type ProgramRow = typeof loyaltyPrograms.$inferSelect;

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Phones, slugs, codes
// ---------------------------------------------------------------------------
export { normalizePhone };

export function requirePhone(input: string): string {
  const p = normalizePhone(input);
  if (!p) throw badRequest("Enter a valid phone number, e.g. 416-555-0123");
  return p;
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "shop"
  );
}

export async function uniqueMerchantSlug(db: DbOrTx, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : i < 10 ? `${base}-${i + 1}` : `${base}-${randomCode(4).toLowerCase()}`;
    const [hit] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug)).limit(1);
    if (!hit) return slug;
  }
  throw new Error("Could not allocate merchant slug");
}

export async function uniqueQrCode(db: DbOrTx): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(7);
    const [hit] = await db.select({ id: locations.id }).from(locations).where(eq(locations.qrCode, code)).limit(1);
    if (!hit) return code;
  }
  throw new Error("Could not allocate QR code");
}

export const joinUrl = (ctx: AppContext, qrCode: string) => `${ctx.config.publicWebUrl.replace(/\/$/, "")}/j/${qrCode}`;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------
export function serializeLocation(ctx: AppContext, l: LocationRow): merchantApi.Location {
  return {
    id: l.id,
    merchantId: l.merchantId,
    name: l.name,
    address: l.address,
    city: l.city,
    postalCode: l.postalCode,
    lat: l.lat,
    lng: l.lng,
    phone: l.phone,
    hours: (l.hours as merchantApi.Hours | null) ?? null,
    qrCode: l.qrCode,
    joinUrl: joinUrl(ctx, l.qrCode),
    active: l.active,
    createdAt: l.createdAt.toISOString(),
  };
}

export function expiryDisclosure(p: Pick<ProgramRow, "expiryMonths" | "terminology">): string {
  return p.expiryMonths
    ? `Your ${p.terminology} expire after ${p.expiryMonths} months with no activity.`
    : `Your ${p.terminology} never expire.`;
}

export function serializeProgram(p: ProgramRow): merchantApi.LoyaltyProgram {
  return {
    id: p.id,
    merchantId: p.merchantId,
    name: p.name,
    earnType: p.earnType,
    pointsPerDollar: p.pointsPerDollar,
    pointsPerVisit: p.pointsPerVisit,
    minSpendCents: p.minSpendCents,
    stampGoal: p.stampGoal,
    terminology: p.terminology,
    welcomeBonus: p.welcomeBonus,
    birthdayBonus: p.birthdayBonus,
    referralBonus: p.referralBonus,
    expiryMonths: p.expiryMonths,
    visitCooldownMinutes: p.visitCooldownMinutes,
    termsText: p.termsText,
    active: p.active,
    counterAutoStamp: p.counterAutoStamp && p.earnType !== "per_dollar",
    rewardCostCents: p.rewardCostCents,
    expiryDisclosure: expiryDisclosure(p),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeMerchant(m: Merchant, primary: LocationRow | null): merchantApi.MerchantProfile {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    vertical: m.vertical as Vertical,
    description: m.description,
    neighbourhoodId: m.neighbourhoodId,
    status: m.status,
    plan: m.plan,
    betaOptIn: m.betaOptIn,
    email: m.email,
    phone: m.phone,
    website: m.website,
    instagram: m.instagram,
    logoUrl: m.logoUrl,
    coverUrl: m.coverUrl,
    brandColor: m.brandColor,
    timezone: m.timezone,
    repUserId: m.repUserId,
    activatedAt: iso(m.activatedAt),
    onboardingStep: m.onboardingStep,
    smsCreditsUsed: m.smsCreditsUsed,
    smsReceiptsEnabled: m.smsReceiptsEnabled,
    hasApiKey: !!m.apiKeyHash,
    hours: (primary?.hours as merchantApi.Hours | null) ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function loadMerchantDetail(ctx: AppContext, merchantId: string, role: merchantApi.StaffRole): Promise<merchantApi.MerchantDetail> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const locs = await ctx.db.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id));
  const [program] = await ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  return {
    merchant: serializeMerchant(m, locs[0] ?? null),
    role,
    locations: locs.map((l) => serializeLocation(ctx, l)),
    program: program ? serializeProgram(program) : null,
  };
}

// ---------------------------------------------------------------------------
// Vertical templates
// ---------------------------------------------------------------------------
export interface ApplyTemplateResult {
  programId: string;
  rewardIds: string[];
  categoryIds: string[];
  discountCardId: string | null;
}

/**
 * Apply VERTICAL_TEMPLATES[vertical] to a merchant: loyalty program, rewards,
 * categories (incl. no-earn ones like Prescriptions) and the discount card.
 * Safe to call on an existing merchant: the program is replaced, while
 * rewards/categories/cards are only added when the merchant has none yet
 * (categories are merged by name, so regulated ones are always present).
 */
export async function applyVerticalTemplate(tx: Tx, merchantId: string, vertical: Vertical): Promise<ApplyTemplateResult> {
  const t = VERTICAL_TEMPLATES[vertical];
  if (!t) throw badRequest(`Unknown vertical: ${vertical}`);
  const [merchant] = await tx.select({ name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant) throw notFound("Merchant");
  const programValues = {
    name: `${merchant.name} ${t.terminology === "stamps" ? "Stamp Card" : "Rewards"}`,
    earnType: t.earnType,
    pointsPerDollar: t.pointsPerDollar,
    pointsPerVisit: t.pointsPerVisit,
    stampGoal: t.stampGoal,
    terminology: t.terminology,
    welcomeBonus: t.welcomeBonus,
    minSpendCents: 0,
    expiryMonths: null,
    active: true,
    // Stamp on scan is on for cafés and bakeries only; elsewhere the owner opts in on the Rewards page.
    counterAutoStamp: (vertical === "cafe" || vertical === "bakery") && t.earnType !== "per_dollar",
    termsText: `${t.terminology[0]!.toUpperCase()}${t.terminology.slice(1)} are earned and redeemed only at ${merchant.name}. They never expire and have no cash value.`,
  };
  const [program] = await tx
    .insert(loyaltyPrograms)
    .values({ merchantId, ...programValues })
    .onConflictDoUpdate({ target: loyaltyPrograms.merchantId, set: { ...programValues, updatedAt: sql`now()` } })
    .returning();

  // Categories: merge by name (case-insensitive). Regulated ones are forced to no-earn.
  const existingCats = await tx.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
  const byName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));
  const categoryIds: string[] = [];
  for (const c of t.categories) {
    const hit = byName.get(c.name.toLowerCase());
    if (hit) {
      if (!c.earnEligible || !c.discountEligible) {
        await tx
          .update(merchantCategories)
          .set({ earnEligible: hit.earnEligible && c.earnEligible, discountEligible: hit.discountEligible && c.discountEligible })
          .where(eq(merchantCategories.id, hit.id));
      }
      categoryIds.push(hit.id);
      continue;
    }
    const [row] = await tx.insert(merchantCategories).values({ merchantId, ...c }).returning({ id: merchantCategories.id });
    categoryIds.push(row!.id);
  }

  let rewardIds: string[] = [];
  const [hasReward] = await tx.select({ id: rewards.id }).from(rewards).where(eq(rewards.merchantId, merchantId)).limit(1);
  if (!hasReward && t.rewards.length) {
    const rows = await tx
      .insert(rewards)
      .values(t.rewards.map((r, i) => ({ merchantId, name: r.name, pointsCost: r.pointsCost, rewardType: r.rewardType, value: r.value, sortOrder: i })))
      .returning({ id: rewards.id });
    rewardIds = rows.map((r) => r.id);
  }

  let discountCardId: string | null = null;
  if (t.discountCard) {
    const [hasCard] = await tx.select({ id: discountCards.id }).from(discountCards).where(eq(discountCards.merchantId, merchantId)).limit(1);
    if (!hasCard) {
      const cats = await tx.select().from(merchantCategories).where(eq(merchantCategories.merchantId, merchantId));
      const excluded = cats.filter((c) => !c.discountEligible).map((c) => c.id);
      const [card] = await tx
        .insert(discountCards)
        .values({
          merchantId,
          name: t.discountCard.name,
          percentOff: t.discountCard.percentOff,
          terms: t.discountCard.terms,
          eligibility: /senior/i.test(t.discountCard.name) ? "seniors" : "members_only",
          excludedCategoryIds: excluded,
        })
        .returning({ id: discountCards.id });
      discountCardId = card!.id;
    }
  }
  return { programId: program!.id, rewardIds, categoryIds, discountCardId };
}

// ---------------------------------------------------------------------------
// Create merchant (self-serve wizard + rep console)
// ---------------------------------------------------------------------------
export interface CreateMerchantArgs {
  body: merchantApi.CreateMerchantBody;
  /** Owner user (self-serve: the caller; rep console: the invited owner). */
  ownerUserId: string;
  repUserId?: string | null;
  actorUserId: string;
}

export async function resolveNeighbourhoodId(db: DbOrTx, id?: string | null, slug?: string | null): Promise<string | null> {
  if (id) {
    const [n] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, id)).limit(1);
    if (!n) throw badRequest("Unknown neighbourhood");
    return n.id;
  }
  if (slug) {
    const [n] = await db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, slug)).limit(1);
    if (!n) throw badRequest("Unknown neighbourhood");
    return n.id;
  }
  return null;
}

export async function createMerchantWithTemplate(ctx: AppContext, args: CreateMerchantArgs) {
  const b = args.body;
  const phone = requirePhone(b.phone);
  return ctx.db.transaction(async (tx) => {
    const neighbourhoodId = await resolveNeighbourhoodId(tx, b.neighbourhoodId, b.neighbourhoodSlug);
    const slug = await uniqueMerchantSlug(tx, b.name);
    const [m] = await tx
      .insert(merchants)
      .values({
        slug,
        name: b.name,
        vertical: b.vertical,
        neighbourhoodId,
        phone,
        email: b.email ?? null,
        status: "onboarding",
        plan: "free",
        repUserId: args.repUserId ?? null,
        onboardingStep: "profile",
        createdAt: ctx.now(),
        updatedAt: ctx.now(),
      })
      .returning();
    await tx.insert(merchantStaff).values({ merchantId: m!.id, userId: args.ownerUserId, role: "owner", createdAt: ctx.now() });
    const [loc] = await tx
      .insert(locations)
      .values({
        merchantId: m!.id,
        name: b.name,
        address: b.address,
        city: b.city ?? "Toronto",
        postalCode: b.postalCode ?? null,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        phone,
        hours: b.hours ?? null,
        qrCode: await uniqueQrCode(tx),
        createdAt: ctx.now(),
      })
      .returning();
    const template = await applyVerticalTemplate(tx, m!.id, b.vertical);
    await writeAudit(tx, {
      actorUserId: args.actorUserId,
      merchantId: m!.id,
      action: args.repUserId ? "rep.merchant_created" : "merchant.created",
      entity: "merchant",
      entityId: m!.id,
      data: { vertical: b.vertical, template },
    });
    return { merchant: m!, location: loc!, template };
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfile(ctx: AppContext, merchantId: string, actorUserId: string, body: merchantApi.UpdateProfileBody) {
  return ctx.db.transaction(async (tx) => {
    const { hours, neighbourhoodId, phone, ...rest } = body;
    const set: Partial<typeof merchants.$inferInsert> = { ...rest, updatedAt: ctx.now() };
    if (phone !== undefined) set.phone = phone === null ? null : requirePhone(phone);
    if (neighbourhoodId !== undefined) set.neighbourhoodId = neighbourhoodId === null ? null : await resolveNeighbourhoodId(tx, neighbourhoodId);
    if (set.instagram) set.instagram = set.instagram.replace(/^@/, "");
    await tx.update(merchants).set(set).where(eq(merchants.id, merchantId));
    if (hours !== undefined) {
      const [primary] = await tx.select().from(locations).where(eq(locations.merchantId, merchantId)).orderBy(asc(locations.createdAt), asc(locations.id)).limit(1);
      if (primary) await tx.update(locations).set({ hours }).where(eq(locations.id, primary.id));
    }
    await writeAudit(tx, { actorUserId, merchantId, action: "merchant.profile_updated", entity: "merchant", entityId: merchantId, data: { fields: Object.keys(body) } });
  });
}

export async function setBetaOptIn(ctx: AppContext, merchantId: string, actorUserId: string, optIn: boolean) {
  await ctx.db.update(merchants).set({ betaOptIn: optIn, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "merchant.beta_opt_in", entity: "merchant", entityId: merchantId, data: { optIn } });
}

// ---------------------------------------------------------------------------
// Onboarding checklist
// ---------------------------------------------------------------------------
const STEP_LABELS: Record<merchantApi.OnboardingStepKey, string> = {
  profile: "Add your logo and description",
  program: "Set your earn rules",
  rewards: "Pick your rewards",
  staff: "Add your staff",
  qr_kit: "Print your counter QR kit",
  first_members: "Sign up your first members",
};
const STEP_ORDER: merchantApi.OnboardingStepKey[] = ["profile", "program", "rewards", "staff", "qr_kit", "first_members"];

export async function countActiveMembers(db: DbOrTx, merchantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), gte(merchantMembers.visitCount, 1)));
  return Number(row?.n ?? 0);
}

export async function getOnboardingChecklist(ctx: AppContext, merchantId: string): Promise<merchantApi.OnboardingChecklist> {
  const db = ctx.db;
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [[program], [rewardRow], [staffRow], marks, activeMembers] = await Promise.all([
    db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1),
    db.select({ n: count() }).from(rewards).where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true))),
    db.select({ n: count() }).from(merchantStaff).where(eq(merchantStaff.merchantId, merchantId)),
    db
      .select({ data: auditLogs.data })
      .from(auditLogs)
      .where(and(eq(auditLogs.merchantId, merchantId), eq(auditLogs.action, "onboarding.step_completed"))),
    countActiveMembers(db, merchantId),
  ]);
  const marked = new Set(marks.map((r) => (r.data as { step?: string } | null)?.step).filter(Boolean));
  const target = ctx.config.activationThreshold;
  const done: Record<merchantApi.OnboardingStepKey, boolean> = {
    profile: (!!m.description && !!m.logoUrl) || marked.has("profile"),
    program: (!!program && program.active) || marked.has("program"),
    rewards: Number(rewardRow?.n ?? 0) > 0 || marked.has("rewards"),
    staff: Number(staffRow?.n ?? 0) > 1 || marked.has("staff"),
    qr_kit: marked.has("qr_kit"),
    first_members: !!m.activatedAt || activeMembers >= target,
  };
  const detail: Record<merchantApi.OnboardingStepKey, string | null> = {
    profile: null,
    program: program ? `${program.earnType.replace("_", " ")} · ${program.terminology}` : null,
    rewards: `${Number(rewardRow?.n ?? 0)} active reward(s)`,
    staff: `${Number(staffRow?.n ?? 0)} team member(s)`,
    qr_kit: null,
    first_members: `${Math.min(activeMembers, target)} of ${target} members have visited`,
  };
  const steps = STEP_ORDER.map((key) => ({ key, label: STEP_LABELS[key], done: done[key], detail: detail[key] }));
  const current = steps.find((s) => !s.done)?.key ?? "done";
  if (m.onboardingStep !== current) await db.update(merchants).set({ onboardingStep: current }).where(eq(merchants.id, merchantId));
  return {
    steps,
    currentStep: current,
    percentComplete: Math.round((steps.filter((s) => s.done).length / steps.length) * 100),
    activeMembers,
    activationTarget: target,
    activatedAt: iso(m.activatedAt),
  };
}

export async function completeOnboardingStep(ctx: AppContext, merchantId: string, actorUserId: string, step: string) {
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "onboarding.step_completed", entity: "merchant", entityId: merchantId, data: { step } });
  return getOnboardingChecklist(ctx, merchantId);
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
export async function merchantFeaturesResponse(db: DbOrTx, m: Merchant): Promise<merchantApi.MerchantFeaturesResponse> {
  const [states, stages] = await Promise.all([getMerchantFeatures(db, m), getRolloutStages(db)]);
  return {
    plan: m.plan,
    betaOptIn: m.betaOptIn,
    features: FEATURE_KEYS.map((k) => ({
      key: k,
      name: FEATURES[k].name,
      description: FEATURES[k].description,
      phase: FEATURES[k].phase,
      enabled: states[k].enabled,
      stage: states[k].stage,
      minPlan: states[k].minPlan,
      lockedReason: states[k].lockedReason,
    })),
    plansAvailable: Object.fromEntries(PLAN_IDS.map((p) => [p, isPlanAvailable(p, stages)])) as Record<PlanId, boolean>,
  };
}

// ---------------------------------------------------------------------------
// API key (integrations team verifies with verifyMerchantApiKey)
// ---------------------------------------------------------------------------
export const API_KEY_PREFIX = "llk_";

export async function rotateApiKey(ctx: AppContext, merchantId: string, actorUserId: string): Promise<string> {
  const apiKey = `${API_KEY_PREFIX}${randomToken(24)}`;
  await ctx.db.update(merchants).set({ apiKeyHash: sha256(apiKey), updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "merchant.api_key_rotated", entity: "merchant", entityId: merchantId });
  return apiKey;
}

export async function revokeApiKey(ctx: AppContext, merchantId: string, actorUserId: string) {
  await ctx.db.update(merchants).set({ apiKeyHash: null, updatedAt: ctx.now() }).where(eq(merchants.id, merchantId));
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "merchant.api_key_revoked", entity: "merchant", entityId: merchantId });
}

/** Resolve a merchant from a raw API key (sha256 lookup). Returns null if unknown. */
export async function verifyMerchantApiKey(db: DbOrTx, apiKey: string): Promise<Merchant | null> {
  if (!apiKey.startsWith(API_KEY_PREFIX)) return null;
  const [m] = await db.select().from(merchants).where(eq(merchants.apiKeyHash, sha256(apiKey))).limit(1);
  return m ?? null;
}

// ---------------------------------------------------------------------------
// QR kit
// ---------------------------------------------------------------------------
export async function buildQrKit(ctx: AppContext, merchantId: string): Promise<merchantApi.QrKit> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const locs = await ctx.db
    .select()
    .from(locations)
    .where(and(eq(locations.merchantId, merchantId), eq(locations.active, true)))
    .orderBy(asc(locations.createdAt), asc(locations.id));
  const [program] = await ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  const headline = program
    ? program.earnType === "stamps"
      ? `Collect ${program.stampGoal || 10} stamps, get a reward`
      : program.earnType === "per_visit"
        ? `Earn ${program.pointsPerVisit} ${program.terminology} every visit`
        : `Earn ${program.pointsPerDollar} ${program.terminology === "points" ? "point" : program.terminology} per $1`
    : "Join our rewards";
  return {
    merchant: { id: m.id, name: m.name, slug: m.slug, logoUrl: m.logoUrl, brandColor: m.brandColor, vertical: m.vertical as Vertical },
    program: program ? { name: program.name, terminology: program.terminology, headline } : null,
    locations: await Promise.all(
      locs.map(async (l) => {
        const url = joinUrl(ctx, l.qrCode);
        return { id: l.id, name: l.name, address: l.address, qrCode: l.qrCode, joinUrl: url, qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) };
      }),
    ),
    staffScript: `"Are you on ${m.name} rewards? It's free — just your phone number." Then award ${program?.terminology ?? "points"} in the staff app.`,
  };
}
