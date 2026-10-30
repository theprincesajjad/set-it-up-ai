/**
 * Founder's console: activation funnel by area, MRR and fee revenue, at-risk shops, cost per shop,
 * charge mode, and support sessions. Everything is computed from subscriptions, payments, members,
 * visits and usage counters; the only assumptions are the unit costs and launch plan in @ll/shared/launch.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { invoices, leads, merchantAddOns, merchantMembers, merchants, neighbourhoods, orders, subscriptions, supportSessions, tiffinCharges, users, type DbOrTx } from "@ll/db";
import { ADD_ONS, AT_RISK, LAUNCH_PLAN, PLANS, RESTAURANT_PLANS, FOUNDING_OFFER, UNIT_COSTS, adminApi, messagingCostCents, planPace } from "@ll/shared";
import type { AppContext } from "../context.js";
import { notFound } from "../lib/errors.js";
import { writeAudit } from "./admin-audit.js";
import { listRepMerchants } from "./rep.js";
import { smsAllowance } from "./messaging.js";

const DAY = 86400000;
const num = (v: unknown) => Number(v ?? 0);
type MerchantRow = typeof merchants.$inferSelect;
type SubRow = typeof subscriptions.$inferSelect;

/** Monthly recurring revenue (cents) for one subscription row. Trialing pays nothing yet; the founding offer is 50% off in year 1. */
export function subscriptionMrrCents(sub: Pick<SubRow, "plan" | "restaurantTier" | "interval" | "status">, foundingOffer = false): number {
  if (sub.status === "trialing" || sub.status === "canceled" || sub.status === "incomplete") return 0;
  const plan = sub.restaurantTier ? RESTAURANT_PLANS[sub.restaurantTier] : PLANS[sub.plan];
  const monthly = sub.interval === "year" ? plan.annualPriceCents / 12 : plan.priceCents;
  return Math.round(foundingOffer && sub.restaurantTier ? monthly * (1 - FOUNDING_OFFER.firstYearPct / 100) : monthly);
}

/**
 * Monthly recurring revenue (cents) of one add-on row. A yearly subscription pays ten months up front for
 * add-ons (see billing-restaurant `addOnAmount`), so its monthly share is a twelfth of that. WhatsApp packs are
 * billed once per billing period, so they count as one pack per month.
 */
export function addOnMrrCents(addOnId: string, quantity: number, interval: "month" | "year"): number {
  const def = (ADD_ONS as Record<string, (typeof ADD_ONS)[keyof typeof ADD_ONS] | undefined>)[addOnId];
  if (!def) return 0;
  const monthly = interval === "year" ? (def.priceCents * 10) / 12 : def.priceCents;
  return Math.round(monthly * Math.max(1, quantity));
}

type AddOnSplitKey = "whatsappCents" | "extraLocationsCents" | "otherAddOnsCents";
const addOnBucket = (id: string): AddOnSplitKey => (id === "whatsapp_1000" ? "whatsappCents" : id === "extra_location" ? "extraLocationsCents" : "otherAddOnsCents");

/** Add-on MRR per paying shop, from active merchant_add_ons rows on a shop whose subscription is paying. */
async function addOnMrrByMerchant(db: DbOrTx, subs: { s: SubRow }[], merchantId?: string) {
  const interval = new Map<string, "month" | "year">();
  for (const { s } of subs) if (subscriptionMrrCents(s) > 0 && !interval.has(s.merchantId)) interval.set(s.merchantId, s.interval === "year" ? "year" : "month");
  const rows = await db
    .select()
    .from(merchantAddOns)
    .where(and(eq(merchantAddOns.status, "active"), merchantId ? eq(merchantAddOns.merchantId, merchantId) : undefined));
  const out = new Map<string, { whatsappCents: number; extraLocationsCents: number; otherAddOnsCents: number; totalCents: number }>();
  for (const r of rows) {
    const iv = interval.get(r.merchantId);
    if (!iv) continue;
    const c = addOnMrrCents(r.addOnId, r.quantity, iv);
    const cur = out.get(r.merchantId) ?? { whatsappCents: 0, extraLocationsCents: 0, otherAddOnsCents: 0, totalCents: 0 };
    cur[addOnBucket(r.addOnId)] += c;
    cur.totalCents += c;
    out.set(r.merchantId, cur);
  }
  return out;
}

const PAYING_STATUSES = ["active", "past_due"] as const;

async function liveSubscriptions(db: DbOrTx) {
  const rows = await db
    .select({ s: subscriptions, founding: merchants.foundingOffer })
    .from(subscriptions)
    .innerJoin(merchants, eq(merchants.id, subscriptions.merchantId))
    .where(and(inArray(subscriptions.status, [...PAYING_STATUSES]), ne(merchants.status, "closed")));
  return rows;
}

/** Platform fees (cents) and payment volume per merchant since `since`: orders (+ customer fee), invoices, tiffin charges. */
async function feesSince(db: DbOrTx, since: Date, merchantId?: string) {
  const byMerchant = new Map<string, { fee: number; volume: number }>();
  const add = (id: string, fee: number, volume: number) => {
    const cur = byMerchant.get(id) ?? { fee: 0, volume: 0 };
    cur.fee += fee;
    cur.volume += volume;
    byMerchant.set(id, cur);
  };
  const [o, i, t] = await Promise.all([
    db
      .select({ id: orders.merchantId, fee: sql<number>`coalesce(sum(${orders.platformFeeCents} + ${orders.customerFeeCents}), 0)::int`, vol: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
      .from(orders)
      .where(and(isNotNull(orders.paidAt), gte(orders.paidAt, since), merchantId ? eq(orders.merchantId, merchantId) : undefined))
      .groupBy(orders.merchantId),
    db
      .select({ id: invoices.merchantId, fee: sql<number>`coalesce(sum(${invoices.platformFeeCents}), 0)::int`, vol: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int` })
      .from(invoices)
      .where(and(isNotNull(invoices.paidAt), gte(invoices.paidAt, since), merchantId ? eq(invoices.merchantId, merchantId) : undefined))
      .groupBy(invoices.merchantId),
    db
      .select({ id: tiffinCharges.merchantId, fee: sql<number>`coalesce(sum(${tiffinCharges.platformFeeCents}), 0)::int`, vol: sql<number>`coalesce(sum(${tiffinCharges.amountCents}), 0)::int` })
      .from(tiffinCharges)
      .where(and(eq(tiffinCharges.status, "paid"), isNotNull(tiffinCharges.paidAt), gte(tiffinCharges.paidAt, since), merchantId ? eq(tiffinCharges.merchantId, merchantId) : undefined))
      .groupBy(tiffinCharges.merchantId),
  ]);
  for (const r of o) add(r.id, num(r.fee), num(r.vol));
  for (const r of i) add(r.id, num(r.fee), num(r.vol));
  for (const r of t) add(r.id, num(r.fee), num(r.vol));
  return byMerchant;
}

async function memberStats(db: DbOrTx) {
  const rows = await db
    .select({ id: merchantMembers.merchantId, total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${merchantMembers.visitCount} >= 1)::int`, lastVisit: sql<Date | null>`max(${merchantMembers.lastVisitAt})` })
    .from(merchantMembers)
    .groupBy(merchantMembers.merchantId);
  return new Map(rows.map((r) => [r.id, { total: num(r.total), active: num(r.active), lastVisit: r.lastVisit ? new Date(r.lastVisit) : null }]));
}

const shopCost = (m: Pick<MerchantRow, "smsCreditsUsed" | "whatsappCreditsUsed">) => {
  const messagingCents = messagingCostCents(m.smsCreditsUsed, m.whatsappCreditsUsed);
  return { messagingCents, infraCents: UNIT_COSTS.infraPerShopCents, totalCents: messagingCents + UNIT_COSTS.infraPerShopCents };
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export async function adminOverview(ctx: AppContext): Promise<adminApi.AdminOverview> {
  const now = ctx.now();
  const since = new Date(now.getTime() - 30 * DAY);
  const [all, hoods, leadRows, subs, fees, members, repMerchants] = await Promise.all([
    ctx.db.select().from(merchants).where(ne(merchants.status, "closed")),
    ctx.db.select().from(neighbourhoods).orderBy(asc(neighbourhoods.name)),
    ctx.db.select({ hood: leads.neighbourhoodId, stage: leads.stage, n: sql<number>`count(*)::int` }).from(leads).groupBy(leads.neighbourhoodId, leads.stage),
    liveSubscriptions(ctx.db),
    feesSince(ctx.db, since),
    memberStats(ctx.db),
    ctx.db.select({ repUserId: merchants.repUserId }).from(merchants).where(isNotNull(merchants.repUserId)).groupBy(merchants.repUserId),
  ]);
  const target = ctx.config.activationThreshold;
  const activated = all.filter((m) => m.activatedAt).length;

  // Pace
  const pace = planPace(now, all.length);
  const today = now.toISOString().slice(0, 7);
  const opened = hoods.filter((h) => h.opensOn && h.opensOn.slice(0, 7) <= today && h.opensOn >= LAUNCH_PLAN.startsOn).length;
  const planned = hoods.filter((h) => h.opensOn && h.opensOn.slice(0, 7) === today).length;

  // Money
  let mrr = 0;
  const split = { plansCents: 0, restaurantCents: 0, whatsappCents: 0, extraLocationsCents: 0, otherAddOnsCents: 0 };
  const byPlan = { plus: 0, studio: 0, pro: 0, restaurant: 0 };
  const payingIds = new Set<string>();
  for (const { s, founding } of subs) {
    const c = subscriptionMrrCents(s, founding);
    if (!c) continue;
    mrr += c;
    payingIds.add(s.merchantId);
    if (s.restaurantTier) split.restaurantCents += c;
    else split.plansCents += c;
    if (s.restaurantTier) byPlan.restaurant++;
    else if (s.plan === "pro") byPlan.pro++;
    else if (s.plan === "studio") byPlan.studio++;
    else byPlan.plus++;
  }
  for (const a of (await addOnMrrByMerchant(ctx.db, subs)).values()) {
    mrr += a.totalCents;
    split.whatsappCents += a.whatsappCents;
    split.extraLocationsCents += a.extraLocationsCents;
    split.otherAddOnsCents += a.otherAddOnsCents;
  }
  let feeTotal = 0;
  let volume = 0;
  for (const f of fees.values()) {
    feeTotal += f.fee;
    volume += f.volume;
  }

  // Costs
  const costMonth = all.reduce((a, m) => a + shopCost(m).totalCents, 0);

  // Funnel
  const funnel: adminApi.AreaFunnel[] = [];
  const dueByRep = new Map<string, number>();
  for (const r of repMerchants) {
    if (!r.repUserId) continue;
    const list = await listRepMerchants(ctx, { id: r.repUserId, platformRole: "admin" }, r.repUserId);
    for (const m of list) if (m.neighbourhoodId) dueByRep.set(m.neighbourhoodId, (dueByRep.get(m.neighbourhoodId) ?? 0) + m.checkIns.filter((c) => c.due).length);
  }
  for (const h of hoods) {
    const ls = leadRows.filter((r) => r.hood === h.id);
    const shops = all.filter((m) => m.neighbourhoodId === h.id);
    const leadsOpen = ls.filter((r) => r.stage !== "lost").reduce((a, r) => a + num(r.n), 0);
    const contacted = ls.filter((r) => !["new", "lost"].includes(r.stage)).reduce((a, r) => a + num(r.n), 0);
    if (!leadsOpen && !shops.length && !h.streetDayOn && !h.opensOn) continue;
    funnel.push({
      neighbourhoodId: h.id,
      name: h.name,
      status: h.status,
      opensOn: h.opensOn,
      streetDayOn: h.streetDayOn,
      targetShops: h.targetShops,
      leads: leadsOpen,
      contacted,
      signed: shops.length,
      activated: shops.filter((m) => m.activatedAt).length,
      signedPct: h.targetShops ? Math.round((shops.length / h.targetShops) * 1000) / 1000 : 0,
      checkInsDue: dueByRep.get(h.id) ?? 0,
    });
  }
  funnel.sort((a, b) => b.signed - a.signed || a.name.localeCompare(b.name));

  // At risk
  const risk = atRiskShops(ctx, all, subs.map((s) => s.s), members, hoods, target);
  return {
    generatedAt: now.toISOString(),
    pace: { month: pace.month, plannedEndOfMonth: pace.plannedEndOfMonth, plannedToday: pace.plannedToday, actual: pace.actual, delta: pace.delta, areasOpened: opened, areasPlanned: Math.max(planned, LAUNCH_PLAN.areasPerMonth) },
    money: { mrrCents: mrr, mrrSplit: split, payingShops: payingIds.size, byPlan, feeRevenue30dCents: feeTotal, volume30dCents: volume },
    activation: { signed: all.length, activated, rate: all.length ? Math.round((activated / all.length) * 1000) / 1000 : 0, goal: LAUNCH_PLAN.activationGoal },
    costs: { monthCents: costMonth, perShopCents: all.length ? Math.round(costMonth / all.length) : 0, shops: all.length },
    funnel,
    atRisk: { total: risk.length, items: risk.slice(0, 10) },
  };
}

/** One reason per shop, the most urgent first. Pure so it can be unit-tested with fake rows. */
export function atRiskShops(
  ctx: Pick<AppContext, "now">,
  shops: MerchantRow[],
  subs: Pick<SubRow, "merchantId" | "status">[],
  members: Map<string, { total: number; active: number; lastVisit: Date | null }>,
  hoods: { id: string; name: string }[],
  target: number,
): adminApi.AtRiskShop[] {
  const now = ctx.now().getTime();
  const pastDue = new Set(subs.filter((s) => s.status === "past_due").map((s) => s.merchantId));
  const hoodName = new Map(hoods.map((h) => [h.id, h.name]));
  const out: (adminApi.AtRiskShop & { rank: number })[] = [];
  for (const m of shops) {
    if (m.status === "closed" || m.status === "paused") continue;
    const st = members.get(m.id) ?? { total: 0, active: 0, lastVisit: null };
    const days = Math.floor((now - m.createdAt.getTime()) / DAY);
    const base = { merchantId: m.id, name: m.name, neighbourhoodName: m.neighbourhoodId ? hoodName.get(m.neighbourhoodId) ?? null : null, daysSinceSignup: days, activeMembers: st.active, target };
    let hit: { reason: adminApi.AtRiskReason; detail: string; rank: number } | null = null;
    if (pastDue.has(m.id)) hit = { reason: "payment_failed", detail: "The last subscription payment failed.", rank: 0 };
    else if (days >= AT_RISK.noVisitAfterDays && st.active === 0) hit = { reason: "stalled_setup", detail: `Signed ${days} days ago and no customer has visited yet.`, rank: 1 };
    else if (m.activatedAt && st.lastVisit && now - st.lastVisit.getTime() >= AT_RISK.quietDays * DAY) hit = { reason: "quiet", detail: `No visit in ${Math.floor((now - st.lastVisit.getTime()) / DAY)} days.`, rank: 2 };
    else if (!m.activatedAt && days >= AT_RISK.notActivatedAfterDays) hit = { reason: "slow_activation", detail: `${days} days in, ${st.active} of ${target} members.`, rank: 3 };
    else if (m.smsCreditsUsed > 0 && m.smsCreditsUsed >= smsAllowance(m)) hit = { reason: "sms_cap", detail: "Used the whole monthly SMS allowance.", rank: 4 };
    if (hit) out.push({ ...base, reason: hit.reason, detail: hit.detail, rank: hit.rank });
  }
  return out.sort((a, b) => a.rank - b.rank || b.daysSinceSignup - a.daysSinceSignup || a.name.localeCompare(b.name)).map(({ rank: _r, ...r }) => r);
}

export async function atRiskAll(ctx: AppContext): Promise<{ items: adminApi.AtRiskShop[] }> {
  const [all, hoods, subs, members] = await Promise.all([
    ctx.db.select().from(merchants).where(ne(merchants.status, "closed")),
    ctx.db.select({ id: neighbourhoods.id, name: neighbourhoods.name }).from(neighbourhoods),
    ctx.db.select().from(subscriptions).where(inArray(subscriptions.status, [...PAYING_STATUSES])),
    memberStats(ctx.db),
  ]);
  return { items: atRiskShops(ctx, all, subs, members, hoods, ctx.config.activationThreshold) };
}

// ---------------------------------------------------------------------------
// Costs per shop
// ---------------------------------------------------------------------------
export async function adminCosts(ctx: AppContext): Promise<adminApi.AdminCosts> {
  const since = new Date(ctx.now().getTime() - 30 * DAY);
  const [all, subs, fees] = await Promise.all([ctx.db.select().from(merchants).where(ne(merchants.status, "closed")), liveSubscriptions(ctx.db), feesSince(ctx.db, since)]);
  const subBy = new Map<string, number>();
  for (const { s, founding } of subs) subBy.set(s.merchantId, (subBy.get(s.merchantId) ?? 0) + subscriptionMrrCents(s, founding));
  const addOnBy = await addOnMrrByMerchant(ctx.db, subs);
  const shops: adminApi.ShopCostRow[] = all
    .map((m) => {
      const c = shopCost(m);
      const sub = (subBy.get(m.id) ?? 0) + (addOnBy.get(m.id)?.totalCents ?? 0);
      const fee = fees.get(m.id)?.fee ?? 0;
      return { merchantId: m.id, name: m.name, plan: m.plan, smsCredits: m.smsCreditsUsed, whatsappMessages: m.whatsappCreditsUsed, messagingCents: c.messagingCents, infraCents: c.infraCents, costCents: c.totalCents, subscriptionCents: sub, feeCents30d: fee, marginCents: sub + fee - c.totalCents };
    })
    .sort((a, b) => b.costCents - a.costCents || a.name.localeCompare(b.name));
  const sum = (f: (r: adminApi.ShopCostRow) => number) => shops.reduce((a, r) => a + f(r), 0);
  return {
    generatedAt: ctx.now().toISOString(),
    totals: { smsCredits: sum((r) => r.smsCredits), whatsappMessages: sum((r) => r.whatsappMessages), costCents: sum((r) => r.costCents), subscriptionCents: sum((r) => r.subscriptionCents), feeCents30d: sum((r) => r.feeCents30d), marginCents: sum((r) => r.marginCents), shops: shops.length },
    shops,
    assumptions: { ...UNIT_COSTS },
  };
}

// ---------------------------------------------------------------------------
// One shop: money, charge mode
// ---------------------------------------------------------------------------
export async function merchantMoney(ctx: AppContext, merchantId: string): Promise<adminApi.MerchantMoney> {
  const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const [subs, fees] = await Promise.all([
    ctx.db.select().from(subscriptions).where(and(eq(subscriptions.merchantId, merchantId), inArray(subscriptions.status, ["active", "past_due", "trialing"]))).orderBy(desc(subscriptions.createdAt)),
    feesSince(ctx.db, new Date(ctx.now().getTime() - 30 * DAY), merchantId),
  ]);
  const baseMrr = subs.reduce((a, s) => a + subscriptionMrrCents(s, m.foundingOffer), 0);
  const addOns = (await addOnMrrByMerchant(ctx.db, subs.map((s) => ({ s })), merchantId)).get(merchantId);
  const mrr = baseMrr + (addOns?.totalCents ?? 0);
  const top = subs[0] ?? null;
  const f = fees.get(merchantId);
  const c = shopCost(m);
  return {
    mrrCents: mrr,
    mrrSplit: { subscriptionCents: baseMrr, addOnCents: addOns?.totalCents ?? 0 },
    subscriptionStatus: top?.status ?? null,
    renewsOn: top?.currentPeriodEnd ? top.currentPeriodEnd.toISOString().slice(0, 10) : null,
    fees30dCents: f?.fee ?? 0,
    volume30dCents: f?.volume ?? 0,
    costs: { smsCredits: m.smsCreditsUsed, whatsappMessages: m.whatsappCreditsUsed, ...c },
    chargeMode: m.chargeMode === "direct" ? "direct" : "destination",
    stripe: { connected: !!m.stripeAccountId, chargesEnabled: m.stripeChargesEnabled, payoutsEnabled: m.stripePayoutsEnabled },
  };
}

// ---------------------------------------------------------------------------
// Support sessions (timed, reasoned, audited access to a shop's dashboard)
// ---------------------------------------------------------------------------
const serializeSession = (s: typeof supportSessions.$inferSelect, adminName: string | null, now: Date): adminApi.SupportSession => ({
  id: s.id,
  adminUserId: s.adminUserId,
  adminName,
  merchantId: s.merchantId,
  reason: s.reason,
  startedAt: s.startedAt.toISOString(),
  expiresAt: s.expiresAt.toISOString(),
  endedAt: s.endedAt ? s.endedAt.toISOString() : null,
  active: !s.endedAt && s.expiresAt > now,
});

export async function startSupportSession(ctx: AppContext, actorUserId: string, merchantId: string, reason: string, ip?: string) {
  const [m] = await ctx.db.select({ id: merchants.id, name: merchants.name }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!m) throw notFound("Merchant");
  const now = ctx.now();
  const [s] = await ctx.db.insert(supportSessions).values({ adminUserId: actorUserId, merchantId, reason, startedAt: now, expiresAt: new Date(now.getTime() + adminApi.SUPPORT_SESSION_MINUTES * 60000) }).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "support.session_started", entity: "support_session", entityId: s!.id, data: { reason, minutes: adminApi.SUPPORT_SESSION_MINUTES }, ip });
  const [u] = await ctx.db.select({ name: users.name }).from(users).where(eq(users.id, actorUserId)).limit(1);
  return serializeSession(s!, u?.name ?? null, now);
}

export async function endSupportSession(ctx: AppContext, actorUserId: string, sessionId: string, isAdmin = true) {
  const [s] = await ctx.db.select().from(supportSessions).where(eq(supportSessions.id, sessionId)).limit(1);
  if (!s || (!isAdmin && s.adminUserId !== actorUserId)) throw notFound("Support session");
  if (s.endedAt) return serializeSession(s, null, ctx.now());
  const [u] = await ctx.db.update(supportSessions).set({ endedAt: ctx.now() }).where(eq(supportSessions.id, sessionId)).returning();
  await writeAudit(ctx.db, { actorUserId, merchantId: s.merchantId, action: "support.session_ended", entity: "support_session", entityId: sessionId, data: { startedBy: s.adminUserId } });
  return serializeSession(u!, null, ctx.now());
}

export async function listSupportSessions(ctx: AppContext, merchantId?: string) {
  const rows = await ctx.db
    .select({ s: supportSessions, name: users.name })
    .from(supportSessions)
    .leftJoin(users, eq(users.id, supportSessions.adminUserId))
    .where(merchantId ? eq(supportSessions.merchantId, merchantId) : undefined)
    .orderBy(desc(supportSessions.startedAt))
    .limit(50);
  const now = ctx.now();
  return { items: rows.map((r) => serializeSession(r.s, r.name, now)), nextCursor: null };
}

export async function areaPlanUsers(ctx: AppContext) {
  return ctx.db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.platformRole, ["rep", "admin"]));
}
