/**
 * Visit-rhythm facts per member (café & retail): visits in the last 30 days, "usually comes in",
 * regular and slipping away. The rules live in @ll/shared (reportsApi.isRegular / isSlipping /
 * usuallyLabel) so the dashboard, API and tests agree; this module only loads the visits.
 */
import { and, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { visits, type DbOrTx } from "@ll/db";
import { reportsApi } from "@ll/shared";
import { localParts } from "./ledger.js";
import { localDayStart } from "./staff.js";

const DAY = 86_400_000;

/** Shop-local YYYY-MM-DD. */
export const shopDate = (at: Date, timeZone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

export interface MemberRhythm {
  visits30d: number;
  usually: string | null;
  isRegular: boolean;
  isSlipping: boolean;
  lastVisitAt: Date | null;
}

export const NO_RHYTHM: MemberRhythm = { visits30d: 0, usually: null, isRegular: false, isSlipping: false, lastVisitAt: null };

/**
 * One query: each member's 12 most recent visits plus every visit in the last 60 days.
 * `memberIds` narrows it to a page of members; omit it for the whole shop.
 */
export async function memberRhythms(db: DbOrTx, merchantId: string, timezone: string, now: Date, memberIds?: string[]): Promise<Map<string, MemberRhythm>> {
  const out = new Map<string, MemberRhythm>();
  if (memberIds && !memberIds.length) return out;
  const since = new Date(now.getTime() - 60 * DAY);
  const ranked = db
    .select({
      memberId: visits.memberId,
      at: visits.createdAt,
      rn: sql<number>`row_number() over (partition by ${visits.memberId} order by ${visits.createdAt} desc)`.as("rn"),
    })
    .from(visits)
    .where(and(eq(visits.merchantId, merchantId), lte(visits.createdAt, now), memberIds ? inArray(visits.memberId, memberIds) : undefined))
    .as("ranked");
  const list = await db
    .select({ memberId: ranked.memberId, at: ranked.at })
    .from(ranked)
    .where(or(lte(ranked.rn, reportsApi.USUALLY_WINDOW), gt(ranked.at, since)))
    .orderBy(desc(ranked.at));
  const by = new Map<string, Date[]>();
  for (const r of list) {
    const a = by.get(r.memberId) ?? [];
    a.push(r.at);
    by.set(r.memberId, a);
  }
  for (const [id, times] of by) {
    out.set(id, rhythmOf(times, timezone, now));
  }
  return out;
}

/** `times` newest first. */
export function rhythmOf(times: Date[], timezone: string, now: Date): MemberRhythm {
  const slots = times.map((t) => {
    const p = localParts(t, timezone);
    return { dow: p.dow, hour: Number(p.hhmm.slice(0, 2)) };
  });
  return {
    visits30d: times.filter((t) => t.getTime() > now.getTime() - 30 * DAY).length,
    usually: reportsApi.usuallyLabel(slots),
    isRegular: reportsApi.isRegular(times, now),
    isSlipping: reportsApi.isSlipping(times, now),
    lastVisitAt: times[0] ?? null,
  };
}

/** Member ids in a café segment, computed from visit rhythm (regulars, slipping). */
export async function rhythmSegmentIds(db: DbOrTx, merchantId: string, timezone: string, now: Date, segment: "regulars" | "slipping"): Promise<string[]> {
  const all = await memberRhythms(db, merchantId, timezone, now);
  return [...all.entries()].filter(([, r]) => (segment === "regulars" ? r.isRegular : r.isSlipping)).map(([id]) => id);
}

/** Start (UTC instant) of the shop-local calendar month containing `now`. */
export function monthStart(now: Date, timezone: string): Date {
  const first = `${shopDate(now, timezone).slice(0, 7)}-01`;
  return localDayStart(new Date(`${first}T12:00:00Z`), timezone).start;
}
