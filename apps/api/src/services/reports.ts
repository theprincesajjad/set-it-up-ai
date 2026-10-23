/**
 * Merchant reports. Every query is scoped to one merchant; network overlap
 * only ever returns aggregate counts (never another shop's customers).
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { auditLogs, ledgerTransactions, loyaltyPrograms, merchantMembers, merchants, neighbourhoods, promos, redemptions, rewards, users, visits, type DbOrTx } from "@ll/db";
import { reportsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { getMerchantFeatures } from "./features.js";
import { localParts } from "./ledger.js";
import { countActiveMembers, iso } from "./merchant.js";
import { memberRhythms, shopDate } from "./member-stats.js";
import { localDate } from "./messaging.js";
import { localDayStart } from "./staff.js";

type Merchant = typeof merchants.$inferSelect;
const DAY = 86400000;
const EARN_TYPES = ["earn", "welcome_bonus", "birthday_bonus", "referral_bonus", "promo_bonus", "network_bonus", "campaign_bonus", "import"] as const;
const num = (v: unknown) => Number(v ?? 0);
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0);

export function resolveRange(ctx: AppContext, q: reportsApi.RangeQuery, defaultDays = 30): { from: Date; to: Date } {
  const to = q.to ? new Date(q.to) : ctx.now();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - defaultDays * DAY);
  if (from >= to) throw badRequest("`from` must be before `to`");
  if (to.getTime() - from.getTime() > 366 * DAY) throw badRequest("Reports cover at most 366 days");
  return { from, to };
}
const rangeOut = (r: { from: Date; to: Date }): reportsApi.Range => ({ from: r.from.toISOString(), to: r.to.toISOString() });
const localDay = (col: SQL | unknown, tz: string) => sql<string>`to_char((${col} at time zone ${tz}), 'YYYY-MM-DD')`;

/** Every local date between from and to (inclusive) in a timezone. */
function daysBetween(from: Date, to: Date, tz: string): string[] {
  const out: string[] = [];
  const last = localDate(to, tz);
  for (let t = from.getTime(); ; t += DAY) {
    const d = localDate(new Date(t), tz);
    if (out[out.length - 1] !== d) out.push(d);
    if (d >= last || out.length > 400) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
async function metrics(db: DbOrTx, merchantId: string, from: Date, to: Date): Promise<reportsApi.OverviewMetrics> {
  const inRange = (col: typeof visits.createdAt) => and(gte(col, from), lt(col, to));
  const [members] = await db
    .select({
      total: sql<number>`count(*) filter (where ${merchantMembers.createdAt} < ${to.toISOString()}::timestamptz)::int`,
      fresh: sql<number>`count(*) filter (where ${merchantMembers.createdAt} >= ${from.toISOString()}::timestamptz and ${merchantMembers.createdAt} < ${to.toISOString()}::timestamptz)::int`,
    })
    .from(merchantMembers)
    .where(eq(merchantMembers.merchantId, merchantId));
  const perMember = db
    .select({ memberId: visits.memberId, n: sql<number>`count(*)`.as("n"), spend: sql<number>`coalesce(sum(${visits.amountCents}), 0)`.as("spend") })
    .from(visits)
    .where(and(eq(visits.merchantId, merchantId), inRange(visits.createdAt)))
    .groupBy(visits.memberId)
    .as("pm");
  const [v] = await db
    .select({
      active: sql<number>`count(*)::int`,
      visits: sql<number>`coalesce(sum(${perMember.n}), 0)::int`,
      repeat: sql<number>`count(*) filter (where ${perMember.n} >= 2)::int`,
      revenue: sql<number>`coalesce(sum(${perMember.spend}), 0)::bigint`,
    })
    .from(perMember);
  const [p] = await db
    .select({
      issued: sql<number>`coalesce(sum(${ledgerTransactions.points}) filter (where ${ledgerTransactions.points} > 0 and ${ledgerTransactions.type} in ${EARN_TYPES} and ${ledgerTransactions.reversedAt} is null), 0)::int`,
      redeemed: sql<number>`coalesce(-sum(${ledgerTransactions.points}) filter (where ${ledgerTransactions.type} = 'redeem' and ${ledgerTransactions.reversedAt} is null), 0)::int`,
      redemptions: sql<number>`count(*) filter (where ${ledgerTransactions.type} = 'redeem' and ${ledgerTransactions.reversedAt} is null)::int`,
      redeemers: sql<number>`count(distinct ${ledgerTransactions.memberId}) filter (where ${ledgerTransactions.type} = 'redeem' and ${ledgerTransactions.reversedAt} is null)::int`,
    })
    .from(ledgerTransactions)
    .where(and(eq(ledgerTransactions.merchantId, merchantId), gte(ledgerTransactions.createdAt, from), lt(ledgerTransactions.createdAt, to)));
  const active = num(v?.active);
  const visitCount = num(v?.visits);
  const revenue = num(v?.revenue);
  return {
    totalMembers: num(members?.total),
    newMembers: num(members?.fresh),
    activeMembers: active,
    visits: visitCount,
    pointsIssued: num(p?.issued),
    pointsRedeemed: num(p?.redeemed),
    redemptions: num(p?.redemptions),
    redemptionRate: ratio(num(p?.redeemers), active),
    revenueFromMembersCents: revenue,
    avgSpendPerVisitCents: visitCount ? Math.round(revenue / visitCount) : 0,
    repeatRate: ratio(num(v?.repeat), active),
  };
}

export async function overview(ctx: AppContext, merchant: Merchant, q: reportsApi.RangeQuery): Promise<reportsApi.OverviewReport> {
  const r = resolveRange(ctx, q);
  const len = r.to.getTime() - r.from.getTime();
  const now = ctx.now();
  const [current, previous, last30] = await Promise.all([
    metrics(ctx.db, merchant.id, r.from, r.to),
    metrics(ctx.db, merchant.id, new Date(r.from.getTime() - len), r.from),
    ctx.db
      .select({ n: sql<number>`count(distinct ${visits.memberId})::int` })
      .from(visits)
      .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, new Date(now.getTime() - 30 * DAY)), lte(visits.createdAt, now))),
  ]);
  return { range: rangeOut(r), current, previous, activeMembers30d: num(last30[0]?.n), pointsLiability: await pointsLiability(ctx.db, merchant.id) };
}

/**
 * Outstanding points liability. Method (docs/engineering/api/reports.md): sum of every member's
 * current balance; dollar estimate uses the cheapest active `amount_off` reward (lowest points
 * cost, ties → lowest value) as the cents-per-point rate. Redeemed at that rate, every outstanding
 * point is worth value ÷ cost cents. Percent-off / free-item rewards are ignored (no fixed value).
 */
export async function pointsLiability(db: DbOrTx, merchantId: string): Promise<reportsApi.PointsLiability> {
  const [[totals], [basis]] = await Promise.all([
    db
      .select({ points: sql<number>`coalesce(sum(${merchantMembers.balance}), 0)::bigint`, holders: sql<number>`count(*) filter (where ${merchantMembers.balance} > 0)::int` })
      .from(merchantMembers)
      .where(eq(merchantMembers.merchantId, merchantId)),
    db
      .select({ id: rewards.id, name: rewards.name, pointsCost: rewards.pointsCost, value: rewards.value })
      .from(rewards)
      .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true), eq(rewards.rewardType, "amount_off"), sql`${rewards.pointsCost} > 0`, sql`${rewards.value} > 0`))
      .orderBy(rewards.pointsCost, rewards.value)
      .limit(1),
  ]);
  const outstandingPoints = num(totals?.points);
  const cpp = basis ? basis.value / basis.pointsCost : null;
  return {
    outstandingPoints,
    membersWithBalance: num(totals?.holders),
    centsPerPoint: cpp === null ? null : Math.round(cpp * 10000) / 10000,
    estimatedValueCents: cpp === null ? null : Math.round(outstandingPoints * cpp),
    basisReward: basis ? { id: basis.id, name: basis.name, pointsCost: basis.pointsCost, valueCents: basis.value } : null,
  };
}

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------
export async function daily(ctx: AppContext, merchant: Merchant, q: reportsApi.RangeQuery): Promise<reportsApi.DailyReport> {
  const r = resolveRange(ctx, q);
  const tz = merchant.timezone;
  const [v, m, p] = await Promise.all([
    ctx.db
      .select({ d: localDay(visits.createdAt, tz), n: sql<number>`count(*)::int`, rev: sql<number>`coalesce(sum(${visits.amountCents}), 0)::bigint` })
      .from(visits)
      .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, r.from), lt(visits.createdAt, r.to)))
      .groupBy(sql`1`),
    ctx.db
      .select({ d: localDay(merchantMembers.createdAt, tz), n: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, merchant.id), gte(merchantMembers.createdAt, r.from), lt(merchantMembers.createdAt, r.to)))
      .groupBy(sql`1`),
    ctx.db
      .select({
        d: localDay(ledgerTransactions.createdAt, tz),
        issued: sql<number>`coalesce(sum(${ledgerTransactions.points}) filter (where ${ledgerTransactions.points} > 0 and ${ledgerTransactions.type} in ${EARN_TYPES} and ${ledgerTransactions.reversedAt} is null), 0)::int`,
        redeemed: sql<number>`coalesce(-sum(${ledgerTransactions.points}) filter (where ${ledgerTransactions.type} = 'redeem' and ${ledgerTransactions.reversedAt} is null), 0)::int`,
      })
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, merchant.id), gte(ledgerTransactions.createdAt, r.from), lt(ledgerTransactions.createdAt, r.to)))
      .groupBy(sql`1`),
  ]);
  const vm = new Map(v.map((x) => [x.d, x]));
  const mm = new Map(m.map((x) => [x.d, x]));
  const pm = new Map(p.map((x) => [x.d, x]));
  return {
    range: rangeOut(r),
    timezone: tz,
    series: daysBetween(r.from, r.to, tz).map((date) => ({
      date,
      visits: num(vm.get(date)?.n),
      newMembers: num(mm.get(date)?.n),
      pointsIssued: num(pm.get(date)?.issued),
      pointsRedeemed: num(pm.get(date)?.redeemed),
      revenueCents: num(vm.get(date)?.rev),
    })),
  };
}

// ---------------------------------------------------------------------------
// Top customers
// ---------------------------------------------------------------------------
export async function topCustomers(ctx: AppContext, merchant: Merchant, q: reportsApi.RangeQuery & { by: "spend" | "visits" | "points"; limit: number }): Promise<reportsApi.TopCustomersReport> {
  const r = resolveRange(ctx, q);
  const vAgg = await ctx.db
    .select({ memberId: visits.memberId, n: sql<number>`count(*)::int`, spend: sql<number>`coalesce(sum(${visits.amountCents}), 0)::bigint` })
    .from(visits)
    .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, r.from), lt(visits.createdAt, r.to)))
    .groupBy(visits.memberId);
  const pAgg = await ctx.db
    .select({ memberId: ledgerTransactions.memberId, pts: sql<number>`coalesce(sum(${ledgerTransactions.points}), 0)::int` })
    .from(ledgerTransactions)
    .where(
      and(
        eq(ledgerTransactions.merchantId, merchant.id),
        gte(ledgerTransactions.createdAt, r.from),
        lt(ledgerTransactions.createdAt, r.to),
        sql`${ledgerTransactions.points} > 0 and ${ledgerTransactions.type} in ${EARN_TYPES} and ${ledgerTransactions.reversedAt} is null`,
      ),
    )
    .groupBy(ledgerTransactions.memberId);
  const stats = new Map<string, { visits: number; spend: number; points: number }>();
  for (const x of vAgg) stats.set(x.memberId, { visits: num(x.n), spend: num(x.spend), points: 0 });
  for (const x of pAgg) stats.set(x.memberId, { ...(stats.get(x.memberId) ?? { visits: 0, spend: 0 }), points: num(x.pts) });
  const key = q.by === "spend" ? "spend" : q.by === "visits" ? "visits" : "points";
  const top = [...stats.entries()].filter(([, s]) => s[key] > 0).sort((a, b) => b[1][key] - a[1][key] || b[1].visits - a[1].visits).slice(0, q.limit);
  const ids = top.map(([id]) => id);
  const details = ids.length
    ? await ctx.db
        .select({ id: merchantMembers.id, name: users.name, phone: users.phone, balance: merchantMembers.balance, lastVisitAt: merchantMembers.lastVisitAt })
        .from(merchantMembers)
        .innerJoin(users, eq(users.id, merchantMembers.userId))
        .where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.id, ids)))
    : [];
  const byId = new Map(details.map((d) => [d.id, d]));
  return {
    range: rangeOut(r),
    by: q.by,
    items: top.map(([id, s]) => {
      const d = byId.get(id);
      return { memberId: id, name: d?.name ?? null, phoneLast4: d?.phone ? d.phone.slice(-4) : null, visits: s.visits, spendCents: s.spend, pointsEarned: s.points, balance: d?.balance ?? 0, lastVisitAt: iso(d?.lastVisitAt) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Reward performance
// ---------------------------------------------------------------------------
export async function rewardPerformance(ctx: AppContext, merchant: Merchant, q: reportsApi.RangeQuery): Promise<reportsApi.RewardsReport> {
  const r = resolveRange(ctx, q);
  const list = await ctx.db.select().from(rewards).where(eq(rewards.merchantId, merchant.id)).orderBy(rewards.sortOrder, rewards.pointsCost);
  const agg = await ctx.db
    .select({
      rewardId: redemptions.rewardId,
      n: sql<number>`count(*)::int`,
      members: sql<number>`count(distinct ${redemptions.memberId})::int`,
      discount: sql<number>`coalesce(sum(${redemptions.discountCents}), 0)::int`,
      points: sql<number>`coalesce(-sum(${ledgerTransactions.points}), 0)::int`,
    })
    .from(redemptions)
    .leftJoin(ledgerTransactions, eq(ledgerTransactions.id, redemptions.transactionId))
    .where(and(eq(redemptions.merchantId, merchant.id), ne(redemptions.status, "void"), gte(redemptions.createdAt, r.from), lt(redemptions.createdAt, r.to)))
    .groupBy(redemptions.rewardId);
  const by = new Map(agg.map((a) => [a.rewardId, a]));
  return {
    range: rangeOut(r),
    items: list
      .map((rw) => {
        const a = by.get(rw.id);
        return { rewardId: rw.id, name: rw.name, pointsCost: rw.pointsCost, active: rw.active, redemptions: num(a?.n), uniqueMembers: num(a?.members), pointsSpent: num(a?.points), discountCents: num(a?.discount) };
      })
      .sort((a, b) => b.redemptions - a.redemptions),
  };
}

// ---------------------------------------------------------------------------
// Promo results
// ---------------------------------------------------------------------------
/** Does a visit at `at` fall inside the promo's weekdays and hours (shop time)? */
function inPromoWindow(p: typeof promos.$inferSelect, at: Date, tz: string): boolean {
  if (!(p.daysOfWeek?.length || p.startTime || p.endTime)) return true;
  const { dow, hhmm } = localParts(at, tz);
  return (!p.daysOfWeek?.length || p.daysOfWeek.includes(dow)) && (!p.startTime || hhmm >= p.startTime) && (!p.endTime || hhmm < p.endTime);
}

/** Local dates in [from, to) whose weekday the promo runs on (all days when it has no weekday rule). */
function matchingDays(p: typeof promos.$inferSelect, from: Date, to: Date, tz: string): number {
  let n = 0;
  const seen = new Set<string>();
  for (let t = from.getTime(); t < to.getTime() + DAY && seen.size < 400; t += DAY) {
    const d = localDate(new Date(t), tz);
    if (seen.has(d)) continue;
    seen.add(d);
    const day = new Date(t);
    // A day counts when it started before `to` and the promo runs on that weekday.
    if (localDayStart(day, tz).start >= to) continue;
    if (!p.daysOfWeek?.length || p.daysOfWeek.includes(localParts(day, tz).dow)) n++;
  }
  return n;
}

/** Fewer than this many days of history before a promo and "typical" is not shown. */
const PROMO_MIN_BASELINE_DAYS = 14;
const PROMO_BASELINE_DAYS = 28;

export async function promoResults(ctx: AppContext, merchant: Merchant): Promise<reportsApi.PromosReport> {
  const now = ctx.now();
  const tz = merchant.timezone;
  const list = await ctx.db
    .select()
    .from(promos)
    .where(and(eq(promos.merchantId, merchant.id), ne(promos.status, "draft")))
    .orderBy(desc(promos.startsAt))
    .limit(100);
  const [first] = await ctx.db.select({ at: sql<Date | null>`min(${visits.createdAt})` }).from(visits).where(eq(visits.merchantId, merchant.id));
  const firstVisitAt = first?.at ? new Date(first.at) : null;
  const items: reportsApi.PromoResult[] = [];
  for (const p of list) {
    const start = p.startsAt;
    const end = p.endsAt && p.endsAt < now ? p.endsAt : now;
    let attributed = 0;
    let liftPct: number | null = null;
    let windowDays = 0;
    let typicalPerDay: number | null = null;
    let free = 0;
    if (start < end) {
      const vs = await ctx.db
        .select({ at: visits.createdAt })
        .from(visits)
        .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, start), lt(visits.createdAt, end)));
      attributed = vs.filter(({ at }) => inPromoWindow(p, at, tz)).length;
      const [base] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(visits)
        .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, new Date(start.getTime() - 14 * DAY)), lt(visits.createdAt, start)));
      const baseline = num(base?.n) / 14;
      const during = vs.length / Math.max(1, (end.getTime() - start.getTime()) / DAY);
      liftPct = baseline > 0 ? Math.round(((during - baseline) / baseline) * 100) : null;

      // Typical: the same weekdays and hours over the 4 weeks before the promo, per matching day.
      windowDays = matchingDays(p, start, end, tz);
      const histDays = firstVisitAt ? Math.floor((start.getTime() - firstVisitAt.getTime()) / DAY) : 0;
      if (histDays >= PROMO_MIN_BASELINE_DAYS) {
        const baseFrom = new Date(Math.max(start.getTime() - PROMO_BASELINE_DAYS * DAY, firstVisitAt!.getTime()));
        const baseVisits = await ctx.db
          .select({ at: visits.createdAt })
          .from(visits)
          .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, baseFrom), lt(visits.createdAt, start)));
        const baseDays = matchingDays(p, baseFrom, start, tz);
        const inWin = baseVisits.filter(({ at }) => inPromoWindow(p, at, tz)).length;
        typicalPerDay = baseDays > 0 ? Math.round((inWin / baseDays) * 10) / 10 : 0;
      }
      const reds = await ctx.db
        .select({ at: redemptions.createdAt })
        .from(redemptions)
        .where(and(eq(redemptions.merchantId, merchant.id), ne(redemptions.status, "void"), gte(redemptions.createdAt, start), lt(redemptions.createdAt, end)));
      free = reds.filter(({ at }) => inPromoWindow(p, at, tz)).length;
    }
    const typicalVisits = typicalPerDay === null ? null : Math.round(typicalPerDay * windowDays);
    const [boosted] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, merchant.id), eq(ledgerTransactions.promoId, p.id), isNull(ledgerTransactions.reversedAt)));
    items.push({
      promoId: p.id,
      title: p.title,
      kind: p.kind,
      status: p.status,
      startsAt: p.startsAt.toISOString(),
      endsAt: iso(p.endsAt),
      views: p.viewCount,
      claims: p.claimCount,
      attributedVisits: attributed,
      boostedTransactions: num(boosted?.n),
      liftPct,
      windowVisits: attributed,
      windowDays,
      typicalPerDay,
      typicalVisits,
      extraVisits: typicalVisits === null ? null : attributed - typicalVisits,
      freeItemsGiven: free,
    });
  }
  return { items };
}

// ---------------------------------------------------------------------------
// Network overlap (aggregates only)
// ---------------------------------------------------------------------------
export async function networkOverlap(ctx: AppContext, merchant: Merchant, windowDays = 90): Promise<reportsApi.NetworkOverlapReport> {
  const [{ n: myMembers } = { n: 0 }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(merchantMembers).where(eq(merchantMembers.merchantId, merchant.id));
  const empty = { windowDays, myMembers: num(myMembers), sharedMembers: 0, sharedPct: 0, avgOtherShops: 0, shops: [], suppressedShops: 0 };
  if (!merchant.neighbourhoodId) return { neighbourhood: null, ...empty };
  const [hood] = await ctx.db.select({ id: neighbourhoods.id, name: neighbourhoods.name }).from(neighbourhoods).where(eq(neighbourhoods.id, merchant.neighbourhoodId)).limit(1);
  const since = new Date(ctx.now().getTime() - windowDays * DAY);
  const myUsers = sql`(select ${merchantMembers.userId} from ${merchantMembers} where ${merchantMembers.merchantId} = ${merchant.id})`;
  const where = and(eq(visits.neighbourhoodId, merchant.neighbourhoodId), ne(visits.merchantId, merchant.id), gte(visits.createdAt, since), sql`${visits.userId} in ${myUsers}`);
  const [tot] = await ctx.db
    .select({ users: sql<number>`count(distinct ${visits.userId})::int`, pairs: sql<number>`count(distinct (${visits.userId}, ${visits.merchantId}))::int` })
    .from(visits)
    .where(where);
  const perShop = await ctx.db
    .select({ merchantId: visits.merchantId, name: merchants.name, vertical: merchants.vertical, n: sql<number>`count(distinct ${visits.userId})::int` })
    .from(visits)
    .innerJoin(merchants, eq(merchants.id, visits.merchantId))
    .where(and(where, inArray(merchants.status, ["onboarding", "active"])))
    .groupBy(visits.merchantId, merchants.name, merchants.vertical)
    .orderBy(desc(sql`4`));
  const shared = num(tot?.users);
  const visible = perShop.filter((s) => num(s.n) >= reportsApi.OVERLAP_MIN_COHORT);
  return {
    neighbourhood: hood ?? null,
    ...empty,
    sharedMembers: shared,
    sharedPct: ratio(shared, num(myMembers)),
    avgOtherShops: shared ? Math.round((num(tot?.pairs) / shared) * 10) / 10 : 0,
    shops: visible.map((s) => ({ merchantId: s.merchantId, name: s.name, vertical: s.vertical, sharedMembers: num(s.n) })),
    suppressedShops: perShop.length - visible.length,
  };
}

// ---------------------------------------------------------------------------
// Activation progress (25 active members)
// ---------------------------------------------------------------------------
export async function activation(ctx: AppContext, merchant: Merchant): Promise<reportsApi.ActivationReport> {
  const target = ctx.config.activationThreshold;
  const active = await countActiveMembers(ctx.db, merchant.id);
  const tz = merchant.timezone;
  const now = ctx.now();
  const firsts = ctx.db
    .select({ first: sql<Date>`min(${visits.createdAt})`.as("first") })
    .from(visits)
    .where(eq(visits.merchantId, merchant.id))
    .groupBy(visits.memberId)
    .as("f");
  const rows = await ctx.db
    .select({ d: localDay(firsts.first, tz), n: sql<number>`count(*)::int` })
    .from(firsts)
    .where(gte(firsts.first, new Date(now.getTime() - 30 * DAY)))
    .groupBy(sql`1`);
  const by = new Map(rows.map((r) => [r.d, num(r.n)]));
  return {
    activeMembers: active,
    target,
    remaining: Math.max(0, target - active),
    progressPct: Math.min(100, Math.round((active / target) * 100)),
    activatedAt: iso(merchant.activatedAt),
    daysSinceSignup: Math.floor((now.getTime() - merchant.createdAt.getTime()) / DAY),
    last30Days: daysBetween(new Date(now.getTime() - 29 * DAY), now, tz).map((date) => ({ date, newActive: by.get(date) ?? 0 })),
  };
}

// ---------------------------------------------------------------------------
// Retention cohorts (Plus: reports.advanced)
// ---------------------------------------------------------------------------
export async function retention(ctx: AppContext, merchant: Merchant, months: number): Promise<reportsApi.RetentionReport> {
  const tz = merchant.timezone;
  const nowMonth = localDate(ctx.now(), tz).slice(0, 7);
  const monthList: string[] = [];
  let [y, m] = nowMonth.split("-").map(Number) as [number, number];
  for (let i = 0; i < months; i++) {
    monthList.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  const first = monthList[0]!;
  const monthOf = (col: unknown) => sql<string>`to_char((${col} at time zone ${tz}), 'YYYY-MM')`;
  const members = await ctx.db
    .select({ id: merchantMembers.id, cohort: monthOf(merchantMembers.createdAt) })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchant.id), sql`${monthOf(merchantMembers.createdAt)} >= ${first}`));
  const vm = await ctx.db
    .selectDistinct({ memberId: visits.memberId, month: monthOf(visits.createdAt) })
    .from(visits)
    .where(and(eq(visits.merchantId, merchant.id), sql`${monthOf(visits.createdAt)} >= ${first}`));
  const visitsBy = new Map<string, Set<string>>();
  for (const v of vm) visitsBy.set(v.memberId, (visitsBy.get(v.memberId) ?? new Set()).add(v.month));
  const idx = (mo: string) => monthList.indexOf(mo);
  const joinerReturn = await joinerReturnReport(ctx, merchant);
  return {
    joinerReturn,
    months,
    cohorts: monthList.map((cohort) => {
      const cm = members.filter((x) => x.cohort === cohort);
      const span = months - idx(cohort);
      const retention = Array.from({ length: span }, (_, off) => {
        const target = monthList[idx(cohort) + off]!;
        return ratio(cm.filter((x) => visitsBy.get(x.id)?.has(target)).length, cm.length);
      });
      return { cohort, size: cm.length, retention };
    }),
  };
}

// ---------------------------------------------------------------------------
// Joiners who came back (windows 7, 14, 30 days)
// ---------------------------------------------------------------------------
export const JOINER_WINDOWS = [7, 14, 30] as const;

/**
 * Members who joined in the 4 weeks ending 30 days ago (so every window has fully elapsed), and how
 * many of them had a second visit within 7, 14 and 30 days of their first (cumulative).
 */
export async function joinerReturnReport(ctx: AppContext, merchant: Merchant): Promise<reportsApi.JoinerReturnReport> {
  const to = new Date(ctx.now().getTime() - 30 * DAY);
  const from = new Date(to.getTime() - 28 * DAY);
  const joined = await ctx.db
    .select({ id: merchantMembers.id })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchant.id), gte(merchantMembers.createdAt, from), lt(merchantMembers.createdAt, to)));
  const ids = joined.map((j) => j.id);
  const vs = ids.length
    ? await ctx.db
        .select({ memberId: visits.memberId, at: visits.createdAt })
        .from(visits)
        .where(and(eq(visits.merchantId, merchant.id), inArray(visits.memberId, ids)))
        .orderBy(visits.createdAt)
    : [];
  const by = new Map<string, Date[]>();
  for (const v of vs) by.set(v.memberId, [...(by.get(v.memberId) ?? []), v.at]);
  const gaps = [...by.values()].filter((t) => t.length >= 2).map((t) => (t[1]!.getTime() - t[0]!.getTime()) / DAY);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    joined: ids.length,
    windows: JOINER_WINDOWS.map((days) => ({ days, cameBack: gaps.filter((g) => g <= days).length })),
  };
}

// ---------------------------------------------------------------------------
// Heatmap: weekday x hour (shop time)
// ---------------------------------------------------------------------------
export async function heatmap(ctx: AppContext, merchant: Merchant, weeks: number): Promise<reportsApi.HeatmapReport> {
  const tz = merchant.timezone;
  const to = ctx.now();
  const from = new Date(to.getTime() - weeks * 7 * DAY);
  const rows = await ctx.db
    .select({
      dow: sql<number>`(extract(isodow from (${visits.createdAt} at time zone ${tz}))::int - 1)`,
      hour: sql<number>`extract(hour from (${visits.createdAt} at time zone ${tz}))::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(visits)
    .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, from), lte(visits.createdAt, to)))
    .groupBy(sql`1`, sql`2`);
  const matrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) matrix[num(r.dow)]![num(r.hour)] = num(r.n);
  return { weeks, timezone: tz, matrix, max: Math.max(0, ...matrix.flat()) };
}

// ---------------------------------------------------------------------------
// Rewards owed
// ---------------------------------------------------------------------------
/** Free rewards members could claim right now. Always an estimate; cost is the shop's own number. */
export async function rewardsOwed(ctx: AppContext, merchant: Merchant): Promise<reportsApi.RewardsOwedReport> {
  const [[prog], [cost], [totals]] = await Promise.all([
    ctx.db.select({ rewardCostCents: loyaltyPrograms.rewardCostCents }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id)).limit(1),
    ctx.db
      .select({ min: sql<number | null>`min(${rewards.pointsCost})::int` })
      .from(rewards)
      .where(and(eq(rewards.merchantId, merchant.id), eq(rewards.active, true))),
    ctx.db
      .select({ stamps: sql<number>`coalesce(sum(${merchantMembers.balance}), 0)::int`, members: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, merchant.id), sql`${merchantMembers.balance} > 0`)),
  ]);
  const goal = cost?.min ?? null;
  let owed = 0;
  if (goal && goal > 0) {
    const [o] = await ctx.db
      .select({ n: sql<number>`coalesce(sum(floor(${merchantMembers.balance}::numeric / ${goal})), 0)::int` })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, merchant.id), sql`${merchantMembers.balance} >= ${goal}`));
    owed = num(o?.n);
  }
  const rc = prog?.rewardCostCents ?? null;
  return { rewardsOwed: owed, stampsOutstanding: num(totals?.stamps), members: num(totals?.members), rewardCostCents: rc, estCostCents: rc === null ? null : owed * rc, estimate: true };
}

// ---------------------------------------------------------------------------
// Today (home): 7 am / at close
// ---------------------------------------------------------------------------
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7);
const mean1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

export async function today(ctx: AppContext, merchant: Merchant): Promise<reportsApi.TodayReportDto> {
  const tz = merchant.timezone;
  const now = ctx.now();
  const todayStart = localDayStart(now, tz).start;
  const noon = todayStart.getTime() + 12 * 3600_000;
  const dayKey = (daysBack: number) => shopDate(new Date(noon - daysBack * DAY), tz);
  const todayKey = dayKey(0);
  const yesterdayKey = dayKey(1);
  const earliest = new Date(todayStart.getTime() - 30 * DAY);

  const [visitRows, newMemberRows, earnRows, redeemRows, wf, [prog], [minCost]] = await Promise.all([
    ctx.db
      .select({ d: localDay(visits.createdAt, tz), h: sql<number>`extract(hour from (${visits.createdAt} at time zone ${tz}))::int`, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, earliest), lte(visits.createdAt, now)))
      .groupBy(sql`1`, sql`2`),
    ctx.db
      .select({ d: localDay(merchantMembers.createdAt, tz), via: merchantMembers.joinedVia, n: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(eq(merchantMembers.merchantId, merchant.id), gte(merchantMembers.createdAt, new Date(todayStart.getTime() - DAY - 6 * 3600_000))))
      .groupBy(sql`1`, merchantMembers.joinedVia),
    ctx.db
      .select({ staffId: ledgerTransactions.staffUserId, points: ledgerTransactions.points, at: ledgerTransactions.createdAt })
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.merchantId, merchant.id),
          gte(ledgerTransactions.createdAt, todayStart),
          lte(ledgerTransactions.createdAt, now),
          sql`${ledgerTransactions.points} > 0 and ${ledgerTransactions.type} in ${EARN_TYPES} and ${ledgerTransactions.reversedAt} is null`,
        ),
      ),
    ctx.db
      .select({ staffId: ledgerTransactions.staffUserId, type: ledgerTransactions.type, reversesId: ledgerTransactions.reversesTransactionId })
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, merchant.id), gte(ledgerTransactions.createdAt, todayStart), lte(ledgerTransactions.createdAt, now), isNull(ledgerTransactions.reversedAt), inArray(ledgerTransactions.type, ["redeem", "reversal"]))),
    getMerchantFeatures(ctx.db, merchant),
    ctx.db.select({ stampGoal: loyaltyPrograms.stampGoal }).from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchant.id)).limit(1),
    ctx.db
      .select({ min: sql<number | null>`min(${rewards.pointsCost})::int` })
      .from(rewards)
      .where(and(eq(rewards.merchantId, merchant.id), eq(rewards.active, true))),
  ]);
  void prog;
  const byDay = new Map<string, number[]>();
  for (const r of visitRows) {
    const arr = byDay.get(r.d) ?? Array<number>(24).fill(0);
    arr[num(r.h)] = num(r.n);
    byDay.set(r.d, arr);
  }
  const dayTotal = (key: string) => (byDay.get(key) ?? []).reduce((a, b) => a + b, 0);
  const hourOf = (key: string, h: number) => byDay.get(key)?.[h] ?? 0;
  const sameWeekday = (fromBack: number) => [0, 1, 2, 3].map((k) => dayKey(fromBack + 7 * k));
  const typicalYesterdayKeys = sameWeekday(8); // 4 same weekdays before yesterday
  const typicalTodayKeys = sameWeekday(7);
  const typicalDay = (keys: string[]) => reportsApi.typicalFromWeeks(keys.map(dayTotal)) ?? 0;

  const newBy = (key: string, via?: string) => newMemberRows.filter((r) => r.d === key && (!via || r.via === via)).reduce((a, r) => a + num(r.n), 0);

  // Regulars and slipping come from visit rhythm.
  const rhythms = await memberRhythms(ctx.db, merchant.id, tz, now);
  const regularIds = [...rhythms.entries()].filter(([, r]) => r.isRegular).map(([id]) => id);
  const regularsSeen = regularIds.filter((id) => (rhythms.get(id)!.lastVisitAt?.getTime() ?? 0) >= todayStart.getTime()).length;
  const slippingIds = [...rhythms.entries()].filter(([, r]) => r.isSlipping).map(([id]) => id);

  const goal = minCost?.min ?? null;
  const person = {
    id: merchantMembers.id,
    name: users.name,
    phone: users.phone,
    balance: merchantMembers.balance,
    lastVisitAt: merchantMembers.lastVisitAt,
    consentAt: merchantMembers.marketingConsentAt,
    muted: merchantMembers.muted,
  };
  const [waiting, [waitingCount], slippingPeople] = await Promise.all([
    goal
      ? ctx.db
          .select(person)
          .from(merchantMembers)
          .innerJoin(users, eq(users.id, merchantMembers.userId))
          .where(and(eq(merchantMembers.merchantId, merchant.id), gte(merchantMembers.balance, goal), isNull(users.deletedAt)))
          .orderBy(sql`${merchantMembers.lastVisitAt} desc nulls last`)
          .limit(4)
      : Promise.resolve([]),
    goal
      ? ctx.db
          .select({ n: sql<number>`count(*)::int` })
          .from(merchantMembers)
          .innerJoin(users, eq(users.id, merchantMembers.userId))
          .where(and(eq(merchantMembers.merchantId, merchant.id), gte(merchantMembers.balance, goal), isNull(users.deletedAt)))
      : Promise.resolve([{ n: 0 }]),
    slippingIds.length
      ? ctx.db
          .select(person)
          .from(merchantMembers)
          .innerJoin(users, eq(users.id, merchantMembers.userId))
          .where(and(eq(merchantMembers.merchantId, merchant.id), inArray(merchantMembers.id, slippingIds), isNull(users.deletedAt)))
      : Promise.resolve([]),
  ]);
  const canText = (p: { phone: string | null; consentAt: Date | null; muted: boolean }) => !!p.consentAt && !p.muted && !!p.phone;
  const slippingSorted = [...slippingPeople].sort((a, b) => (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0));

  // Staff: stamps, visits, undone today (counter awards carry staffUserId).
  const staffIds = [...new Set([...earnRows.map((r) => r.staffId), ...redeemRows.map((r) => r.staffId)].filter((x): x is string => !!x))];
  const staffNames = staffIds.length ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : [];
  const staff = staffIds
    .map((id) => {
      const mine = earnRows.filter((r) => r.staffId === id);
      const hours = mine.map((r) => Number(localParts(r.at, tz).hhmm.slice(0, 2)));
      const lo = Math.min(...hours);
      const hi = Math.max(...hours);
      return {
        staffId: id,
        name: staffNames.find((n) => n.id === id)?.name ?? "Staff",
        shift: mine.length > 1 && lo !== hi ? `${reportsApi.hourLabel(lo)} to ${reportsApi.hourLabel(hi + 1)}` : null,
        stamps: mine.reduce((a, r) => a + r.points, 0),
        visits: mine.length,
        undone: redeemRows.filter((r) => r.staffId === id && r.type === "reversal").length,
      };
    })
    .sort((a, b) => b.stamps - a.stamps);

  // Promo running today: a live promo whose weekday and hours cover part of today.
  let promoWindow: reportsApi.TodayReportDto["promoWindow"] = null;
  if (features["promos.basic"].enabled) {
    const todayDow = localParts(now, tz).dow;
    const live = await ctx.db
      .select()
      .from(promos)
      .where(and(eq(promos.merchantId, merchant.id), eq(promos.status, "live"), lte(promos.startsAt, now), or(isNull(promos.endsAt), gte(promos.endsAt, now))))
      .orderBy(desc(promos.startsAt));
    const p = live.find((x) => (x.startTime || x.endTime) && (!x.daysOfWeek?.length || x.daysOfWeek.includes(todayDow)));
    if (p) {
      const hourSet = HOURS.filter((h) => {
        const hh = `${String(h).padStart(2, "0")}:00`;
        return (!p.startTime || hh >= p.startTime.slice(0, 2) + ":00") && (!p.endTime || hh < p.endTime);
      });
      const windowVisits = hourSet.reduce((a, h) => a + hourOf(todayKey, h), 0);
      const typical = Math.round(mean1(typicalTodayKeys.map((k) => hourSet.reduce((a, h) => a + hourOf(k, h), 0))));
      promoWindow = { promoId: p.id, title: p.title, startTime: p.startTime, endTime: p.endTime, windowVisits, typicalVisits: typical, extraVisits: windowVisits - typical };
    }
  }

  // Counter app: online when staff signed in with a PIN today or stamped in the last 30 minutes.
  const [signin] = await ctx.db
    .select({ at: auditLogs.createdAt, name: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.merchantId, merchant.id), eq(auditLogs.action, "staff_pin.verified"), gte(auditLogs.createdAt, todayStart)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  const recentStamp = earnRows.some((r) => r.staffId && now.getTime() - r.at.getTime() < 30 * 60_000);

  return {
    asOf: now.toISOString(),
    timezone: tz,
    yesterday: { visits: dayTotal(yesterdayKey), typicalVisits: typicalDay(typicalYesterdayKeys), newMembers: newBy(yesterdayKey), newViaQr: newBy(yesterdayKey, "qr") },
    today: {
      visits: dayTotal(todayKey),
      typicalVisitsFullDay: typicalDay(typicalTodayKeys),
      newMembers: newBy(todayKey),
      newViaQr: newBy(todayKey, "qr"),
      stampsGiven: earnRows.reduce((a, r) => a + r.points, 0),
      redemptions: redeemRows.filter((r) => r.type === "redeem").length,
      regularsSeen,
      regularsTotal: regularIds.length,
    },
    hourly: {
      hours: HOURS,
      typical: HOURS.map((h) => mean1(typicalTodayKeys.map((k) => hourOf(k, h)))),
      today: HOURS.map((h) => hourOf(todayKey, h)),
    },
    rewardsWaiting: {
      count: num(waitingCount?.n),
      goal,
      members: waiting.map((m) => ({ memberId: m.id, name: m.name, balance: m.balance, lastVisitAt: iso(m.lastVisitAt) })),
    },
    slipping: {
      count: slippingIds.length,
      canText: slippingPeople.filter(canText).length,
      members: slippingSorted.slice(0, 3).map((m) => ({ memberId: m.id, name: m.name, usually: rhythms.get(m.id)?.usually ?? null, lastVisitAt: iso(m.lastVisitAt), canText: canText(m) })),
    },
    staff,
    promoWindow,
    counter: { online: !!signin || recentStamp, staffName: signin?.name ?? null, signedInAt: iso(signin?.at) },
  };
}
