/**
 * Who a promo is for, and whether its stamp effect applies to one member right now (wave N, promo team).
 *
 * Stamp effects go through the rules team's earn engine: plain promos (everyone, no cap) are its built-in `activeBoosts`;
 * targeted ones (a segment, or a quantity cap) come from the boost provider "promo:targeted" registered here, which sees the
 * locked member. Contract (scratchpad notes-promo.md): a paused promo never boosts; a segment promo (regulars, lapsed, new,
 * birthday) boosts only members in that segment; a promo with a quantity cap boosts only members who hold a spot.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { merchantMembers, promoClaims, promos, users, type DbOrTx } from "@ll/db";
import { promosApi } from "@ll/shared";
const { SEGMENT_RULES } = promosApi;
import { registerEarnBoostProvider, type EarnBoost } from "./earn-engine.js";
import { enabledFeaturesFor } from "./features.js";
import { promoAppliesAt } from "./ledger.js";

type PromoRow = typeof promos.$inferSelect;
const DAY = 86_400_000;

export interface PromoMember {
  id: string;
  visitCount: number;
  lastVisitAt: Date | null;
  createdAt: Date;
  /** users.birthday, "MM-DD", or null. */
  birthday?: string | null;
}

/** The month ("MM") in a timezone. */
export function localMonth(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, month: "2-digit" }).format(at);
}

/** Is this member in the segment at `at`? Pure. */
export function inSegment(segment: string, m: PromoMember, at: Date, timeZone: string): boolean {
  const t = at.getTime();
  switch (segment as promosApi.PromoSegment) {
    case "regulars":
      return m.visitCount >= SEGMENT_RULES.regularMinVisits && !!m.lastVisitAt && t - m.lastVisitAt.getTime() <= SEGMENT_RULES.regularWithinDays * DAY;
    case "lapsed":
      return !!m.lastVisitAt && t - m.lastVisitAt.getTime() > SEGMENT_RULES.lapsedAfterDays * DAY;
    case "new":
      return t - m.createdAt.getTime() <= SEGMENT_RULES.newWithinDays * DAY;
    case "birthday":
      return !!m.birthday && m.birthday.slice(0, 2) === localMonth(at, timeZone);
    default:
      return true;
  }
}

/** May this promo boost this member's earn right now (pause, segment)? Pure; quantity caps are checked by the async filter. */
export function promoBoostEligible(p: PromoRow, member: PromoMember | null, at: Date, timeZone: string): boolean {
  if (p.pausedAt) return false;
  if (p.segment && p.segment !== "everyone") {
    if (!member) return false;
    if (!inSegment(p.segment, member, at, timeZone)) return false;
  }
  return true;
}

/**
 * The earn-engine hook: keep the candidate promo rows that may boost this member. Reads the birthday only when a birthday promo
 * is among the candidates, and the member's spots only when a capped promo is.
 */
export async function filterBoostsForMember(db: DbOrTx, rows: PromoRow[], member: Omit<PromoMember, "birthday"> & { userId?: string } | null, at: Date, timeZone: string): Promise<PromoRow[]> {
  if (!rows.length) return rows;
  let birthday: string | null = null;
  if (member?.userId && rows.some((p) => p.segment === "birthday")) {
    const [u] = await db.select({ b: users.birthday }).from(users).where(eq(users.id, member.userId)).limit(1);
    birthday = u?.b ?? null;
  }
  const capped = rows.filter((p) => p.quantityCap != null).map((p) => p.id);
  const held = new Set<string>();
  if (member && capped.length) {
    const c = await db.select({ promoId: promoClaims.promoId }).from(promoClaims).where(and(eq(promoClaims.memberId, member.id), inArray(promoClaims.promoId, capped)));
    for (const x of c) held.add(x.promoId);
  }
  const m = member ? { ...member, birthday } : null;
  return rows.filter((p) => promoBoostEligible(p, m, at, timeZone) && (p.quantityCap == null || held.has(p.id)));
}

/** SQL condition on merchant_members (joined with users) for a segment. */
export function segmentWhere(segment: string, merchantId: string, at: Date, timeZone: string): SQL {
  const base = eq(merchantMembers.merchantId, merchantId);
  const t = at.getTime();
  switch (segment as promosApi.PromoSegment) {
    case "regulars":
      return and(base, gte(merchantMembers.visitCount, SEGMENT_RULES.regularMinVisits), gte(merchantMembers.lastVisitAt, new Date(t - SEGMENT_RULES.regularWithinDays * DAY)))!;
    case "lapsed":
      return and(base, isNotNull(merchantMembers.lastVisitAt), lt(merchantMembers.lastVisitAt, new Date(t - SEGMENT_RULES.lapsedAfterDays * DAY)))!;
    case "new":
      return and(base, gte(merchantMembers.createdAt, new Date(t - SEGMENT_RULES.newWithinDays * DAY)))!;
    case "birthday":
      return and(base, sql`substr(${users.birthday}, 1, 2) = ${localMonth(at, timeZone)}`)!;
    default:
      return base;
  }
}

/**
 * Earn-engine boost provider: live targeted promos (segment ≠ everyone or a quantity cap) for this member. One indexed read; the
 * feature check runs only when a candidate exists. Never throws (a failed lookup must not block an award).
 */
registerEarnBoostProvider("promo:targeted", async (tx, c): Promise<EarnBoost[]> => {
  try {
    const at = c.at;
    const rows = await tx
      .select()
      .from(promos)
      .where(
        and(
          eq(promos.merchantId, c.merchant.id),
          inArray(promos.kind, ["multiplier", "bonus_points"]),
          inArray(promos.status, ["live", "scheduled"]),
          isNull(promos.pausedAt),
          or(ne(promos.segment, "everyone"), sql`${promos.quantityCap} is not null`),
          lte(promos.startsAt, at),
          or(isNull(promos.endsAt), gte(promos.endsAt, at)),
        ),
      );
    if (!rows.length) return [];
    const on = (await enabledFeaturesFor(tx, [c.merchant], ["promos.double_points"])).get(c.merchant.id);
    if (!on?.has("promos.double_points")) return [];
    const tz = c.merchant.timezone || "America/Toronto";
    const live = rows.filter((p) => promoAppliesAt(p, at, tz));
    const ok = await filterBoostsForMember(tx, live, { id: c.member.id, userId: c.member.userId, visitCount: c.member.visitCount, lastVisitAt: c.member.lastVisitAt, createdAt: c.member.createdAt }, at, tz);
    return ok.map((p) => ({ promoId: p.id, multiplier: p.multiplierPct ? p.multiplierPct / 100 : undefined, bonusPoints: p.bonusPoints ?? undefined, itemId: p.itemId, categoryId: p.categoryId, label: p.title }));
  } catch {
    return [];
  }
});
