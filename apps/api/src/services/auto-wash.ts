/**
 * Wash check-in (docs/research/auto-care.md 2.1): count a wash at the tunnel or the till by plate, member QR or phone.
 * Plans and punch cards are the existing membership engine (class_products: a membership is the unlimited plan, a pack is the
 * punch card; class_memberships bills it, freezes it and cancels it with the Ontario cooling-off). This file only decides whether
 * a member may be washed now and records it: one wash a day by default, a plan that is not active is refused with its reason,
 * and a punch card takes a credit only when there is no plan.
 */
import { and, desc, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { classMemberships, classPasses, loyaltyPrograms, merchantMembers, merchants as merchantsTable, users, vehicles, washVisits, type DbOrTx } from "@ll/db";
import { WASH_AT_RISK_BELOW, WASH_REFUSAL_TEXT, WASH_WINDOW_DAYS, type WashMembershipState, addDaysStr, autoApi, normalizePhone, normalizePlate, washDecision } from "@ll/shared";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import type { StaffContext } from "../lib/auth.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { awardPurchase } from "./ledger.js";
import { localDate } from "./messaging.js";
import { parseMemberCode } from "./staff.js";
import { getSettingsRow, vehicleLabel } from "./auto-vehicles.js";

type Merchant = typeof merchantsTable.$inferSelect;
const todayFor = (ctx: AppContext, tz: string) => localDate(ctx.now(), tz);

const PLAN_PRIORITY = ["active", "frozen", "past_due", "pending", "cancelled", "expired"] as const;

async function planOf(db: DbOrTx, merchantId: string, userId: string) {
  const rows = await db.select().from(classMemberships).where(and(eq(classMemberships.merchantId, merchantId), eq(classMemberships.userId, userId))).orderBy(desc(classMemberships.createdAt));
  for (const st of PLAN_PRIORITY) {
    const m = rows.find((r) => r.status === st);
    if (m) return m;
  }
  return null;
}

async function punchOf(db: DbOrTx, now: Date, merchantId: string, userId: string) {
  const rows = await db
    .select()
    .from(classPasses)
    .where(and(eq(classPasses.merchantId, merchantId), eq(classPasses.userId, userId), eq(classPasses.status, "active"), gt(classPasses.creditsLeft, 0), gt(classPasses.expiresAt, now)))
    .orderBy(classPasses.expiresAt);
  return rows[0] ?? null;
}

async function memberDto(ctx: AppContext, merchant: Merchant, userId: string, memberId: string, plateNorm?: string | null): Promise<autoApi.WashMemberDto> {
  const today = todayFor(ctx, merchant.timezone);
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const plan = await planOf(ctx.db, merchant.id, userId);
  const punch = await punchOf(ctx.db, ctx.now(), merchant.id, userId);
  const vs = await ctx.db.select().from(vehicles).where(eq(vehicles.userId, userId));
  const v = (plateNorm ? vs.find((x) => x.plateNorm === plateNorm) : null) ?? vs[0] ?? null;
  const [month] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(washVisits).where(and(eq(washVisits.merchantId, merchant.id), eq(washVisits.userId, userId), gte(washVisits.day, `${today.slice(0, 7)}-01`)));
  const [td] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(washVisits).where(and(eq(washVisits.merchantId, merchant.id), eq(washVisits.userId, userId), eq(washVisits.day, today)));
  return { memberId, userId, name: u?.name ?? null, vehicleLabel: v ? vehicleLabel(v) : null, plan: plan ? { id: plan.id, name: plan.name, state: plan.status } : null, punch: punch ? { name: punch.name, left: punch.creditsLeft } : null, washesThisMonth: Number(month?.n ?? 0), washedToday: Number(td?.n ?? 0) > 0 };
}

/** Find members by plate (exact), phone digits, member code or name. */
export async function lookup(ctx: AppContext, merchant: Merchant, q: string): Promise<autoApi.WashLookupResponse> {
  const found = new Map<string, { userId: string; memberId: string; plate?: string | null }>();
  const plate = normalizePlate(q);
  if (plate) {
    const rows = await ctx.db
      .select({ userId: vehicles.userId, memberId: merchantMembers.id })
      .from(vehicles)
      .innerJoin(merchantMembers, and(eq(merchantMembers.userId, vehicles.userId), eq(merchantMembers.merchantId, merchant.id)))
      .where(eq(vehicles.plateNorm, plate))
      .limit(5);
    for (const r of rows) found.set(r.memberId, { ...r, plate });
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const rows = await ctx.db
    .select({ userId: users.id, memberId: merchantMembers.id })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, merchant.id), isNull(users.deletedAt), or(ilike(users.name, like), digits.length >= 4 ? ilike(users.phone, `%${digits}%`) : sql`false`, eq(users.memberCode, parseMemberCode(q)))))
    .limit(6);
  for (const r of rows) if (!found.has(r.memberId)) found.set(r.memberId, r);
  const items: autoApi.WashMemberDto[] = [];
  for (const f of [...found.values()].slice(0, 6)) items.push(await memberDto(ctx, merchant, f.userId, f.memberId, f.plate));
  return { items };
}

async function resolve(ctx: AppContext, merchant: Merchant, body: z.output<typeof autoApi.washCheckInBody>): Promise<{ userId: string; memberId: string; plate: string | null }> {
  if (body.memberId) {
    const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.id, body.memberId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
    if (!m) throw notFound("Member");
    return { userId: m.userId, memberId: m.id, plate: null };
  }
  if (body.plate) {
    const plate = normalizePlate(body.plate);
    if (!plate) throw badRequest("A plate is 2 to 8 letters and numbers.");
    const rows = await ctx.db
      .select({ userId: vehicles.userId, memberId: merchantMembers.id })
      .from(vehicles)
      .innerJoin(merchantMembers, and(eq(merchantMembers.userId, vehicles.userId), eq(merchantMembers.merchantId, merchant.id)))
      .where(eq(vehicles.plateNorm, plate));
    const owners = [...new Map(rows.map((r) => [r.memberId, r])).values()];
    if (!owners.length) throw notFound("Member with that plate");
    if (owners.length > 1) throw conflict("More than one member has that plate. Look them up by phone.");
    return { ...owners[0]!, plate };
  }
  let userId: string | null = null;
  if (body.memberCode) {
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.memberCode, parseMemberCode(body.memberCode)), isNull(users.deletedAt))).limit(1);
    userId = u?.id ?? null;
  } else if (body.phone) {
    const phone = normalizePhone(body.phone);
    if (!phone) throw badRequest("Enter a valid phone number");
    const [u] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    userId = u?.id ?? null;
  }
  if (!userId) throw notFound("Member");
  const [m] = await ctx.db.select().from(merchantMembers).where(and(eq(merchantMembers.userId, userId), eq(merchantMembers.merchantId, merchant.id))).limit(1);
  if (!m) throw notFound("Member");
  return { userId, memberId: m.id, plate: null };
}

export async function checkIn(ctx: AppContext, staff: StaffContext, body: z.output<typeof autoApi.washCheckInBody>): Promise<autoApi.WashCheckInResponse> {
  const merchant = staff.merchant;
  const who = await resolve(ctx, merchant, body);
  const st = await getSettingsRow(ctx, merchant.id);
  const today = todayFor(ctx, merchant.timezone);
  const result = await ctx.db.transaction(async (tx) => {
    // One check-in at a time per member and day: two taps cannot both take "the one wash a day".
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`wash:${merchant.id}:${who.userId}:${today}`}, 0))`);
    const plan = await planOf(tx, merchant.id, who.userId);
    const punch = await punchOf(tx, ctx.now(), merchant.id, who.userId);
    const [td] = await tx.select({ n: sql<number>`count(*)::int` }).from(washVisits).where(and(eq(washVisits.merchantId, merchant.id), eq(washVisits.userId, who.userId), eq(washVisits.day, today)));
    const d = washDecision({ membership: (plan?.status ?? "none") as WashMembershipState, punchLeft: punch?.creditsLeft ?? 0, washesToday: Number(td?.n ?? 0), maxPerDay: st.washMaxPerDay });
    if (!d.ok) return { d, visitId: null as string | null };
    let passId: string | null = null;
    if (d.kind === "punch") {
      const [p] = await tx
        .update(classPasses)
        .set({ creditsLeft: sql`${classPasses.creditsLeft} - 1`, status: sql`case when ${classPasses.creditsLeft} - 1 <= 0 then 'used_up' else ${classPasses.status} end`, updatedAt: ctx.now() })
        .where(and(eq(classPasses.id, punch!.id), gt(classPasses.creditsLeft, 0), eq(classPasses.status, "active")))
        .returning({ id: classPasses.id });
      if (!p) return { d: { ok: false, kind: null, reason: "no_plan" as const }, visitId: null };
      passId = p.id;
    }
    const vs = await tx.select().from(vehicles).where(eq(vehicles.userId, who.userId));
    const v = (who.plate ? vs.find((x) => x.plateNorm === who.plate) : null) ?? (vs.length === 1 ? vs[0] : null) ?? null;
    const [row] = await tx
      .insert(washVisits)
      .values({ merchantId: merchant.id, userId: who.userId, vehicleId: v?.id ?? null, kind: d.kind!, membershipId: d.kind === "member" ? plan!.id : null, passId, source: body.source, staffId: staff.user.id, day: today })
      .returning({ id: washVisits.id });
    return { d, visitId: row!.id };
  });
  const member = await memberDto(ctx, merchant, who.userId, who.memberId, who.plate);
  if (!result.d.ok) {
    const reason = result.d.reason!;
    return { ok: false, kind: null, reason, message: WASH_REFUSAL_TEXT[reason], member };
  }
  if (result.visitId) await awardVisit(ctx, staff, who.userId, result.visitId);
  const first = (member.name ?? "").split(" ")[0] || "Member";
  const message = result.d.kind === "member" ? `${first} is in. ${member.plan?.name ?? "Plan"}, wash ${member.washesThisMonth} this month.` : `${first} is in. ${member.punch ? `${member.punch.left} washes left on the card.` : "That was the last wash on the card."}`;
  return { ok: true, kind: result.d.kind, reason: null, message, member };
}

/** A visit or stamp loyalty program earns on a wash; a per-dollar program earns on the payment instead. */
async function awardVisit(ctx: AppContext, staff: StaffContext, userId: string, visitId: string): Promise<void> {
  const [program] = await ctx.db.select({ earnType: loyaltyPrograms.earnType, active: loyaltyPrograms.active }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, staff.merchant.id)).limit(1);
  if (!program?.active || program.earnType === "per_dollar") return;
  try {
    await awardPurchase(ctx, { merchantId: staff.merchant.id, merchant: staff.merchant, userId, source: "staff_app", locationId: null, staffUserId: staff.user.id, idempotencyKey: `wash:visit:${visitId}`, ignoreCooldown: true, joinedVia: "phone" });
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[auto-wash] award failed", err);
  }
}

export async function summary(ctx: AppContext, merchant: Merchant): Promise<autoApi.WashSummaryResponse> {
  const today = todayFor(ctx, merchant.timezone);
  const from = addDaysStr(today, -(WASH_WINDOW_DAYS - 1));
  const plans = await ctx.db.select().from(classMemberships).where(and(eq(classMemberships.merchantId, merchant.id), eq(classMemberships.status, "active")));
  const visits = await ctx.db.select({ userId: washVisits.userId, day: washVisits.day, kind: washVisits.kind }).from(washVisits).where(and(eq(washVisits.merchantId, merchant.id), gte(washVisits.day, from), lte(washVisits.day, today)));
  const memberVisits = visits.filter((v) => v.kind === "member");
  const uids = [...new Set(plans.map((p) => p.userId))];
  const names = new Map((uids.length ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uids)) : []).map((u) => [u.id, u.name]));
  const memberIds = new Map((uids.length ? await ctx.db.select({ id: merchantMembers.id, userId: merchantMembers.userId }).from(merchantMembers).where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.userId, uids))) : []).map((m) => [m.userId, m.id]));
  // A plan that is under two weeks old has not had time to show a pattern.
  const cutoff = addDaysStr(today, -14);
  const atRisk = plans
    .filter((p) => p.startDate <= cutoff)
    .map((p) => ({ memberId: memberIds.get(p.userId) ?? "", name: names.get(p.userId) ?? null, planName: p.name, washes30d: memberVisits.filter((v) => v.userId === p.userId).length }))
    .filter((r) => r.washes30d < WASH_AT_RISK_BELOW)
    .sort((a, b) => a.washes30d - b.washes30d);
  const [open] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(classPasses).where(and(eq(classPasses.merchantId, merchant.id), eq(classPasses.status, "active"), gt(classPasses.creditsLeft, 0)));
  return {
    members: plans.length,
    washesToday: visits.filter((v) => v.day === today).length,
    washes30d: visits.length,
    avgPerMember30d: plans.length ? Math.round((memberVisits.length / plans.length) * 10) / 10 : null,
    atRisk: atRisk.slice(0, 50),
    punchCardsOpen: Number(open?.n ?? 0),
  };
}
