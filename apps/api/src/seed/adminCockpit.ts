/**
 * Founder's cockpit demo (wave N, team admin): 30 shops in the Greater Toronto Area with varied trades, plans (Free, Pro monthly
 * and yearly, Studio, Service, a restaurant tier), trials (running, ending soon, converted, lapsed), churn, activity curves (growing,
 * steady, declining, gone quiet, brand new) and landing sources ("/", /for-nail-techs, /for-barbers, /for-groomers; ig, tiktok,
 * google cpc, direct; phone and desktop), plus a month of landing traffic and two days of API latency rows.
 *
 * Dev and e2e only: seedDemo calls it, and it refuses to run when the config says production. Idempotent: it skips when its first
 * shop exists. Stamps go through services/ledger.ts awardPurchase (the ledger stays balanced); timestamps come from the clock.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { apiMetrics, appointments, invoices, landingEvents, locations, merchantMilestones, merchants, sessions, subscriptions, users, type Db } from "@ll/db";
import type { AppContext } from "../context.js";
import { LATENCY_BUCKETS_MS } from "../lib/metrics.js";
import { awardPurchase } from "../services/ledger.js";
import { createMerchantWithTemplate } from "../services/merchant.js";

const DAY = 86_400_000;
export const COCKPIT_FIRST_SLUG = "ck-lumen-nail-studio";

type Curve = "growing" | "steady" | "declining" | "quiet" | "new" | "none";
type Billing = "free" | "plus_m" | "plus_y" | "studio" | "service" | "restaurant" | "past_due" | "trial" | "trial_ending" | "trial_lapsed" | "churned";
interface Spec {
  name: string;
  vertical: string;
  city: string;
  days: number;
  billing: Billing;
  curve: Curve;
  /** Landing page path, source, UTM medium, device; null = signed up with no landing visit (a rep, a referral). */
  landing: [string, string | null, string | null, "phone" | "desktop"] | null;
  variant?: string;
}

const SHOPS: Spec[] = [
  { name: "Lumen Nail Studio", vertical: "nails", city: "Toronto", days: 118, billing: "plus_y", curve: "growing", landing: ["/for-nail-techs", "ig", null, "phone"] },
  { name: "Glossbox Nails", vertical: "nails", city: "Mississauga", days: 96, billing: "plus_m", curve: "steady", landing: ["/for-nail-techs", "tiktok", null, "phone"], variant: "dms" },
  { name: "Polished by Priya", vertical: "nails", city: "Brampton", days: 61, billing: "plus_m", curve: "declining", landing: ["/for-nail-techs", "ig", null, "phone"] },
  { name: "Tip Top Nails", vertical: "nails", city: "Scarborough", days: 12, billing: "trial_ending", curve: "none", landing: ["/for-nail-techs", "google", "cpc", "desktop"] },
  { name: "Brow Theory", vertical: "brows_lashes", city: "Toronto", days: 74, billing: "studio", curve: "growing", landing: ["/for-nail-techs", "ig", null, "phone"] },
  { name: "Lash Loft", vertical: "brows_lashes", city: "Markham", days: 33, billing: "trial_lapsed", curve: "quiet", landing: ["/for-nail-techs", null, null, "phone"] },
  { name: "Fade Factory", vertical: "barber", city: "Toronto", days: 110, billing: "plus_m", curve: "steady", landing: ["/for-barbers", "tiktok", null, "phone"] },
  { name: "Kings Cuts", vertical: "barber", city: "Brampton", days: 88, billing: "past_due", curve: "declining", landing: ["/for-barbers", "ig", null, "phone"] },
  { name: "Sharp Line Barbers", vertical: "barber", city: "Etobicoke", days: 10, billing: "trial", curve: "growing", landing: ["/for-barbers", "google", "cpc", "desktop"] },
  { name: "Old Town Barber", vertical: "barber", city: "Toronto", days: 140, billing: "churned", curve: "quiet", landing: null },
  { name: "Waggy Wash", vertical: "pet", city: "Toronto", days: 70, billing: "plus_m", curve: "growing", landing: ["/for-groomers", "ig", null, "phone"] },
  { name: "Pawfect Grooming", vertical: "pet", city: "Mississauga", days: 41, billing: "trial_lapsed", curve: "steady", landing: ["/for-groomers", "google", "cpc", "desktop"] },
  { name: "Fluff and Fold Pets", vertical: "pet", city: "Vaughan", days: 9, billing: "trial", curve: "new", landing: ["/for-groomers", null, null, "phone"] },
  { name: "Bean There Cafe", vertical: "cafe", city: "Toronto", days: 125, billing: "plus_y", curve: "steady", landing: ["/", "google", "cpc", "desktop"] },
  { name: "Daily Grind", vertical: "cafe", city: "Toronto", days: 80, billing: "free", curve: "steady", landing: ["/", null, null, "desktop"] },
  { name: "Morning Ritual Coffee", vertical: "cafe", city: "Oakville", days: 54, billing: "free", curve: "quiet", landing: ["/", "ig", null, "phone"] },
  { name: "Crumb and Co Bakery", vertical: "bakery", city: "Toronto", days: 102, billing: "studio", curve: "growing", landing: ["/", "google", "cpc", "desktop"] },
  { name: "Sweet Saffron", vertical: "bakery", city: "Brampton", days: 47, billing: "free", curve: "declining", landing: null },
  { name: "Tandoor House", vertical: "restaurant_south_asian", city: "Mississauga", days: 90, billing: "restaurant", curve: "steady", landing: null },
  { name: "Lotus Spa", vertical: "spa", city: "Markham", days: 66, billing: "service", curve: "steady", landing: ["/", "google", "cpc", "desktop"] },
  { name: "Glow Up Makeup", vertical: "makeup", city: "Toronto", days: 11, billing: "trial", curve: "growing", landing: ["/for-nail-techs", "tiktok", null, "phone"] },
  { name: "Fix It Phones", vertical: "repair_electronics", city: "Scarborough", days: 58, billing: "free", curve: "steady", landing: ["/", null, null, "desktop"] },
  { name: "Green Leaf Florist", vertical: "florist", city: "Toronto", days: 37, billing: "free", curve: "steady", landing: null },
  { name: "Iron Temple Fitness", vertical: "fitness", city: "Etobicoke", days: 84, billing: "churned", curve: "quiet", landing: ["/", "google", "cpc", "desktop"] },
  { name: "Corner Books", vertical: "bookstore", city: "Toronto", days: 15, billing: "plus_m", curve: "new", landing: ["/", "ig", null, "phone"] },
  { name: "Snip Studio", vertical: "salon", city: "Richmond Hill", days: 4, billing: "free", curve: "new", landing: ["/", null, null, "phone"] },
  { name: "Nail Haus", vertical: "nails", city: "Toronto", days: 2, billing: "free", curve: "new", landing: ["/for-nail-techs", "ig", null, "phone"] },
  { name: "Clean Press Dry Cleaners", vertical: "dry_cleaning", city: "North York", days: 99, billing: "plus_m", curve: "declining", landing: null },
  { name: "Halal Fresh Grocer", vertical: "grocery", city: "Mississauga", days: 76, billing: "free", curve: "steady", landing: null },
  { name: "Silk Threading Bar", vertical: "brows_lashes", city: "Brampton", days: 6, billing: "trial", curve: "new", landing: ["/for-nail-techs", "google", "cpc", "desktop"] },
];

/** Weekly stamps for a curve, 12 weeks (index 0 the oldest), scaled by `k`. */
function curveWeeks(c: Curve, k: number): number[] {
  const base: Record<Curve, number[]> = {
    growing: [2, 3, 3, 4, 5, 6, 6, 7, 8, 9, 10, 12],
    steady: [6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7],
    declining: [9, 10, 9, 10, 9, 10, 9, 10, 9, 10, 10, 3],
    quiet: [5, 4, 4, 3, 3, 2, 2, 1, 0, 0, 0, 0],
    new: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
    none: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
  return base[c].map((n) => Math.round(n * k));
}

const slug = (name: string) => `ck-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const aidFor = (i: number, salt: string) => `ck${salt}${String(i).padStart(20 - salt.length, "0")}`;

export async function seedAdminCockpit(db: Db, ctx: AppContext, clock: { now: Date }, o: { scale?: number; log?: (m: string) => void } = {}) {
  const log = o.log ?? (() => {});
  if (ctx.config.env === "production") return { skipped: true, merchants: 0 };
  const [exists] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, COCKPIT_FIRST_SLUG)).limit(1);
  if (exists) return { skipped: true, merchants: 0 };
  const realNow = new Date();
  const at = (daysAgo: number, hour = 15) => new Date(Math.min(realNow.getTime() - daysAgo * DAY + (hour - 15) * 3_600_000, daysAgo >= 0 ? realNow.getTime() - 60_000 : Infinity));
  const k = Math.max(0.25, Math.min(1, o.scale ?? 1));
  const hash = await bcrypt.hash("localloyalty-demo", 4);
  let phoneSeq = 0;
  let visitorSeq = 0;
  const landingRows: (typeof landingEvents.$inferInsert)[] = [];
  const PAGE_ID: Record<string, string> = { "/": "home", "/for-nail-techs": "nail", "/for-barbers": "barber", "/for-groomers": "groom" };
  const TRADE: Record<string, string> = { "/": "home", "/for-nail-techs": "nails", "/for-barbers": "barber", "/for-groomers": "groom" };

  for (const [i, s] of SHOPS.entries()) {
    // ---- the landing visit that led to the signup ----
    const anonId = s.landing ? aidFor(i, "s") : null;
    if (s.landing && anonId) {
      const [path, src, medium, device] = s.landing;
      const base = { anonId, page: PAGE_ID[path]!, trade: TRADE[path]!, variant: s.variant ?? "control", src, device, utmSource: medium ? src : null, utmMedium: medium, utmCampaign: medium ? "fall-launch" : null };
      const t = at(s.days + 0.02);
      landingRows.push({ ...base, kind: "view", createdAt: t }, { ...base, kind: "cta_click", data: "hero", createdAt: t }, { ...base, kind: path === "/" ? "signup_start" : "start_submit", createdAt: t });
    }

    // ---- the shop, created at its signup time ----
    clock.now = at(s.days);
    const [owner] = await db.insert(users).values({ email: `owner+${slug(s.name)}@example.com`, name: `${s.name} owner`, passwordHash: hash, memberCode: `CK${String(i).padStart(4, "0")}` }).returning();
    const { merchant, location } = await createMerchantWithTemplate(ctx, {
      body: { name: s.name, vertical: s.vertical as never, address: `${100 + i} Queen St`, city: s.city, postalCode: "M5V 2T6", phone: `+1437555${String(2000 + i).padStart(4, "0")}`, description: `${s.name}, ${s.city}.` },
      ownerUserId: owner!.id,
      repUserId: null,
      actorUserId: owner!.id,
    });
    const [path, src, medium, device] = s.landing ?? [null, null, null, null];
    await db
      .update(merchants)
      .set({
        slug: slug(s.name),
        status: (s.curve === "new" || s.curve === "none") && s.days < 7 ? "onboarding" : "active",
        plan: s.billing === "studio" ? "studio" : s.billing === "service" ? "pro" : ["plus_m", "plus_y", "past_due", "churned"].includes(s.billing) ? "plus" : "free",
        // Every in-app trial lasts 14 days from signup; shops that pay now started on one too (the subscription begins as it ends).
        ...(s.billing.startsWith("trial") || (["plus_m", "plus_y", "studio", "past_due"].includes(s.billing) && s.days > 20) ? { trialPlan: s.billing === "studio" ? "studio" : "plus", trialUsed: true, trialStartedAt: at(s.days), trialEndsAt: at(s.days - 14) } : {}),
        signupAnonId: anonId,
        signupPage: path,
        signupVariant: s.landing ? (s.variant ?? "control") : null,
        signupSrc: src,
        signupUtmSource: medium ? src : null,
        signupUtmMedium: medium,
        signupUtmCampaign: medium ? "fall-launch" : null,
        signupDevice: device,
      })
      .where(eq(merchants.id, merchant.id));
    await db.update(locations).set({ city: s.city }).where(eq(locations.id, location.id));
    if (s.days >= 7) await db.insert(merchantMilestones).values({ merchantId: merchant.id, key: "booking_link_live", reachedAt: at(s.days - 1) }).onConflictDoNothing();

    // ---- billing ----
    const sub = (plan: "plus" | "studio" | "pro", status: "active" | "past_due" | "canceled", interval: "month" | "year", daysAgo: number, restaurantTier?: "growth") =>
      db.insert(subscriptions).values({ merchantId: merchant.id, plan, status, interval, restaurantTier: restaurantTier ?? null, createdAt: at(daysAgo), currentPeriodEnd: at(daysAgo - (interval === "year" ? 365 : 30 * Math.ceil(daysAgo / 30))) });
    if (s.billing === "plus_m") await sub("plus", "active", "month", s.days - 14);
    if (s.billing === "plus_y") await sub("plus", "active", "year", s.days - 14);
    if (s.billing === "studio") await sub("studio", "active", "month", s.days - 14);
    if (s.billing === "service") await sub("pro", "active", "month", s.days - 14);
    if (s.billing === "restaurant") await sub("plus", "active", "month", s.days - 3, "growth");
    if (s.billing === "past_due") await sub("plus", "past_due", "month", s.days - 14);
    if (s.billing === "churned") await sub("plus", "canceled", "month", s.days - 14);
    if (s.billing === "trial_lapsed" && s.vertical === "pet") await sub("plus", "active", "month", s.days - 15);

    // ---- usage: stamps through the ledger, a booking every few stamps, staff logins, some POS sales and paid invoices ----
    const weeks = curveWeeks(s.curve, k);
    const maxWeeks = Math.min(12, Math.floor(s.days / 7) + 1);
    let n = 0;
    for (let w = 12 - maxWeeks; w < 12; w++) {
      const weekAgo = 12 - w; // 12..1
      for (let j = 0; j < weeks[w]!; j++) {
        const daysAgo = Math.max(0.05, (weekAgo - 1) * 7 + ((j * 5) % 7) + 0.3);
        if (daysAgo >= s.days) continue;
        clock.now = at(daysAgo, 11 + (j % 7));
        const phone = `+1437556${String(1000 + ((i * 7 + j) % 60) + (phoneSeq++ % 3) * 60).padStart(4, "0")}`;
        const pos = j % 5 === 0;
        await awardPurchase(ctx, { merchantId: merchant.id, phone, customerName: null, amountCents: 1200 + ((j * 731) % 4800), source: pos ? "square" : "staff_app", locationId: location.id });
        if (n++ % 3 === 0) {
          const starts = new Date(clock.now.getTime() + DAY);
          await db.insert(appointments).values({ merchantId: merchant.id, locationId: location.id, customerName: "Walk-in", startsAt: starts, endsAt: new Date(starts.getTime() + 3_600_000), status: starts < realNow ? "completed" : "booked", depositCents: j % 2 ? 2000 : 0, depositPaidAt: j % 2 ? clock.now : null, createdAt: clock.now });
        }
      }
      if (weeks[w]! > 0) {
        for (let l = 0; l < Math.min(5, Math.ceil(weeks[w]! / 3)); l++) await db.insert(sessions).values({ userId: owner!.id, refreshTokenHash: `ck-${i}-${w}-${l}`, userAgent: null, expiresAt: at(-30), revokedAt: at((weekAgo - 1) * 7), createdAt: at((weekAgo - 1) * 7 + l + 0.5) });
      }
    }
    if (["service", "studio"].includes(s.billing) || s.vertical === "spa") {
      for (let v = 0; v < 4; v++) {
        const paid = at(3 + v * 9);
        const [u] = await db.select({ id: users.id }).from(users).where(eq(users.phone, `+1437556${String(1000 + ((i * 7) % 60)).padStart(4, "0")}`)).limit(1);
        if (u) await db.insert(invoices).values({ merchantId: merchant.id, userId: u.id, number: 900 + v, lineItems: [], subtotalCents: 8500 + v * 1000, totalCents: 8500 + v * 1000, amountDueCents: 0, payToken: `ck-${i}-${v}`, status: "paid", paidAt: paid, createdAt: paid });
      }
    }
    if (s.billing === "churned") await db.update(merchants).set({ status: "closed" }).where(eq(merchants.id, merchant.id));
  }

  // ---- landing traffic that did not sign up: 30 days, the four pages, several sources, both devices ----
  const pages = ["/", "/", "/for-nail-techs", "/for-nail-techs", "/for-barbers", "/for-groomers"];
  const sources: [string | null, string | null][] = [[null, null], ["ig", null], ["tiktok", null], ["google", "cpc"], [null, null]];
  const visitors = Math.round(480 * k);
  // A small fixed-seed PRNG (mulberry32), so the demo is the same every time but not striped.
  let seed = 20261101;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let v = 0; v < visitors; v++) {
    const path = pages[Math.floor(rnd() * pages.length)]!;
    const [src, medium] = sources[Math.floor(rnd() * sources.length)]!;
    const device = rnd() < 0.68 ? "phone" : "desktop";
    const dms = path === "/for-nail-techs" && rnd() < 0.5;
    const base = { anonId: aidFor(visitorSeq++, "v"), page: PAGE_ID[path]!, trade: TRADE[path]!, variant: dms ? "dms" : "control", src, device, utmSource: medium ? src : null, utmMedium: medium, utmCampaign: medium ? "fall-launch" : null };
    // Traffic grows over the month; phones click a little less, the DM variant a little more.
    const t = at(Math.pow(rnd(), 1.4) * 30);
    landingRows.push({ ...base, kind: "view", createdAt: t });
    const clicks = rnd() < 0.3 + (dms ? 0.08 : 0) - (device === "phone" ? 0.05 : 0);
    if (clicks) landingRows.push({ ...base, kind: "cta_click", data: rnd() < 0.6 ? "hero" : "pricing", createdAt: t });
    if (clicks && rnd() < 0.35) landingRows.push({ ...base, kind: path === "/" ? "signup_start" : "start_submit", createdAt: t });
  }
  for (let r = 0; r < landingRows.length; r += 400) await db.insert(landingEvents).values(landingRows.slice(r, r + 400)).onConflictDoNothing();

  // ---- API latency: 48 hourly windows per route group, so the performance page has a shape before real traffic ----
  const ROUTES: [string, string, number, number][] = [
    ["GET /v1/merchants/:merchantId/dashboard", "merchants:dashboard", 140, 3],
    ["POST /v1/staff/:merchantId/award", "staff:award", 220, 4],
    ["GET /v1/public/shops/:slug", "public", 90, 2],
    ["POST /v1/public/landing-events", "public", 40, 1],
    ["GET /v1/merchants/:merchantId/appointments", "merchants:appointments", 60, 7],
    ["GET /v1/me/wallet", "me", 70, 3],
    ["GET /v1/admin/cockpit", "admin", 3, 8],
    ["POST /v1/auth/login", "auth", 25, 6],
  ];
  const metricRows: (typeof apiMetrics.$inferInsert)[] = [];
  for (let h = 47; h >= 0; h--) {
    const busy = 0.4 + 0.6 * Math.sin(((24 - (h % 24)) / 24) * Math.PI);
    for (const [route, group, volume, slowIdx] of ROUTES) {
      const count = Math.max(1, Math.round(volume * busy));
      const hist = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
      const spike = h === 5 && group === "merchants:appointments" ? 3 : 0;
      hist[Math.max(0, slowIdx - 2)]! += Math.round(count * 0.55);
      hist[slowIdx - 1 + spike]! += Math.round(count * 0.35);
      hist[slowIdx + spike]! += count - Math.round(count * 0.55) - Math.round(count * 0.35);
      const errors = group === "staff:award" && h % 11 === 0 ? 1 : 0;
      metricRows.push({ bucketStart: new Date(realNow.getTime() - (h + 1) * 3_600_000), routeGroup: group, route, count, errors, sumMs: count * LATENCY_BUCKETS_MS[slowIdx - 1]!, maxMs: LATENCY_BUCKETS_MS[slowIdx + spike]!, hist });
    }
  }
  for (let r = 0; r < metricRows.length; r += 200) await db.insert(apiMetrics).values(metricRows.slice(r, r + 200));
  clock.now = new Date();
  log(`Admin cockpit demo: ${SHOPS.length} shops, ${landingRows.length} landing events, ${metricRows.length} latency rows.`);
  return { skipped: false, merchants: SHOPS.length };
}
