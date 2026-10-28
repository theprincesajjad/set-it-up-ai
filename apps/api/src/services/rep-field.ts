/**
 * Rep console, street day: the ordered list of ~30 shops in one area, one-tap outcomes that survive
 * a bad connection (idempotent by clientId), the Today summary and the live proof a rep shows at the door.
 * Docs: docs/engineering/api/rep.md.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { leadActivities, leads, merchantMembers, merchants, neighbourhoods, users, visits, type DbOrTx } from "@ll/db";
import { orderStreetDay, repApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { AuthUser } from "../lib/auth.js";
import { notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { localDate } from "./messaging.js";
import { activityStats, getLead, listRepMerchants, loadLead, serializeLead, visibleTo } from "./rep.js";

const DAY = 86400000;
const TZ = "America/Toronto";
const OPEN_STAGES = ["new", "contacted", "visit_booked"];
const isOutcome = (v: string | null): v is repApi.LeadOutcome => !!v && (repApi.LEAD_OUTCOMES as readonly string[]).includes(v);

/** The area a rep walks: asked for, else the next street day assigned to them (or to nobody). */
async function pickArea(ctx: AppContext, user: AuthUser, neighbourhoodId?: string) {
  if (neighbourhoodId) {
    const [a] = await ctx.db.select().from(neighbourhoods).where(eq(neighbourhoods.id, neighbourhoodId)).limit(1);
    if (!a) throw notFound("Area");
    return a;
  }
  const today = localDate(ctx.now(), TZ);
  const rows = await ctx.db
    .select()
    .from(neighbourhoods)
    .where(and(isNotNull(neighbourhoods.streetDayOn), gte(neighbourhoods.streetDayOn, today)))
    .orderBy(asc(neighbourhoods.streetDayOn), asc(neighbourhoods.name));
  return rows.find((a) => a.streetDayRepId === user.id) ?? rows.find((a) => !a.streetDayRepId) ?? (user.platformRole === "admin" ? rows[0] : undefined) ?? null;
}

async function todaysOutcomes(db: DbOrTx, ids: string[], now: Date) {
  const map = new Map<string, repApi.LeadOutcome>();
  if (!ids.length) return map;
  const today = localDate(now, TZ);
  const rows = await db
    .select({ leadId: leadActivities.leadId, outcome: leadActivities.outcome, createdAt: leadActivities.createdAt })
    .from(leadActivities)
    .where(and(inArray(leadActivities.leadId, ids), gte(leadActivities.createdAt, new Date(now.getTime() - 2 * DAY))))
    .orderBy(asc(leadActivities.createdAt));
  for (const r of rows) if (isOutcome(r.outcome) && localDate(r.createdAt, TZ) === today) map.set(r.leadId, r.outcome);
  return map;
}

export async function streetDay(ctx: AppContext, user: AuthUser, q: { neighbourhoodId?: string }): Promise<repApi.StreetDay> {
  const area = await pickArea(ctx, user, q.neighbourhoodId);
  const generatedAt = ctx.now().toISOString();
  const empty = { total: 0, visited: 0, signedUp: 0, setupCalls: 0, comeBack: 0, notInterested: 0, notIn: 0, left: 0 };
  if (!area) return { area: null, stops: [], counts: empty, generatedAt };
  const rows = await ctx.db
    .select()
    .from(leads)
    .where(and(eq(leads.neighbourhoodId, area.id), visibleTo(user)))
    .orderBy(asc(leads.businessName))
    .limit(300);
  const outcomes = await todaysOutcomes(ctx.db, rows.map((r) => r.id), ctx.now());
  const stats = await activityStats(ctx.db, rows.map((r) => r.id));
  const open = rows.filter((l) => OPEN_STAGES.includes(l.stage) && !outcomes.has(l.id));
  const done = rows.filter((l) => outcomes.has(l.id));
  const ordered = orderStreetDay(open.map((l) => ({ id: l.id, address: l.address, lat: l.lat, lng: l.lng, row: l }))).map((x) => x.row);
  const stop = (l: (typeof rows)[number], order: number | null): repApi.StreetStop => ({ ...serializeLead(l, stats.get(l.id)), order, todayOutcome: outcomes.get(l.id) ?? null });
  const stops = [...ordered.map((l, i) => stop(l, i + 1)), ...done.map((l) => stop(l, null))];
  const n = (o: repApi.LeadOutcome) => done.filter((l) => outcomes.get(l.id) === o).length;
  return {
    area: { id: area.id, name: area.name, streetDayOn: area.streetDayOn, targetShops: area.targetShops, storefrontEstimate: area.storefrontEstimate },
    stops,
    counts: { total: stops.length, visited: done.length, signedUp: n("signed_up"), setupCalls: n("setup_call"), comeBack: n("come_back"), notInterested: n("not_interested"), notIn: n("not_in"), left: ordered.length },
    generatedAt,
  };
}

type Recorded = "recorded" | "duplicate";

/** One tap at the door. Replaying the same clientId (offline queue) changes nothing the second time. */
export async function recordOutcome(ctx: AppContext, user: AuthUser, leadId: string, body: repApi.LeadOutcomeBody): Promise<{ status: Recorded; lead: repApi.LeadDetail }> {
  const cur = await loadLead(ctx.db, user, leadId);
  const [dup] = await ctx.db.select({ id: leadActivities.id }).from(leadActivities).where(eq(leadActivities.clientId, body.clientId)).limit(1);
  const detail = () => getLead(ctx, user, leadId);
  if (dup) return { status: "duplicate", lead: await detail() };
  const at = body.at ? new Date(body.at) : ctx.now();
  const set: Partial<typeof leads.$inferInsert> = { updatedAt: ctx.now() };
  if (!cur.assignedRepId && user.platformRole !== "admin") set.assignedRepId = user.id;
  if (body.lat != null && body.lng != null) {
    set.lat = body.lat;
    set.lng = body.lng;
  }
  let kind: "visit" | "call" = "visit";
  switch (body.outcome) {
    case "signed_up":
      if (cur.stage === "new") set.stage = "contacted";
      set.nextActionAt = null;
      break;
    case "setup_call":
      kind = "call";
      set.stage = "visit_booked";
      set.setupAt = body.setupAt ? new Date(body.setupAt) : new Date(ctx.now().getTime() + DAY);
      set.setupChannel = body.setupChannel ?? "phone";
      set.nextActionAt = set.setupAt;
      break;
    case "come_back":
      if (cur.stage === "new") set.stage = "contacted";
      set.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : new Date(ctx.now().getTime() + 2 * DAY);
      break;
    case "not_in":
      if (cur.stage === "new") set.stage = "contacted";
      set.nextActionAt = new Date(ctx.now().getTime() + DAY);
      break;
    case "not_interested":
      set.stage = "lost";
      set.nextActionAt = null;
      break;
  }
  await ctx.db.insert(leadActivities).values({ leadId, repUserId: user.id, kind, outcome: body.outcome, notes: body.notes ?? null, clientId: body.clientId, createdAt: at });
  await ctx.db.update(leads).set(set).where(eq(leads.id, leadId));
  if (set.stage && set.stage !== cur.stage) {
    await writeAudit(ctx.db, { actorUserId: user.id, action: "lead.stage_changed", entity: "lead", entityId: leadId, data: { from: cur.stage, to: set.stage, outcome: body.outcome } });
  }
  return { status: "recorded", lead: await detail() };
}

export async function syncOutcomes(ctx: AppContext, user: AuthUser, items: (repApi.LeadOutcomeBody & { leadId: string })[]): Promise<repApi.OutcomeSyncResult> {
  const results: repApi.OutcomeSyncResult["results"] = [];
  for (const { leadId, ...body } of items) {
    try {
      const r = await recordOutcome(ctx, user, leadId, body);
      results.push({ clientId: body.clientId, leadId, status: r.status });
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) results.push({ clientId: body.clientId, leadId, status: "not_found" });
      else throw e;
    }
  }
  return { results };
}

export async function repToday(ctx: AppContext, user: AuthUser): Promise<repApi.RepToday> {
  const now = ctx.now();
  const today = localDate(now, TZ);
  const [me] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1);
  const [mine, due, web, setups, sd] = await Promise.all([
    listRepMerchants(ctx, user),
    ctx.db.select().from(leads).where(and(visibleTo(user), lte(leads.nextActionAt, now), inArray(leads.stage, OPEN_STAGES))).orderBy(asc(leads.nextActionAt)).limit(20),
    ctx.db.select().from(leads).where(and(visibleTo(user), eq(leads.source, "website"), eq(leads.stage, "new"), sql`${leads.assignedRepId} is null`)).orderBy(desc(leads.createdAt)).limit(10),
    ctx.db.select().from(leads).where(and(visibleTo(user), isNotNull(leads.setupAt), gte(leads.setupAt, new Date(now.getTime() - 12 * 3600000)), inArray(leads.stage, OPEN_STAGES))).orderBy(asc(leads.setupAt)).limit(20),
    streetDay(ctx, user, {}),
  ]);
  const stats = await activityStats(ctx.db, [...due, ...web].map((l) => l.id));
  return {
    repName: me?.name ?? null,
    streetDay: sd.area ? { areaId: sd.area.id, areaName: sd.area.name, streetDayOn: sd.area.streetDayOn, visited: sd.counts.visited, total: sd.counts.total, isToday: sd.area.streetDayOn === today } : null,
    checkInsDue: mine.flatMap((m) => m.checkIns.filter((c) => c.due).map((c) => ({ merchantId: m.merchantId, name: m.name, day: c.day, daysSinceSignup: m.daysSinceSignup, activeMembers: m.activeMembers, target: m.target }))),
    setupSessions: setups.filter((l) => localDate(l.setupAt!, TZ) <= today).map((l) => ({ leadId: l.id, businessName: l.businessName, setupAt: l.setupAt!.toISOString(), setupChannel: (l.setupChannel as repApi.SetupChannel | null) ?? null, phone: l.phone })),
    leadsDue: due.map((l) => serializeLead(l, stats.get(l.id))),
    websiteLeads: web.map((l) => serializeLead(l, stats.get(l.id))),
  };
}

async function networkShops(ctx: AppContext) {
  const [r] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(merchants).where(eq(merchants.status, "active"));
  return Number(r?.n ?? 0);
}

/** Live numbers a rep can say at the door. Never invented: counts of active shops, members and visits. */
export async function pitchProof(ctx: AppContext, q: { neighbourhoodId?: string }): Promise<repApi.PitchProof> {
  const area = q.neighbourhoodId ? (await ctx.db.select({ id: neighbourhoods.id, name: neighbourhoods.name }).from(neighbourhoods).where(eq(neighbourhoods.id, q.neighbourhoodId)).limit(1))[0] ?? null : null;
  const live = and(eq(merchants.status, "active"), area ? eq(merchants.neighbourhoodId, area.id) : undefined);
  const shops = await ctx.db.select({ id: merchants.id, name: merchants.name, vertical: merchants.vertical }).from(merchants).where(live);
  const ids = shops.map((s) => s.id);
  const [[net], members, [v]] = await Promise.all([
    ctx.db
      .select({ customers: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where t.n >= 2)::int` })
      .from(sql`(select ${merchantMembers.userId}, count(*) as n from ${merchantMembers} group by ${merchantMembers.userId}) t`),
    ids.length ? ctx.db.select({ id: merchantMembers.merchantId, n: sql<number>`count(*)::int` }).from(merchantMembers).where(inArray(merchantMembers.merchantId, ids)).groupBy(merchantMembers.merchantId) : Promise.resolve([]),
    ids.length ? ctx.db.select({ n: sql<number>`count(*)::int` }).from(visits).where(and(inArray(visits.merchantId, ids), gte(visits.createdAt, new Date(ctx.now().getTime() - 7 * DAY)))) : Promise.resolve([{ n: 0 }]),
  ]);
  const byShop = new Map(members.map((m) => [m.id, Number(m.n)]));
  const customers = members.reduce((a, m) => a + Number(m.n), 0);
  const customersNet = Number(net?.customers ?? 0);
  return {
    area,
    shopsLive: shops.length,
    customers: area ? customers : customersNet,
    multiShopPct: customersNet ? Math.round((Number(net?.multi ?? 0) / customersNet) * 1000) / 1000 : 0,
    visitsLast7Days: Number(v?.n ?? 0),
    network: { shopsLive: await networkShops(ctx), customers: customersNet },
    topShops: shops.map((s) => ({ name: s.name, vertical: s.vertical, members: byShop.get(s.id) ?? 0 })).sort((a, b) => b.members - a.members).slice(0, 3),
  };
}

