/**
 * Platform admin: network dashboard, feature rollout control (stages +
 * per-merchant overrides), plan availability, neighbourhoods, network perks,
 * merchants, users, platform roles and the audit log.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, like, lte, or, sql } from "drizzle-orm";
import {
  auditLogs,
  featureInterest,
  featureOverrides,
  featureRollouts,
  locations,
  merchantMembers,
  merchantStaff,
  merchants,
  neighbourhoods,
  networkPerkAwards,
  networkPerks,
  users,
  visits,
  type DbOrTx,
} from "@ll/db";
import { FEATURE_KEYS, FEATURES, FREE_FOREVER, PLAN_IDS, PLANS, isPlanAvailable, type FeatureKey, type PlanId, type RolloutStage, adminApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { getRolloutStages } from "./features.js";
import { iso, requirePhone } from "./merchant.js";
import { decodeCursor, encodeCursor } from "./merchant-customers.js";
import { localDate } from "./messaging.js";

const DAY = 86400000;
const num = (v: unknown) => Number(v ?? 0);
const likeOf = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
/** Monday (YYYY-MM-DD) of the week containing a local date. */
function mondayOf(localYmd: string): string {
  const d = new Date(`${localYmd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

export async function networkDashboard(ctx: AppContext): Promise<adminApi.NetworkDashboard> {
  const db = ctx.db;
  const [all, byVertical, byHood, [cust], weekly] = await Promise.all([
    db.select({ status: merchants.status, plan: merchants.plan, activated: sql<boolean>`${merchants.activatedAt} is not null` }).from(merchants),
    db.select({ vertical: merchants.vertical, n: count() }).from(merchants).groupBy(merchants.vertical).orderBy(desc(count())),
    db
      .select({
        id: merchants.neighbourhoodId,
        name: neighbourhoods.name,
        n: count(),
        activated: sql<number>`count(*) filter (where ${merchants.activatedAt} is not null)::int`,
      })
      .from(merchants)
      .leftJoin(neighbourhoods, eq(neighbourhoods.id, merchants.neighbourhoodId))
      .groupBy(merchants.neighbourhoodId, neighbourhoods.name)
      .orderBy(desc(count())),
    db
      .select({ customers: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where t.n >= 2)::int`, memberships: sql<number>`coalesce(sum(t.n), 0)::int` })
      .from(sql`(select ${merchantMembers.userId}, count(*) as n from ${merchantMembers} group by ${merchantMembers.userId}) t`),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${visits.createdAt} at time zone 'America/Toronto'), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
        users: sql<number>`count(distinct ${visits.userId})::int`,
      })
      .from(visits)
      .where(gte(visits.createdAt, new Date(ctx.now().getTime() - 8 * 7 * DAY)))
      .groupBy(sql`1`),
  ]);
  const byStatus = { onboarding: 0, active: 0, paused: 0, closed: 0 };
  const byPlan = { free: 0, plus: 0, pro: 0 } as Record<PlanId, number>;
  let activated = 0;
  for (const m of all) {
    byStatus[m.status]++;
    byPlan[m.plan]++;
    if (m.activated) activated++;
  }
  const weekMap = new Map(weekly.map((w) => [w.week, w]));
  const thisMonday = mondayOf(localDate(ctx.now(), "America/Toronto"));
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(new Date(`${thisMonday}T12:00:00Z`).getTime() - (7 - i) * 7 * DAY).toISOString().slice(0, 10));
  const customers = num(cust?.customers);
  const notClosed = all.length - byStatus.closed;
  return {
    merchants: {
      total: all.length,
      byStatus,
      byVertical: byVertical.map((v) => ({ vertical: v.vertical, count: num(v.n) })),
      byNeighbourhood: byHood.map((h) => ({ neighbourhoodId: h.id, name: h.name ?? "No neighbourhood", merchants: num(h.n), activated: num(h.activated) })),
      byPlan,
    },
    activatedMerchants: activated,
    activationRate: notClosed ? Math.round((activated / notClosed) * 1000) / 1000 : 0,
    customers,
    multiShopCustomers: num(cust?.multi),
    multiShopPct: customers ? Math.round((num(cust?.multi) / customers) * 1000) / 1000 : 0,
    memberships: num(cust?.memberships),
    weeklyVisits: weeks.map((w) => ({ weekStart: w, visits: num(weekMap.get(w)?.n), activeCustomers: num(weekMap.get(w)?.users) })),
  };
}

// ---------------------------------------------------------------------------
// Feature rollout
// ---------------------------------------------------------------------------
const isFeatureKey = (k: string): k is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(k);
export function requireFeatureKey(k: string): FeatureKey {
  if (!isFeatureKey(k)) throw notFound("Feature");
  return k;
}
const freeForeverError = (key: FeatureKey) =>
  new HttpError(422, "free_forever", `${FEATURES[key].name} is free forever and must stay available to every merchant (stage "ga", no opt-outs).`, { key });

export async function listFeatures(ctx: AppContext): Promise<adminApi.AdminFeature[]> {
  const [rows, ov, [active], interest] = await Promise.all([
    ctx.db.select().from(featureRollouts),
    ctx.db
      .select({ key: featureOverrides.key, enabled: sql<number>`count(*) filter (where ${featureOverrides.enabled})::int`, disabled: sql<number>`count(*) filter (where not ${featureOverrides.enabled})::int` })
      .from(featureOverrides)
      .groupBy(featureOverrides.key),
    ctx.db.select({ n: count() }).from(merchants).where(eq(merchants.status, "active")),
    ctx.db.select({ key: featureInterest.featureKey, n: count() }).from(featureInterest).groupBy(featureInterest.featureKey),
  ]);
  const interestMap = new Map(interest.map((i) => [i.key, num(i.n)]));
  const stored = new Map(rows.map((r) => [r.key, r]));
  const ovMap = new Map(ov.map((o) => [o.key, o]));
  const activeMerchants = num(active?.n);
  return FEATURE_KEYS.map((key) => {
    const def = FEATURES[key];
    const row = stored.get(key);
    const o = ovMap.get(key);
    return {
      key,
      name: def.name,
      description: def.description,
      minPlan: def.minPlan,
      phase: def.phase,
      stage: (row?.stage as RolloutStage) ?? def.defaultStage,
      defaultStage: def.defaultStage,
      freeForever: FREE_FOREVER.includes(key),
      unlockAtMerchants: def.unlockAtMerchants,
      activeMerchants,
      readyToUnlock: activeMerchants >= def.unlockAtMerchants,
      overrides: { enabled: num(o?.enabled), disabled: num(o?.disabled) },
      interestCount: interestMap.get(key) ?? 0,
      note: row?.note ?? null,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: iso(row?.updatedAt ?? null),
    };
  });
}

export async function setFeatureStage(ctx: AppContext, actorUserId: string, key: FeatureKey, stage: RolloutStage, note?: string) {
  if (FREE_FOREVER.includes(key) && stage !== "ga") throw freeForeverError(key);
  const before = (await getRolloutStages(ctx.db))[key];
  await ctx.db
    .insert(featureRollouts)
    .values({ key, stage, note: note ?? null, updatedBy: actorUserId, updatedAt: ctx.now() })
    .onConflictDoUpdate({ target: featureRollouts.key, set: { stage, note: note ?? null, updatedBy: actorUserId, updatedAt: ctx.now() } });
  await writeAudit(ctx.db, { actorUserId, action: "feature.stage_changed", entity: "feature", entityId: key, data: { from: before, to: stage, note: note ?? null } });
  return (await listFeatures(ctx)).find((f) => f.key === key)!;
}

export async function listOverrides(ctx: AppContext, key: FeatureKey): Promise<adminApi.FeatureOverride[]> {
  const rows = await ctx.db
    .select({ o: featureOverrides, name: merchants.name })
    .from(featureOverrides)
    .innerJoin(merchants, eq(merchants.id, featureOverrides.merchantId))
    .where(eq(featureOverrides.key, key))
    .orderBy(asc(merchants.name));
  return rows.map(({ o, name }) => ({ key, merchantId: o.merchantId, merchantName: name, enabled: o.enabled, reason: o.reason, createdAt: o.createdAt.toISOString() }));
}

export async function setOverride(ctx: AppContext, actorUserId: string, key: FeatureKey, body: z.infer<typeof adminApi.featureOverrideBody>) {
  if (FREE_FOREVER.includes(key) && !body.enabled) throw freeForeverError(key);
  const [m] = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, body.merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  await ctx.db
    .insert(featureOverrides)
    .values({ merchantId: body.merchantId, key, enabled: body.enabled, reason: body.reason ?? null, createdAt: ctx.now() })
    .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled: body.enabled, reason: body.reason ?? null } });
  await writeAudit(ctx.db, { actorUserId, merchantId: body.merchantId, action: "feature.override_set", entity: "feature", entityId: key, data: { enabled: body.enabled, reason: body.reason ?? null } });
  return listOverrides(ctx, key);
}

export async function removeOverride(ctx: AppContext, actorUserId: string, key: FeatureKey, merchantId: string) {
  const r = await ctx.db.delete(featureOverrides).where(and(eq(featureOverrides.key, key), eq(featureOverrides.merchantId, merchantId))).returning();
  if (!r.length) throw notFound("Override");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "feature.override_removed", entity: "feature", entityId: key });
}

export async function planAvailability(ctx: AppContext): Promise<adminApi.PlanAvailability[]> {
  const stages = await getRolloutStages(ctx.db);
  return PLAN_IDS.map((id) => ({
    id,
    name: PLANS[id].name,
    priceCents: PLANS[id].priceCents,
    available: isPlanAvailable(id, stages),
    features: FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === id).map((k) => ({ key: k, stage: stages[k] })),
  }));
}

// ---------------------------------------------------------------------------
// Neighbourhoods
// ---------------------------------------------------------------------------
type HoodRow = typeof neighbourhoods.$inferSelect;
async function hoodCounts(db: DbOrTx) {
  const rows = await db
    .select({ id: merchants.neighbourhoodId, n: count(), activated: sql<number>`count(*) filter (where ${merchants.activatedAt} is not null)::int` })
    .from(merchants)
    .groupBy(merchants.neighbourhoodId);
  return new Map(rows.map((r) => [r.id, r]));
}
const serializeHood = (h: HoodRow, c?: { n: number; activated: number }): adminApi.AdminNeighbourhood => ({
  id: h.id,
  slug: h.slug,
  name: h.name,
  city: h.city,
  province: h.province,
  status: h.status,
  centerLat: h.centerLat,
  centerLng: h.centerLng,
  radiusMetres: h.radiusMetres,
  biaName: h.biaName,
  biaContactName: h.biaContactName,
  biaContactEmail: h.biaContactEmail,
  biaContactPhone: h.biaContactPhone,
  storefrontEstimate: h.storefrontEstimate,
  notes: h.notes,
  merchants: num(c?.n),
  activatedMerchants: num(c?.activated),
  createdAt: h.createdAt.toISOString(),
});

export async function listNeighbourhoods(ctx: AppContext) {
  const [rows, counts] = await Promise.all([ctx.db.select().from(neighbourhoods).orderBy(asc(neighbourhoods.name)), hoodCounts(ctx.db)]);
  return rows.map((h) => serializeHood(h, counts.get(h.id)));
}

async function getHood(ctx: AppContext, id: string) {
  const [h] = await ctx.db.select().from(neighbourhoods).where(eq(neighbourhoods.id, id)).limit(1);
  if (!h) throw notFound("Neighbourhood");
  return serializeHood(h, (await hoodCounts(ctx.db)).get(h.id));
}

export async function createNeighbourhood(ctx: AppContext, actorUserId: string, body: z.infer<typeof adminApi.createNeighbourhoodBody>) {
  const values = { ...body, biaContactPhone: body.biaContactPhone ? requirePhone(body.biaContactPhone) : (body.biaContactPhone ?? null) };
  const [h] = await ctx.db.insert(neighbourhoods).values(values).onConflictDoNothing().returning();
  if (!h) throw conflict(`A neighbourhood with slug "${body.slug}" already exists`);
  await writeAudit(ctx.db, { actorUserId, action: "neighbourhood.created", entity: "neighbourhood", entityId: h.id, data: { slug: h.slug } });
  return getHood(ctx, h.id);
}

export async function updateNeighbourhood(ctx: AppContext, actorUserId: string, id: string, body: z.infer<typeof adminApi.updateNeighbourhoodBody>) {
  const set = { ...body };
  if (body.biaContactPhone) set.biaContactPhone = requirePhone(body.biaContactPhone);
  if (body.slug) {
    const [clash] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.slug, body.slug)).limit(1);
    if (clash && clash.id !== id) throw conflict(`A neighbourhood with slug "${body.slug}" already exists`);
  }
  const r = await ctx.db.update(neighbourhoods).set(set).where(eq(neighbourhoods.id, id)).returning({ id: neighbourhoods.id });
  if (!r.length) throw notFound("Neighbourhood");
  await writeAudit(ctx.db, { actorUserId, action: "neighbourhood.updated", entity: "neighbourhood", entityId: id, data: body });
  return getHood(ctx, id);
}

export async function deleteNeighbourhood(ctx: AppContext, actorUserId: string, id: string) {
  const h = await getHood(ctx, id);
  if (h.merchants > 0) throw conflict("Move this neighbourhood's merchants first");
  await ctx.db.delete(neighbourhoods).where(eq(neighbourhoods.id, id));
  await writeAudit(ctx.db, { actorUserId, action: "neighbourhood.deleted", entity: "neighbourhood", entityId: id, data: { slug: h.slug } });
}

// ---------------------------------------------------------------------------
// Network perks
// ---------------------------------------------------------------------------
type PerkRow = typeof networkPerks.$inferSelect;
async function perkAwards(db: DbOrTx) {
  const rows = await db.select({ id: networkPerkAwards.perkId, n: count() }).from(networkPerkAwards).groupBy(networkPerkAwards.perkId);
  return new Map(rows.map((r) => [r.id, num(r.n)]));
}
const serializePerk = (p: PerkRow, awards = 0): adminApi.NetworkPerk => ({
  id: p.id,
  neighbourhoodId: p.neighbourhoodId,
  name: p.name,
  description: p.description,
  ruleType: "distinct_merchants",
  threshold: p.threshold,
  windowDays: p.windowDays,
  bonusPoints: p.bonusPoints,
  active: p.active,
  awards,
  createdAt: p.createdAt.toISOString(),
});

export async function listPerks(ctx: AppContext, neighbourhoodId?: string) {
  const [rows, awards] = await Promise.all([
    ctx.db.select().from(networkPerks).where(neighbourhoodId ? eq(networkPerks.neighbourhoodId, neighbourhoodId) : undefined).orderBy(asc(networkPerks.createdAt)),
    perkAwards(ctx.db),
  ]);
  return rows.map((p) => serializePerk(p, awards.get(p.id)));
}

async function assertHood(ctx: AppContext, id: string | null | undefined) {
  if (!id) return;
  const [h] = await ctx.db.select({ id: neighbourhoods.id }).from(neighbourhoods).where(eq(neighbourhoods.id, id)).limit(1);
  if (!h) throw badRequest("Unknown neighbourhood");
}

export async function createPerk(ctx: AppContext, actorUserId: string, body: z.infer<typeof adminApi.createPerkBody>) {
  await assertHood(ctx, body.neighbourhoodId);
  const [p] = await ctx.db.insert(networkPerks).values({ ...body, neighbourhoodId: body.neighbourhoodId ?? null, description: body.description ?? null }).returning();
  await writeAudit(ctx.db, { actorUserId, action: "perk.created", entity: "network_perk", entityId: p!.id, data: body });
  return serializePerk(p!);
}

export async function updatePerk(ctx: AppContext, actorUserId: string, id: string, body: z.infer<typeof adminApi.updatePerkBody>) {
  await assertHood(ctx, body.neighbourhoodId);
  const [p] = await ctx.db.update(networkPerks).set(body).where(eq(networkPerks.id, id)).returning();
  if (!p) throw notFound("Perk");
  await writeAudit(ctx.db, { actorUserId, action: "perk.updated", entity: "network_perk", entityId: id, data: body });
  return serializePerk(p, (await perkAwards(ctx.db)).get(id));
}

/** Perks that were awarded are deactivated (award history is kept); unused ones are deleted. */
export async function deletePerk(ctx: AppContext, actorUserId: string, id: string) {
  const [p] = await ctx.db.select().from(networkPerks).where(eq(networkPerks.id, id)).limit(1);
  if (!p) throw notFound("Perk");
  const used = (await perkAwards(ctx.db)).get(id) ?? 0;
  if (used) await ctx.db.update(networkPerks).set({ active: false }).where(eq(networkPerks.id, id));
  else await ctx.db.delete(networkPerks).where(eq(networkPerks.id, id));
  await writeAudit(ctx.db, { actorUserId, action: used ? "perk.deactivated" : "perk.deleted", entity: "network_perk", entityId: id });
  return { deleted: !used, deactivated: !!used };
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------
async function memberCounts(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, { total: number; active: number }>();
  const rows = await db
    .select({ id: merchantMembers.merchantId, total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${merchantMembers.visitCount} >= 1)::int` })
    .from(merchantMembers)
    .where(inArray(merchantMembers.merchantId, ids))
    .groupBy(merchantMembers.merchantId);
  return new Map(rows.map((r) => [r.id, { total: num(r.total), active: num(r.active) }]));
}
type MerchantRow = typeof merchants.$inferSelect;
const serializeAdminMerchant = (m: MerchantRow, c?: { total: number; active: number }): adminApi.AdminMerchant => ({
  id: m.id,
  name: m.name,
  slug: m.slug,
  vertical: m.vertical,
  status: m.status,
  plan: m.plan,
  neighbourhoodId: m.neighbourhoodId,
  repUserId: m.repUserId,
  activatedAt: iso(m.activatedAt),
  members: c?.total ?? 0,
  activeMembers: c?.active ?? 0,
  createdAt: m.createdAt.toISOString(),
});

export async function listMerchants(ctx: AppContext, q: z.infer<typeof adminApi.listMerchantsQuery>) {
  const offset = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select()
    .from(merchants)
    .where(
      and(
        q.q ? or(ilike(merchants.name, likeOf(q.q)), ilike(merchants.slug, likeOf(q.q)), ilike(merchants.email, likeOf(q.q))) : undefined,
        q.status ? eq(merchants.status, q.status) : undefined,
        q.neighbourhoodId ? eq(merchants.neighbourhoodId, q.neighbourhoodId) : undefined,
        q.vertical ? eq(merchants.vertical, q.vertical) : undefined,
        q.plan ? eq(merchants.plan, q.plan) : undefined,
        q.repUserId ? eq(merchants.repUserId, q.repUserId) : undefined,
      ),
    )
    .orderBy(asc(merchants.name), asc(merchants.id))
    .limit(q.limit + 1)
    .offset(offset);
  const page = rows.slice(0, q.limit);
  const counts = await memberCounts(ctx.db, page.map((m) => m.id));
  return { items: page.map((m) => serializeAdminMerchant(m, counts.get(m.id))), nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

export async function getMerchant(ctx: AppContext, id: string): Promise<adminApi.AdminMerchantDetail> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  if (!m) throw notFound("Merchant");
  const [counts, staff, [locs], ov] = await Promise.all([
    memberCounts(ctx.db, [id]),
    ctx.db
      .select({ userId: merchantStaff.userId, name: users.name, email: users.email, role: merchantStaff.role })
      .from(merchantStaff)
      .innerJoin(users, eq(users.id, merchantStaff.userId))
      .where(eq(merchantStaff.merchantId, id)),
    ctx.db.select({ n: count() }).from(locations).where(eq(locations.merchantId, id)),
    ctx.db.select().from(featureOverrides).where(eq(featureOverrides.merchantId, id)),
  ]);
  return {
    ...serializeAdminMerchant(m, counts.get(id)),
    email: m.email,
    phone: m.phone,
    betaOptIn: m.betaOptIn,
    smsCreditsUsed: m.smsCreditsUsed,
    onboardingStep: m.onboardingStep,
    staff,
    locations: num(locs?.n),
    overrides: ov.map((o) => ({ key: o.key, enabled: o.enabled, reason: o.reason })),
  };
}

export async function setMerchantStatus(ctx: AppContext, actorUserId: string, id: string, status: MerchantRow["status"], reason: string) {
  const [cur] = await ctx.db.select({ status: merchants.status }).from(merchants).where(eq(merchants.id, id)).limit(1);
  if (!cur) throw notFound("Merchant");
  await ctx.db.update(merchants).set({ status, updatedAt: ctx.now() }).where(eq(merchants.id, id));
  await writeAudit(ctx.db, { actorUserId, merchantId: id, action: "merchant.status_changed", entity: "merchant", entityId: id, data: { from: cur.status, to: status, reason } });
  return getMerchant(ctx, id);
}

// ---------------------------------------------------------------------------
// Users + platform roles
// ---------------------------------------------------------------------------
export async function listUsers(ctx: AppContext, q: z.infer<typeof adminApi.listUsersQuery>) {
  const offset = decodeCursor(q.cursor);
  const digits = q.q?.replace(/\D/g, "") ?? "";
  const rows = await ctx.db
    .select({
      u: users,
      memberships: sql<number>`(select count(*)::int from ${merchantMembers} where ${merchantMembers.userId} = ${users.id})`,
      staffOf: sql<number>`(select count(*)::int from ${merchantStaff} where ${merchantStaff.userId} = ${users.id})`,
    })
    .from(users)
    .where(
      and(
        q.q
          ? or(ilike(users.name, likeOf(q.q)), ilike(users.email, likeOf(q.q)), digits.length >= 3 ? like(users.phone, `%${digits}%`) : undefined, eq(users.memberCode, q.q.toUpperCase()))
          : undefined,
        q.platformRole ? eq(users.platformRole, q.platformRole) : undefined,
      ),
    )
    .orderBy(desc(users.createdAt), asc(users.id))
    .limit(q.limit + 1)
    .offset(offset);
  const items: adminApi.AdminUser[] = rows.slice(0, q.limit).map(({ u, memberships, staffOf }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    memberCode: u.memberCode,
    platformRole: u.platformRole,
    memberships: num(memberships),
    staffOf: num(staffOf),
    deletedAt: iso(u.deletedAt),
    createdAt: u.createdAt.toISOString(),
  }));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

export async function setPlatformRole(ctx: AppContext, actorUserId: string, userId: string, role: "none" | "rep" | "admin") {
  if (userId === actorUserId && role !== "admin") throw badRequest("You can't remove your own admin role");
  const [cur] = await ctx.db.select({ role: users.platformRole, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (!cur || cur.deletedAt) throw notFound("User");
  await ctx.db.update(users).set({ platformRole: role, updatedAt: ctx.now() }).where(eq(users.id, userId));
  await writeAudit(ctx.db, { actorUserId, action: "user.platform_role_changed", entity: "user", entityId: userId, data: { from: cur.role, to: role } });
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  return { id: u!.id, platformRole: u!.platformRole };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function listAudit(ctx: AppContext, q: z.infer<typeof adminApi.listAuditQuery>) {
  const offset = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select({ a: auditLogs, actorName: users.name, actorEmail: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        q.merchantId ? eq(auditLogs.merchantId, q.merchantId) : undefined,
        q.actorUserId ? eq(auditLogs.actorUserId, q.actorUserId) : undefined,
        q.action ? (q.action.endsWith(".") ? like(auditLogs.action, `${q.action.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : eq(auditLogs.action, q.action)) : undefined,
        q.entity ? eq(auditLogs.entity, q.entity) : undefined,
        q.from ? gte(auditLogs.createdAt, new Date(q.from)) : undefined,
        q.to ? lte(auditLogs.createdAt, new Date(q.to)) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(q.limit + 1)
    .offset(offset);
  const items: adminApi.AuditEntry[] = rows.slice(0, q.limit).map(({ a, actorName, actorEmail }) => ({
    id: a.id,
    actorUserId: a.actorUserId,
    actorName: actorName ?? actorEmail ?? null,
    merchantId: a.merchantId,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    data: a.data,
    ip: a.ip,
    createdAt: a.createdAt.toISOString(),
  }));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

