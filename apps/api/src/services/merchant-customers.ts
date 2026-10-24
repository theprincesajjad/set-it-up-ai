/**
 * Customers directory, member detail, notes/tags, manual adjustments,
 * reversals, CSV export and CSV import (migration from another program).
 * Points only change through ledger.ts.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import {
  ledgerTransactions,
  merchants,
  merchantMembers,
  redemptions,
  rewards,
  users,
  vipLevels,
  visits,
  type DbOrTx,
} from "@ll/db";
import { maskPhone, toMonthDay, type merchantApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { badRequest, notFound } from "../lib/errors.js";
import { parseCsvObjects, toCsv } from "./csv.js";
import { adjustPoints, ensureMember, findOrCreateCustomerByPhone, postTransaction, reverseTransaction } from "./ledger.js";
import { writeAudit } from "./admin-audit.js";
import { iso, normalizePhone } from "./merchant.js";
import { monthStart } from "./staff.js";
import { NO_RHYTHM, memberRhythms, shopDate, rhythmSegmentIds, type MemberRhythm } from "./member-stats.js";

// ---------------------------------------------------------------------------
// Cursor helpers (opaque offset cursors)
// ---------------------------------------------------------------------------
export const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString("base64url");
export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  if (!Number.isInteger(n) || n < 0) throw badRequest("Invalid cursor");
  return n;
}

async function minRewardCost(db: DbOrTx, merchantId: string): Promise<number | null> {
  const [row] = await db
    .select({ min: sql<number | null>`min(${rewards.pointsCost})::int` })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true)));
  return row?.min == null ? null : Number(row.min);
}

const summarySelect = {
  member: merchantMembers,
  name: users.name,
  phone: users.phone,
  email: users.email,
  memberCode: users.memberCode,
  birthday: users.birthday,
  vipName: vipLevels.name,
};
type SummaryRow = {
  member: typeof merchantMembers.$inferSelect;
  name: string | null;
  phone: string | null;
  email: string | null;
  memberCode: string;
  birthday: string | null;
  vipName: string | null;
};

function toSummary(r: SummaryRow, minCost: number | null, rhythm: MemberRhythm = NO_RHYTHM): merchantApi.CustomerSummary {
  const m = r.member;
  return {
    memberId: m.id,
    userId: m.userId,
    name: r.name,
    // Privacy: masked by default; managers reveal (audit-logged) with POST …/reveal-phone.
    phone: r.phone ? maskPhone(r.phone) : null,
    email: r.email,
    memberCode: r.memberCode,
    balance: m.balance,
    lifetimePoints: m.lifetimePoints,
    visitCount: m.visitCount,
    totalSpendCents: Number(m.totalSpendCents),
    lastVisitAt: iso(m.lastVisitAt),
    joinedAt: m.createdAt.toISOString(),
    joinedVia: m.joinedVia,
    vipLevel: m.vipLevelId && r.vipName ? { id: m.vipLevelId, name: r.vipName } : null,
    tags: m.tags,
    marketingConsent: !!m.marketingConsentAt && !m.muted,
    muted: m.muted,
    rewardAvailable: minCost !== null && m.balance >= minCost,
    visits30d: rhythm.visits30d,
    usually: rhythm.usually,
    isRegular: rhythm.isRegular,
    isSlipping: rhythm.isSlipping,
  };
}

async function merchantTimezone(db: DbOrTx, merchantId: string): Promise<string> {
  const [m] = await db.select({ tz: merchants.timezone }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return m?.tz ?? "America/Toronto";
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------
/**
 * `segmentIds`: members already resolved for the rhythm segments (regulars, slipping), which need visit history.
 * `birthdayMonth`: "MM" of the current month in the shop's timezone, for segment=birthday_month.
 */
export function customerFilters(
  ctx: AppContext,
  merchantId: string,
  q: Partial<merchantApi.ListCustomersQuery>,
  minCost: number | null,
  extra: { segmentIds?: string[]; birthdayMonth?: string } = {},
): SQL {
  const conds: (SQL | undefined)[] = [eq(merchantMembers.merchantId, merchantId)];
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const digits = q.q.replace(/\D/g, "");
    conds.push(or(ilike(users.name, like), ilike(users.email, like), digits.length >= 3 ? sql`${users.phone} like ${`%${digits}%`}` : undefined, eq(users.memberCode, q.q.toUpperCase())));
  }
  if (q.phoneLast4) conds.push(sql`${users.phone} like ${`%${q.phoneLast4}`}`);
  if (q.tag) conds.push(sql`${merchantMembers.tags} @> ${JSON.stringify([q.tag])}::jsonb`);
  if (q.vipLevelId) conds.push(eq(merchantMembers.vipLevelId, q.vipLevelId));
  if (q.vip === "true") conds.push(isNotNull(merchantMembers.vipLevelId));
  if (q.vip === "false") conds.push(isNull(merchantMembers.vipLevelId));
  if (q.lapsedDays) {
    const since = new Date(ctx.now().getTime() - q.lapsedDays * 86400000);
    conds.push(or(isNull(merchantMembers.lastVisitAt), lt(merchantMembers.lastVisitAt, since)));
  }
  if (q.rewardAvailable === "true") conds.push(minCost === null ? sql`false` : gte(merchantMembers.balance, minCost));
  if (q.rewardAvailable === "false" && minCost !== null) conds.push(lt(merchantMembers.balance, minCost));
  if (q.joinedAfter) conds.push(gte(merchantMembers.createdAt, new Date(q.joinedAfter.length === 10 ? `${q.joinedAfter}T00:00:00Z` : q.joinedAfter)));
  // Same rule as CustomerSummary.marketingConsent: consent recorded and not muted.
  if (q.consent === "opted_in") conds.push(and(isNotNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, false)));
  if (q.consent === "not") conds.push(or(isNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, true)));
  if (q.segment === "regulars" || q.segment === "slipping") conds.push(extra.segmentIds?.length ? inArray(merchantMembers.id, extra.segmentIds) : sql`false`);
  if (q.segment === "birthday_month") conds.push(extra.birthdayMonth ? sql`substring(${users.birthday} from 1 for 2) = ${extra.birthdayMonth}` : sql`false`);
  if (q.segment === "can_text") conds.push(and(isNotNull(merchantMembers.marketingConsentAt), eq(merchantMembers.muted, false), isNotNull(users.phone), isNull(users.deletedAt)));
  if (q.muted === "true") conds.push(eq(merchantMembers.muted, true));
  if (q.muted === "false") conds.push(eq(merchantMembers.muted, false));
  return and(...conds)!;
}

export async function listCustomers(ctx: AppContext, merchantId: string, q: merchantApi.ListCustomersQuery) {
  const minCost = await minRewardCost(ctx.db, merchantId);
  const offset = decodeCursor(q.cursor);
  const order = {
    recent: [sql`${merchantMembers.lastVisitAt} desc nulls last`],
    joined: [desc(merchantMembers.createdAt)],
    balance: [desc(merchantMembers.balance)],
    visits: [desc(merchantMembers.visitCount)],
    spend: [desc(merchantMembers.totalSpendCents)],
    name: [sql`${users.name} asc nulls last`],
  }[q.sort];
  const tz = await merchantTimezone(ctx.db, merchantId);
  const now = ctx.now();
  const where = customerFilters(ctx, merchantId, q, minCost, await segmentExtras(ctx, merchantId, tz, q.segment));
  const [rows, [totalRow]] = await Promise.all([
    ctx.db
      .select(summarySelect)
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
      .where(where)
      .orderBy(...order, asc(merchantMembers.id))
      .limit(q.limit + 1)
      .offset(offset),
    ctx.db.select({ n: count() }).from(merchantMembers).innerJoin(users, eq(users.id, merchantMembers.userId)).where(where),
  ]);
  const page = rows.slice(0, q.limit);
  const rhythms = await memberRhythms(ctx.db, merchantId, tz, now, page.map((r) => r.member.id));
  const items = page.map((r) => toSummary(r, minCost, rhythms.get(r.member.id)));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null, total: Number(totalRow?.n ?? 0) } satisfies merchantApi.ListCustomersResponse;
}

async function segmentExtras(ctx: AppContext, merchantId: string, tz: string, segment: merchantApi.ListCustomersQuery["segment"]) {
  const now = ctx.now();
  if (segment === "regulars" || segment === "slipping") return { segmentIds: await rhythmSegmentIds(ctx.db, merchantId, tz, now, segment) };
  if (segment === "birthday_month") return { birthdayMonth: shopDate(now, tz).slice(5, 7) };
  return {};
}

/** Counts behind the Customers chips. One pass over members; rhythm segments come from visit history. */
export async function segmentCounts(ctx: AppContext, merchantId: string): Promise<merchantApi.CustomerSegmentCounts> {
  const tz = await merchantTimezone(ctx.db, merchantId);
  const now = ctx.now();
  const minCost = await minRewardCost(ctx.db, merchantId);
  const rhythms = await memberRhythms(ctx.db, merchantId, tz, now);
  const [row] = await ctx.db
    .select({
      all: sql<number>`count(*)::int`,
      rewardReady: sql<number>`count(*) filter (where ${minCost === null ? sql`false` : sql`${merchantMembers.balance} >= ${minCost}`})::int`,
      fresh: sql<number>`count(*) filter (where ${merchantMembers.createdAt} >= ${monthStart(now, tz).toISOString()}::timestamptz)::int`,
      birthday: sql<number>`count(*) filter (where substring(${users.birthday} from 1 for 2) = ${shopDate(now, tz).slice(5, 7)})::int`,
      canText: sql<number>`count(*) filter (where ${merchantMembers.marketingConsentAt} is not null and ${merchantMembers.muted} = false and ${users.phone} is not null)::int`,
    })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, merchantId), isNull(users.deletedAt)));
  const vals = [...rhythms.values()];
  return {
    all: Number(row?.all ?? 0),
    regulars: vals.filter((r) => r.isRegular).length,
    slipping: vals.filter((r) => r.isSlipping).length,
    rewardReady: Number(row?.rewardReady ?? 0),
    newThisMonth: Number(row?.fresh ?? 0),
    birthdayMonth: Number(row?.birthday ?? 0),
    canText: Number(row?.canText ?? 0),
  };
}

/** Full phone number for one member (manager+). Every reveal is written to audit_logs. */
export async function revealCustomerPhone(ctx: AppContext, merchantId: string, actorUserId: string, memberId: string, ip?: string | null): Promise<merchantApi.RevealPhoneResponse> {
  const r = await loadMember(ctx.db, merchantId, memberId);
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "customer.phone_revealed", entity: "member", entityId: memberId, ip: ip ?? null });
  return { memberId, phone: r.phone };
}

async function loadMember(db: DbOrTx, merchantId: string, memberId: string) {
  const [r] = await db
    .select(summarySelect)
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
    .where(and(eq(merchantMembers.id, memberId), eq(merchantMembers.merchantId, merchantId)))
    .limit(1);
  if (!r) throw notFound("Customer");
  return r;
}

export function serializeTx(t: typeof ledgerTransactions.$inferSelect): merchantApi.LedgerTransactionView {
  return {
    id: t.id,
    type: t.type,
    source: t.source,
    points: t.points,
    amountCents: t.amountCents,
    description: t.description,
    breakdown: t.breakdown,
    locationId: t.locationId,
    staffUserId: t.staffUserId,
    reversesTransactionId: t.reversesTransactionId,
    reversedAt: iso(t.reversedAt),
    rewardId: t.rewardId,
    promoId: t.promoId,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function getCustomerDetail(ctx: AppContext, merchantId: string, memberId: string): Promise<merchantApi.CustomerDetail> {
  const r = await loadMember(ctx.db, merchantId, memberId);
  const minCost = await minRewardCost(ctx.db, merchantId);
  const rhythm = (await memberRhythms(ctx.db, merchantId, await merchantTimezone(ctx.db, merchantId), ctx.now(), [memberId])).get(memberId);
  const [txs, vs, reds] = await Promise.all([
    ctx.db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.merchantId, merchantId), eq(ledgerTransactions.memberId, memberId)))
      .orderBy(desc(ledgerTransactions.createdAt), desc(ledgerTransactions.id))
      .limit(100),
    ctx.db
      .select()
      .from(visits)
      .where(and(eq(visits.merchantId, merchantId), eq(visits.memberId, memberId)))
      .orderBy(desc(visits.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.merchantId, merchantId), eq(redemptions.memberId, memberId)))
      .orderBy(desc(redemptions.createdAt))
      .limit(50),
  ]);
  return {
    customer: {
      ...toSummary(r, minCost, rhythm),
      birthday: r.birthday,
      notes: r.member.notes,
      marketingConsentAt: iso(r.member.marketingConsentAt),
      marketingConsentSource: r.member.marketingConsentSource,
      marketingConsentText: r.member.marketingConsentText,
    },
    transactions: txs.map(serializeTx),
    visits: vs.map((v) => ({ id: v.id, locationId: v.locationId, amountCents: v.amountCents, source: v.source, transactionId: v.transactionId, createdAt: v.createdAt.toISOString() })),
    redemptions: reds.map((d) => ({ id: d.id, rewardId: d.rewardId, code: d.code, status: d.status, discountCents: d.discountCents, createdAt: d.createdAt.toISOString() })),
  };
}

export async function updateCustomer(ctx: AppContext, merchantId: string, actorUserId: string, memberId: string, body: { notes?: string | null; tags?: string[] }) {
  await loadMember(ctx.db, merchantId, memberId);
  const set: Partial<typeof merchantMembers.$inferInsert> = {};
  if (body.notes !== undefined) set.notes = body.notes;
  if (body.tags !== undefined) set.tags = [...new Set(body.tags.map((t) => t.toLowerCase()))];
  if (Object.keys(set).length) {
    await ctx.db.update(merchantMembers).set(set).where(and(eq(merchantMembers.id, memberId), eq(merchantMembers.merchantId, merchantId)));
    await writeAudit(ctx.db, { actorUserId, merchantId, action: "customer.updated", entity: "member", entityId: memberId, data: { fields: Object.keys(set) } });
  }
  return getCustomerDetail(ctx, merchantId, memberId);
}

export async function adjustCustomerPoints(ctx: AppContext, merchantId: string, actorUserId: string, memberId: string, body: { points: number; reason: string; idempotencyKey?: string }) {
  await loadMember(ctx.db, merchantId, memberId);
  const r = await adjustPoints(ctx, { merchantId, memberId, points: body.points, reason: body.reason, staffUserId: actorUserId, source: "dashboard", idempotencyKey: body.idempotencyKey ?? null });
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "customer.points_adjusted", entity: "member", entityId: memberId, data: { points: body.points, reason: body.reason, transactionId: r.transaction.id } });
  return { transaction: serializeTx(r.transaction), balance: r.member.balance, duplicate: r.duplicate };
}

export async function reverseCustomerTransaction(ctx: AppContext, merchantId: string, actorUserId: string, transactionId: string, reason: string) {
  const r = await reverseTransaction(ctx, { merchantId, transactionId, reason, staffUserId: actorUserId, source: "dashboard" });
  await writeAudit(ctx.db, { actorUserId, merchantId, action: "transaction.reversed", entity: "ledger_transaction", entityId: transactionId, data: { reason } });
  return { transaction: serializeTx(r.transaction), balance: r.member.balance };
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------
function activityWhere(merchantId: string, q: { from?: string; to?: string; type?: string; memberId?: string }) {
  return and(
    eq(ledgerTransactions.merchantId, merchantId),
    q.from ? gte(ledgerTransactions.createdAt, new Date(q.from)) : undefined,
    q.to ? lte(ledgerTransactions.createdAt, new Date(q.to)) : undefined,
    q.type ? sql`${ledgerTransactions.type}::text = ${q.type}` : undefined,
    q.memberId ? eq(ledgerTransactions.memberId, q.memberId) : undefined,
  );
}

export async function listActivity(ctx: AppContext, merchantId: string, q: { from?: string; to?: string; type?: string; memberId?: string; limit: number; cursor?: string }) {
  const offset = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select({ tx: ledgerTransactions, name: users.name })
    .from(ledgerTransactions)
    .innerJoin(merchantMembers, eq(merchantMembers.id, ledgerTransactions.memberId))
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(activityWhere(merchantId, q))
    .orderBy(desc(ledgerTransactions.createdAt), desc(ledgerTransactions.id))
    .limit(q.limit + 1)
    .offset(offset);
  const items: merchantApi.ActivityItem[] = rows.slice(0, q.limit).map((r) => ({ ...serializeTx(r.tx), memberId: r.tx.memberId, customerName: r.name }));
  return { items, nextCursor: rows.length > q.limit ? encodeCursor(offset + q.limit) : null };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
export async function exportCustomersCsv(ctx: AppContext, merchantId: string, q: Partial<merchantApi.ListCustomersQuery> = {}): Promise<string> {
  const minCost = await minRewardCost(ctx.db, merchantId);
  const extras = await segmentExtras(ctx, merchantId, await merchantTimezone(ctx.db, merchantId), q.segment);
  const rows = await ctx.db
    .select(summarySelect)
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .leftJoin(vipLevels, eq(vipLevels.id, merchantMembers.vipLevelId))
    .where(customerFilters(ctx, merchantId, q, minCost, extras))
    .orderBy(asc(merchantMembers.createdAt), asc(merchantMembers.id));
  return toCsv(
    ["member_id", "name", "phone", "email", "member_code", "balance", "lifetime_points", "visits", "total_spend", "last_visit_at", "joined_at", "joined_via", "vip_level", "tags", "birthday", "marketing_consent_at", "muted", "notes"],
    rows.map((r) => [
      r.member.id,
      r.name,
      r.phone,
      r.email,
      r.memberCode,
      r.member.balance,
      r.member.lifetimePoints,
      r.member.visitCount,
      (Number(r.member.totalSpendCents) / 100).toFixed(2),
      r.member.lastVisitAt,
      r.member.createdAt,
      r.member.joinedVia,
      r.vipName,
      r.member.tags.join(";"),
      r.birthday,
      r.member.marketingConsentAt,
      r.member.muted,
      r.member.notes,
    ]),
  );
}

export async function exportTransactionsCsv(ctx: AppContext, merchantId: string, q: { from?: string; to?: string; type?: string; memberId?: string } = {}): Promise<string> {
  const rows = await ctx.db
    .select({ tx: ledgerTransactions, name: users.name, phone: users.phone })
    .from(ledgerTransactions)
    .innerJoin(merchantMembers, eq(merchantMembers.id, ledgerTransactions.memberId))
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(activityWhere(merchantId, q))
    .orderBy(asc(ledgerTransactions.createdAt), asc(ledgerTransactions.id));
  return toCsv(
    ["transaction_id", "created_at", "member_id", "customer_name", "phone", "type", "source", "points", "amount", "eligible_amount", "description", "location_id", "staff_user_id", "reverses_transaction_id", "reversed_at", "external_ref"],
    rows.map(({ tx, name, phone }) => [
      tx.id,
      tx.createdAt,
      tx.memberId,
      name,
      phone,
      tx.type,
      tx.source,
      tx.points,
      tx.amountCents == null ? null : (tx.amountCents / 100).toFixed(2),
      tx.eligibleCents == null ? null : (tx.eligibleCents / 100).toFixed(2),
      tx.description,
      tx.locationId,
      tx.staffUserId,
      tx.reversesTransactionId,
      tx.reversedAt,
      tx.externalRef,
    ]),
  );
}

// ---------------------------------------------------------------------------
// CSV import (migration)
// ---------------------------------------------------------------------------
const TRUTHY = new Set(["yes", "y", "true", "1", "opted_in", "opt-in", "optin", "subscribed"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v !== undefined && v !== "") ?? "";

/** "MM-DD" or "YYYY-MM-DD" -> "MM-DD" (the year is never kept). */
const parseBirthday = toMonthDay;

export async function importCustomersCsv(ctx: AppContext, merchantId: string, actorUserId: string, body: { csv: string; dryRun: boolean; sourceName?: string }): Promise<merchantApi.ImportCustomersResult> {
  const { headers, rows } = parseCsvObjects(body.csv);
  if (!headers.includes("phone") && !headers.includes("phone_number") && !headers.includes("mobile")) {
    throw badRequest("The CSV needs a header row with a phone column (phone,name,email,points,visits,birthday)");
  }
  if (rows.length > 20000) throw badRequest("Import at most 20,000 rows at a time");
  const result: merchantApi.ImportCustomersResult = {
    dryRun: body.dryRun,
    rows: rows.length,
    membersCreated: 0,
    membersExisting: 0,
    pointsImported: 0,
    duplicates: 0,
    consentRecorded: 0,
    errors: [],
    warnings: [],
  };
  const seen = new Set<string>();
  const label = body.sourceName?.trim() || "previous loyalty program";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNo = i + 1;
    const fail = (message: string) => result.errors.push({ row: rowNo, message });
    const phone = normalizePhone(pick(row, "phone", "phone_number", "mobile"));
    if (!phone) {
      fail("Missing or invalid phone number");
      continue;
    }
    if (seen.has(phone)) {
      result.duplicates++;
      fail(`Phone ${phone} appears more than once in this file`);
      continue;
    }
    seen.add(phone);
    const pointsRaw = pick(row, "points", "balance", "points_balance");
    const points = pointsRaw === "" ? 0 : Number(pointsRaw.replace(/,/g, ""));
    if (!Number.isInteger(points) || points < 0) {
      fail(`Points must be a whole number of 0 or more (got "${pointsRaw}")`);
      continue;
    }
    const visitsRaw = pick(row, "visits", "visit_count");
    const visitCount = visitsRaw === "" ? 0 : Number(visitsRaw);
    if (!Number.isInteger(visitCount) || visitCount < 0) {
      fail(`Visits must be a whole number (got "${visitsRaw}")`);
      continue;
    }
    const email = pick(row, "email", "email_address").toLowerCase();
    if (email && !EMAIL_RE.test(email)) {
      fail(`Invalid email "${email}"`);
      continue;
    }
    const birthdayRaw = pick(row, "birthday", "birthdate", "dob");
    const birthday = birthdayRaw ? parseBirthday(birthdayRaw) : null;
    if (birthdayRaw && !birthday) result.warnings.push({ row: rowNo, message: `Birthday "${birthdayRaw}" ignored (use MM-DD)` });

    // CASL: only an explicit consent flag WITH a consent date counts as express consent.
    const consentFlag = pick(row, "consent", "marketing_consent", "opt_in", "accepts_marketing").toLowerCase();
    const consentDateRaw = pick(row, "consent_date", "consent_at", "opt_in_date", "consented_at");
    let consentAt: Date | null = null;
    if (consentFlag && TRUTHY.has(consentFlag)) {
      const d = consentDateRaw ? new Date(consentDateRaw) : null;
      if (d && !Number.isNaN(d.getTime()) && d <= ctx.now()) consentAt = d;
      else result.warnings.push({ row: rowNo, message: "Marketing consent not imported: a valid consent_date is required (CASL)" });
    }
    const name = pick(row, "name", "full_name", "customer_name") || [pick(row, "first_name"), pick(row, "last_name")].filter(Boolean).join(" ") || null;

    if (body.dryRun) {
      const [existing] = await ctx.db
        .select({ id: merchantMembers.id })
        .from(merchantMembers)
        .innerJoin(users, eq(users.id, merchantMembers.userId))
        .where(and(eq(merchantMembers.merchantId, merchantId), eq(users.phone, phone)))
        .limit(1);
      if (existing) result.membersExisting++;
      else result.membersCreated++;
      result.pointsImported += points;
      if (consentAt) result.consentRecorded++;
      continue;
    }

    try {
      await ctx.db.transaction(async (tx) => {
        const { user } = await findOrCreateCustomerByPhone(tx, phone, name);
        const userPatch: Partial<typeof users.$inferInsert> = {};
        if (birthday && !user.birthday) userPatch.birthday = birthday;
        if (email && !user.email) {
          const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
          if (!taken) userPatch.email = email;
        }
        if (Object.keys(userPatch).length) await tx.update(users).set(userPatch).where(eq(users.id, user.id));
        const { member, created } = await ensureMember(ctx, tx, { merchantId, userId: user.id, joinedVia: "import", source: "import", skipWelcomeBonus: true });
        if (created) result.membersCreated++;
        else result.membersExisting++;
        if (consentAt && !member.marketingConsentAt) {
          await tx
            .update(merchantMembers)
            .set({ marketingConsentAt: consentAt, marketingConsentSource: "import", marketingConsentText: `Express consent recorded by ${label} on ${consentAt.toISOString().slice(0, 10)} (imported)` })
            .where(eq(merchantMembers.id, member.id));
          result.consentRecorded++;
        }
        if (points > 0) {
          const r = await postTransaction(tx, {
            merchantId,
            memberId: member.id,
            type: "import",
            source: "import",
            points,
            description: `Opening balance from ${label}`,
            breakdown: visitCount ? [`${visitCount} visit(s) in ${label}`] : null,
            idempotencyKey: `import:${phone}`,
            staffUserId: actorUserId,
          });
          if (r.duplicate) result.duplicates++;
          else result.pointsImported += points;
        }
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not import row");
    }
  }
  if (!body.dryRun) {
    await writeAudit(ctx.db, {
      actorUserId,
      merchantId,
      action: "customers.imported",
      entity: "merchant",
      entityId: merchantId,
      data: { rows: result.rows, created: result.membersCreated, points: result.pointsImported, errors: result.errors.length, source: label },
    });
  }
  return result;
}
