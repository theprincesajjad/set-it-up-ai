import { createPgliteDb, featureOverrides, supportSessions, loyaltyPrograms, merchantCategories, merchantStaff, merchants, neighbourhoods, rewards, users, type Db } from "@ll/db";
import type { FastifyInstance } from "fastify";
import type { FeatureKey } from "@ll/shared";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { signAccessToken } from "../src/lib/auth.js";
import { createProviders } from "../src/providers/index.js";
import { generateMemberCode } from "../src/services/ledger.js";

export interface TestEnv {
  ctx: AppContext;
  app: FastifyInstance;
  db: Db;
  /** Mutable clock. */
  clock: { now: Date };
  close: () => Promise<void>;
}

export async function createTestEnv(opts: { now?: Date; activationThreshold?: number } = {}): Promise<TestEnv> {
  const db = await createPgliteDb();
  const config = { ...loadConfig({ NODE_ENV: "test" }), activationThreshold: opts.activationThreshold ?? 25 };
  const clock = { now: opts.now ?? new Date("2026-11-03T15:00:00Z") };
  const ctx: AppContext = { db, config, providers: createProviders(config), now: () => clock.now };
  const app = await buildApp(ctx);
  return { ctx, app, db, clock, close: async () => { await app.close(); await db.$close(); } };
}

let phoneSeq = 1000;
export const nextPhone = () => `+1416555${String(phoneSeq++).padStart(4, "0")}`;

export async function createUser(db: Db, data: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db.insert(users).values({ phone: nextPhone(), memberCode: await generateMemberCode(db), ...data }).returning();
  return u!;
}

export async function tokenFor(env: TestEnv, user: { id: string; platformRole: "none" | "rep" | "admin" }) {
  return signAccessToken(env.ctx, { id: user.id, platformRole: user.platformRole });
}

/** A merchant with an owner, a program, a reward and a no-earn category. */
export async function createMerchant(env: TestEnv, opts: { earnType?: "per_dollar" | "per_visit" | "stamps"; neighbourhoodId?: string; welcomeBonus?: number; slug?: string } = {}) {
  const owner = await createUser(env.db, { email: `owner${phoneSeq}@example.com` });
  const [m] = await env.db
    .insert(merchants)
    .values({ slug: opts.slug ?? `shop-${phoneSeq++}`, name: "Test Shop", vertical: "pharmacy", neighbourhoodId: opts.neighbourhoodId ?? null, status: "active" })
    .returning();
  await env.db.insert(merchantStaff).values({ merchantId: m!.id, userId: owner.id, role: "owner" });
  const [program] = await env.db
    .insert(loyaltyPrograms)
    .values({
      merchantId: m!.id,
      name: "Test Rewards",
      earnType: opts.earnType ?? "per_dollar",
      pointsPerDollar: 1,
      pointsPerVisit: 1,
      welcomeBonus: opts.welcomeBonus ?? 0,
    })
    .returning();
  const [reward] = await env.db.insert(rewards).values({ merchantId: m!.id, name: "$5 off", pointsCost: 50, rewardType: "amount_off", value: 500 }).returning();
  const [rx] = await env.db.insert(merchantCategories).values({ merchantId: m!.id, name: "Prescriptions", earnEligible: false, discountEligible: false }).returning();
  const ownerToken = await tokenFor(env, owner);
  return { merchant: m!, owner, ownerToken, program: program!, reward: reward!, noEarnCategory: rx! };
}

export async function createNeighbourhood(db: Db, slug = `hood-${phoneSeq++}`) {
  const [n] = await db.insert(neighbourhoods).values({ slug, name: slug, status: "live", centerLat: 43.65, centerLng: -79.45 }).returning();
  return n!;
}

/**
 * Pricing v2: promos, marketing, VIP, CSV, integrations... are paid and hidden at launch.
 * Tests of those areas enable them the way pilot shops get them: an admin per-merchant override.
 */
export async function grantFeatures(env: Pick<TestEnv, "db">, merchantId: string, keys: FeatureKey[], enabled = true) {
  if (!keys.length) return;
  await env.db
    .insert(featureOverrides)
    .values(keys.map((key) => ({ merchantId, key, enabled, reason: "test pilot" })))
    .onConflictDoUpdate({ target: [featureOverrides.merchantId, featureOverrides.key], set: { enabled } });
}

/** An open, reasoned 30-minute support session: admins and reps may write inside a shop only while one exists. */
export async function openSupportSession(env: Pick<TestEnv, "db" | "clock">, userId: string, merchantId: string, reason = "Test support session") {
  const [s] = await env.db
    .insert(supportSessions)
    .values({ adminUserId: userId, merchantId, reason, startedAt: env.clock.now, expiresAt: new Date(env.clock.now.getTime() + 30 * 60_000) })
    .returning();
  return s!;
}
