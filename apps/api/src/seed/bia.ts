/**
 * BIA console demo: a manager login for the Roncesvalles neighbourhood with campaign data to look at
 * (an ended passport week with a drawn winner, a points weekend running now, a scheduled passport, a draft multiplier).
 *
 * Idempotent: a user or campaign that already exists is left alone. Everyone here is fictional.
 */
import bcrypt from "bcryptjs";
import { eq, like, sql } from "drizzle-orm";
import { campaignMerchants, campaignProgress, campaigns, featureRollouts, merchants, neighbourhoodManagers, neighbourhoods, users, type Db } from "@ll/db";
import { generateMemberCode } from "../services/ledger.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const BIA_DEMO = {
  email: (hood: string) => `bia+${hood}@example.com`,
  password: "localloyalty-demo",
  hood: "roncesvalles",
  name: "Jordan Kowalski",
} as const;

export async function seedBiaDemo(db: Db, opts: { log?: (m: string) => void; now?: Date } = {}): Promise<void> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const [hood] = await db.select().from(neighbourhoods).where(eq(neighbourhoods.slug, BIA_DEMO.hood)).limit(1);
  if (!hood) return;

  const email = BIA_DEMO.email(BIA_DEMO.hood);
  let [manager] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!manager) {
    [manager] = await db
      .insert(users)
      .values({ memberCode: await generateMemberCode(db), email, name: hood.biaContactName ?? BIA_DEMO.name, passwordHash: await bcrypt.hash(BIA_DEMO.password, 10), emailVerifiedAt: now })
      .returning();
  }
  await db.insert(neighbourhoodManagers).values({ neighbourhoodId: hood.id, userId: manager!.id }).onConflictDoNothing();
  // Neighbourhood campaigns are hidden at launch; the demo shows them (an admin can still switch them off in Rollout).
  await db.insert(featureRollouts).values({ key: "campaigns.neighbourhood", stage: "ga" }).onConflictDoNothing();

  const [already] = await db.select({ n: sql<number>`count(*)::int` }).from(campaigns).where(eq(campaigns.neighbourhoodId, hood.id));
  if (Number(already?.n ?? 0) > 0) return;

  const shops = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.neighbourhoodId, hood.id)).orderBy(merchants.slug);
  const shopIds = shops.map((s) => s.id);
  const customers = await db.select({ id: users.id }).from(users).where(like(users.phone, "+1647555%")).orderBy(users.phone).limit(40);

  const mk = async (v: Omit<typeof campaigns.$inferInsert, "neighbourhoodId" | "createdBy">) => {
    const [c] = await db.insert(campaigns).values({ ...v, neighbourhoodId: hood.id, createdBy: manager!.id }).returning();
    await db.insert(campaignMerchants).values(shopIds.map((merchantId) => ({ campaignId: c!.id, merchantId }))).onConflictDoNothing();
    return c!;
  };

  const ended = await mk({
    name: "Roncesvalles Passport Week",
    description: "Visit five Roncesvalles shops in a week for a chance at the street-wide prize draw.",
    kind: "passport",
    startsAt: new Date(now.getTime() - 40 * DAY),
    endsAt: new Date(now.getTime() - 33 * DAY),
    goalVisits: 5,
    bonusPoints: 25,
    prize: "$250 in shop credit, spent on the Roncesvalles strip",
    priceCents: 225_000,
    paidAt: new Date(now.getTime() - 45 * DAY),
    status: "ended",
    createdAt: new Date(now.getTime() - 46 * DAY),
  });
  const weekend = await mk({
    name: "Polish Festival Points Weekend",
    description: "Bonus points at every participating shop while the festival is on.",
    kind: "points_weekend",
    startsAt: new Date(now.getTime() - 20 * HOUR),
    endsAt: new Date(now.getTime() + 2 * DAY),
    goalVisits: 3,
    bonusPoints: 50,
    prize: null,
    priceCents: 150_000,
    paidAt: new Date(now.getTime() - 6 * DAY),
    status: "live",
    createdAt: new Date(now.getTime() - 7 * DAY),
  });
  await mk({
    name: "Holiday Passport",
    description: "Pick up gifts at five shops and enter the holiday draw.",
    kind: "passport",
    startsAt: new Date(now.getTime() + 20 * DAY),
    endsAt: new Date(now.getTime() + 27 * DAY),
    goalVisits: 5,
    bonusPoints: 25,
    prize: "$250 in shop credit",
    priceCents: 225_000,
    paidAt: new Date(now.getTime() - 2 * DAY),
    status: "scheduled",
    createdAt: new Date(now.getTime() - 3 * DAY),
  });
  await mk({
    name: "Double Points Saturdays",
    description: "Two weeks of double points on the strip.",
    kind: "multiplier",
    startsAt: new Date(now.getTime() + 45 * DAY),
    endsAt: new Date(now.getTime() + 59 * DAY),
    goalVisits: 5,
    bonusPoints: 0,
    multiplierPct: 200,
    prize: null,
    priceCents: 300_000,
    status: "draft",
    createdAt: new Date(now.getTime() - DAY),
  });

  // Participation: how many shops each customer reached, so the report has completions and a drawn winner.
  const reach = (i: number, goal: number) => Math.min(shopIds.length, 1 + ((i * 7) % goal) + (i % 3 === 0 ? 1 : 0));
  const rows: (typeof campaignProgress.$inferInsert)[] = [];
  customers.slice(0, 28).forEach((c, i) => {
    const n = reach(i, 5);
    const at = new Date(now.getTime() - (38 - (i % 5)) * DAY);
    rows.push({ campaignId: ended.id, userId: c.id, merchantIds: shopIds.slice(0, n), completedAt: n >= 5 ? at : null, updatedAt: at });
  });
  customers.slice(8, 22).forEach((c, i) => {
    const n = reach(i, 3);
    const at = new Date(now.getTime() - (i % 12) * HOUR);
    rows.push({ campaignId: weekend.id, userId: c.id, merchantIds: shopIds.slice(0, n), completedAt: n >= 3 ? at : null, updatedAt: at });
  });
  if (rows.length) await db.insert(campaignProgress).values(rows).onConflictDoNothing();
  const winner = rows.find((r) => r.campaignId === ended.id && r.completedAt);
  if (winner) await db.update(campaigns).set({ winnerUserId: winner.userId, drawnAt: new Date(now.getTime() - 32 * DAY) }).where(eq(campaigns.id, ended.id));
  log(`BIA demo: ${email} manages ${hood.name} with 4 campaigns`);
}
