/**
 * BIA overview and board report for one neighbourhood (docs/engineering/api/campaigns.md "Neighbourhood overview and
 * report"). Aggregates only: no response carries a customer id, name, phone or email, and the queries never select one
 * out of the database. Access is the same as `GET /v1/admin/neighbourhoods/:id/merchants`: that neighbourhood's
 * manager, or an admin.
 */
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { campaigns, merchantMembers, merchants, neighbourhoods, visits, type DbOrTx } from "@ll/db";
import { campaignsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import type { AuthUser } from "../lib/auth.js";
import { notFound } from "../lib/errors.js";
import { campaignReport, requireNeighbourhoodManager } from "./campaigns.js";
import { toCsv } from "./csv.js";
import { localDayStart } from "./staff.js";

const DAY_MS = 86_400_000;
const TZ = "America/Toronto";
const WEEKS = 12;
type Range = { from: Date; to: Date };

const iso = (r: Range): campaignsApi.PeriodRange => ({ from: r.from.toISOString(), to: r.to.toISOString() });
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** The requested period (default: the 30 days to now) and the same length immediately before it. */
export function resolvePeriod(now: Date, q: { from?: Date; to?: Date }): { period: Range; prior: Range } {
  const to = q.to ?? now;
  const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
  const len = to.getTime() - from.getTime();
  return { period: { from, to }, prior: { from: new Date(from.getTime() - len), to: from } };
}

/** Monday (YYYY-MM-DD, Toronto) of the week containing `at`. */
function weekStartOf(at: Date): string {
  const { date } = localDayStart(at, TZ);
  const d = new Date(`${date}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}
const addDaysYmd = (ymd: string, n: number) => new Date(new Date(`${ymd}T12:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

async function loadHood(db: DbOrTx, id: string) {
  const [h] = await db.select().from(neighbourhoods).where(eq(neighbourhoods.id, id)).limit(1);
  if (!h) throw notFound("Neighbourhood");
  return h;
}

/** Distinct shoppers with a visit at the given shops in a range, and how many visited two or more of those shops. */
async function shopperStats(db: DbOrTx, shopIds: string[], r: Range): Promise<{ active: number; multi: number }> {
  if (!shopIds.length || r.from >= r.to) return { active: 0, multi: 0 };
  const per = db
    .select({ userId: visits.userId, shops: sql<number>`count(distinct ${visits.merchantId})::int`.as("shops") })
    .from(visits)
    .where(and(inArray(visits.merchantId, shopIds), gte(visits.createdAt, r.from), lt(visits.createdAt, r.to)))
    .groupBy(visits.userId)
    .as("per");
  const [row] = await db.select({ active: sql<number>`count(*)::int`, multi: sql<number>`count(*) filter (where ${per.shops} >= 2)::int` }).from(per);
  return { active: Number(row?.active ?? 0), multi: Number(row?.multi ?? 0) };
}

async function visitsAndJoins(db: DbOrTx, shopIds: string[], r: Range) {
  const v = new Map<string, number>();
  const j = new Map<string, number>();
  if (!shopIds.length || r.from >= r.to) return { v, j };
  const [vr, jr] = await Promise.all([
    db
      .select({ id: visits.merchantId, n: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(inArray(visits.merchantId, shopIds), gte(visits.createdAt, r.from), lt(visits.createdAt, r.to)))
      .groupBy(visits.merchantId),
    db
      .select({ id: merchantMembers.merchantId, n: sql<number>`count(*)::int` })
      .from(merchantMembers)
      .where(and(inArray(merchantMembers.merchantId, shopIds), gte(merchantMembers.createdAt, r.from), lt(merchantMembers.createdAt, r.to)))
      .groupBy(merchantMembers.merchantId),
  ]);
  for (const x of vr) v.set(x.id, Number(x.n));
  for (const x of jr) j.set(x.id, Number(x.n));
  return { v, j };
}

export async function neighbourhoodOverview(ctx: AppContext, user: AuthUser, neighbourhoodId: string, q: { from?: Date; to?: Date }): Promise<campaignsApi.NeighbourhoodOverview> {
  await requireNeighbourhoodManager(ctx.db, user, neighbourhoodId);
  const hood = await loadHood(ctx.db, neighbourhoodId);
  return buildOverview(ctx, hood, q);
}

export async function buildOverview(ctx: AppContext, hood: typeof neighbourhoods.$inferSelect, q: { from?: Date; to?: Date }): Promise<campaignsApi.NeighbourhoodOverview> {
  const db = ctx.db;
  const now = ctx.now();
  const { period, prior } = resolvePeriod(now, q);
  const shops = await db.select().from(merchants).where(and(eq(merchants.neighbourhoodId, hood.id), ne(merchants.status, "closed"))).orderBy(asc(merchants.name), asc(merchants.id));
  const ids = shops.map((s) => s.id);

  // 12 weekly buckets ending with the week that holds the last instant of the period.
  const lastWeek = weekStartOf(new Date(period.to.getTime() - 1));
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => addDaysYmd(lastWeek, (i - (WEEKS - 1)) * 7));
  const weeksFrom = localDayStart(new Date(`${weekStarts[0]}T12:00:00Z`), TZ).start;
  const weeksTo = localDayStart(new Date(`${addDaysYmd(lastWeek, 7)}T12:00:00Z`), TZ).start;

  const thirtyAgo = { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
  const [cur, prev, now30, perShop, weekRows, running] = await Promise.all([
    shopperStats(db, ids, period),
    shopperStats(db, ids, prior),
    shopperStats(db, ids, thirtyAgo),
    visitsAndJoins(db, ids, period),
    ids.length
      ? db
          .select({ week: sql<string>`to_char(date_trunc('week', ${visits.createdAt} at time zone ${TZ}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
          .from(visits)
          .where(and(inArray(visits.merchantId, ids), gte(visits.createdAt, weeksFrom), lt(visits.createdAt, weeksTo)))
          .groupBy(sql`1`)
      : Promise.resolve([] as { week: string; n: number }[]),
    db
      .select({ id: campaigns.id, startsAt: campaigns.startsAt, endsAt: campaigns.endsAt })
      .from(campaigns)
      .where(and(eq(campaigns.neighbourhoodId, hood.id), inArray(campaigns.status, ["scheduled", "live", "ended"]), lt(campaigns.startsAt, weeksTo), gte(campaigns.endsAt, weeksFrom))),
  ]);
  const priorVisits = await visitsAndJoins(db, ids, prior);

  const shopsTable: campaignsApi.NeighbourhoodShopRow[] = shops.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    activated: !!s.activatedAt,
    visits: perShop.v.get(s.id) ?? 0,
    newMembers: perShop.j.get(s.id) ?? 0,
  }));
  // Visits sort first, then name: the shops table opens with the busiest, "not activated" ones are reordered by the UI.
  const visitsTotal = shopsTable.reduce((n, s) => n + s.visits, 0);
  const priorTotal = [...priorVisits.v.values()].reduce((n, x) => n + x, 0);

  const weekMap = new Map(weekRows.map((w) => [w.week, Number(w.n)]));
  const weekly = weekStarts.map((weekStart) => {
    const start = localDayStart(new Date(`${weekStart}T12:00:00Z`), TZ).start.getTime();
    const end = start + 7 * DAY_MS;
    return {
      weekStart,
      visits: weekMap.get(weekStart) ?? 0,
      campaignIds: running.filter((c) => c.startsAt.getTime() < end && c.endsAt.getTime() > start).map((c) => c.id),
    };
  });

  const activatedAts = shops.map((s) => s.activatedAt).filter((d): d is Date => !!d);
  const first = activatedAts.length ? Math.min(...activatedAts.map((d) => d.getTime())) : null;
  const liveMonths = first === null ? 0 : Math.max(0, Math.floor((now.getTime() - first) / (30.4375 * DAY_MS)));
  const multiNow = pct(cur.multi, cur.active);

  return {
    period: iso(period),
    prior: iso(prior),
    shops: {
      live: shops.filter((s) => s.status === "active").length,
      members: hood.biaMemberCount ?? null,
      joinedInPeriod: shops.filter((s) => s.createdAt >= period.from && s.createdAt < period.to).length,
    },
    activeMembers: { value: cur.active, delta: cur.active - prev.active },
    multiShopPct: { value: multiNow, deltaPoints: round1(multiNow - pct(prev.multi, prev.active)) },
    visits: { value: visitsTotal, deltaPct: priorTotal > 0 ? round1(((visitsTotal - priorTotal) / priorTotal) * 100) : null },
    weekly,
    shopsTable,
    gates: {
      liveMonths,
      activeShops: shops.filter((s) => s.status === "active").length,
      activeCustomers: now30.active,
      multiShopPct: pct(now30.multi, now30.active),
      thresholds: { ...campaignsApi.UNLOCK_PER_NEIGHBOURHOOD },
    },
  };
}

export async function neighbourhoodReport(ctx: AppContext, user: AuthUser, neighbourhoodId: string, q: { from?: Date; to?: Date }): Promise<campaignsApi.NeighbourhoodReport> {
  await requireNeighbourhoodManager(ctx.db, user, neighbourhoodId);
  const hood = await loadHood(ctx.db, neighbourhoodId);
  const overview = await buildOverview(ctx, hood, q);
  const from = new Date(overview.period.from);
  const to = new Date(overview.period.to);
  const rows = await ctx.db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.neighbourhoodId, hood.id), inArray(campaigns.status, ["scheduled", "live", "ended"]), lt(campaigns.startsAt, to), gte(campaigns.endsAt, from)))
    .orderBy(asc(campaigns.startsAt), asc(campaigns.id));
  const list: campaignsApi.NeighbourhoodReportCampaign[] = [];
  for (const c of rows) {
    const report = await campaignReport(ctx, c);
    list.push({
      id: c.id,
      name: c.name,
      kind: c.kind as campaignsApi.CampaignKind,
      status: c.status as campaignsApi.CampaignStatus,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      shops: report.perMerchant.length,
      report,
    });
  }
  return { neighbourhood: { id: hood.id, name: hood.name }, period: overview.period, prior: overview.prior, generatedAt: ctx.now().toISOString(), overview, campaigns: list };
}

/** The board report as one CSV: a key-numbers block, one row per campaign, one row per shop. */
export function reportCsv(r: campaignsApi.NeighbourhoodReport): string {
  const o = r.overview;
  const rows: (string | number | null)[][] = [
    ["period_from", r.period.from.slice(0, 10)],
    ["period_to", r.period.to.slice(0, 10)],
    [],
    ["measure", "value", "change_vs_prior"],
    ["shops_live", o.shops.live, ""],
    ["bia_members", o.shops.members, ""],
    ["shops_joined_in_period", o.shops.joinedInPeriod, ""],
    ["active_members", o.activeMembers.value, o.activeMembers.delta],
    ["shoppers_at_2_plus_shops_pct", o.multiShopPct.value, o.multiShopPct.deltaPoints],
    ["visits", o.visits.value, o.visits.deltaPct],
    [],
    ["campaign", "kind", "status", "starts", "ends", "shops", "visits", "baseline_visits", "visit_lift_pct", "customers", "new_members", "baseline_new_members", "took_part", "completed", "came_back_within_30_days", "came_back_pct", "came_back_available_from"],
    ...r.campaigns.map((c) => [
      c.name, c.kind, c.status, c.startsAt.slice(0, 10), c.endsAt.slice(0, 10), c.shops, c.report.visits, c.report.baselineVisits, c.report.visitLiftPct, c.report.uniqueCustomers,
      c.report.newMembers, c.report.baselineNewMembers, c.report.participants, c.report.completions, c.report.returnedWithin30d, c.report.returnedWithin30dPct, c.report.returnWindowEndsAt.slice(0, 10),
    ]),
    [],
    ["shop", "status", "activated", "visits", "new_members"],
    ...o.shopsTable.map((s) => [s.name, s.status, s.activated ? "yes" : "no", s.visits, s.newMembers]),
    [],
    ["note", "Aggregates only. No customer is identified in this report."],
  ];
  return toCsv(["report", r.neighbourhood.name], rows);
}
