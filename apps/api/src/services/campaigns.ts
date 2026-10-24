/**
 * BIA neighbourhood campaigns ("Passport week", "Points weekend", street-wide
 * multipliers). Paid per campaign by the BIA; bonus points are funded by the
 * network (ledger counter account "network_issued"), never by the merchant.
 *
 * The visit hook registered at the bottom of this module tracks progress and
 * awards bonuses; it is active as soon as the module is imported
 * (routes/campaigns/index.ts and jobs/ads.ts both import it).
 *
 * Spec: docs/business/network-monetization.md
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import {
  campaignMerchants,
  campaignProgress,
  campaigns,
  ledgerTransactions,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  neighbourhoodManagers,
  neighbourhoods,
  users,
  visits,
  type DbOrTx,
  type Tx,
} from "@ll/db";
import { FEATURES, campaignsApi, distanceMetres, maskPhone, networkBonusInShopUnits } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser } from "../lib/auth.js";
import { HttpError, badRequest, conflict, featureLocked, forbidden, notFound } from "../lib/errors.js";
import { getRolloutStages, requireFeature } from "./features.js";
import { postTransaction, visitHooks, type VisitHook } from "./ledger.js";
import { hoodDto, shopCountSql } from "./network.js";

const { CAMPAIGN_PACKAGES } = campaignsApi;

export type CampaignRow = typeof campaigns.$inferSelect;
type CreateBody = z.output<typeof campaignsApi.createCampaignBody>;
type UpdateBody = z.output<typeof campaignsApi.updateCampaignBody>;
type Merchant = typeof merchants.$inferSelect;

const DAY_MS = 86_400_000;
/** Statuses in which visits count toward a campaign (inside its window). */
const RUNNING: CampaignRow["status"][] = ["scheduled", "live"];

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------
export async function managedNeighbourhoodIds(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.select({ id: neighbourhoodManagers.neighbourhoodId }).from(neighbourhoodManagers).where(eq(neighbourhoodManagers.userId, userId));
  return rows.map((r) => r.id);
}

/** Platform admins manage every neighbourhood; BIA managers only the ones they're assigned to. */
export async function requireNeighbourhoodManager(db: DbOrTx, user: AuthUser, neighbourhoodId: string): Promise<void> {
  if (user.platformRole === "admin") return;
  const [row] = await db
    .select({ id: neighbourhoodManagers.userId })
    .from(neighbourhoodManagers)
    .where(and(eq(neighbourhoodManagers.neighbourhoodId, neighbourhoodId), eq(neighbourhoodManagers.userId, user.id)))
    .limit(1);
  if (!row) throw forbidden();
}

/**
 * Neighbourhood campaigns are a Phase 3 feature. BIA managers get a 402 while
 * it's hidden; platform admins can still set up pilots.
 */
export async function requireCampaignsRolledOut(db: DbOrTx, user: AuthUser): Promise<void> {
  if (user.platformRole === "admin") return;
  const stages = await getRolloutStages(db);
  if (stages["campaigns.neighbourhood"] === "hidden") throw featureLocked(FEATURES["campaigns.neighbourhood"].name, "rollout");
}

export async function loadCampaign(db: DbOrTx, id: string): Promise<CampaignRow> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!c) throw notFound("Campaign");
  return c;
}

/** Load a campaign and authorize the caller as its neighbourhood's manager. */
export async function loadManagedCampaign(ctx: AppContext, user: AuthUser, id: string): Promise<CampaignRow> {
  const c = await loadCampaign(ctx.db, id);
  await requireNeighbourhoodManager(ctx.db, user, c.neighbourhoodId);
  return c;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
async function merchantsFor(db: DbOrTx, campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, campaignsApi.CampaignMerchant[]>();
  const rows = await db
    .select({ campaignId: campaignMerchants.campaignId, id: merchants.id, name: merchants.name, slug: merchants.slug, logoUrl: merchants.logoUrl })
    .from(campaignMerchants)
    .innerJoin(merchants, eq(merchants.id, campaignMerchants.merchantId))
    .where(inArray(campaignMerchants.campaignId, campaignIds))
    .orderBy(asc(merchants.name));
  const out = new Map<string, campaignsApi.CampaignMerchant[]>();
  for (const r of rows) out.set(r.campaignId, [...(out.get(r.campaignId) ?? []), { id: r.id, name: r.name, slug: r.slug, logoUrl: r.logoUrl }]);
  return out;
}

export function toCampaign(c: CampaignRow, ms: campaignsApi.CampaignMerchant[]): campaignsApi.Campaign {
  return {
    id: c.id,
    neighbourhoodId: c.neighbourhoodId,
    name: c.name,
    description: c.description,
    kind: c.kind as campaignsApi.CampaignKind,
    status: c.status as campaignsApi.CampaignStatus,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    goalVisits: c.goalVisits,
    bonusPoints: c.bonusPoints,
    multiplierPct: c.multiplierPct,
    prize: c.prize,
    priceCents: c.priceCents,
    paid: c.paidAt !== null,
    paidAt: c.paidAt?.toISOString() ?? null,
    merchants: ms,
    drawnAt: c.drawnAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function campaignDto(db: DbOrTx, c: CampaignRow): Promise<campaignsApi.Campaign> {
  return toCampaign(c, (await merchantsFor(db, [c.id])).get(c.id) ?? []);
}

async function publicDtos(db: DbOrTx, rows: CampaignRow[]): Promise<campaignsApi.PublicCampaign[]> {
  if (!rows.length) return [];
  const ms = await merchantsFor(db, rows.map((r) => r.id));
  const hoods = await db
    .select({ id: neighbourhoods.id, name: neighbourhoods.name, slug: neighbourhoods.slug })
    .from(neighbourhoods)
    .where(inArray(neighbourhoods.id, [...new Set(rows.map((r) => r.neighbourhoodId))]));
  const hoodMap = new Map(hoods.map((h) => [h.id, h]));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind as campaignsApi.CampaignKind,
    status: c.status as campaignsApi.CampaignStatus,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    goalVisits: c.goalVisits,
    bonusPoints: c.bonusPoints,
    multiplierPct: c.multiplierPct,
    prize: c.prize,
    neighbourhood: hoodMap.get(c.neighbourhoodId)!,
    merchants: ms.get(c.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// BIA manager / admin
// ---------------------------------------------------------------------------
export async function createCampaign(ctx: AppContext, user: AuthUser, body: CreateBody): Promise<CampaignRow> {
  await requireCampaignsRolledOut(ctx.db, user);
  await requireNeighbourhoodManager(ctx.db, user, body.neighbourhoodId);
  const [hood] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, body.neighbourhoodId)).limit(1);
  if (!hood) throw notFound("Neighbourhood");
  if (body.endsAt <= ctx.now()) throw badRequest("Campaign must end in the future");
  const pkg = CAMPAIGN_PACKAGES[body.kind];
  // Only platform admins set the price (BIA managers get the package price).
  const priceCents = user.platformRole === "admin" && body.priceCents !== undefined ? body.priceCents : pkg.priceCents;
  const [row] = await ctx.db
    .insert(campaigns)
    .values({
      neighbourhoodId: body.neighbourhoodId,
      name: body.name,
      description: body.description ?? null,
      kind: body.kind,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      goalVisits: body.goalVisits ?? pkg.goalVisits,
      bonusPoints: body.bonusPoints,
      multiplierPct: body.multiplierPct ?? null,
      prize: body.prize ?? null,
      priceCents,
      status: "draft",
      createdBy: user.id,
    })
    .returning();
  return row!;
}

export async function updateCampaign(ctx: AppContext, user: AuthUser, id: string, body: UpdateBody): Promise<CampaignRow> {
  const c = await loadManagedCampaign(ctx, user, id);
  if (c.status !== "draft" && c.status !== "scheduled") throw conflict("Only draft or scheduled campaigns can be edited");
  if (body.priceCents !== undefined && user.platformRole !== "admin") throw forbidden("Only the network team can change the price");
  const startsAt = body.startsAt ?? c.startsAt;
  const endsAt = body.endsAt ?? c.endsAt;
  if (endsAt <= startsAt) throw badRequest("endsAt must be after startsAt");
  if (endsAt.getTime() - startsAt.getTime() > 31 * DAY_MS) throw badRequest("Campaigns run at most 31 days");
  const multiplierPct = body.multiplierPct === undefined ? c.multiplierPct : body.multiplierPct;
  if (c.kind === "multiplier" && !multiplierPct) throw badRequest("Multiplier campaigns need multiplierPct");
  const patch: Partial<CampaignRow> = {};
  for (const k of ["name", "description", "goalVisits", "bonusPoints", "prize", "priceCents"] as const) {
    if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  }
  Object.assign(patch, { startsAt, endsAt, multiplierPct });
  const [row] = await ctx.db.update(campaigns).set(patch).where(eq(campaigns.id, c.id)).returning();
  return row!;
}

/** Draft → scheduled. BIA managers need the campaign paid (or free); admins can schedule pilots unpaid. */
export async function scheduleCampaign(ctx: AppContext, user: AuthUser, id: string): Promise<CampaignRow> {
  const c = await loadManagedCampaign(ctx, user, id);
  await requireCampaignsRolledOut(ctx.db, user);
  if (c.status !== "draft") throw conflict("Only draft campaigns can be scheduled");
  if (c.endsAt <= ctx.now()) throw conflict("This campaign's dates have passed");
  if (user.platformRole !== "admin" && c.priceCents > 0 && !c.paidAt) throw new HttpError(402, "payment_required", "This campaign needs to be paid before it can be scheduled");
  const status = c.startsAt <= ctx.now() ? "live" : "scheduled";
  const [row] = await ctx.db.update(campaigns).set({ status }).where(eq(campaigns.id, c.id)).returning();
  return row!;
}

export async function cancelCampaign(ctx: AppContext, user: AuthUser, id: string): Promise<CampaignRow> {
  const c = await loadManagedCampaign(ctx, user, id);
  if (c.status === "ended" || c.status === "cancelled") throw conflict("This campaign is already closed");
  const [row] = await ctx.db.update(campaigns).set({ status: "cancelled" }).where(eq(campaigns.id, c.id)).returning();
  return row!;
}

export async function markCampaignPaid(ctx: AppContext, id: string, paid: boolean): Promise<CampaignRow> {
  const c = await loadCampaign(ctx.db, id);
  const [row] = await ctx.db.update(campaigns).set({ paidAt: paid ? (c.paidAt ?? ctx.now()) : null }).where(eq(campaigns.id, c.id)).returning();
  return row!;
}

export async function listCampaigns(ctx: AppContext, user: AuthUser, q: { neighbourhoodId?: string; status?: string; limit: number; cursor?: string }) {
  // The BIA console probes this list: a 402 while campaigns are hidden is what shows its "coming soon" state.
  await requireCampaignsRolledOut(ctx.db, user);
  const conds = [];
  if (user.platformRole !== "admin") {
    const mine = await managedNeighbourhoodIds(ctx.db, user.id);
    if (!mine.length) throw forbidden();
    if (q.neighbourhoodId && !mine.includes(q.neighbourhoodId)) throw forbidden();
    conds.push(inArray(campaigns.neighbourhoodId, q.neighbourhoodId ? [q.neighbourhoodId] : mine));
  } else if (q.neighbourhoodId) conds.push(eq(campaigns.neighbourhoodId, q.neighbourhoodId));
  if (q.status) conds.push(eq(campaigns.status, q.status));
  if (q.cursor) conds.push(lt(campaigns.createdAt, new Date(q.cursor)));
  const rows = await ctx.db.select().from(campaigns).where(and(...conds)).orderBy(desc(campaigns.createdAt)).limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const ms = await merchantsFor(ctx.db, page.map((r) => r.id));
  return { items: page.map((c) => toCampaign(c, ms.get(c.id) ?? [])), nextCursor: rows.length > q.limit ? page[page.length - 1]!.createdAt.toISOString() : null };
}

/** Neighbourhoods the caller manages (admins: every neighbourhood, any status). */
export async function listManagedNeighbourhoods(ctx: AppContext, user: AuthUser): Promise<campaignsApi.ManagedNeighbourhood[]> {
  const base = ctx.db.select({ n: neighbourhoods, shopCount: shopCountSql }).from(neighbourhoods);
  const rows =
    user.platformRole === "admin"
      ? await base.orderBy(asc(neighbourhoods.name))
      : await base
          .innerJoin(neighbourhoodManagers, eq(neighbourhoodManagers.neighbourhoodId, neighbourhoods.id))
          .where(eq(neighbourhoodManagers.userId, user.id))
          .orderBy(asc(neighbourhoods.name));
  return rows.map((r) => hoodDto(r.n, r.shopCount));
}

/** Every shop on a strip (any status, listed or not) for campaign shop pickers. Admin or that neighbourhood's manager. */
export async function listNeighbourhoodMerchants(ctx: AppContext, user: AuthUser, neighbourhoodId: string): Promise<campaignsApi.NeighbourhoodMerchant[]> {
  await requireNeighbourhoodManager(ctx.db, user, neighbourhoodId);
  const [hood] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, neighbourhoodId)).limit(1);
  if (!hood) throw notFound("Neighbourhood");
  const rows = await ctx.db.select().from(merchants).where(eq(merchants.neighbourhoodId, neighbourhoodId)).orderBy(asc(merchants.name), asc(merchants.id));
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    vertical: m.vertical,
    status: m.status,
    activated: !!m.activatedAt,
    activatedAt: m.activatedAt ? m.activatedAt.toISOString() : null,
    logoUrl: m.logoUrl,
  }));
}

function assertOpenForMerchants(c: CampaignRow) {
  if (c.status === "ended" || c.status === "cancelled") throw conflict("This campaign is closed");
}

/** BIA manager or admin adds a shop. The shop must be on the campaign's strip. */
export async function addCampaignMerchant(ctx: AppContext, user: AuthUser, campaignId: string, merchantId: string) {
  const c = await loadManagedCampaign(ctx, user, campaignId);
  assertOpenForMerchants(c);
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  if (m.neighbourhoodId !== c.neighbourhoodId) throw badRequest("That shop isn't in this campaign's neighbourhood");
  if (m.status === "closed") throw conflict("That shop is closed");
  await ctx.db.insert(campaignMerchants).values({ campaignId: c.id, merchantId: m.id }).onConflictDoNothing();
  return campaignDto(ctx.db, await loadCampaign(ctx.db, c.id));
}

export async function removeCampaignMerchant(ctx: AppContext, user: AuthUser, campaignId: string, merchantId: string) {
  const c = await loadManagedCampaign(ctx, user, campaignId);
  if (c.startsAt <= ctx.now() && user.platformRole !== "admin") throw conflict("Shops can't be removed once the campaign has started");
  await ctx.db.delete(campaignMerchants).where(and(eq(campaignMerchants.campaignId, c.id), eq(campaignMerchants.merchantId, merchantId)));
  return campaignDto(ctx.db, await loadCampaign(ctx.db, c.id));
}

// ---------------------------------------------------------------------------
// Merchant opt-in (owner / manager)
// ---------------------------------------------------------------------------
export async function listMerchantCampaigns(ctx: AppContext, merchant: Merchant): Promise<campaignsApi.MerchantCampaign[]> {
  await requireFeature(ctx.db, merchant, "campaigns.neighbourhood");
  if (!merchant.neighbourhoodId) return [];
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.neighbourhoodId, merchant.neighbourhoodId), inArray(campaigns.status, ["scheduled", "live", "ended"]), gt(campaigns.endsAt, new Date(now.getTime() - 30 * DAY_MS))))
    .orderBy(asc(campaigns.startsAt));
  const dtos = await publicDtos(ctx.db, rows);
  return dtos.map((d, i) => ({
    ...d,
    joined: d.merchants.some((m) => m.id === merchant.id),
    canChange: rows[i]!.status !== "ended" && rows[i]!.startsAt > now,
  }));
}

async function loadJoinableCampaign(ctx: AppContext, merchant: Merchant, campaignId: string) {
  await requireFeature(ctx.db, merchant, "campaigns.neighbourhood");
  const c = await loadCampaign(ctx.db, campaignId);
  if (c.neighbourhoodId !== merchant.neighbourhoodId) throw notFound("Campaign");
  if (c.status !== "scheduled" && c.status !== "live") throw conflict("This campaign isn't open for shops");
  return c;
}

export async function merchantJoinCampaign(ctx: AppContext, merchant: Merchant, campaignId: string) {
  const c = await loadJoinableCampaign(ctx, merchant, campaignId);
  if (c.endsAt <= ctx.now()) throw conflict("This campaign has ended");
  await ctx.db.insert(campaignMerchants).values({ campaignId: c.id, merchantId: merchant.id }).onConflictDoNothing();
  return (await listMerchantCampaigns(ctx, merchant)).find((x) => x.id === c.id)!;
}

export async function merchantLeaveCampaign(ctx: AppContext, merchant: Merchant, campaignId: string) {
  const c = await loadJoinableCampaign(ctx, merchant, campaignId);
  if (c.startsAt <= ctx.now()) throw conflict("You can't leave a campaign after it starts");
  await ctx.db.delete(campaignMerchants).where(and(eq(campaignMerchants.campaignId, c.id), eq(campaignMerchants.merchantId, merchant.id)));
  return (await listMerchantCampaigns(ctx, merchant)).find((x) => x.id === c.id)!;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export async function publicCampaign(ctx: AppContext, id: string): Promise<campaignsApi.PublicCampaign> {
  const [c] = await ctx.db.select().from(campaigns).where(and(eq(campaigns.id, id), inArray(campaigns.status, ["scheduled", "live", "ended"]))).limit(1);
  if (!c) throw notFound("Campaign");
  return (await publicDtos(ctx.db, [c]))[0]!;
}

/** Street campaigns running right now, soonest to end first: what the public shopper page shows as "on now". */
export async function liveCampaigns(ctx: AppContext, limit = 6): Promise<campaignsApi.PublicCampaign[]> {
  const now = ctx.now();
  const rows = await ctx.db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.status, "live"), lte(campaigns.startsAt, now), gt(campaigns.endsAt, now)))
    .orderBy(asc(campaigns.endsAt))
    .limit(limit);
  return publicDtos(ctx.db, rows);
}

/** Live and upcoming campaigns near the customer (home neighbourhood, shops they belong to, or where they are), with progress. */
export async function myCampaigns(ctx: AppContext, userId: string, q: { lat?: number; lng?: number }): Promise<campaignsApi.MyCampaign[]> {
  const db = ctx.db;
  const now = ctx.now();
  const hoodIds = new Set<string>();
  const [u] = await db.select({ home: users.homeNeighbourhoodId }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.home) hoodIds.add(u.home);
  const memberHoods = await db
    .selectDistinct({ id: merchants.neighbourhoodId })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(and(eq(merchantMembers.userId, userId), isNotNull(merchants.neighbourhoodId)));
  for (const h of memberHoods) if (h.id) hoodIds.add(h.id);
  if (q.lat !== undefined && q.lng !== undefined) {
    const all = await db.select().from(neighbourhoods);
    for (const h of all) {
      if (h.centerLat != null && h.centerLng != null && distanceMetres({ lat: q.lat, lng: q.lng }, { lat: h.centerLat, lng: h.centerLng }) <= h.radiusMetres * 2) hoodIds.add(h.id);
    }
  }
  // Also anything the customer already has progress in.
  const progressRows = await db.select().from(campaignProgress).where(eq(campaignProgress.userId, userId));
  const progressMap = new Map(progressRows.map((p) => [p.campaignId, p]));
  const conds = [inArray(campaigns.status, RUNNING), gt(campaigns.endsAt, now)];
  const scope = [];
  if (hoodIds.size) scope.push(inArray(campaigns.neighbourhoodId, [...hoodIds]));
  if (progressMap.size) scope.push(inArray(campaigns.id, [...progressMap.keys()]));
  if (!scope.length) return [];
  const rows = await db.select().from(campaigns).where(and(...conds, or(...scope))).orderBy(asc(campaigns.startsAt));
  const dtos = await publicDtos(db, rows);
  return dtos.map((d) => {
    const p = progressMap.get(d.id);
    const visited = p?.merchantIds ?? [];
    return {
      ...d,
      progress: {
        visitedMerchantIds: visited,
        visited: visited.length,
        goal: d.goalVisits,
        completedAt: p?.completedAt?.toISOString() ?? null,
        enteredInDraw: !!p?.completedAt && !!d.prize,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Visit hook: progress, bonuses, completion
// ---------------------------------------------------------------------------
export const campaignVisitHook: VisitHook = async (tx: Tx, { merchant, member, visitId, at, source }) => {
  const live = await tx
    .select({ c: campaigns })
    .from(campaigns)
    .innerJoin(campaignMerchants, and(eq(campaignMerchants.campaignId, campaigns.id), eq(campaignMerchants.merchantId, merchant.id)))
    .where(and(inArray(campaigns.status, RUNNING), lte(campaigns.startsAt, at), gt(campaigns.endsAt, at)));
  if (!live.length) return;
  let pointsAwarded = 0;
  const messages: string[] = [];
  for (const { c } of live) {
    await tx.insert(campaignProgress).values({ campaignId: c.id, userId: member.userId, merchantIds: [] }).onConflictDoNothing();
    const [p] = await tx
      .select()
      .from(campaignProgress)
      .where(and(eq(campaignProgress.campaignId, c.id), eq(campaignProgress.userId, member.userId)))
      .for("update")
      .limit(1);
    const firstAtShop = !p!.merchantIds.includes(merchant.id);
    const merchantIds = firstAtShop ? [...p!.merchantIds, merchant.id] : p!.merchantIds;
    const completesNow = !p!.completedAt && merchantIds.length >= c.goalVisits;
    if (firstAtShop || completesNow) {
      await tx
        .update(campaignProgress)
        .set({ merchantIds, updatedAt: at, ...(completesNow ? { completedAt: at } : {}) })
        .where(and(eq(campaignProgress.campaignId, c.id), eq(campaignProgress.userId, member.userId)));
    }

    if (firstAtShop && c.bonusPoints > 0) {
      const [program] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id)).limit(1);
      const bonus = program ? networkBonusInShopUnits(program, c.bonusPoints) : c.bonusPoints;
      const r = await postTransaction(tx, {
        merchantId: merchant.id,
        memberId: member.id,
        type: "campaign_bonus",
        source,
        points: bonus,
        description: `${c.name}: shop bonus`,
        campaignId: c.id,
        counterAccount: "network_issued",
        idempotencyKey: `campaign:${c.id}:${member.userId}:${merchant.id}`,
      });
      if (!r.duplicate) pointsAwarded += bonus;
    }

    if (c.multiplierPct && c.multiplierPct > 100) {
      const [base] = await tx
        .select({ points: ledgerTransactions.points })
        .from(visits)
        .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, visits.transactionId))
        .where(and(eq(visits.id, visitId), eq(ledgerTransactions.type, "earn")))
        .limit(1);
      const extra = base ? Math.floor((base.points * (c.multiplierPct - 100)) / 100) : 0;
      if (extra > 0) {
        const r = await postTransaction(tx, {
          merchantId: merchant.id,
          memberId: member.id,
          type: "campaign_bonus",
          source,
          points: extra,
          description: `${c.name}: ${c.multiplierPct / 100}x points`,
          campaignId: c.id,
          counterAccount: "network_issued",
          idempotencyKey: `campaign:${c.id}:visit:${visitId}`,
        });
        if (!r.duplicate) pointsAwarded += extra;
      }
    }

    if (completesNow) messages.push(c.prize ? `${c.name} complete! You're entered in the draw for ${c.prize}.` : `${c.name} complete!`);
    else if (firstAtShop) messages.push(`${c.name}: ${merchantIds.length} of ${c.goalVisits} shops visited.`);
  }
  return { pointsAwarded, messages };
};

if (!visitHooks.includes(campaignVisitHook)) visitHooks.push(campaignVisitHook);

// ---------------------------------------------------------------------------
// BIA report (aggregates only)
// ---------------------------------------------------------------------------
const RETURN_WINDOW_DAYS = 30;

/**
 * "Came back within 30 days": unique customers with a visit at a participating shop in [from, to) who have another
 * visit at any shop in the neighbourhood in the 30 days from `to`. Customer ids stay inside these queries.
 */
async function returnedStats(db: DbOrTx, participantIds: string[], hoodShopIds: string[], from: Date, to: Date): Promise<{ customers: number; returned: number }> {
  if (!participantIds.length || !hoodShopIds.length || from >= to) return { customers: 0, returned: 0 };
  const after = new Date(to.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
  const eventUsers = db
    .select({ userId: visits.userId })
    .from(visits)
    .where(and(inArray(visits.merchantId, participantIds), gte(visits.createdAt, from), lt(visits.createdAt, to)))
    .groupBy(visits.userId);
  const [[c], [r]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(eventUsers.as("eu")),
    db
      .select({ n: sql<number>`count(distinct ${visits.userId})::int` })
      .from(visits)
      .where(and(inArray(visits.merchantId, hoodShopIds), gte(visits.createdAt, to), lt(visits.createdAt, after), inArray(visits.userId, eventUsers))),
  ]);
  return { customers: Number(c?.n ?? 0), returned: Number(r?.n ?? 0) };
}

export async function campaignReport(ctx: AppContext, c: CampaignRow): Promise<campaignsApi.CampaignReport> {
  const db = ctx.db;
  const now = ctx.now();
  const start = c.startsAt;
  const end = new Date(Math.min(c.endsAt.getTime(), Math.max(now.getTime(), start.getTime())));
  const len = end.getTime() - start.getTime();
  const baseStart = new Date(start.getTime() - len);
  const ms = (await merchantsFor(db, [c.id])).get(c.id) ?? [];
  const ids = ms.map((m) => m.id);

  const zero = { visits: 0, uniq: 0 };
  async function visitStats(from: Date, to: Date) {
    if (!ids.length || from >= to) return { total: zero, per: new Map<string, typeof zero>() };
    const window = and(inArray(visits.merchantId, ids), gte(visits.createdAt, from), lt(visits.createdAt, to));
    const [tot] = await db.select({ visits: sql<number>`count(*)::int`, uniq: sql<number>`count(distinct ${visits.userId})::int` }).from(visits).where(window);
    const per = await db
      .select({ merchantId: visits.merchantId, visits: sql<number>`count(*)::int`, uniq: sql<number>`count(distinct ${visits.userId})::int` })
      .from(visits)
      .where(window)
      .groupBy(visits.merchantId);
    return {
      total: { visits: Number(tot?.visits ?? 0), uniq: Number(tot?.uniq ?? 0) },
      per: new Map(per.map((p) => [p.merchantId, { visits: Number(p.visits), uniq: Number(p.uniq) }])),
    };
  }
  async function newMembers(from: Date, to: Date) {
    if (!ids.length || from >= to) return { total: 0, per: new Map<string, number>() };
    const rows = await db
      .select({ merchantId: merchantMembers.merchantId, n: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(inArray(merchantMembers.merchantId, ids), gte(merchantMembers.createdAt, from), lt(merchantMembers.createdAt, to)))
      .groupBy(merchantMembers.merchantId);
    const per = new Map(rows.map((r) => [r.merchantId, Number(r.n)]));
    return { total: [...per.values()].reduce((s, n) => s + n, 0), per };
  }

  const [during, before, joined, joinedBefore, progress, bonus] = await Promise.all([
    visitStats(start, end),
    visitStats(baseStart, start),
    newMembers(start, end),
    newMembers(baseStart, start),
    db
      .select({ participants: sql<number>`count(*)::int`, completions: sql<number>`count(${campaignProgress.completedAt})::int` })
      .from(campaignProgress)
      .where(eq(campaignProgress.campaignId, c.id)),
    db
      .select({ pts: sql<number>`coalesce(sum(${ledgerTransactions.points}), 0)::int` })
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.campaignId, c.id), eq(ledgerTransactions.type, "campaign_bonus"))),
  ]);

  // Came back within 30 days: null until the 30 days after the campaign have passed.
  const returnWindowEndsAt = new Date(c.endsAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
  let ret: { customers: number; returned: number } | null = null;
  let retBase: { customers: number; returned: number } | null = null;
  if (now >= returnWindowEndsAt) {
    const hoodShops = (await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.neighbourhoodId, c.neighbourhoodId))).map((m) => m.id);
    const fullLen = c.endsAt.getTime() - c.startsAt.getTime();
    [ret, retBase] = await Promise.all([
      returnedStats(db, ids, hoodShops, c.startsAt, c.endsAt),
      returnedStats(db, ids, hoodShops, new Date(c.startsAt.getTime() - fullLen), c.startsAt),
    ]);
  }
  const pctOf = (x: { customers: number; returned: number } | null) => (x && x.customers > 0 ? Math.round((x.returned / x.customers) * 1000) / 10 : null);

  const visitLiftPct = before.total.visits > 0 ? Math.round(((during.total.visits - before.total.visits) / before.total.visits) * 1000) / 10 : null;
  return {
    campaignId: c.id,
    window: { startsAt: start.toISOString(), endsAt: end.toISOString() },
    baselineWindow: { startsAt: baseStart.toISOString(), endsAt: start.toISOString() },
    visits: during.total.visits,
    baselineVisits: before.total.visits,
    visitLiftPct,
    uniqueCustomers: during.total.uniq,
    baselineUniqueCustomers: before.total.uniq,
    newMembers: joined.total,
    baselineNewMembers: joinedBefore.total,
    participants: Number(progress[0]?.participants ?? 0),
    completions: Number(progress[0]?.completions ?? 0),
    bonusPointsIssued: Number(bonus[0]?.pts ?? 0),
    returnedWithin30d: ret ? ret.returned : null,
    returnedWithin30dPct: pctOf(ret),
    returnWindowEndsAt: returnWindowEndsAt.toISOString(),
    baselineReturnedWithin30d: retBase ? retBase.returned : null,
    baselineReturnedWithin30dPct: pctOf(retBase),
    perMerchant: ms.map((m) => ({
      merchantId: m.id,
      name: m.name,
      visits: during.per.get(m.id)?.visits ?? 0,
      baselineVisits: before.per.get(m.id)?.visits ?? 0,
      uniqueCustomers: during.per.get(m.id)?.uniq ?? 0,
      newMembers: joined.per.get(m.id) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Prize draw (admin)
// ---------------------------------------------------------------------------
export function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export async function drawWinner(ctx: AppContext, id: string, opts: { redraw: boolean }): Promise<campaignsApi.DrawResult> {
  return ctx.db.transaction(async (tx) => {
    const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, id)).for("update").limit(1);
    if (!c) throw notFound("Campaign");
    if (c.status === "cancelled" || c.status === "draft") throw conflict("This campaign didn't run");
    if (ctx.now() < c.endsAt) throw conflict("The draw happens after the campaign ends");
    if (c.winnerUserId && !opts.redraw) throw conflict("A winner was already drawn; pass redraw: true to draw again");
    const conds = [eq(campaignProgress.campaignId, c.id), isNotNull(campaignProgress.completedAt), sql`${users.deletedAt} is null`];
    if (c.winnerUserId) conds.push(ne(campaignProgress.userId, c.winnerUserId));
    const eligible = await tx
      .select({ userId: campaignProgress.userId, name: users.name, phone: users.phone })
      .from(campaignProgress)
      .innerJoin(users, eq(users.id, campaignProgress.userId))
      .where(and(...conds))
      .orderBy(asc(campaignProgress.userId));
    if (!eligible.length) throw conflict("Nobody is eligible for the draw");
    const winner = eligible[randomInt(eligible.length)]!;
    const drawnAt = ctx.now();
    await tx.update(campaigns).set({ winnerUserId: winner.userId, drawnAt }).where(eq(campaigns.id, c.id));
    return {
      campaignId: c.id,
      eligibleCount: eligible.length,
      drawnAt: drawnAt.toISOString(),
      winner: { firstName: firstName(winner.name), maskedPhone: winner.phone ? maskPhone(winner.phone) : null },
    };
  });
}

// ---------------------------------------------------------------------------
// Neighbourhood managers (admin)
// ---------------------------------------------------------------------------
export async function addNeighbourhoodManager(ctx: AppContext, adminId: string, body: { neighbourhoodId: string; userId?: string; email?: string; phone?: string }) {
  const [hood] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, body.neighbourhoodId)).limit(1);
  if (!hood) throw notFound("Neighbourhood");
  const cond = body.userId
    ? eq(users.id, body.userId)
    : body.email
      ? sql`lower(${users.email}) = lower(${body.email})`
      : eq(users.phone, body.phone!);
  const [u] = await ctx.db.select().from(users).where(and(cond, sql`${users.deletedAt} is null`)).limit(1);
  if (!u) throw notFound("User");
  await ctx.db.insert(neighbourhoodManagers).values({ neighbourhoodId: hood.id, userId: u.id, createdBy: adminId }).onConflictDoNothing();
  return listNeighbourhoodManagers(ctx, hood.id);
}

export async function removeNeighbourhoodManager(ctx: AppContext, neighbourhoodId: string, userId: string) {
  await ctx.db.delete(neighbourhoodManagers).where(and(eq(neighbourhoodManagers.neighbourhoodId, neighbourhoodId), eq(neighbourhoodManagers.userId, userId)));
}

export async function listNeighbourhoodManagers(ctx: AppContext, neighbourhoodId?: string): Promise<campaignsApi.NeighbourhoodManager[]> {
  const rows = await ctx.db
    .select({ neighbourhoodId: neighbourhoodManagers.neighbourhoodId, userId: neighbourhoodManagers.userId, name: users.name, createdAt: neighbourhoodManagers.createdAt })
    .from(neighbourhoodManagers)
    .innerJoin(users, eq(users.id, neighbourhoodManagers.userId))
    .where(neighbourhoodId ? eq(neighbourhoodManagers.neighbourhoodId, neighbourhoodId) : undefined)
    .orderBy(asc(neighbourhoodManagers.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ---------------------------------------------------------------------------
// Lifecycle (job)
// ---------------------------------------------------------------------------
export async function runCampaignLifecycle(ctx: AppContext): Promise<void> {
  const now = ctx.now();
  await ctx.db.update(campaigns).set({ status: "ended" }).where(and(inArray(campaigns.status, RUNNING), lte(campaigns.endsAt, now)));
  await ctx.db.update(campaigns).set({ status: "live" }).where(and(eq(campaigns.status, "scheduled"), lte(campaigns.startsAt, now), gt(campaigns.endsAt, now)));
}
