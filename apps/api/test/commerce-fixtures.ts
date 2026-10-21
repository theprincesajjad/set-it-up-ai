/** Shared fixtures for the commerce / service / billing / payments test suites. */
import { eq } from "drizzle-orm";
import { featureRollouts, locations, merchantStaff, merchants, pushTokens } from "@ll/db";
import { FEATURE_KEYS, FEATURES, type FeatureKey, type PlanId, type RolloutStage } from "@ll/shared";
import { FakePayments, getPayments, type PaymentsEvent } from "../src/providers/payments.js";
import { createMerchant, createUser, tokenFor, type TestEnv } from "./helpers.js";

export const PAID_FEATURES = FEATURE_KEYS.filter((k) => FEATURES[k].minPlan !== "free");

export async function setStage(env: TestEnv, keys: readonly FeatureKey[], stage: RolloutStage) {
  for (const key of keys) {
    await env.db.insert(featureRollouts).values({ key, stage }).onConflictDoUpdate({ target: featureRollouts.key, set: { stage } });
  }
}

export async function setPlan(env: TestEnv, merchantId: string, plan: PlanId) {
  await env.db.update(merchants).set({ plan }).where(eq(merchants.id, merchantId));
}

export function fake(env: TestEnv): FakePayments {
  const p = getPayments(env.ctx);
  if (!(p instanceof FakePayments)) throw new Error("expected FakePayments");
  return p;
}

/** Sign an event like Stripe and POST it to the webhook endpoint. */
export async function deliver(env: TestEnv, event: PaymentsEvent) {
  const payload = JSON.stringify(event);
  return env.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "content-type": "application/json", "stripe-signature": fake(env).sign(payload) }, payload });
}

export async function call(env: TestEnv, token: string | null, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await env.app.inject({
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as any };
}

export const HOURS = {
  mon: [["09:00", "17:00"]],
  tue: [["09:00", "17:00"]],
  wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]],
  fri: [["09:00", "17:00"]],
  sat: [["10:00", "14:00"]],
} as Record<string, [string, string][]>;

/**
 * A merchant on a paid plan with every paid feature GA, a location with
 * hours, and (by default) a Connect account that can take charges.
 */
export async function paidMerchant(env: TestEnv, opts: { plan?: PlanId; connect?: boolean; stage?: RolloutStage; slug?: string } = {}) {
  const base = await createMerchant(env, { slug: opts.slug });
  await setStage(env, PAID_FEATURES, opts.stage ?? "ga");
  await setPlan(env, base.merchant.id, opts.plan ?? "pro");
  const [location] = await env.db.insert(locations).values({ merchantId: base.merchant.id, name: "Main", address: "123 Roncesvalles Ave", qrCode: `QR${Math.random().toString(36).slice(2, 10)}`, hours: HOURS }).returning();
  if (opts.connect !== false) {
    const payments = fake(env);
    const { accountId } = await payments.createConnectedAccount({ merchantId: base.merchant.id, businessName: base.merchant.name });
    payments.completeOnboarding(accountId);
    await env.db.update(merchants).set({ stripeAccountId: accountId, stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true }).where(eq(merchants.id, base.merchant.id));
  }
  const [merchant] = await env.db.select().from(merchants).where(eq(merchants.id, base.merchant.id));
  return { ...base, merchant: merchant!, location: location! };
}

export async function staffMember(env: TestEnv, merchantId: string, role: "staff" | "manager" | "owner" = "staff", permissions: string[] | null = null) {
  const user = await createUser(env.db);
  await env.db.insert(merchantStaff).values({ merchantId, userId: user.id, role, permissions });
  return { user, token: await tokenFor(env, user) };
}

export async function customer(env: TestEnv, opts: { pushToken?: boolean; name?: string } = {}) {
  const user = await createUser(env.db, { name: opts.name ?? "Casey Customer" });
  if (opts.pushToken !== false) await env.db.insert(pushTokens).values({ userId: user.id, token: `ExponentPushToken[${user.id.slice(0, 8)}]`, platform: "ios" });
  return { user, token: await tokenFor(env, user) };
}
