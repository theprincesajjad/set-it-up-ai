/**
 * Promos owners can fully shape (wave N, promo team): CRUD with every field editable, pause / resume / duplicate / end early,
 * results per promo (sent, opened, claimed, redeemed, revenue), door-crasher spots (first come, never past the cap), the
 * customer's Deals inbox, and the customer-eye preview.
 *
 * Stamp effects are not posted here: plain promos are the earn engine's built-in boosts and targeted ones come from the
 * "promo:targeted" boost provider (services/promo-rules.ts). Announcements and reminders: services/promo-notify.ts.
 */
import { and, desc, eq, gte, inArray, isNull, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { catalogItems, ledgerTransactions, merchantCategories, merchantMembers, merchants, promoClaims, promoDeliveries, promos, services, users, type DbOrTx } from "@ll/db";
import { merchantApi, promosApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { randomCode } from "../lib/crypto.js";
import { writeAudit } from "./admin-audit.js";
import { assertBeautyClaims } from "./beauty-guard.js";
import { enabledFeaturesByMerchantId, promoFeature } from "./features.js";
import { promoAppliesAt } from "./ledger.js";
import { assertPharmacyText } from "./pharmacy-guard.js";
import { inSegment, segmentWhere } from "./promo-rules.js";

type PromoRow = typeof promos.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
type Body<T extends z.ZodType> = z.infer<T>;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function serializePromo(p: PromoRow): merchantApi.Promo {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    imageUrl: p.imageUrl,
    kind: p.kind,
    multiplierPct: p.multiplierPct,
    bonusPoints: p.bonusPoints,
    percentOff: p.percentOff,
    itemId: p.itemId,
    categoryId: p.categoryId,
    daysOfWeek: p.daysOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    startsAt: p.startsAt.toISOString(),
    endsAt: iso(p.endsAt),
    audience: p.audience as merchantApi.Promo["audience"],
    status: p.status,
    viewCount: p.viewCount,
    claimCount: p.claimCount,
    createdAt: p.createdAt.toISOString(),
    promoType: p.promoType as promosApi.PromoType,
    segment: p.segment as promosApi.PromoSegment,
    quantityCap: p.quantityCap,
    claimedCount: p.claimedCount,
    remaining: p.quantityCap == null ? null : Math.max(0, p.quantityCap - p.claimedCount),
    color: (p.color as promosApi.PromoColor | null) ?? null,
    holiday: p.holiday,
    itemIds: p.itemIds ?? [],
    channels: (p.channels ?? ["inbox", "push"]) as promosApi.PromoChannel[],
    notifyText: p.notifyText,
    pausedAt: iso(p.pausedAt),
    endedEarlyAt: iso(p.endedEarlyAt),
    duplicatedFrom: p.duplicatedFrom,
    announcedAt: iso(p.announcedAt),
  };
}

export async function listPromos(db: DbOrTx, merchantId: string, status?: merchantApi.PromoStatus) {
  const rows = await db
    .select()
    .from(promos)
    .where(and(eq(promos.merchantId, merchantId), status ? eq(promos.status, status) : undefined))
    .orderBy(desc(promos.startsAt));
  return rows.map(serializePromo);
}

export async function getPromo(db: DbOrTx, merchantId: string, id: string): Promise<PromoRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Promo");
  const [p] = await db.select().from(promos).where(and(eq(promos.id, id), eq(promos.merchantId, merchantId))).limit(1);
  if (!p) throw notFound("Promo");
  return p;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
type Shape = Partial<typeof promos.$inferInsert> & Pick<PromoRow, "kind" | "startsAt">;

async function checkText(ctx: AppContext, merchant: Pick<Merchant, "vertical">, p: { title?: string | null; body?: string | null; notifyText?: string | null }) {
  for (const [text, what] of [[p.title, "The promo title"], [p.body, "The promo text"], [p.notifyText, "The notification text"]] as const) {
    assertPharmacyText(merchant, text, what);
    assertBeautyClaims(merchant, text, what);
  }
}

async function validate(db: DbOrTx, merchantId: string, p: Shape, claimed = 0) {
  if (p.kind === "multiplier" && !p.multiplierPct) throw badRequest("Double stamps need a multiplier (200 = double).");
  if (p.kind === "bonus_points" && !p.bonusPoints) throw badRequest("Bonus stamps need how many extra.");
  if (p.kind === "discount" && !p.percentOff) throw badRequest("Discount promos need percentOff");
  if (p.endsAt && p.endsAt <= p.startsAt) throw badRequest("End must be after start");
  if (p.startTime && p.endTime && p.endTime <= p.startTime) throw badRequest("End time must be after start time");
  if ((p.startTime && !p.endTime) || (!p.startTime && p.endTime)) throw badRequest("Set both a start and an end time, or neither.");
  if (p.promoType === "door_crasher" && !p.quantityCap) throw badRequest("A door crasher needs a number of spots.");
  if (p.quantityCap != null && p.quantityCap < claimed) throw conflict(`${claimed} spots are already taken; the limit can't go below that.`);
  if (p.promoType === "happy_hour" && !(p.daysOfWeek?.length || p.startTime)) throw badRequest("A happy hour needs days or hours.");
  if (p.categoryId) {
    const [c] = await db.select().from(merchantCategories).where(and(eq(merchantCategories.id, p.categoryId), eq(merchantCategories.merchantId, merchantId))).limit(1);
    if (!c) throw badRequest("Unknown category");
    if ((p.kind === "multiplier" || p.kind === "bonus_points") && !c.earnEligible) throw new HttpError(422, "regulated_category", `${c.name} can't earn or be boosted.`);
    if (p.kind === "discount" && !c.discountEligible) throw new HttpError(422, "regulated_category", `${c.name} can't be discounted.`);
  }
  if (p.itemIds?.length) {
    const ids = [...new Set(p.itemIds)];
    const [a, b] = await Promise.all([
      db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchantId), inArray(services.id, ids))),
      db.select({ id: catalogItems.id }).from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), inArray(catalogItems.id, ids))),
    ]);
    if (a.length + b.length !== ids.length) throw badRequest("One of the services or items isn't on your list any more.");
  }
}

/** Normalise the wave-n fields: inbox is always on, never SMS, segment promos stay off the public feed. */
function normalise(set: Partial<typeof promos.$inferInsert>) {
  if (set.channels) set.channels = [...new Set(["inbox", ...set.channels.filter((c) => (promosApi.PROMO_CHANNELS as readonly string[]).includes(c))])];
  if (set.segment && set.segment !== "everyone") set.audience = "members";
  if (set.itemIds) set.itemIds = [...new Set(set.itemIds)];
  if (set.promoType && set.promoType !== "door_crasher" && set.quantityCap === undefined) {
    /* keep the cap as sent */
  }
  return set;
}

export async function createPromo(ctx: AppContext, merchant: Merchant, actorUserId: string, body: Body<typeof merchantApi.createPromoBody>) {
  const { publish, startsAt, endsAt, ...rest } = body;
  const shape = normalise({ ...rest, startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : null }) as Shape;
  await checkText(ctx, merchant, rest);
  await validate(ctx.db, merchant.id, shape);
  const now = ctx.now();
  if (publish && shape.endsAt && shape.endsAt <= now) throw badRequest("This promo would already be over");
  const status = publish ? (shape.startsAt <= now ? "live" : "scheduled") : "draft";
  const [p] = await ctx.db.insert(promos).values({ ...(shape as typeof promos.$inferInsert), merchantId: merchant.id, status }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.created", entity: "promo", entityId: p!.id, data: { status, promoType: p!.promoType, ai: !!p!.aiGenerationId } });
  if (status !== "draft") await afterPublish(ctx, p!);
  return serializePromo(p!);
}

export async function updatePromo(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, body: Body<typeof merchantApi.updatePromoBody>) {
  const cur = await getPromo(ctx.db, merchant.id, id);
  if (cur.status === "ended" || cur.status === "archived") throw conflict(`An ${cur.status} promo can't be edited`);
  const { startsAt, endsAt, ...rest } = body;
  const set = normalise({ ...rest });
  if (startsAt !== undefined) set.startsAt = new Date(startsAt);
  if (endsAt !== undefined) set.endsAt = endsAt ? new Date(endsAt) : null;
  if (cur.status === "live" && set.endsAt && set.endsAt <= ctx.now()) throw badRequest("Use End early to stop it now.");
  await checkText(ctx, merchant, rest);
  await validate(ctx.db, merchant.id, { ...cur, ...set } as Shape, cur.claimedCount);
  const [p] = await ctx.db.update(promos).set(set).where(eq(promos.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.updated", entity: "promo", entityId: id, data: body });
  return serializePromo(p!);
}

export async function transitionPromo(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, to: merchantApi.PromoStatus) {
  const cur = await getPromo(ctx.db, merchant.id, id);
  if (cur.status === to) return serializePromo(cur);
  if (!merchantApi.PROMO_TRANSITIONS[cur.status].includes(to)) {
    throw new HttpError(409, "invalid_transition", `Can't move a promo from ${cur.status} to ${to}`, { from: cur.status, to, allowed: merchantApi.PROMO_TRANSITIONS[cur.status] });
  }
  const now = ctx.now();
  const set: Partial<typeof promos.$inferInsert> = { status: to };
  if (to === "live" && cur.startsAt > now) set.startsAt = now;
  if (to === "scheduled" && cur.endsAt && cur.endsAt <= now) throw badRequest("This promo's end date has passed");
  if (to === "scheduled" && cur.startsAt <= now) set.status = "live";
  if (to === "ended" && (!cur.endsAt || cur.endsAt > now)) set.endsAt = now;
  const [p] = await ctx.db.update(promos).set(set).where(eq(promos.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.status_changed", entity: "promo", entityId: id, data: { from: cur.status, to: p!.status } });
  if (p!.status === "live" || p!.status === "scheduled") await afterPublish(ctx, p!);
  if (p!.status === "ended") await afterEnd(ctx, p!);
  return serializePromo(p!);
}

/** Pause (customers stop seeing it, no boost, no notifications), resume, end early. */
export async function promoAction(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string, action: promosApi.PromoAction) {
  const cur = await getPromo(ctx.db, merchant.id, id);
  const now = ctx.now();
  let set: Partial<typeof promos.$inferInsert>;
  if (action === "pause") {
    if (cur.status !== "live" && cur.status !== "scheduled") throw conflict("Only a running or scheduled promo can be paused.");
    if (cur.pausedAt) return serializePromo(cur);
    set = { pausedAt: now };
  } else if (action === "resume") {
    if (!cur.pausedAt) return serializePromo(cur);
    if (cur.endsAt && cur.endsAt <= now) throw conflict("This promo's end date has passed. Duplicate it to run it again.");
    set = { pausedAt: null };
  } else {
    if (cur.status !== "live" && cur.status !== "scheduled") throw conflict("Only a running or scheduled promo can be ended.");
    set = { status: "ended", endsAt: now, endedEarlyAt: now, pausedAt: null };
  }
  const [p] = await ctx.db.update(promos).set(set).where(eq(promos.id, id)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: `promo.${action}`, entity: "promo", entityId: id });
  if (action === "resume") await afterPublish(ctx, p!);
  else await afterEnd(ctx, p!);
  return serializePromo(p!);
}

/** A copy as a draft: same shape, fresh dates (starts now, same length), no results. */
export async function duplicatePromo(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string) {
  const cur = await getPromo(ctx.db, merchant.id, id);
  const now = ctx.now();
  const length = cur.endsAt ? cur.endsAt.getTime() - cur.startsAt.getTime() : null;
  const { id: _id, createdAt: _c, status: _s, viewCount: _v, claimCount: _cc, claimedCount: _cl, pausedAt: _p, endedEarlyAt: _e, announcedAt: _a, remindedAt: _r, aiGenerationId: _g, ...copy } = cur;
  const [p] = await ctx.db
    .insert(promos)
    .values({ ...copy, title: `${cur.title}`.slice(0, 120), status: "draft", startsAt: now, endsAt: length ? new Date(now.getTime() + length) : null, duplicatedFrom: cur.id })
    .returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.duplicated", entity: "promo", entityId: p!.id, data: { from: cur.id } });
  return serializePromo(p!);
}

export async function deletePromo(ctx: AppContext, merchant: Merchant, actorUserId: string, id: string) {
  const cur = await getPromo(ctx.db, merchant.id, id);
  if (cur.status !== "draft") throw conflict("Only drafts can be deleted. Archive this promo instead.");
  await ctx.db.delete(promos).where(eq(promos.id, id));
  await writeAudit(ctx.db, { actorUserId, merchantId: merchant.id, action: "promo.deleted", entity: "promo", entityId: id });
}

async function afterPublish(ctx: AppContext, p: PromoRow) {
  const { announcePromo } = await import("./promo-notify.js");
  await announcePromo(ctx, p.id).catch((err) => {
    if (ctx.config.env !== "test") console.error("[promos] announce failed", err);
  });
}
async function afterEnd(ctx: AppContext, p: PromoRow) {
  const { refreshDealPasses } = await import("./promo-notify.js");
  await refreshDealPasses(ctx, p.merchantId).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Results and audience
// ---------------------------------------------------------------------------
export async function promoResults(ctx: AppContext, merchantId: string, id: string): Promise<promosApi.PromoResults> {
  const p = await getPromo(ctx.db, merchantId, id);
  const d = await ctx.db
    .select({ channel: promoDeliveries.channel, status: promoDeliveries.status, skip: promoDeliveries.skipReason, opened: sql<number>`count(${promoDeliveries.openedAt})::int`, n: sql<number>`count(*)::int` })
    .from(promoDeliveries)
    .where(eq(promoDeliveries.promoId, id))
    .groupBy(promoDeliveries.channel, promoDeliveries.status, promoDeliveries.skipReason);
  const sent = d.filter((x) => x.status === "sent");
  const by = (c: string) => sent.filter((x) => x.channel === c).reduce((s, x) => s + Number(x.n), 0);
  const [c] = await ctx.db
    .select({ claimed: sql<number>`count(*)::int`, redeemed: sql<number>`count(*) filter (where ${promoClaims.status} = 'redeemed')::int`, cents: sql<number>`coalesce(sum(${promoClaims.amountCents}) filter (where ${promoClaims.status} = 'redeemed'),0)::bigint` })
    .from(promoClaims)
    .where(eq(promoClaims.promoId, id));
  const [l] = await ctx.db
    .select({ cents: sql<number>`coalesce(sum(${ledgerTransactions.amountCents}),0)::bigint` })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.promoId, id), eq(ledgerTransactions.type, "earn"), isNull(ledgerTransactions.reversedAt)));
  return {
    promoId: id,
    sent: sent.reduce((s, x) => s + Number(x.n), 0),
    opened: d.reduce((s, x) => s + Number(x.opened), 0),
    claimed: Number(c?.claimed ?? 0),
    redeemed: Number(c?.redeemed ?? 0),
    revenueCents: Number(c?.cents ?? 0) + Number(l?.cents ?? 0),
    skippedByCap: d.filter((x) => x.status === "skipped" && x.skip === "cap").reduce((s, x) => s + Number(x.n), 0),
    remaining: p.quantityCap == null ? null : Math.max(0, p.quantityCap - p.claimedCount),
    byChannel: { push: by("push"), webPush: by("web_push"), email: by("email"), inbox: by("inbox") },
  };
}

export async function audiencePreview(ctx: AppContext, merchant: Merchant, segment: promosApi.PromoSegment): Promise<promosApi.PromoAudiencePreview> {
  const where = segmentWhere(segment, merchant.id, ctx.now(), merchant.timezone || "America/Toronto");
  const [r] = await ctx.db
    .select({
      members: sql<number>`count(*)::int`,
      reachable: sql<number>`count(*) filter (where ${merchantMembers.marketingConsentAt} is not null and ${merchantMembers.muted} = false)::int`,
    })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(where, isNull(users.deletedAt)));
  return { segment, members: Number(r?.members ?? 0), reachable: Number(r?.reachable ?? 0) };
}

// ---------------------------------------------------------------------------
// Door crasher spots and counter redemptions
// ---------------------------------------------------------------------------
/**
 * Take one spot: a single guarded UPDATE (never past quantity_cap; the row lock serialises concurrent takers) and the claim
 * row in the same transaction (one per member: a second try rolls the spot back).
 */
async function takeSpot(ctx: AppContext, p: PromoRow, member: { id: string; userId: string }, redeemed: { by: string; amountCents: number | null } | null) {
  return ctx.db.transaction(async (tx) => {
    const now = ctx.now();
    const [upd] = await tx
      .update(promos)
      .set({ claimedCount: sql`${promos.claimedCount} + 1`, claimCount: sql`${promos.claimCount} + 1` })
      .where(and(eq(promos.id, p.id), eq(promos.status, "live"), isNull(promos.pausedAt), lte(promos.startsAt, now), or(isNull(promos.quantityCap), sql`${promos.claimedCount} < ${promos.quantityCap}`)))
      .returning({ claimedCount: promos.claimedCount, quantityCap: promos.quantityCap });
    if (!upd) {
      if (p.quantityCap != null) throw new HttpError(409, "sold_out", "All the spots are gone.");
      throw conflict("This deal isn't running right now.");
    }
    const [claim] = await tx
      .insert(promoClaims)
      .values({ promoId: p.id, merchantId: p.merchantId, memberId: member.id, userId: member.userId, code: randomCode(6), status: redeemed ? "redeemed" : "claimed", amountCents: redeemed?.amountCents ?? null, redeemedAt: redeemed ? now : null, redeemedBy: redeemed?.by ?? null, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (!claim) throw new HttpError(409, "already_claimed", "You already have a spot for this one.");
    return { claim, remaining: upd.quantityCap == null ? null : Math.max(0, upd.quantityCap - upd.claimedCount) };
  });
}

/** Customer: claim a spot (door crasher). Needs a membership at the shop. */
export async function claimDeal(ctx: AppContext, userId: string, promoId: string): Promise<promosApi.ClaimResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(promoId)) throw notFound("Deal");
  const [p] = await ctx.db.select().from(promos).where(eq(promos.id, promoId)).limit(1);
  if (!p) throw notFound("Deal");
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.merchantId, p.merchantId), eq(merchantMembers.userId, userId))).limit(1);
  if (!m) throw new HttpError(403, "join_first", "Join this shop's rewards first.");
  const [existing] = await ctx.db.select().from(promoClaims).where(and(eq(promoClaims.promoId, p.id), eq(promoClaims.memberId, m.id))).limit(1);
  if (existing) return { claim: { code: existing.code, status: existing.status as "claimed" | "redeemed" }, remaining: p.quantityCap == null ? null : Math.max(0, p.quantityCap - p.claimedCount) };
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, p.merchantId)).limit(1);
  const tz = merchant?.timezone || "America/Toronto";
  const [u] = await ctx.db.select({ birthday: users.birthday }).from(users).where(eq(users.id, userId)).limit(1);
  if (!inSegment(p.segment, { ...m, birthday: u?.birthday ?? null }, ctx.now(), tz)) throw new HttpError(403, "not_eligible", "This deal is for other customers.");
  const r = await takeSpot(ctx, p, m, null);
  await ctx.db.update(promoDeliveries).set({ openedAt: ctx.now() }).where(and(eq(promoDeliveries.promoId, p.id), eq(promoDeliveries.memberId, m.id), isNull(promoDeliveries.openedAt)));
  return { claim: { code: r.claim.code, status: "claimed" }, remaining: r.remaining };
}

/** Staff at the counter: redeem by claim code or member. A held spot is used; otherwise a new spot is taken (if any are left). */
export async function redeemPromo(ctx: AppContext, merchant: Merchant, staffUserId: string, id: string, body: z.infer<typeof promosApi.redeemPromoBody>) {
  const p = await getPromo(ctx.db, merchant.id, id);
  if (!body.memberId && !body.code) throw badRequest("Scan the customer or enter their code.");
  const [claim] = await ctx.db
    .select()
    .from(promoClaims)
    .where(and(eq(promoClaims.promoId, p.id), body.code ? eq(promoClaims.code, body.code.toUpperCase()) : eq(promoClaims.memberId, body.memberId!)))
    .limit(1);
  const now = ctx.now();
  if (claim) {
    if (claim.status === "redeemed") throw new HttpError(409, "already_redeemed", "Already used.");
    const [done] = await ctx.db.update(promoClaims).set({ status: "redeemed", redeemedAt: now, redeemedBy: staffUserId, amountCents: body.amountCents ?? null }).where(and(eq(promoClaims.id, claim.id), eq(promoClaims.status, "claimed"))).returning();
    if (!done) throw new HttpError(409, "already_redeemed", "Already used.");
    await writeAudit(ctx.db, { actorUserId: staffUserId, merchantId: merchant.id, action: "promo.redeemed", entity: "promo", entityId: p.id, data: { claimId: claim.id } });
    return { status: "redeemed" as const, remaining: p.quantityCap == null ? null : Math.max(0, p.quantityCap - p.claimedCount) };
  }
  if (body.code) throw notFound("Claim code");
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId!), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Member");
  const r = await takeSpot(ctx, p, m, { by: staffUserId, amountCents: body.amountCents ?? null });
  await writeAudit(ctx.db, { actorUserId: staffUserId, merchantId: merchant.id, action: "promo.redeemed", entity: "promo", entityId: p.id, data: { claimId: r.claim.id } });
  return { status: "redeemed" as const, remaining: r.remaining };
}

// ---------------------------------------------------------------------------
// The customer's Deals inbox
// ---------------------------------------------------------------------------
const UPCOMING_DAYS = 7;

/** Deals for one person: running (or starting within a week) promos from shops they joined, that they are eligible for. */
export async function dealsFor(ctx: AppContext, userId: string, opts: { merchantId?: string } = {}): Promise<promosApi.DealsResponse> {
  const now = ctx.now();
  const mem = await ctx.db
    .select({ member: merchantMembers, merchant: merchants })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(and(eq(merchantMembers.userId, userId), ne(merchants.status, "closed"), opts.merchantId ? eq(merchants.id, opts.merchantId) : undefined));
  if (!mem.length) return { items: [] };
  const rows = await ctx.db
    .select()
    .from(promos)
    .where(
      and(
        inArray(promos.merchantId, mem.map((x) => x.merchant.id)),
        inArray(promos.status, ["live", "scheduled"]),
        isNull(promos.pausedAt),
        lte(promos.startsAt, new Date(now.getTime() + UPCOMING_DAYS * 86_400_000)),
        or(isNull(promos.endsAt), sql`${promos.endsAt} > ${now.toISOString()}::timestamptz`),
      ),
    )
    .orderBy(promos.startsAt);
  if (!rows.length) return { items: [] };
  const on = await enabledFeaturesByMerchantId(ctx.db, [...new Set(rows.map((p) => p.merchantId))], ["promos.basic", "promos.double_points"]);
  const [u] = await ctx.db.select({ birthday: users.birthday }).from(users).where(eq(users.id, userId)).limit(1);
  const ids = rows.map((p) => p.id);
  const [claims, deliveries] = await Promise.all([
    ctx.db.select().from(promoClaims).where(and(eq(promoClaims.userId, userId), inArray(promoClaims.promoId, ids))),
    ctx.db.select({ promoId: promoDeliveries.promoId, openedAt: promoDeliveries.openedAt, status: promoDeliveries.status }).from(promoDeliveries).where(and(eq(promoDeliveries.userId, userId), inArray(promoDeliveries.promoId, ids))),
  ]);
  const byShop = new Map(mem.map((x) => [x.merchant.id, x]));
  const items: promosApi.DealDto[] = [];
  for (const p of rows) {
    const x = byShop.get(p.merchantId)!;
    if (!on.get(p.merchantId)?.has(promoFeature(p.kind))) continue;
    const tz = x.merchant.timezone || "America/Toronto";
    if (!inSegment(p.segment, { ...x.member, birthday: u?.birthday ?? null }, now, tz)) continue;
    const upcoming = p.startsAt > now;
    // Only door crashers are shown ahead of time (a countdown); other promos appear when they start.
    if (upcoming && p.promoType !== "door_crasher") continue;
    const claim = claims.find((c) => c.promoId === p.id);
    const sent = deliveries.filter((d) => d.promoId === p.id && d.status === "sent");
    items.push(dealDto(p, x.merchant, x.member.id, now, tz, { claim: claim ? { code: claim.code, status: claim.status as "claimed" | "redeemed" } : null, unread: sent.some((d) => !d.openedAt), optedIn: !!x.member.marketingConsentAt && !x.member.muted }));
  }
  items.sort((a, b) => Number(b.activeNow) - Number(a.activeNow) || Number(b.unread) - Number(a.unread) || a.startsAt.localeCompare(b.startsAt));
  return { items };
}

export function dealDto(p: PromoRow, m: Merchant, memberId: string | null, now: Date, tz: string, extra: { claim: promosApi.DealDto["claim"]; unread: boolean; optedIn: boolean }): promosApi.DealDto {
  return {
    id: p.id,
    merchant: { id: m.id, name: m.name, slug: m.slug, brandColor: m.brandColor ?? null, vertical: m.vertical, logoUrl: m.logoUrl ?? null },
    memberId,
    title: p.title,
    body: p.body,
    imageUrl: p.imageUrl,
    color: (p.color as promosApi.PromoColor | null) ?? null,
    promoType: p.promoType as promosApi.PromoType,
    kind: p.kind,
    multiplierPct: p.multiplierPct,
    bonusPoints: p.bonusPoints,
    percentOff: p.percentOff,
    daysOfWeek: p.daysOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    startsAt: p.startsAt.toISOString(),
    endsAt: iso(p.endsAt),
    activeNow: promoAppliesAt(p, now, tz) && !p.pausedAt,
    upcoming: p.startsAt > now,
    quantityCap: p.quantityCap,
    remaining: p.quantityCap == null ? null : Math.max(0, p.quantityCap - p.claimedCount),
    ...extra,
  };
}

/** Owner preview: the deal exactly as a customer sees it (the same DTO the Deals inbox renders). */
export async function previewDeal(ctx: AppContext, merchant: Merchant, id: string): Promise<promosApi.DealDto> {
  const p = await getPromo(ctx.db, merchant.id, id);
  return dealDto(p, merchant, null, ctx.now(), merchant.timezone || "America/Toronto", { claim: null, unread: true, optedIn: true });
}

/** The customer opened a deal (Deals inbox or a notification link): counts as opened in the results. */
export async function openDeal(ctx: AppContext, userId: string, promoId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(promoId)) throw notFound("Deal");
  await ctx.db.update(promoDeliveries).set({ openedAt: ctx.now() }).where(and(eq(promoDeliveries.promoId, promoId), eq(promoDeliveries.userId, userId), isNull(promoDeliveries.openedAt), eq(promoDeliveries.status, "sent")));
  return { ok: true };
}

/** The deal a wallet pass shows: the newest running deal from a shop this person opted in to. */
export async function currentDealForUser(ctx: AppContext, userId: string, merchantId?: string): Promise<{ shop: string; title: string; id: string } | null> {
  const now = ctx.now();
  const [r] = await ctx.db
    .select({ id: promos.id, title: promos.title, shop: merchants.name })
    .from(promos)
    .innerJoin(merchants, eq(merchants.id, promos.merchantId))
    .innerJoin(merchantMembers, and(eq(merchantMembers.merchantId, promos.merchantId), eq(merchantMembers.userId, userId)))
    .where(
      and(
        eq(promos.status, "live"),
        isNull(promos.pausedAt),
        eq(promos.segment, "everyone"),
        ...(merchantId ? [eq(promos.merchantId, merchantId)] : []),
        isNotNull(merchantMembers.marketingConsentAt),
        eq(merchantMembers.muted, false),
        lte(promos.startsAt, now),
        or(isNull(promos.endsAt), gte(promos.endsAt, now)),
      ),
    )
    .orderBy(desc(promos.startsAt))
    .limit(1);
  return r ?? null;
}
