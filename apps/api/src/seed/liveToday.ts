/**
 * A live-looking "today" for every demo shop (Main Street Warm demo data). Today, the reports and the counter's Recent list are never empty:
 * visits spread across the morning up to the real "now", stamps, a few rewards redeemed, new members, rewards waiting and a couple of
 * slipping regulars. It works for every trade; a shop that cannot take points (a pharmacy before its pharmacist confirms) is skipped.
 *
 * Idempotent per shop and per day: it only adds what is missing, so running the seed again tomorrow freshens today without doubling it.
 * Everything goes through services/ledger.ts (awardPurchase / redeemReward); afterwards only timestamps are back-dated, as demo.ts does.
 * Counts are scaled by `scale` (tests pass a small one) and the random stream is its own, so no other seeded value moves.
 */
import { and, asc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import {
  ledgerTransactions,
  locations,
  loyaltyPrograms,
  merchantCategories,
  merchantMembers,
  merchants,
  redemptions,
  rewards,
  users,
  visits,
  type Db,
} from "@ll/db";
import type { AppContext } from "../context.js";
import { zonedToUtc } from "../services/bookings.js";
import { awardPurchase, redeemReward } from "../services/ledger.js";
import { memberRhythms } from "../services/member-stats.js";
import { FIRST_NAMES, LAST_NAMES } from "./data.js";

const TZ = "America/Toronto";
const DAY = 86_400_000;
const MIN = 60_000;
const LOCAL_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const LOCAL_HOUR = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });
/** How busy each local hour is (7 am to 6 pm): a morning rush, a lunch bump, a slow afternoon, a small evening return. */
const HOUR_WEIGHT: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 4, 8: 8, 9: 9, 10: 6, 11: 5, 12: 8, 13: 7, 14: 4, 15: 4, 16: 5, 17: 6, 18: 4, 19: 2, 20: 1, 21: 1, 22: 1, 23: 1 };

/** A small deterministic PRNG (mulberry32), separate from demo.ts so the main seed's stream is untouched. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)]!, chance: (p: number) => next() < p };
}

export interface LiveTodayOptions {
  seed?: number;
  /** 0 to 1: how much to add. The full demo uses 1; tests use a small value. Floors keep every shop non-empty. */
  scale?: number;
  log?: (msg: string) => void;
}

export interface LiveTodayResult {
  shops: number;
  visits: number;
  redemptions: number;
  newMembers: number;
  slipping: number;
}

export async function seedLiveToday(db: Db, ctx: AppContext, clock: { now: Date }, opts: LiveTodayOptions = {}): Promise<LiveTodayResult> {
  const log = opts.log ?? (() => {});
  const scale = Math.min(1, Math.max(0.1, opts.scale ?? 1));
  const R = rng(opts.seed ?? 20261028);
  const realNow = new Date();
  const since = new Date(realNow.getTime() - 1000);
  const localDate = LOCAL_DATE.format(realNow);
  const dayStart = zonedToUtc(localDate, 0, TZ);
  const result: LiveTodayResult = { shops: 0, visits: 0, redemptions: 0, newMembers: 0, slipping: 0 };

  // The window visits land in: from the morning rush (7:30) or three hours before now when it is earlier, up to two minutes ago.
  const morning = new Date(dayStart.getTime() + 7.5 * 60 * MIN);
  const windowStart = new Date(Math.max(dayStart.getTime(), Math.min(morning.getTime(), realNow.getTime() - 3 * 60 * MIN)));
  const windowEnd = new Date(realNow.getTime() - 2 * MIN);
  if (windowEnd.getTime() - windowStart.getTime() < 10 * MIN) return result; // the first minutes after midnight: nothing to spread yet

  /** A random time in the window, weighted by hour. */
  const pickTime = (): Date => {
    const span = windowEnd.getTime() - windowStart.getTime();
    for (let tries = 0; tries < 30; tries++) {
      const at = new Date(windowStart.getTime() + Math.floor(R.next() * span));
      const hour = Number(LOCAL_HOUR.format(at)) % 24;
      if (R.next() * 9 < (HOUR_WEIGHT[hour] ?? 1)) return at;
    }
    return new Date(windowStart.getTime() + Math.floor(R.next() * span));
  };

  const backdate = async (memberId: string, userId: string, at: Date) => {
    await db.update(visits).set({ createdAt: at }).where(and(eq(visits.memberId, memberId), gt(visits.createdAt, since)));
    await db.update(ledgerTransactions).set({ createdAt: at }).where(and(eq(ledgerTransactions.memberId, memberId), gt(ledgerTransactions.createdAt, since)));
    await db.update(redemptions).set({ createdAt: at }).where(and(eq(redemptions.memberId, memberId), gt(redemptions.createdAt, since)));
    await db.update(merchantMembers).set({ createdAt: at }).where(and(eq(merchantMembers.id, memberId), gt(merchantMembers.createdAt, since)));
    await db.update(users).set({ createdAt: at }).where(and(eq(users.id, userId), gt(users.createdAt, since)));
  };

  const all = await db.select().from(merchants).orderBy(asc(merchants.createdAt));
  let phoneSeq = 0;
  const freshPhone = () => `+1647559${String(R.int(0, 9) * 1000 + (phoneSeq++ % 1000)).padStart(4, "0")}`;

  for (const [idx, shop] of all.entries()) {
    if (shop.status === "closed" || shop.status === "paused") continue;
    const [program] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, shop.id)).limit(1);
    if (!program || !program.active) continue;
    const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.merchantId, shop.id)).orderBy(asc(locations.createdAt)).limit(1);
    const catRows = shop.vertical === "pharmacy" ? await db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, shop.id)) : [];
    const front = catRows.find((c) => c.name === "Front store")?.id;
    const pharmacyBlocked = shop.vertical === "pharmacy" && (!shop.pharmacyConfirmedAt || !front);
    if (pharmacyBlocked) continue;

    const rewardRows = await db.select({ id: rewards.id, cost: rewards.pointsCost }).from(rewards).where(and(eq(rewards.merchantId, shop.id), eq(rewards.active, true))).orderBy(asc(rewards.pointsCost));
    const goal = rewardRows[0]?.cost ?? null;

    const [today] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(and(eq(visits.merchantId, shop.id), gte(visits.createdAt, dayStart)));
    const haveToday = Number(today?.n ?? 0);
    // A shop sees 14 to 34 visits by evening; scale to how much of the day has passed, with a floor so the card is never thin.
    const fullDay = R.int(14, 26) + (idx % 4) * 2;
    const elapsed = Math.min(1, Math.max(0.35, (realNow.getTime() - windowStart.getTime()) / (11 * 60 * MIN)));
    const target = Math.max(6, Math.round(fullDay * elapsed * scale));
    const need = Math.max(0, target - haveToday);

    const members = await db
      .select({ id: merchantMembers.id, phone: users.phone })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .where(and(eq(merchantMembers.merchantId, shop.id), isNull(users.deletedAt)))
      .orderBy(asc(merchantMembers.createdAt))
      .limit(150);
    const known = members.filter((m) => !!m.phone);

    const ticket = { lo: 450, hi: 2600 };
    const money = () => Math.round(R.int(ticket.lo, ticket.hi) / 5) * 5;
    const award = async (at: Date, who: { phone: string; name: string | null; memberId?: string }, cents = money()) => {
      clock.now = at;
      const lines = front ? [{ amountCents: cents, categoryId: front }] : undefined;
      try {
        const r = await awardPurchase(ctx, {
          merchantId: shop.id,
          ...(who.memberId ? { memberId: who.memberId } : { phone: who.phone, customerName: who.name }),
          amountCents: lines ? undefined : cents,
          lines,
          source: "staff_app",
          locationId: loc?.id,
          joinedVia: R.chance(0.6) ? "qr" : "phone",
          ignoreCooldown: true,
        });
        await backdate(r.member.id, r.member.userId, at);
        // Let the outbox's fast path (a setImmediate per award) run while we seed, not all at once after the database closes.
        await new Promise<void>((done) => setImmediate(done));
        result.visits++;
        if (r.memberCreated) result.newMembers++;
        return r;
      } catch (e) {
        log(`  live today: skipped an award at ${shop.name}: ${(e as Error).message}`);
        return null;
      }
    };
    const redeem = async (at: Date, memberId: string, rewardId: string) => {
      clock.now = at;
      try {
        await redeemReward(ctx, { merchantId: shop.id, memberId, rewardId, source: "staff_app", locationId: loc?.id });
        await db.update(redemptions).set({ createdAt: at }).where(and(eq(redemptions.memberId, memberId), gt(redemptions.createdAt, since)));
        await db.update(ledgerTransactions).set({ createdAt: at }).where(and(eq(ledgerTransactions.memberId, memberId), gt(ledgerTransactions.createdAt, since)));
        result.redemptions++;
        return true;
      } catch {
        return false;
      }
    };

    // 1. Today's visits, oldest first, as the day would have gone. About one in five is a new member.
    const times = Array.from({ length: need }, pickTime).sort((a, b) => a.getTime() - b.getTime());
    const newCount = Math.max(need > 0 ? 2 : 0, Math.round(need * 0.18));
    const newAt = new Set<number>();
    while (newAt.size < Math.min(newCount, times.length)) newAt.add(R.int(0, times.length - 1));
    for (const [i, at] of times.entries()) {
      const isNew = newAt.has(i) || known.length === 0;
      const who = isNew ? { phone: freshPhone(), name: `${R.pick(FIRST_NAMES)} ${R.pick(LAST_NAMES)}` } : (() => { const m = R.pick(known); return { phone: m.phone!, name: null, memberId: m.id }; })();
      const r = await award(at, who);
      if (r && goal && r.rewardsAvailable.length && R.chance(0.35)) await redeem(new Date(at.getTime() + MIN), r.member.id, r.rewardsAvailable[0]!.id);
    }

    // 2. Rewards waiting (at least four) and rewards redeemed today (at least two), the way a shop with real regulars looks.
    if (goal) {
      const waiting = async () => {
        const rows = await db.select({ id: merchantMembers.id, phone: users.phone }).from(merchantMembers).innerJoin(users, eq(users.id, merchantMembers.userId)).where(and(eq(merchantMembers.merchantId, shop.id), gte(merchantMembers.balance, goal), isNull(users.deletedAt)));
        return rows;
      };
      const [redeemedToday] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(ledgerTransactions)
        .where(and(eq(ledgerTransactions.merchantId, shop.id), eq(ledgerTransactions.type, "redeem"), isNull(ledgerTransactions.reversedAt), gte(ledgerTransactions.createdAt, dayStart)));
      const needRedeem = Math.max(0, 2 - Number(redeemedToday?.n ?? 0));
      const wantWaiting = 4 + needRedeem;
      let have = await waiting();
      // Bump members toward the goal with a few visits each (a visit earns points or a stamp; a larger sale earns more points).
      for (let round = 0; have.length < wantWaiting && round < 6 && known.length > 0; round++) {
        const m = known[(round * 3 + idx) % known.length]!;
        if (have.some((h) => h.id === m.id)) continue;
        for (let k = 0; k < 8; k++) {
          const r = await award(pickTime(), { phone: m.phone!, name: null, memberId: m.id }, 6000);
          if (!r || r.rewardsAvailable.length) break;
        }
        have = await waiting();
      }
      for (const m of have.slice(0, needRedeem)) {
        const cheapest = rewardRows[0]!;
        await redeem(new Date(Math.max(windowStart.getTime(), windowEnd.getTime() - R.int(5, 90) * MIN)), m.id, cheapest.id);
      }
    }

    // 3. One or two slipping regulars: four weekly visits that stopped about a month ago (a regular whose gap is now well past her own rhythm).
    const rhythm = await memberRhythms(db, shop.id, TZ, realNow);
    const slippingNow = [...rhythm.values()].filter((r) => r.isSlipping).length;
    const wantSlipping = known.length >= 12 ? 2 : 1;
    for (let s = slippingNow; s < wantSlipping; s++) {
      const phone = freshPhone();
      const name = `${R.pick(FIRST_NAMES)} ${R.pick(LAST_NAMES)}`;
      const last = R.int(24, 34);
      for (let v = 3; v >= 0; v--) {
        const days = last + v * 7;
        const at = new Date(zonedToUtc(LOCAL_DATE.format(new Date(realNow.getTime() - days * DAY)), 9 * 60 + R.int(0, 240), TZ));
        const r = await award(at, { phone, name });
        if (r && v === 3) result.newMembers--; // history, not a member who joined today
      }
      result.slipping++;
    }
    result.shops++;
  }
  clock.now = new Date();
  log(`Live today: ${result.shops} shops, ${result.visits} visits, ${result.redemptions} rewards redeemed, ${result.newMembers} new members, ${result.slipping} slipping regulars added`);
  return result;
}
