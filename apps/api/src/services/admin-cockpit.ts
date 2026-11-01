/**
 * The founder's cockpit (team admin, wave N): overview, businesses, landing funnel, health and churn risk.
 * Contract: packages/shared/src/api/admin-cockpit.ts. Every number is computed from the shop's own rows; nothing is estimated.
 *
 * Windows are rolling and end at ctx.now(): "this week" is the last 7 × 24 h, the 30-day period is the last 30 × 24 h and its
 * comparison the 30 days before. Buckets are counted in SQL (bucket 0 = the most recent), so a long history is never loaded.
 *
 * Definitions (the founder reads these in the page's footnotes):
 *  - live: status "active". activated: gave a first stamp or took a first booking (appointment or slot booking).
 *  - paying: an active or past-due subscription with a price on a shop that is not closed. trial: the in-app trial runs or a
 *    Stripe subscription is trialing. trial → paid: in-app trials that ended, and how many of those shops ever paid. churned: closed, or a cancelled subscription and nothing paying now. free: the rest.
 *  - stamps: earn transactions not reversed. bookings: appointments (lapsed unpaid holds excluded) and slot bookings, by when made.
 *  - GMV: paid orders, paid invoices, appointment deposits not carried by a paid invoice, paid tiffin and class charges, and sales a
 *    POS integration reported with an award. active customers: distinct people with a visit or a completed appointment.
 * Customer PII never leaves this file: only counts and cents per shop.
 */
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { merchantMilestones, locations, merchants, subscriptions, type DbOrTx } from "@ll/db";
import { adminCockpitApi as api } from "@ll/shared";
import type { AppContext } from "../context.js";
import { notFound } from "../lib/errors.js";
import { rowsOf } from "../lib/sql.js";
import { addOnMrrByMerchant, subscriptionMrrCents } from "./admin-ops.js";
import { writeAudit } from "./admin-audit.js";
import { PATH_BY_PAGE } from "./landing-events.js";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const POS_SOURCES = ["square", "clover", "shopify", "lightspeed", "toast", "api"] as const;
const PAYING = new Set(["active", "past_due"]);
const num = (v: unknown) => Number(v ?? 0);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
export const delta = (current: number, previous: number): api.Delta => ({ current, previous, deltaPct: pct(current, previous) });

type MerchantRow = typeof merchants.$inferSelect;
type SubRow = typeof subscriptions.$inferSelect;

// ---------------------------------------------------------------------------
// Bucketed activity (SQL)
// ---------------------------------------------------------------------------
export const METRICS = ["stamps", "bookings", "logins", "orders", "invoices", "deposits", "tiffin", "classes", "pos"] as const;
export type Metric = (typeof METRICS)[number];
const GMV_METRICS = ["orders", "invoices", "deposits", "tiffin", "classes", "pos"] as const satisfies readonly Metric[];

/** One SELECT per metric: (merchant_id, ts, v). Timestamps are bounded by the caller. */
function metricSources(since: string, until: string, merchantId?: string): SQL {
  const m = (col: SQL) => (merchantId ? sql`and ${col} = ${merchantId}::uuid` : sql``);
  const win = (col: SQL) => sql`${col} > ${since}::timestamptz and ${col} <= ${until}::timestamptz`;
  const pos = sql.join(POS_SOURCES.map((s) => sql`${s}`), sql`, `);
  return sql`
    select merchant_id, created_at as ts, 'stamps' as k, 1::bigint as v from ledger_transactions
      where type = 'earn' and reversed_at is null and ${win(sql`created_at`)} ${m(sql`merchant_id`)}
    union all select merchant_id, created_at, 'bookings', 1 from appointments
      where not (status = 'cancelled' and coalesce(cancel_reason, '') = 'hold_expired') and ${win(sql`created_at`)} ${m(sql`merchant_id`)}
    union all select merchant_id, created_at, 'bookings', 1 from bookings where ${win(sql`created_at`)} ${m(sql`merchant_id`)}
    union all select ms.merchant_id, s.created_at, 'logins', 1 from sessions s join merchant_staff ms on ms.user_id = s.user_id
      where ${win(sql`s.created_at`)} ${m(sql`ms.merchant_id`)}
    union all select merchant_id, paid_at, 'orders', total_cents from orders where paid_at is not null and ${win(sql`paid_at`)} ${m(sql`merchant_id`)}
    union all select merchant_id, paid_at, 'invoices', total_cents from invoices where paid_at is not null and ${win(sql`paid_at`)} ${m(sql`merchant_id`)}
    union all select a.merchant_id, a.deposit_paid_at, 'deposits', a.deposit_cents from appointments a
      where a.deposit_paid_at is not null and a.deposit_cents > 0 and ${win(sql`a.deposit_paid_at`)} ${m(sql`a.merchant_id`)}
        and not exists (select 1 from invoices i where i.id = a.invoice_id and i.paid_at is not null)
    union all select merchant_id, paid_at, 'tiffin', amount_cents from tiffin_charges where status = 'paid' and paid_at is not null and ${win(sql`paid_at`)} ${m(sql`merchant_id`)}
    union all select merchant_id, paid_at, 'classes', amount_cents from class_charges where status = 'paid' and paid_at is not null and ${win(sql`paid_at`)} ${m(sql`merchant_id`)}
    union all select merchant_id, created_at, 'pos', coalesce(amount_cents, 0) from ledger_transactions
      where type = 'earn' and reversed_at is null and source in (${pos}) and ${win(sql`created_at`)} ${m(sql`merchant_id`)}`;
}

type Buckets = Record<Metric, number[]>;
const emptyBuckets = (n: number): Buckets => Object.fromEntries(METRICS.map((k) => [k, new Array<number>(n).fill(0)])) as Buckets;

/**
 * Activity in `n` rolling buckets of `bucketMs` ending at `now`, bucket 0 the most recent. `byMerchant` keys by shop, else one
 * network-wide entry under "*".
 */
export async function bucketedActivity(db: DbOrTx, now: Date, bucketMs: number, n: number, opts: { byMerchant?: boolean; merchantId?: string } = {}): Promise<Map<string, Buckets>> {
  const until = now.toISOString();
  const since = new Date(now.getTime() - bucketMs * n).toISOString();
  const nowSec = now.getTime() / 1000;
  const bucketSec = bucketMs / 1000;
  const key = opts.byMerchant ? sql`merchant_id::text` : sql`'*'`;
  const rows = rowsOf<{ id: string; bk: number; k: Metric; v: string | number }>(
    await db.execute(sql`
      select ${key} as id, floor((${nowSec}::double precision - extract(epoch from ts)) / ${bucketSec})::int as bk, k, sum(v)::bigint as v
      from (${metricSources(since, until, opts.merchantId)}) x group by 1, 2, 3`),
  );
  const out = new Map<string, Buckets>();
  for (const r of rows) {
    const bk = num(r.bk);
    if (bk < 0 || bk >= n) continue;
    let b = out.get(r.id);
    if (!b) out.set(r.id, (b = emptyBuckets(n)));
    b[r.k][bk]! += num(r.v);
  }
  return out;
}

/** Distinct customers (a visit or a completed appointment) per bucket, bucket 0 the most recent. */
export async function activeCustomers(db: DbOrTx, now: Date, bucketMs: number, n: number, opts: { byMerchant?: boolean; merchantId?: string } = {}): Promise<Map<string, number[]>> {
  const until = now.toISOString();
  const since = new Date(now.getTime() - bucketMs * n).toISOString();
  const nowSec = now.getTime() / 1000;
  const m = (col: SQL) => (opts.merchantId ? sql`and ${col} = ${opts.merchantId}::uuid` : sql``);
  const key = opts.byMerchant ? sql`merchant_id::text` : sql`'*'`;
  const rows = rowsOf<{ id: string; bk: number; n: number }>(
    await db.execute(sql`
      select ${key} as id, floor((${nowSec}::double precision - extract(epoch from ts)) / ${bucketMs / 1000})::int as bk, count(distinct user_id)::int as n from (
        select merchant_id, user_id, created_at as ts from visits where created_at > ${since}::timestamptz and created_at <= ${until}::timestamptz ${m(sql`merchant_id`)}
        union all select merchant_id, user_id, coalesce(completed_at, starts_at) from appointments
          where status = 'completed' and user_id is not null and coalesce(completed_at, starts_at) > ${since}::timestamptz and coalesce(completed_at, starts_at) <= ${until}::timestamptz ${m(sql`merchant_id`)}
      ) x group by 1, 2`),
  );
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const bk = num(r.bk);
    if (bk < 0 || bk >= n) continue;
    let b = out.get(r.id);
    if (!b) out.set(r.id, (b = new Array<number>(n).fill(0)));
    b[bk] = num(r.n);
  }
  return out;
}

/** Last activity (stamp, booking or staff login) per shop, all time. */
async function lastActive(db: DbOrTx, merchantId?: string): Promise<Map<string, Date>> {
  const m = (col: SQL) => (merchantId ? sql`where ${col} = ${merchantId}::uuid` : sql``);
  const rows = rowsOf<{ id: string; at: string | Date }>(
    await db.execute(sql`
      select merchant_id::text as id, max(ts) as at from (
        select merchant_id, max(created_at) as ts from ledger_transactions ${m(sql`merchant_id`)} group by 1
        union all select merchant_id, max(created_at) from appointments ${m(sql`merchant_id`)} group by 1
        union all select merchant_id, max(created_at) from bookings ${m(sql`merchant_id`)} group by 1
        union all select ms.merchant_id, max(s.created_at) from sessions s join merchant_staff ms on ms.user_id = s.user_id ${m(sql`ms.merchant_id`)} group by 1
      ) x group by 1`),
  );
  return new Map(rows.filter((r) => r.at).map((r) => [r.id, new Date(r.at)]));
}

/** Shops that ever gave a stamp or took a booking, with the first time each happened. */
async function firsts(db: DbOrTx, merchantId?: string): Promise<Map<string, { stamp: Date | null; booking: Date | null; customer: Date | null }>> {
  const m = (col: SQL) => (merchantId ? sql`and ${col} = ${merchantId}::uuid` : sql``);
  const rows = rowsOf<{ id: string; k: string; at: string | Date }>(
    await db.execute(sql`
      select merchant_id::text as id, 'stamp' as k, min(created_at) as at from ledger_transactions where type = 'earn' ${m(sql`merchant_id`)} group by 1
      union all select merchant_id::text, 'booking', min(created_at) from appointments where true ${m(sql`merchant_id`)} group by 1
      union all select merchant_id::text, 'booking', min(created_at) from bookings where true ${m(sql`merchant_id`)} group by 1
      union all select merchant_id::text, 'customer', min(created_at) from merchant_members where true ${m(sql`merchant_id`)} group by 1`),
  );
  const out = new Map<string, { stamp: Date | null; booking: Date | null; customer: Date | null }>();
  for (const r of rows) {
    const cur = out.get(r.id) ?? { stamp: null, booking: null, customer: null };
    const at = new Date(r.at);
    const k = r.k as "stamp" | "booking" | "customer";
    if (!cur[k] || at < cur[k]!) cur[k] = at;
    out.set(r.id, cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-shop facts: plan, status, MRR, flags
// ---------------------------------------------------------------------------
export interface ShopFacts {
  m: MerchantRow;
  city: string | null;
  subs: SubRow[];
  mrrCents: number;
  status: api.BusinessStatus;
  plan: string;
  everPaidAt: Date | null;
  activated: boolean;
}

/** Status, plan and MRR of one shop from its subscriptions. Pure, so the rules are unit-tested with fixed rows. */
export function classify(m: Pick<MerchantRow, "status" | "plan" | "trialPlan" | "trialEndsAt" | "foundingOffer">, subs: SubRow[], addOnCents: number, now: Date): Pick<ShopFacts, "mrrCents" | "status" | "plan" | "everPaidAt"> {
  const paying = m.status === "closed" ? [] : subs.filter((s) => PAYING.has(s.status));
  const base = paying.reduce((a, s) => a + subscriptionMrrCents(s, m.foundingOffer), 0);
  const mrrCents = base > 0 ? base + addOnCents : 0;
  const paidSubs = subs.filter((s) => PAYING.has(s.status) || s.status === "canceled").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const top = paying.find((s) => subscriptionMrrCents(s, m.foundingOffer) > 0);
  const trialing = (m.trialEndsAt && m.trialEndsAt > now) || subs.some((s) => s.status === "trialing");
  let status: api.BusinessStatus;
  if (m.status === "closed") status = "churned";
  else if (mrrCents > 0) status = "paying";
  else if (trialing) status = "trial";
  else if (subs.some((s) => s.status === "canceled")) status = "churned";
  else status = "free";
  const plan = top ? (top.restaurantTier ? "restaurant" : top.plan) : status === "trial" ? (m.trialPlan ?? subs.find((s) => s.status === "trialing")?.plan ?? m.plan) : m.plan;
  return { mrrCents, status, plan, everPaidAt: paidSubs[0]?.createdAt ?? null };
}

async function shopFacts(ctx: AppContext, merchantId?: string): Promise<ShopFacts[]> {
  const db = ctx.db;
  const [ms, subs, locs, first] = await Promise.all([
    db.select().from(merchants).where(merchantId ? eq(merchants.id, merchantId) : undefined),
    db.select().from(subscriptions).where(merchantId ? eq(subscriptions.merchantId, merchantId) : undefined).orderBy(asc(subscriptions.createdAt)),
    db.select({ merchantId: locations.merchantId, city: locations.city }).from(locations).where(merchantId ? eq(locations.merchantId, merchantId) : undefined).orderBy(asc(locations.createdAt)),
    firsts(db, merchantId),
  ]);
  const subsBy = new Map<string, SubRow[]>();
  for (const s of subs) subsBy.set(s.merchantId, [...(subsBy.get(s.merchantId) ?? []), s]);
  const cityBy = new Map<string, string>();
  for (const l of locs) if (!cityBy.has(l.merchantId)) cityBy.set(l.merchantId, l.city);
  const addOns = await addOnMrrByMerchant(db, subs.filter((s) => PAYING.has(s.status)).map((s) => ({ s })), merchantId);
  const now = ctx.now();
  return ms.map((m) => {
    const mine = subsBy.get(m.id) ?? [];
    const f = first.get(m.id);
    return { m, city: cityBy.get(m.id) ?? null, subs: mine, ...classify(m, mine, addOns.get(m.id)?.totalCents ?? 0, now), activated: !!(f?.stamp || f?.booking) };
  });
}

const usageOf = (b: Buckets | undefined, i: number) => (b ? b.stamps[i]! + b.bookings[i]! + b.logins[i]! : 0);

export interface FlagInput {
  m: Pick<MerchantRow, "status" | "createdAt" | "trialEndsAt">;
  subs: Pick<SubRow, "status">[];
  activated: boolean;
  /** Stamps + bookings + logins in the last 7 days and the 7 before. */
  usageThisWeek: number;
  usageLastWeek: number;
  lastActiveAt: Date | null;
}
export const USAGE_DROP = { minPreviousWeek: 5, dropPct: 40 } as const;

/** Churn-risk flags, most urgent first, with one sentence each. Pure. */
export function healthFlags(f: FlagInput, now: Date): { flags: api.HealthFlag[]; reasons: string[] } {
  const flags: api.HealthFlag[] = [];
  const reasons: string[] = [];
  if (f.m.status === "closed" || f.m.status === "paused") return { flags, reasons };
  if (f.subs.some((s) => s.status === "past_due")) {
    flags.push("payment_failed");
    reasons.push("The last subscription payment failed.");
  }
  if (f.m.trialEndsAt && f.m.trialEndsAt > now && f.m.trialEndsAt.getTime() - now.getTime() <= 7 * DAY && !f.activated) {
    const days = Math.ceil((f.m.trialEndsAt.getTime() - now.getTime()) / DAY);
    flags.push("trial_ending_not_activated");
    reasons.push(`Trial ends in ${days} ${days === 1 ? "day" : "days"} and no stamp or booking yet.`);
  }
  if (f.usageLastWeek >= USAGE_DROP.minPreviousWeek && f.usageThisWeek < f.usageLastWeek * (1 - USAGE_DROP.dropPct / 100)) {
    flags.push("usage_drop");
    reasons.push(`Usage dropped ${Math.round(((f.usageLastWeek - f.usageThisWeek) / f.usageLastWeek) * 100)}% week over week (${f.usageLastWeek} → ${f.usageThisWeek}).`);
  }
  const quietSince = f.lastActiveAt ?? f.m.createdAt;
  if (now.getTime() - f.m.createdAt.getTime() >= 14 * DAY && now.getTime() - quietSince.getTime() >= 14 * DAY) {
    flags.push("no_activity_14d");
    reasons.push(f.lastActiveAt ? `No stamp, booking or login in ${Math.floor((now.getTime() - f.lastActiveAt.getTime()) / DAY)} days.` : "No stamp, booking or login since signing up.");
  }
  return { flags, reasons };
}
const FLAG_RANK: Record<api.HealthFlag, number> = { payment_failed: 0, trial_ending_not_activated: 1, usage_drop: 2, no_activity_14d: 3 };

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
const sumRange = (a: number[], from: number, to: number) => a.slice(from, to).reduce((x, y) => x + y, 0);
const gmvAt = (b: Buckets, from: number, to: number) => GMV_METRICS.reduce((a, k) => a + sumRange(b[k], from, to), 0);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function cockpit(ctx: AppContext, days: api.CockpitPeriod): Promise<api.Cockpit> {
  const now = ctx.now();
  const n = days * 2;
  const [facts, daily, weeks, cust, custWeeks, signupRows] = await Promise.all([
    shopFacts(ctx),
    bucketedActivity(ctx.db, now, DAY, Math.max(n, 84)),
    bucketedActivity(ctx.db, now, WEEK, 12),
    activeCustomers(ctx.db, now, days * DAY, 2),
    activeCustomers(ctx.db, now, WEEK, 12),
    ctx.db.select({ at: merchants.createdAt }).from(merchants),
  ]);
  const d = daily.get("*") ?? emptyBuckets(Math.max(n, 84));
  const w = weeks.get("*") ?? emptyBuckets(12);
  const c = cust.get("*") ?? [0, 0];
  const cw = custWeeks.get("*") ?? new Array<number>(12).fill(0);
  const ago = (t: Date) => now.getTime() - t.getTime();
  const signupsIn = (fromMs: number, toMs: number) => signupRows.filter((r) => ago(r.at) >= fromMs && ago(r.at) < toMs && r.at <= now).length;

  const open = facts.filter((f) => f.m.status !== "closed");
  const payingByPlan: Record<api.PayingPlanKey, number> = { plus: 0, studio: 0, pro: 0, restaurant: 0 };
  let mrr = 0;
  for (const f of facts) {
    if (f.status !== "paying") continue;
    mrr += f.mrrCents;
    payingByPlan[(f.plan in payingByPlan ? f.plan : "plus") as api.PayingPlanKey]++;
  }
  // Trial → paid: the in-app 14-day trials that have ended, and how many of those shops have paid since (any paid subscription).
  const trialEnded = facts.filter((f) => f.m.trialStartedAt && f.m.trialEndsAt && f.m.trialEndsAt <= now);
  const converted = trialEnded.filter((f) => f.everPaidAt).length;

  const split: api.GmvSplit = { ordersCents: sumRange(d.orders, 0, days), invoicesCents: sumRange(d.invoices, 0, days), depositsCents: sumRange(d.deposits, 0, days), tiffinCents: sumRange(d.tiffin, 0, days), classesCents: sumRange(d.classes, 0, days), posCents: sumRange(d.pos, 0, days) };
  const weekly: api.WeeklyPoint[] = Array.from({ length: 12 }, (_, j) => {
    const i = 11 - j;
    return {
      weekStart: ymd(new Date(now.getTime() - (i + 1) * WEEK)),
      signups: signupsIn(i * WEEK, (i + 1) * WEEK),
      gmvCents: gmvAt(w, i, i + 1),
      stamps: w.stamps[i]!,
      bookings: w.bookings[i]!,
      activeCustomers: cw[i]!,
    };
  });
  return {
    generatedAt: now.toISOString(),
    days,
    signupsWeek: delta(signupsIn(0, WEEK), signupsIn(WEEK, 2 * WEEK)),
    shops: {
      total: open.length,
      live: open.filter((f) => f.m.status === "active").length,
      activated: open.filter((f) => f.activated).length,
      paying: facts.filter((f) => f.status === "paying").length,
      trialing: facts.filter((f) => f.status === "trial").length,
      churned: facts.filter((f) => f.status === "churned").length,
      payingByPlan,
    },
    money: { mrrCents: mrr, arrCents: mrr * 12, trialToPaid: { ended: trialEnded.length, converted, rate: trialEnded.length ? Math.round((converted / trialEnded.length) * 1000) / 1000 : null } },
    period: {
      signups: delta(signupsIn(0, days * DAY), signupsIn(days * DAY, 2 * days * DAY)),
      gmvCents: delta(gmvAt(d, 0, days), gmvAt(d, days, n)),
      gmvSplit: split,
      stamps: delta(sumRange(d.stamps, 0, days), sumRange(d.stamps, days, n)),
      bookings: delta(sumRange(d.bookings, 0, days), sumRange(d.bookings, days, n)),
      activeCustomers: delta(c[0]!, c[1]!),
    },
    weekly,
  };
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
async function businessRows(ctx: AppContext, merchantId?: string): Promise<{ rows: api.BusinessRow[]; facts: ShopFacts[]; weekly: Map<string, Buckets>; last: Map<string, Date> }> {
  const now = ctx.now();
  const [facts, month, weekly, cust, last] = await Promise.all([
    shopFacts(ctx, merchantId),
    bucketedActivity(ctx.db, now, 30 * DAY, 1, { byMerchant: true, merchantId }),
    bucketedActivity(ctx.db, now, WEEK, 8, { byMerchant: true, merchantId }),
    activeCustomers(ctx.db, now, 30 * DAY, 1, { byMerchant: true, merchantId }),
    lastActive(ctx.db, merchantId),
  ]);
  const rows = facts.map((f): api.BusinessRow => {
    const mo = month.get(f.m.id);
    const wk = weekly.get(f.m.id);
    const { flags } = healthFlags({ m: f.m, subs: f.subs, activated: f.activated, usageThisWeek: usageOf(wk, 0), usageLastWeek: usageOf(wk, 1), lastActiveAt: last.get(f.m.id) ?? null }, now);
    return {
      id: f.m.id,
      name: f.m.name,
      slug: f.m.slug,
      trade: f.m.vertical,
      plan: f.plan,
      city: f.city,
      status: f.status,
      flags,
      signedUpAt: f.m.createdAt.toISOString(),
      lastActiveAt: iso(last.get(f.m.id)),
      mrrCents: f.mrrCents,
      gmv30dCents: mo ? gmvAt(mo, 0, 1) : 0,
      stamps30d: mo?.stamps[0] ?? 0,
      bookings30d: mo?.bookings[0] ?? 0,
      activeCustomers30d: cust.get(f.m.id)?.[0] ?? 0,
      landingPage: f.m.signupPage,
      source: f.m.signupSrc ?? f.m.signupUtmSource,
    };
  });
  return { rows, facts, weekly, last };
}

/** Filters, then sorts; the status counts are taken before the status filter so the chips show what each would give. */
export function filterBusinesses(rows: api.BusinessRow[], q: api.ListBusinessesQuery, now: Date): api.BusinessList {
  const needle = q.q?.toLowerCase();
  const base = rows.filter((r) => {
    if (needle && !r.name.toLowerCase().includes(needle) && !r.slug.includes(needle)) return false;
    if (q.trade && r.trade !== q.trade) return false;
    if (q.plan && r.plan !== q.plan) return false;
    if (q.city && (r.city ?? "").toLowerCase() !== q.city.toLowerCase()) return false;
    if (q.signedFrom && r.signedUpAt.slice(0, 10) < q.signedFrom) return false;
    if (q.signedTo && r.signedUpAt.slice(0, 10) > q.signedTo) return false;
    if (q.activeWithin !== undefined) {
      const age = r.lastActiveAt ? (now.getTime() - new Date(r.lastActiveAt).getTime()) / DAY : Infinity;
      if (q.activeWithin >= 0 ? age > q.activeWithin : age < -q.activeWithin) return false;
    }
    return true;
  });
  const counts = { trial: 0, paying: 0, churned: 0, free: 0, at_risk: 0 };
  for (const r of base) {
    counts[r.status]++;
    if (r.flags.length) counts.at_risk++;
  }
  const filtered = q.status ? base.filter((r) => (q.status === "at_risk" ? r.flags.length > 0 : r.status === q.status)) : base;
  const dir = q.dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const x = a[q.sort];
    const y = b[q.sort];
    // Empty values (never active) sort last either way.
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * dir || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return {
    items: filtered.slice(q.offset, q.offset + q.limit),
    total: filtered.length,
    counts,
    facets: { trades: [...new Set(rows.map((r) => r.trade))].sort(), cities: [...new Set(rows.map((r) => r.city).filter((c): c is string => !!c))].sort() },
  };
}

export async function listBusinesses(ctx: AppContext, q: api.ListBusinessesQuery): Promise<api.BusinessList> {
  return filterBusinesses((await businessRows(ctx)).rows, q, ctx.now());
}

export const BUSINESS_CSV_HEADERS = ["id", "name", "trade", "plan", "city", "status", "flags", "signed_up_at", "last_active_at", "mrr_cents", "gmv_30d_cents", "stamps_30d", "bookings_30d", "active_customers_30d", "landing_page", "source"];
export function businessCsvRows(items: api.BusinessRow[]) {
  return items.map((r) => [r.id, r.name, r.trade, r.plan, r.city, r.status, r.flags.join(" "), r.signedUpAt, r.lastActiveAt, r.mrrCents, r.gmv30dCents, r.stamps30d, r.bookings30d, r.activeCustomers30d, r.landingPage, r.source]);
}

/** One business, for the detail page. Every call is written to the audit log (who looked at which shop). */
export async function businessDetail(ctx: AppContext, actorUserId: string, merchantId: string, ip?: string): Promise<api.BusinessDetail> {
  const { rows, facts, last } = await businessRows(ctx, merchantId);
  const row = rows[0];
  const f = facts[0];
  if (!row || !f) throw notFound("Business");
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "admin.business_viewed", entity: "merchant", entityId: merchantId, ip });
  const now = ctx.now();
  const [weeks, cust, first, ms, allTime] = await Promise.all([
    bucketedActivity(ctx.db, now, WEEK, 12, { merchantId }),
    activeCustomers(ctx.db, now, WEEK, 12, { merchantId }),
    firsts(ctx.db, merchantId),
    ctx.db.select({ key: merchantMilestones.key, at: merchantMilestones.reachedAt }).from(merchantMilestones).where(and(eq(merchantMilestones.merchantId, merchantId), inArray(merchantMilestones.key, ["booking_link_live", "first_stamp"]))),
    bucketedActivity(ctx.db, now, 20 * 365 * DAY, 1, { merchantId }),
  ]);
  const w = weeks.get("*") ?? emptyBuckets(12);
  const cw = cust.get("*") ?? new Array<number>(12).fill(0);
  const fi = first.get(merchantId);
  const ms1 = (k: string) => ms.find((x) => x.key === k)?.at ?? null;
  const m = f.m;
  const month = await bucketedActivity(ctx.db, now, 30 * DAY, 1, { merchantId });
  const mo = month.get("*") ?? emptyBuckets(1);
  const last30 = { ordersCents: mo.orders[0]!, invoicesCents: mo.invoices[0]!, depositsCents: mo.deposits[0]!, tiffinCents: mo.tiffin[0]!, classesCents: mo.classes[0]!, posCents: mo.pos[0]! };
  const usageThisWeek = usageOf(w, 0);
  const usageLastWeek = usageOf(w, 1);
  const { flags, reasons } = healthFlags({ m, subs: f.subs, activated: f.activated, usageThisWeek, usageLastWeek, lastActiveAt: last.get(merchantId) ?? null }, now);
  return {
    row,
    funnel: [
      { key: "signed_up", at: m.createdAt.toISOString() },
      { key: "booking_link_live", at: iso(ms1("booking_link_live")) },
      { key: "first_customer", at: iso(fi?.customer) },
      { key: "first_stamp", at: iso(fi?.stamp ?? ms1("first_stamp")) },
      { key: "paid", at: iso(f.everPaidAt) },
    ],
    usage: Array.from({ length: 12 }, (_, j) => {
      const i = 11 - j;
      return { weekStart: ymd(new Date(now.getTime() - (i + 1) * WEEK)), stamps: w.stamps[i]!, bookings: w.bookings[i]!, logins: w.logins[i]!, gmvCents: gmvAt(w, i, i + 1), activeCustomers: cw[i]! };
    }),
    gmv: { last30: { ...last30, totalCents: Object.values(last30).reduce((a, b) => a + b, 0) }, allTimeCents: gmvAt(allTime.get("*") ?? emptyBuckets(1), 0, 1) },
    billing: {
      plan: f.plan,
      trial: m.trialStartedAt || m.trialEndsAt ? { plan: m.trialPlan, startedAt: iso(m.trialStartedAt), endsAt: iso(m.trialEndsAt) } : null,
      subscriptions: [...f.subs].reverse().map((s) => ({ id: s.id, plan: s.plan, restaurantTier: s.restaurantTier, status: s.status, interval: s.interval, createdAt: s.createdAt.toISOString(), currentPeriodEnd: iso(s.currentPeriodEnd), mrrCents: subscriptionMrrCents(s, m.foundingOffer) })),
    },
    attribution: {
      landingPage: m.signupPage,
      variant: m.signupVariant,
      experimentId: m.signupExperimentId,
      source: m.signupSrc,
      utmSource: m.signupUtmSource,
      utmMedium: m.signupUtmMedium,
      utmCampaign: m.signupUtmCampaign,
      device: m.signupDevice,
      matchedVisit: !!(m.signupAnonId && m.signupPage),
    },
    health: { flags, detail: reasons, usageThisWeek, usageLastWeek, changePct: pct(usageThisWeek, usageLastWeek) },
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export async function healthReport(ctx: AppContext): Promise<api.HealthReport> {
  const now = ctx.now();
  const { facts, weekly, last } = await businessRows(ctx);
  const counts: Record<api.HealthFlag, number> = { payment_failed: 0, trial_ending_not_activated: 0, usage_drop: 0, no_activity_14d: 0 };
  const atRisk: (api.HealthRow & { rank: number })[] = [];
  for (const f of facts) {
    const wk = weekly.get(f.m.id);
    const thisWeek = usageOf(wk, 0);
    const lastWeek = usageOf(wk, 1);
    const { flags, reasons } = healthFlags({ m: f.m, subs: f.subs, activated: f.activated, usageThisWeek: thisWeek, usageLastWeek: lastWeek, lastActiveAt: last.get(f.m.id) ?? null }, now);
    if (!flags.length) continue;
    for (const fl of flags) counts[fl]++;
    atRisk.push({
      merchantId: f.m.id,
      name: f.m.name,
      trade: f.m.vertical,
      status: f.status,
      mrrCents: f.mrrCents,
      flags,
      reasons,
      trend: Array.from({ length: 8 }, (_, j) => usageOf(wk, 7 - j)),
      changePct: pct(thisWeek, lastWeek),
      lastActiveAt: iso(last.get(f.m.id)),
      rank: FLAG_RANK[flags[0]!],
    });
  }
  atRisk.sort((a, b) => a.rank - b.rank || b.mrrCents - a.mrrCents || a.name.localeCompare(b.name));
  return { generatedAt: now.toISOString(), counts, atRisk: atRisk.map(({ rank: _r, ...r }) => r) };
}

// ---------------------------------------------------------------------------
// Landing and conversion funnel
// ---------------------------------------------------------------------------
const zero = (): api.FunnelCounts => ({ views: 0, ctaClicks: 0, signupStarted: 0, signupCompleted: 0, wentLive: 0, paid: 0 });
export const UNATTRIBUTED = "unattributed";

export async function landingFunnel(ctx: AppContext, days: api.CockpitPeriod, by: api.FunnelDimension): Promise<api.LandingFunnel> {
  const now = ctx.now();
  const since = new Date(now.getTime() - days * DAY);
  const events = rowsOf<{ anon_id: string; kind: string; page: string; variant: string; src: string | null; utm_source: string | null; device: string; created_at: string | Date }>(
    await ctx.db.execute(sql`select anon_id, kind, page, variant, src, utm_source, device, created_at from landing_events
      where created_at > ${since.toISOString()}::timestamptz and created_at <= ${now.toISOString()}::timestamptz and kind in ('view', 'cta_click', 'start_submit', 'signup_start')
      order by created_at asc`),
  );
  const keyOf = (e: { page: string | null; variant: string | null; src: string | null; utmSource: string | null; device: string | null }): string => {
    const path = e.page ? (PATH_BY_PAGE[e.page] ?? e.page) : null;
    if (by === "page") return path ?? UNATTRIBUTED;
    if (by === "variant") return path ? `${path} · ${e.variant ?? "control"}` : UNATTRIBUTED;
    if (by === "source") return e.src ?? e.utmSource ?? "direct";
    return e.device ?? UNATTRIBUTED;
  };
  // A visitor is placed by their first view in the window; a visitor with no view by the event itself.
  const firstKey = new Map<string, string>();
  for (const e of events) if (e.kind === "view" && !firstKey.has(e.anon_id)) firstKey.set(e.anon_id, keyOf({ page: e.page, variant: e.variant, src: e.src, utmSource: e.utm_source, device: e.device }));
  const sets = new Map<string, { views: Set<string>; cta: Set<string>; started: Set<string> }>();
  const setFor = (k: string) => {
    let s = sets.get(k);
    if (!s) sets.set(k, (s = { views: new Set(), cta: new Set(), started: new Set() }));
    return s;
  };
  for (const e of events) {
    const k = firstKey.get(e.anon_id) ?? keyOf({ page: e.page, variant: e.variant, src: e.src, utmSource: e.utm_source, device: e.device });
    const s = setFor(k);
    if (e.kind === "view") s.views.add(e.anon_id);
    else if (e.kind === "cta_click") s.cta.add(e.anon_id);
    else s.started.add(e.anon_id);
  }
  const rows = new Map<string, api.FunnelCounts>();
  const row = (k: string) => {
    let r = rows.get(k);
    if (!r) rows.set(k, (r = zero()));
    return r;
  };
  for (const [k, s] of sets) Object.assign(row(k), { views: s.views.size, ctaClicks: s.cta.size, signupStarted: s.started.size });

  const signups = await ctx.db
    .select({ id: merchants.id, status: merchants.status, page: merchants.signupPage, variant: merchants.signupVariant, src: merchants.signupSrc, utm: merchants.signupUtmSource, device: merchants.signupDevice })
    .from(merchants)
    .where(and(sql`${merchants.createdAt} > ${since.toISOString()}::timestamptz`, sql`${merchants.createdAt} <= ${now.toISOString()}::timestamptz`));
  const ids = signups.map((s) => s.id);
  const [live, paid] = ids.length
    ? await Promise.all([
        ctx.db.select({ id: merchantMilestones.merchantId }).from(merchantMilestones).where(and(inArray(merchantMilestones.merchantId, ids), eq(merchantMilestones.key, "booking_link_live"))),
        ctx.db.select({ id: subscriptions.merchantId }).from(subscriptions).where(and(inArray(subscriptions.merchantId, ids), inArray(subscriptions.status, ["active", "past_due", "canceled"]))),
      ])
    : [[], []];
  const liveIds = new Set(live.map((r) => r.id));
  const paidIds = new Set(paid.map((r) => r.id));
  for (const s of signups) {
    // A signup with no landing page carries only its src (or nothing): it is filed by source, else as unattributed.
    const pagePath = s.page;
    const k =
      by === "page" ? (pagePath ?? UNATTRIBUTED)
      : by === "variant" ? (pagePath ? `${pagePath} · ${s.variant ?? "control"}` : UNATTRIBUTED)
      : by === "source" ? (s.src ?? s.utm ?? (pagePath ? "direct" : UNATTRIBUTED))
      : (s.device ?? UNATTRIBUTED);
    const r = row(k);
    r.signupCompleted++;
    if (s.status === "active" || liveIds.has(s.id)) r.wentLive++;
    if (paidIds.has(s.id)) r.paid++;
  }
  const total = zero();
  for (const r of rows.values()) for (const k of Object.keys(total) as (keyof api.FunnelCounts)[]) total[k] += r[k];
  const list = [...rows].map(([key, r]) => ({ key, ...r })).sort((a, b) => b.views - a.views || b.signupCompleted - a.signupCompleted || a.key.localeCompare(b.key));
  return { generatedAt: now.toISOString(), days, by, total, rows: list };
}
