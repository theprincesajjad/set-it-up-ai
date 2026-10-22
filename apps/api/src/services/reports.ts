/**
 * Merchant reports. Every query is scoped to one merchant; network overlap
 * only ever returns aggregate counts (never another shop's customers).
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import { ledgerTransactions, merchantMembers, merchants, neighbourhoods, promos, redemptions, rewards, users, visits, type DbOrTx } from "@ll/db";
import { reportsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { localParts } from "./ledger.js";
import { countActiveMembers, iso } from "./merchant.js";
import { localDate } from "./messaging.js";

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
export async function promoResults(ctx: AppContext, merchant: Merchant): Promise<reportsApi.PromosReport> {
  const now = ctx.now();
  const list = await ctx.db
    .select()
    .from(promos)
    .where(and(eq(promos.merchantId, merchant.id), ne(promos.status, "draft")))
    .orderBy(desc(promos.startsAt))
    .limit(100);
  const items: reportsApi.PromoResult[] = [];
  for (const p of list) {
    const start = p.startsAt;
    const end = p.endsAt && p.endsAt < now ? p.endsAt : now;
    let attributed = 0;
    let liftPct: number | null = null;
    if (start < end) {
      const vs = await ctx.db
        .select({ at: visits.createdAt })
        .from(visits)
        .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, start), lt(visits.createdAt, end)));
      const recurring = !!(p.daysOfWeek?.length || p.startTime || p.endTime);
      attributed = recurring
        ? vs.filter(({ at }) => {
            const { dow, hhmm } = localParts(at, merchant.timezone);
            return (!p.daysOfWeek?.length || p.daysOfWeek.includes(dow)) && (!p.startTime || hhmm >= p.startTime) && (!p.endTime || hhmm < p.endTime);
          }).length
        : vs.length;
      const [base] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(visits)
        .where(and(eq(visits.merchantId, merchant.id), gte(visits.createdAt, new Date(start.getTime() - 14 * DAY)), lt(visits.createdAt, start)));
      const baseline = num(base?.n) / 14;
      const during = vs.length / Math.max(1, (end.getTime() - start.getTime()) / DAY);
      liftPct = baseline > 0 ? Math.round(((during - baseline) / baseline) * 100) : null;
    }
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
  return {
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
