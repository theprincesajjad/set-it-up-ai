/**
 * Rep console: leads pipeline, done-for-you merchant creation, QR kits,
 * activation tracking with day-7/day-30 check-ins.
 */
import { startSupportSession } from "./admin-ops.js";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { auditLogs, leadActivities, leads, merchantMembers, merchants, type DbOrTx } from "@ll/db";
import { repApi } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { AuthUser } from "../lib/auth.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { createMerchantWithTemplate, iso, requirePhone } from "./merchant.js";
import { decodeCursor, encodeCursor } from "./merchant-customers.js";
import { findOrCreateInvitee, sendStaffInvite } from "./merchant-staff.js";

const DAY = 86400000;
type LeadRow = typeof leads.$inferSelect;
type Merchant = typeof merchants.$inferSelect;

const isAdmin = (u: AuthUser) => u.platformRole === "admin";

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export function serializeLead(l: LeadRow, stats?: { n: number; last: Date | null }): repApi.Lead {
  return {
    id: l.id,
    businessName: l.businessName,
    vertical: l.vertical,
    address: l.address,
    contactName: l.contactName,
    phone: l.phone,
    email: l.email,
    neighbourhoodId: l.neighbourhoodId,
    stage: l.stage as repApi.LeadStage,
    currentLoyalty: l.currentLoyalty,
    assignedRepId: l.assignedRepId,
    merchantId: l.merchantId,
    nextActionAt: iso(l.nextActionAt),
    notes: l.notes,
    language: (l.language as repApi.Lead["language"]) ?? null,
    contactRole: l.contactRole,
    eventDate: l.eventDate,
    boardMeetingAt: l.boardMeetingAt,
    memberCount: l.memberCount,
    source: (l.source as repApi.Lead["source"]) ?? null,
    lat: l.lat,
    lng: l.lng,
    setupAt: iso(l.setupAt),
    setupChannel: (l.setupChannel as repApi.Lead["setupChannel"]) ?? null,
    activityCount: stats?.n ?? 0,
    lastActivityAt: iso(stats?.last ?? null),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

/** Promote signed leads whose merchant has since activated. */
async function syncActivatedLeads(db: DbOrTx) {
  await db.execute(sql`
    update leads set stage = 'activated', updated_at = now()
    where stage = 'signed' and merchant_id in (select id from merchants where activated_at is not null)`);
}

export async function activityStats(db: DbOrTx, ids: string[]) {
  if (!ids.length) return new Map<string, { n: number; last: Date | null }>();
  const rows = await db
    .select({ leadId: leadActivities.leadId, n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${leadActivities.createdAt})` })
    .from(leadActivities)
    .where(inArray(leadActivities.leadId, ids))
    .groupBy(leadActivities.leadId);
  return new Map(rows.map((r) => [r.leadId, { n: Number(r.n), last: r.last ? new Date(r.last) : null }]));
}

/** Reps see their own and unassigned leads; admins see everything. */
export function visibleTo(user: AuthUser) {
  return isAdmin(user) ? undefined : or(eq(leads.assignedRepId, user.id), isNull(leads.assignedRepId));
}

export async function listLeads(ctx: AppContext, user: AuthUser, q: z.infer<typeof repApi.listLeadsQuery>) {
  await syncActivatedLeads(ctx.db);
  const offset = decodeCursor(q.cursor);
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await ctx.db
    .select()
    .from(leads)
    .where(
      and(
        visibleTo(user),
        q.mine === "true" ? eq(leads.assignedRepId, user.id) : undefined,
        q.stage ? eq(leads.stage, q.stage) : undefined,
        q.neighbourhoodId ? eq(leads.neighbourhoodId, q.neighbourhoodId) : undefined,
        like ? or(ilike(leads.businessName, like), ilike(leads.contactName, like), ilike(leads.address, like)) : undefined,
        q.due === "true" ? lte(leads.nextActionAt, ctx.now()) : undefined,
      ),
    )
    .orderBy(sql`${leads.nextActionAt} asc nulls last`, desc(leads.updatedAt), asc(leads.id))
    .limit(q.limit + 1)
    .offset(offset);
  const page = rows.slice(0, q.limit);
  const stats = await activityStats(ctx.db, page.map((l) => l.id));
  return { items: page.map((l) => serializeLead(l, stats.get(l.id))), nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

export async function loadLead(db: DbOrTx, user: AuthUser, id: string) {
  const [l] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!l) throw notFound("Lead");
  if (!isAdmin(user) && l.assignedRepId && l.assignedRepId !== user.id) throw notFound("Lead");
  return l;
}

export async function getLead(ctx: AppContext, user: AuthUser, id: string): Promise<repApi.LeadDetail> {
  await syncActivatedLeads(ctx.db);
  const l = await loadLead(ctx.db, user, id);
  const acts = await ctx.db.select().from(leadActivities).where(eq(leadActivities.leadId, id)).orderBy(desc(leadActivities.createdAt));
  return {
    ...serializeLead(l, { n: acts.length, last: acts[0]?.createdAt ?? null }),
    activities: acts.map((a) => ({ id: a.id, kind: a.kind as repApi.LeadActivity["kind"], outcome: a.outcome, notes: a.notes, repUserId: a.repUserId, createdAt: a.createdAt.toISOString() })),
  };
}

function assignee(user: AuthUser, requested: string | null | undefined): string | null | undefined {
  if (requested === undefined) return undefined;
  if (isAdmin(user)) return requested;
  if (requested !== null && requested !== user.id) throw forbidden("Reps can only assign leads to themselves");
  return requested;
}

export async function createLead(ctx: AppContext, user: AuthUser, body: z.infer<typeof repApi.createLeadBody>) {
  const assigned = assignee(user, body.assignedRepId);
  const [l] = await ctx.db
    .insert(leads)
    .values({
      businessName: body.businessName,
      vertical: body.vertical ?? null,
      address: body.address ?? null,
      contactName: body.contactName ?? null,
      phone: body.phone ? requirePhone(body.phone) : null,
      email: body.email ?? null,
      neighbourhoodId: body.neighbourhoodId ?? null,
      currentLoyalty: body.currentLoyalty ?? null,
      notes: body.notes ?? null,
      nextActionAt: body.nextActionAt ? new Date(body.nextActionAt) : null,
      source: body.source ?? "street",
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      setupAt: body.setupAt ? new Date(body.setupAt) : null,
      setupChannel: body.setupChannel ?? null,
      // Reps own the leads they create.
      assignedRepId: assigned === undefined ? (isAdmin(user) ? null : user.id) : assigned,
      stage: "new",
      createdAt: ctx.now(),
      updatedAt: ctx.now(),
    })
    .returning();
  await writeAudit(ctx.db, { actorUserId: user.id, action: "lead.created", entity: "lead", entityId: l!.id });
  return getLead(ctx, user, l!.id);
}

export async function updateLead(ctx: AppContext, user: AuthUser, id: string, body: z.infer<typeof repApi.updateLeadBody>) {
  const cur = await loadLead(ctx.db, user, id);
  const { nextActionAt, phone, assignedRepId, setupAt, ...rest } = body;
  const set: Partial<typeof leads.$inferInsert> = { ...rest, updatedAt: ctx.now() };
  if (setupAt !== undefined) set.setupAt = setupAt ? new Date(setupAt) : null;
  if (nextActionAt !== undefined) set.nextActionAt = nextActionAt ? new Date(nextActionAt) : null;
  if (phone !== undefined) set.phone = phone ? requirePhone(phone) : null;
  const a = assignee(user, assignedRepId);
  if (a !== undefined) set.assignedRepId = a;
  // A rep touching an unassigned lead claims it.
  else if (!cur.assignedRepId && !isAdmin(user)) set.assignedRepId = user.id;
  await ctx.db.update(leads).set(set).where(eq(leads.id, id));
  if (body.stage && body.stage !== cur.stage) {
    await writeAudit(ctx.db, { actorUserId: user.id, action: "lead.stage_changed", entity: "lead", entityId: id, data: { from: cur.stage, to: body.stage } });
  }
  return getLead(ctx, user, id);
}

export async function addLeadActivity(ctx: AppContext, user: AuthUser, id: string, body: z.infer<typeof repApi.addLeadActivityBody>) {
  const cur = await loadLead(ctx.db, user, id);
  await ctx.db.insert(leadActivities).values({ leadId: id, repUserId: user.id, kind: body.kind, outcome: body.outcome ?? null, notes: body.notes ?? null, createdAt: ctx.now() });
  const set: Partial<typeof leads.$inferInsert> = { updatedAt: ctx.now() };
  if (body.stage) set.stage = body.stage;
  else if (cur.stage === "new" && body.kind !== "note") set.stage = "contacted";
  if (body.nextActionAt !== undefined) set.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null;
  if (!cur.assignedRepId && !isAdmin(user)) set.assignedRepId = user.id;
  await ctx.db.update(leads).set(set).where(eq(leads.id, id));
  return getLead(ctx, user, id);
}

// ---------------------------------------------------------------------------
// Done-for-you merchant creation
// ---------------------------------------------------------------------------
export async function createMerchantForOwner(ctx: AppContext, rep: AuthUser, body: repApi.RepCreateMerchantBody) {
  const { owner, leadId, ...merchantBody } = body;
  let lead: LeadRow | null = null;
  if (leadId) {
    lead = await loadLead(ctx.db, rep, leadId);
    if (lead.merchantId) throw badRequest("This lead already has a merchant");
  }
  const ownerUser = await findOrCreateInvitee(ctx.db, { email: owner.email, phone: owner.phone, name: owner.name });
  const { merchant } = await createMerchantWithTemplate(ctx, {
    body: { ...merchantBody, neighbourhoodId: merchantBody.neighbourhoodId ?? lead?.neighbourhoodId ?? undefined },
    ownerUserId: ownerUser.id,
    repUserId: rep.id,
    actorUserId: rep.id,
  });
  if (lead) {
    await ctx.db.update(leads).set({ stage: "signed", merchantId: merchant.id, assignedRepId: lead.assignedRepId ?? rep.id, updatedAt: ctx.now() }).where(eq(leads.id, lead.id));
    await ctx.db.insert(leadActivities).values({ leadId: lead.id, repUserId: rep.id, kind: "note", outcome: "signed", notes: `Merchant created: ${merchant.name}`, createdAt: ctx.now() });
  }
  await sendStaffInvite(ctx, { merchantName: merchant.name, role: "owner", email: owner.email ?? null, phone: owner.email ? null : ownerUser.phone });
  // The done-for-you setup is the reason on file: the rep can configure the shop they just created.
  await startSupportSession(ctx, rep.id, merchant.id, "Done-for-you setup", undefined);
  return { merchant, ownerUserId: ownerUser.id };
}

// ---------------------------------------------------------------------------
// Activation tracking + check-ins
// ---------------------------------------------------------------------------
async function repMerchants(db: DbOrTx, repUserId: string) {
  return db.select().from(merchants).where(eq(merchants.repUserId, repUserId)).orderBy(desc(merchants.createdAt));
}

export async function assertRepMerchant(ctx: AppContext, user: AuthUser, merchantId: string): Promise<Merchant> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m || (!isAdmin(user) && m.repUserId !== user.id)) throw notFound("Merchant");
  return m;
}

export async function listRepMerchants(ctx: AppContext, user: AuthUser, repUserId?: string): Promise<repApi.RepMerchant[]> {
  const who = repUserId && isAdmin(user) ? repUserId : user.id;
  const list = await repMerchants(ctx.db, who);
  if (!list.length) return [];
  const ids = list.map((m) => m.id);
  const [counts, checkIns] = await Promise.all([
    ctx.db
      .select({ merchantId: merchantMembers.merchantId, total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${merchantMembers.visitCount} >= 1)::int` })
      .from(merchantMembers)
      .where(inArray(merchantMembers.merchantId, ids))
      .groupBy(merchantMembers.merchantId),
    ctx.db
      .select({ merchantId: auditLogs.merchantId, data: auditLogs.data, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "rep.check_in"), inArray(auditLogs.merchantId, ids))),
  ]);
  const byM = new Map(counts.map((c) => [c.merchantId, c]));
  const now = ctx.now();
  const target = ctx.config.activationThreshold;
  return list.map((m) => {
    const c = byM.get(m.id);
    const active = Number(c?.active ?? 0);
    return {
      merchantId: m.id,
      name: m.name,
      slug: m.slug,
      vertical: m.vertical,
      status: m.status,
      neighbourhoodId: m.neighbourhoodId,
      createdAt: m.createdAt.toISOString(),
      activatedAt: iso(m.activatedAt),
      activeMembers: active,
      totalMembers: Number(c?.total ?? 0),
      target,
      progressPct: Math.min(100, Math.round((active / target) * 100)),
      daysSinceSignup: Math.floor((now.getTime() - m.createdAt.getTime()) / DAY),
      onboardingStep: m.onboardingStep,
      checkIns: repApi.CHECK_IN_DAYS.map((day) => {
        const dueAt = new Date(m.createdAt.getTime() + day * DAY);
        const done = checkIns.find((ci) => ci.merchantId === m.id && (ci.data as { day?: number } | null)?.day === day);
        return { day, dueAt: dueAt.toISOString(), due: !done && dueAt <= now, doneAt: iso(done?.createdAt ?? null) };
      }),
    };
  });
}

/** Day-7 and day-30 call state for one shop, whether or not a rep owns it (admins and the founder make these calls too). */
export async function checkInStatesFor(db: DbOrTx, m: Pick<Merchant, "id" | "createdAt">, now: Date): Promise<repApi.CheckInState[]> {
  const done = await db.select({ data: auditLogs.data, createdAt: auditLogs.createdAt }).from(auditLogs).where(and(eq(auditLogs.action, "rep.check_in"), eq(auditLogs.merchantId, m.id)));
  return repApi.CHECK_IN_DAYS.map((day) => {
    const dueAt = new Date(m.createdAt.getTime() + day * DAY);
    const hit = done.find((ci) => (ci.data as { day?: number } | null)?.day === day);
    return { day, dueAt: dueAt.toISOString(), due: !hit && dueAt <= now, doneAt: iso(hit?.createdAt ?? null) };
  });
}

export async function logCheckIn(ctx: AppContext, user: AuthUser, merchantId: string, body: z.infer<typeof repApi.logCheckInBody>) {
  const m = await assertRepMerchant(ctx, user, merchantId);
  await writeAudit(ctx.db, { actorUserId: user.id, merchantId, action: "rep.check_in", entity: "merchant", entityId: merchantId, data: { day: body.day, outcome: body.outcome ?? null, notes: body.notes ?? null } });
  const list = m.repUserId ? await listRepMerchants(ctx, user, m.repUserId) : [];
  return list.find((x) => x.merchantId === merchantId) ?? ({ merchantId, name: m.name, checkIns: await checkInStatesFor(ctx.db, m, ctx.now()) } as repApi.RepMerchant);
}
