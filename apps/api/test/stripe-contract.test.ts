/**
 * Stripe request contract tests.
 *
 * The real `stripe` SDK client is pointed at a local HTTP server (no network to
 * Stripe). The server records every request (method, path, form body, headers)
 * and answers with minimal fixtures, so these tests prove what StripePayments
 * and the billing services actually put on the wire.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { merchantAddOns, merchants, subscriptions } from "@ll/db";
import { ADD_ONS, FEES, FOUNDING_OFFER, RESTAURANT_PLANS } from "@ll/shared";
import type { AppContext } from "../src/context.js";
import { StripePayments } from "../src/providers/paymentsStripe.js";
import { computeFees } from "../src/services/fees.js";
import { attachAddOn, detachAddOn, startRestaurantCheckout, changeRestaurantTier } from "../src/services/billing-restaurant.js";
import { startCheckout } from "../src/services/billing.js";
import { createConnectPayment, refundConnectPayment } from "../src/services/payments.js";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";
import { PAID_FEATURES, setStage } from "./commerce-fixtures.js";

interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  /** Form body, bracket keys kept as sent: `transfer_data[destination]`. */
  form: Record<string, string>;
  headers: IncomingMessage["headers"];
}

const WHSEC = "whsec_test_contract_secret";
const ACCT = "acct_1ConnectedKitchen";
const SUB_ID = "sub_test_123";

let server: Server;
let port = 0;
let calls: Recorded[] = [];
let coupons = new Set<string>();
let subscriptionInterval: "month" | "year" = "month";
/** When set, a confirming PaymentIntent create answers with this Stripe card error. */
let offSessionFailure: { code: string; decline_code?: string; type?: string } | null = null;

const err404 = (what: string) => ({ error: { type: "invalid_request_error", code: "resource_missing", message: `No such ${what}` } });

/** Minimal fixtures, enough for the SDK + our mappers. */
function respond(r: Recorded): { status: number; body: unknown } {
  const { method, path, form } = r;
  const id = (prefix: string) => `${prefix}_fixture`;
  if (path === "/v1/payment_intents" && method === "POST" && form.confirm === "true" && offSessionFailure) {
    const f = offSessionFailure;
    const pi = { id: "pi_failed_fixture", object: "payment_intent", client_secret: "pi_failed_fixture_secret", status: "requires_payment_method", amount: Number(form.amount), metadata: {}, last_payment_error: { code: f.code } };
    return { status: f.type === "rate_limit_error" ? 429 : 402, body: { error: { type: f.type ?? "card_error", code: f.code, decline_code: f.decline_code, message: "Your card was declined.", payment_intent: pi } } };
  }
  if (path === "/v1/payment_intents" && method === "POST") {
    return { status: 200, body: { id: "pi_fixture", object: "payment_intent", client_secret: "pi_fixture_secret", status: form.confirm === "true" ? "succeeded" : "requires_payment_method", amount: Number(form.amount), application_fee_amount: Number(form.application_fee_amount ?? 0), metadata: {} } };
  }
  if (path === "/v1/refunds") return { status: 200, body: { id: "re_fixture", object: "refund", status: "succeeded", amount: Number(form.amount ?? 0) } };
  if (path === "/v1/setup_intents" && method === "POST") return { status: 200, body: { id: "seti_fixture", object: "setup_intent", client_secret: "seti_fixture_secret", status: "requires_payment_method", customer: form.customer, metadata: {}, payment_method_types: ["card"] } };
  if (path === "/v1/setup_intents/seti_fixture" && method === "GET") return { status: 200, body: { id: "seti_fixture", object: "setup_intent", client_secret: "seti_fixture_secret", status: "succeeded", customer: "cus_fixture", payment_method: "pm_card_fixture", metadata: {} } };
  if (path === "/v1/payment_methods/pm_card_fixture") return { status: 200, body: { id: "pm_card_fixture", object: "payment_method", type: "card", card: { brand: "visa", last4: "4242" } } };
  if (path === "/v1/payment_methods/pm_pad_fixture") return { status: 200, body: { id: "pm_pad_fixture", object: "payment_method", type: "acss_debit", acss_debit: { bank_name: "STRIPE TEST BANK", last4: "6789" } } };
  if (path === "/v1/customers" && method === "POST") return { status: 200, body: { id: "cus_fixture", object: "customer" } };
  if (path === "/v1/checkout/sessions") return { status: 200, body: { id: "cs_test_fixture", object: "checkout.session", url: "https://checkout.example/cs_test_fixture" } };
  if (path === "/v1/prices" && method === "GET") return { status: 200, body: { object: "list", data: [], has_more: false } };
  if (path === "/v1/prices" && method === "POST") return { status: 200, body: { id: `price_${form.lookup_key}`, object: "price" } };
  const coupon = path.match(/^\/v1\/coupons(?:\/(.+))?$/);
  if (coupon) {
    if (method === "GET") return coupons.has(coupon[1]!) ? { status: 200, body: { id: coupon[1], object: "coupon" } } : { status: 404, body: err404("coupon") };
    coupons.add(form.id!);
    return { status: 200, body: { id: form.id, object: "coupon" } };
  }
  if (path === "/v1/subscription_schedules" && method === "POST") {
    return {
      status: 200,
      body: { id: "sub_sched_fixture", object: "subscription_schedule", phases: [{ start_date: 1_800_000_000, items: [{ price: "price_tier_fixture", quantity: 1 }] }] },
    };
  }
  if (path.startsWith("/v1/subscription_schedules/") && method === "POST") return { status: 200, body: { id: "sub_sched_fixture", object: "subscription_schedule" } };
  if (path === `/v1/subscriptions/${SUB_ID}` && method === "GET") {
    return {
      status: 200,
      body: {
        id: SUB_ID,
        object: "subscription",
        status: "active",
        cancel_at_period_end: false,
        metadata: { merchant_id: "m1" },
        items: { object: "list", data: [{ id: "si_base", object: "subscription_item", metadata: {}, price: { id: "price_tier_fixture", recurring: { interval: subscriptionInterval } }, current_period_end: 1_900_000_000 }] },
      },
    };
  }
  if (path === `/v1/subscriptions/${SUB_ID}` && method === "POST") return { status: 200, body: { id: SUB_ID, object: "subscription", status: "active", cancel_at_period_end: false, items: { data: [] } } };
  if (path === "/v1/subscription_items" && method === "POST") return { status: 200, body: { id: "si_addon_fixture", object: "subscription_item" } };
  if (path.startsWith("/v1/subscription_items/")) return { status: 200, body: { id: path.split("/").pop(), object: "subscription_item", deleted: true } };
  void id;
  return { status: 404, body: err404(path) };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const raw = Buffer.concat(chunks).toString("utf8");
      const form: Record<string, string> = {};
      new URLSearchParams(raw).forEach((v, k) => (form[k] = v));
      const rec: Recorded = { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, form, headers: req.headers };
      calls.push(rec);
      const { status, body } = respond(rec);
      res.writeHead(status, { "content-type": "application/json", "request-id": "req_fixture" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeStripe(): Stripe {
  return new Stripe("sk_test_contract", { host: "127.0.0.1", port, protocol: "http", maxNetworkRetries: 0, appInfo: { name: "Local Loyalty" } });
}
const makeProvider = () => new StripePayments({ stripe: { secretKey: "sk_test_contract", webhookSecret: WHSEC, prices: {} } }, makeStripe());

const only = (method: string, path: string | RegExp) =>
  calls.filter((c) => c.method === method && (typeof path === "string" ? c.path === path : path.test(c.path)));
const one = (method: string, path: string | RegExp) => {
  const found = only(method, path);
  expect(found, `${method} ${String(path)} in ${calls.map((c) => `${c.method} ${c.path}`).join(", ")}`).toHaveLength(1);
  return found[0]!;
};

beforeEach(() => {
  calls = [];
  coupons = new Set();
  subscriptionInterval = "month";
  offSessionFailure = null;
});

// ---------------------------------------------------------------------------
// Connect charges and refunds (provider level)
// ---------------------------------------------------------------------------
describe("payment intents", () => {
  const base = {
    amountCents: 5000,
    connectedAccountId: ACCT,
    description: "Test order",
    metadata: { ll_kind: "order", ll_id: "11111111-1111-1111-1111-111111111111", merchant_id: "m1" },
    idempotencyKey: "order:1:pi",
  };
  const fees = computeFees({ kind: "order", amountCents: 5000, plan: "free", customerServiceFee: true });

  it("destination charge: transfer_data[destination] + fee from computeFees, on the platform account", async () => {
    expect(fees.applicationFeeCents).toBe(Math.round((5000 * FEES.orderBpsFree) / 10000) + FEES.customerServiceFeeCents);
    const pi = await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: fees.applicationFeeCents, chargeMode: "destination" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form).toMatchObject({
      amount: "5000",
      currency: "cad",
      application_fee_amount: String(fees.applicationFeeCents),
      "transfer_data[destination]": ACCT,
      on_behalf_of: ACCT,
      "automatic_payment_methods[enabled]": "true",
      "metadata[ll_kind]": "order",
    });
    expect(r.headers["stripe-account"]).toBeUndefined();
    expect(r.headers["idempotency-key"]).toBe("order:1:pi");
    expect(r.headers.authorization).toBe("Bearer sk_test_contract");
    expect(pi).toMatchObject({ id: "pi_fixture", amountCents: 5000, applicationFeeCents: fees.applicationFeeCents });
  });

  it("direct charge: Stripe-Account header, application_fee_amount, no transfer_data / on_behalf_of", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: fees.applicationFeeCents, chargeMode: "direct" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form.application_fee_amount).toBe(String(fees.applicationFeeCents));
    expect(r.form.amount).toBe("5000");
    expect(Object.keys(r.form).filter((k) => k.startsWith("transfer_data") || k === "on_behalf_of")).toEqual([]);
    expect(r.form["metadata[ll_charge_mode]"]).toBe("direct");
    expect(r.form["metadata[ll_account]"]).toBe(ACCT);
  });

  it("PAD: payment_method_types[]=acss_debit with mandate options and no automatic methods", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: 50, chargeMode: "destination", paymentMethodTypes: ["acss_debit"] });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form["payment_method_types[0]"]).toBe("acss_debit");
    expect(r.form["payment_method_options[acss_debit][mandate_options][payment_schedule]"]).toBe("combined");
    expect(r.form["payment_method_options[acss_debit][mandate_options][interval_description]"]).toBe("Tiffin subscription");
    expect(r.form["payment_method_options[acss_debit][mandate_options][transaction_type]"]).toBe("personal");
    expect(r.form["payment_method_options[acss_debit][verification_method]"]).toBe("automatic");
    expect(r.form["automatic_payment_methods[enabled]"]).toBeUndefined();
    expect(r.form["transfer_data[destination]"]).toBe(ACCT);
  });

  // Fixed with the saved-methods work: the direct branch used to drop paymentMethodTypes (no ACSS mandate options).
  it("PAD on a direct charge keeps acss_debit + mandate options", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: 50, chargeMode: "direct", paymentMethodTypes: ["acss_debit"] });
    const r = one("POST", "/v1/payment_intents");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form["payment_method_types[0]"]).toBe("acss_debit");
    expect(r.form["payment_method_options[acss_debit][mandate_options][payment_schedule]"]).toBe("combined");
    expect(r.form["automatic_payment_methods[enabled]"]).toBeUndefined();
  });

  it("first tiffin payment: customer + setup_future_usage=off_session (destination, platform customer)", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: 50, chargeMode: "destination", customerId: "cus_platform", setupFutureUsage: "off_session" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form.customer).toBe("cus_platform");
    expect(r.form.setup_future_usage).toBe("off_session");
    expect(r.form["transfer_data[destination]"]).toBe(ACCT);
    expect(r.headers["stripe-account"]).toBeUndefined();
  });

  it("first tiffin payment, direct and PAD: customer and mandate live on the connected account", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: 50, chargeMode: "direct", customerId: "cus_on_acct", setupFutureUsage: "off_session", paymentMethodTypes: ["acss_debit"] });
    const r = one("POST", "/v1/payment_intents");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form.customer).toBe("cus_on_acct");
    expect(r.form.setup_future_usage).toBe("off_session");
    expect(r.form["payment_method_types[0]"]).toBe("acss_debit");
  });

  it("an intent without a customer sends neither customer nor setup_future_usage", async () => {
    await makeProvider().createPaymentIntent({ ...base, applicationFeeCents: 50, chargeMode: "destination", setupFutureUsage: "off_session" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form.customer).toBeUndefined();
    expect(r.form.setup_future_usage).toBeUndefined();
  });

  it("renewal: chargeSavedMethod confirms off-session with the saved method on the same customer", async () => {
    const res = await makeProvider().chargeSavedMethod({ ...base, applicationFeeCents: 50, chargeMode: "destination", customerId: "cus_platform", paymentMethodId: "pm_saved", idempotencyKey: "tiffin:c1:off" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form).toMatchObject({ customer: "cus_platform", payment_method: "pm_saved", off_session: "true", confirm: "true", application_fee_amount: "50" });
    expect(r.form.setup_future_usage).toBeUndefined();
    expect(r.headers["idempotency-key"]).toBe("tiffin:c1:off");
    expect(res.outcome).toBe("succeeded");
  });

  it("renewal on a direct charge runs on the connected account", async () => {
    await makeProvider().chargeSavedMethod({ ...base, applicationFeeCents: 50, chargeMode: "direct", customerId: "cus_on_acct", paymentMethodId: "pm_on_acct" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form).toMatchObject({ customer: "cus_on_acct", payment_method: "pm_on_acct", off_session: "true", confirm: "true" });
  });

  it("an off-session card error becomes an outcome (authentication_required vs declined), other errors throw", async () => {
    offSessionFailure = { code: "authentication_required", decline_code: undefined };
    const auth = await makeProvider().chargeSavedMethod({ ...base, applicationFeeCents: 50, chargeMode: "destination", customerId: "cus_platform", paymentMethodId: "pm_saved" });
    expect(auth).toMatchObject({ outcome: "authentication_required", errorCode: "authentication_required", intent: { id: "pi_failed_fixture" } });
    offSessionFailure = { code: "card_declined", decline_code: "generic_decline" };
    const declined = await makeProvider().chargeSavedMethod({ ...base, applicationFeeCents: 50, chargeMode: "destination", customerId: "cus_platform", paymentMethodId: "pm_saved" });
    expect(declined).toMatchObject({ outcome: "declined", errorCode: "card_declined", intent: { lastErrorCode: "card_declined" } });
    offSessionFailure = { code: "rate_limit", type: "rate_limit_error" };
    await expect(makeProvider().chargeSavedMethod({ ...base, applicationFeeCents: 50, chargeMode: "destination", customerId: "cus_platform", paymentMethodId: "pm_saved" })).rejects.toThrow();
  });

  it("payer customer: created on the connected account for direct charges, on the platform otherwise, idempotent per user", async () => {
    await makeProvider().createPayerCustomer({ userId: "u1", merchantId: "m1", email: "a@b.ca", name: "Asha" });
    await makeProvider().createPayerCustomer({ userId: "u1", merchantId: "m1", connectedAccountId: ACCT });
    const [plat, direct] = only("POST", "/v1/customers");
    expect(plat!.headers["stripe-account"]).toBeUndefined();
    expect(plat!.form).toMatchObject({ "metadata[user_id]": "u1", "metadata[merchant_id]": "m1", email: "a@b.ca" });
    expect(plat!.headers["idempotency-key"]).toBe("payer-customer:platform:m1:u1");
    expect(direct!.headers["stripe-account"]).toBe(ACCT);
    expect(direct!.headers["idempotency-key"]).toBe(`payer-customer:${ACCT}:m1:u1`);
  });

  it("SetupIntent (card): off-session usage on the customer, on_behalf_of the kitchen for destination charges", async () => {
    const si = await makeProvider().createSetupIntent({ customerId: "cus_platform", chargeMode: "destination", connectedAccountId: ACCT, metadata: { ll_kind: "tiffin_setup", ll_id: "s1" }, idempotencyKey: "tiffin_setup:s1:x" });
    const r = one("POST", "/v1/setup_intents");
    expect(r.form).toMatchObject({ customer: "cus_platform", usage: "off_session", on_behalf_of: ACCT, "metadata[ll_kind]": "tiffin_setup", "automatic_payment_methods[enabled]": "true" });
    expect(r.headers["stripe-account"]).toBeUndefined();
    expect(si).toMatchObject({ id: "seti_fixture", clientSecret: "seti_fixture_secret" });
  });

  it("SetupIntent (PAD, direct): acss_debit mandate on the connected account, no on_behalf_of", async () => {
    await makeProvider().createSetupIntent({ customerId: "cus_on_acct", chargeMode: "direct", connectedAccountId: ACCT, paymentMethodTypes: ["acss_debit"], metadata: { ll_kind: "tiffin_setup" }, idempotencyKey: "k" });
    const r = one("POST", "/v1/setup_intents");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form.on_behalf_of).toBeUndefined();
    expect(r.form["payment_method_types[0]"]).toBe("acss_debit");
    expect(r.form["payment_method_options[acss_debit][mandate_options][payment_schedule]"]).toBe("combined");
    expect(r.form["payment_method_options[acss_debit][currency]"]).toBe("cad");
  });

  it("retrieves a SetupIntent and a payment method (card brand/last4, PAD bank) from the right account", async () => {
    const p = makeProvider();
    const si = await p.retrieveSetupIntent("seti_fixture", { chargeMode: "direct", connectedAccountId: ACCT });
    expect(si).toMatchObject({ paymentMethodId: "pm_card_fixture", customerId: "cus_fixture", status: "succeeded" });
    expect(one("GET", "/v1/setup_intents/seti_fixture").headers["stripe-account"]).toBe(ACCT);
    expect(await p.retrievePaymentMethod("pm_card_fixture")).toEqual({ id: "pm_card_fixture", type: "card", brand: "visa", last4: "4242" });
    expect(await p.retrievePaymentMethod("pm_pad_fixture")).toEqual({ id: "pm_pad_fixture", type: "pad", brand: "STRIPE TEST BANK", last4: "6789" });
  });

  it("platform charge (ad spend) has no destination, no fee and sets up off-session use", async () => {
    await makeProvider().createPlatformCharge({ merchantId: "m1", amountCents: 2500, description: "Ads", metadata: { kind: "ad_campaign", id: "a1" }, idempotencyKey: "ad:1", customerName: "Shop" });
    const r = one("POST", "/v1/payment_intents");
    expect(r.form).toMatchObject({ amount: "2500", customer: "cus_fixture", setup_future_usage: "off_session", "metadata[ll_platform_charge]": "true" });
    expect(Object.keys(r.form).some((k) => k.startsWith("transfer_data") || k === "application_fee_amount")).toBe(false);
  });
});

describe("refunds", () => {
  it("destination: reverse_transfer + refund_application_fee on the platform account", async () => {
    const out = await makeProvider().refund({ paymentIntentId: "pi_1", amountCents: 1200, idempotencyKey: "refund:1", reason: "cold food", chargeMode: "destination", connectedAccountId: ACCT });
    const r = one("POST", "/v1/refunds");
    expect(r.form).toMatchObject({ payment_intent: "pi_1", amount: "1200", reverse_transfer: "true", refund_application_fee: "true", reason: "requested_by_customer", "metadata[reason]": "cold food" });
    expect(r.headers["stripe-account"]).toBeUndefined();
    expect(out).toEqual({ id: "re_fixture", status: "succeeded", amountCents: 1200 });
  });

  it("direct: refund runs on the connected account, no reverse_transfer, application fee returned", async () => {
    await makeProvider().refund({ paymentIntentId: "pi_1", idempotencyKey: "refund:2", chargeMode: "direct", connectedAccountId: ACCT });
    const r = one("POST", "/v1/refunds");
    expect(r.headers["stripe-account"]).toBe(ACCT);
    expect(r.form.reverse_transfer).toBeUndefined();
    expect(r.form.refund_application_fee).toBe("true");
    expect(r.form.amount).toBeUndefined();
  });

  it("direct without a connected account refuses before calling Stripe", async () => {
    await expect(makeProvider().refund({ paymentIntentId: "pi_1", idempotencyKey: "x", chargeMode: "direct" })).rejects.toThrow(/connectedAccountId/);
    expect(calls).toHaveLength(0);
  });

  it("retrievePaymentIntent for a direct charge reads from the connected account", async () => {
    await makeProvider().retrievePaymentIntent("pi_1", { connectedAccountId: ACCT }).catch(() => undefined);
    const r = one("GET", "/v1/payment_intents/pi_1");
    expect(r.headers["stripe-account"]).toBe(ACCT);
  });
});

// ---------------------------------------------------------------------------
// Service level: charge-mode resolution (STRIPE_DIRECT_CHARGES + merchant.chargeMode)
// ---------------------------------------------------------------------------
describe("charge mode through services/payments", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    env.ctx.providers.payments = makeProvider();
  });
  afterEach(async () => env.close());

  const withDirect = (on: boolean): AppContext => ({ ...env.ctx, config: { ...env.ctx.config, stripe: { ...env.ctx.config.stripe, directCharges: on } } });
  const args = { amountCents: 4000, applicationFeeCents: 60, description: "Order", metadata: { ll_kind: "order", ll_id: "x", merchant_id: "m" }, idempotencyKey: "k1" };

  it("flag on + merchant direct => direct charge and direct refund", async () => {
    const merchant = { chargeMode: "direct" as const, stripeAccountId: ACCT };
    await createConnectPayment(withDirect(true), merchant, args);
    const pi = one("POST", "/v1/payment_intents");
    expect(pi.headers["stripe-account"]).toBe(ACCT);
    expect(pi.form["transfer_data[destination]"]).toBeUndefined();
    await refundConnectPayment(withDirect(true), merchant, { paymentIntentId: "pi_fixture", idempotencyKey: "r1" });
    const rf = one("POST", "/v1/refunds");
    expect(rf.headers["stripe-account"]).toBe(ACCT);
    expect(rf.form.reverse_transfer).toBeUndefined();
  });

  it("flag off => a direct merchant still gets destination charges", async () => {
    await createConnectPayment(withDirect(false), { chargeMode: "direct", stripeAccountId: ACCT }, args);
    const pi = one("POST", "/v1/payment_intents");
    expect(pi.headers["stripe-account"]).toBeUndefined();
    expect(pi.form["transfer_data[destination]"]).toBe(ACCT);
  });

  it("a charge keeps its creation mode on refund even after the merchant switched", async () => {
    await refundConnectPayment(withDirect(true), { chargeMode: "destination", stripeAccountId: ACCT }, { paymentIntentId: "pi_old", idempotencyKey: "r2", chargeMode: "direct" });
    expect(one("POST", "/v1/refunds").headers["stripe-account"]).toBe(ACCT);
  });
});

// ---------------------------------------------------------------------------
// Billing: plan checkout (billing.ts) and restaurant pack (billing-restaurant.ts)
// ---------------------------------------------------------------------------
describe("billing checkout", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    env.ctx.providers.payments = makeProvider();
    await setStage(env, PAID_FEATURES, "ga");
  });
  afterEach(async () => env.close());

  const merchantRow = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;

  it("Plus/Pro: configured price id, quantity 1, metadata on session and subscription, promo codes allowed", async () => {
    env.ctx.config = { ...env.ctx.config, stripe: { ...env.ctx.config.stripe, prices: { plusMonthly: "price_plus_m", plusAnnual: "price_plus_y", proMonthly: "price_pro_m", proAnnual: "price_pro_y" } } };
    const { merchant } = await createMerchant(env);
    const out = await startCheckout(env.ctx, await merchantRow(merchant.id), { plan: "pro", interval: "year" });
    expect(out).toEqual({ sessionId: "cs_test_fixture", url: "https://checkout.example/cs_test_fixture" });
    expect(one("POST", "/v1/customers").form).toMatchObject({ "metadata[merchant_id]": merchant.id });
    const s = one("POST", "/v1/checkout/sessions");
    expect(s.form).toMatchObject({
      mode: "subscription",
      customer: "cus_fixture",
      client_reference_id: merchant.id,
      "line_items[0][price]": "price_pro_y",
      "line_items[0][quantity]": "1",
      "metadata[plan]": "pro",
      "metadata[interval]": "year",
      "metadata[merchant_id]": merchant.id,
      "subscription_data[metadata][plan]": "pro",
      allow_promotion_codes: "true",
    });
    expect(s.form["line_items[0][price_data][unit_amount]"]).toBeUndefined();
    expect(s.form["discounts[0][coupon]"]).toBeUndefined();
  });

  it("without a configured price id, falls back to an inline CAD price", async () => {
    const { merchant } = await createMerchant(env);
    await startCheckout(env.ctx, await merchantRow(merchant.id), { plan: "plus", interval: "month" });
    const s = one("POST", "/v1/checkout/sessions");
    expect(s.form).toMatchObject({ "line_items[0][price_data][currency]": "cad", "line_items[0][price_data][recurring][interval]": "month", "line_items[0][quantity]": "1" });
    expect(s.form["line_items[0][price]"]).toBeUndefined();
  });
});

describe("restaurant pack billing", () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    env.ctx.providers.payments = makeProvider();
  });
  afterEach(async () => env.close());

  const merchantRow = async (id: string) => (await env.db.select().from(merchants).where(eq(merchants.id, id)))[0]!;

  async function liveRestaurant(tier: "starter" | "growth" | "pro", interval: "month" | "year" = "month", founding = false) {
    const { merchant } = await createMerchant(env);
    await env.db.update(merchants).set({ restaurantTier: tier, foundingOffer: founding, stripeCustomerId: "cus_existing" }).where(eq(merchants.id, merchant.id));
    await env.db.insert(subscriptions).values({ merchantId: merchant.id, plan: "free", restaurantTier: tier, status: "active", interval, stripeSubscriptionId: SUB_ID });
    return merchantRow(merchant.id);
  }

  it("tier checkout (no offer): inline CAD price for the tier, quantity 1, tier metadata, no coupon", async () => {
    const { merchant } = await createMerchant(env);
    await startRestaurantCheckout(env.ctx, await merchantRow(merchant.id), { tier: "growth", interval: "month" });
    const s = one("POST", "/v1/checkout/sessions");
    expect(s.form).toMatchObject({
      mode: "subscription",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "cad",
      "line_items[0][price_data][unit_amount]": String(RESTAURANT_PLANS.growth.priceCents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": RESTAURANT_PLANS.growth.name,
      "metadata[restaurant_tier]": "growth",
      "subscription_data[metadata][restaurant_tier]": "growth",
      "subscription_data[metadata][merchant_id]": merchant.id,
    });
    expect(s.form["discounts[0][coupon]"]).toBeUndefined();
    expect(s.form.allow_promotion_codes).toBe("true");
  });

  it("annual tier checkout uses the annual price (two months free)", async () => {
    const { merchant } = await createMerchant(env);
    await startRestaurantCheckout(env.ctx, await merchantRow(merchant.id), { tier: "pro", interval: "year" });
    const s = one("POST", "/v1/checkout/sessions");
    expect(s.form["line_items[0][price_data][unit_amount]"]).toBe(String(RESTAURANT_PLANS.pro.annualPriceCents));
    expect(s.form["line_items[0][price_data][recurring][interval]"]).toBe("year");
  });

  it("founding merchant: 50% x 12 months coupon created once and applied at checkout, promo codes off", async () => {
    const { merchant } = await createMerchant(env);
    await env.db.update(merchants).set({ foundingOffer: true }).where(eq(merchants.id, merchant.id));
    await startRestaurantCheckout(env.ctx, await merchantRow(merchant.id), { tier: "starter", interval: "month" });
    const created = one("POST", "/v1/coupons");
    expect(created.form).toMatchObject({ id: "founding_year_one", percent_off: String(FOUNDING_OFFER.firstYearPct), duration: "repeating", duration_in_months: "12" });
    expect(FOUNDING_OFFER.firstYearPct).toBe(50);
    const s = one("POST", "/v1/checkout/sessions");
    expect(s.form["discounts[0][coupon]"]).toBe("founding_year_one");
    expect(s.form.allow_promotion_codes).toBeUndefined();
    // second checkout reuses the coupon (retrieve hit, no second create)
    await startRestaurantCheckout(env.ctx, { ...(await merchantRow(merchant.id)), stripeCustomerId: "cus_fixture" }, { tier: "starter", interval: "month" });
    expect(only("POST", "/v1/coupons")).toHaveLength(1);
  });

  it("founding schedule (monthly): 12 months at 50%, then the 25% lifetime phase, released at the end", async () => {
    await makeProvider().scheduleFoundingOffer(SUB_ID);
    const coupon1 = only("POST", "/v1/coupons").find((c) => c.form.id === "founding_year_one")!;
    const coupon2 = only("POST", "/v1/coupons").find((c) => c.form.id === "founding_lifetime")!;
    expect(coupon1.form).toMatchObject({ percent_off: "50", duration: "repeating", duration_in_months: "12" });
    expect(coupon2.form).toMatchObject({ percent_off: "25", duration: "forever" });
    expect(one("POST", "/v1/subscription_schedules").form.from_subscription).toBe(SUB_ID);
    const u = one("POST", "/v1/subscription_schedules/sub_sched_fixture");
    expect(u.form).toMatchObject({
      end_behavior: "release",
      "phases[0][start_date]": "1800000000",
      "phases[0][duration][interval]": "month",
      "phases[0][duration][interval_count]": "12",
      "phases[0][discounts][0][coupon]": "founding_year_one",
      "phases[0][items][0][price]": "price_tier_fixture",
      "phases[0][items][0][quantity]": "1",
      "phases[0][proration_behavior]": "none",
      "phases[1][duration][interval]": "month",
      "phases[1][duration][interval_count]": "1",
      "phases[1][discounts][0][coupon]": "founding_lifetime",
      "phases[1][items][0][price]": "price_tier_fixture",
      "phases[1][items][0][quantity]": "1",
    });
    expect(u.form["phases[1][start_date]"]).toBeUndefined();
    expect(Object.keys(u.form).some((k) => k.startsWith("phases[2]"))).toBe(false);
  });

  it("founding schedule (annual): year one at 50%, then a year at 25%", async () => {
    subscriptionInterval = "year";
    await makeProvider().scheduleFoundingOffer(SUB_ID);
    const u = one("POST", "/v1/subscription_schedules/sub_sched_fixture");
    expect(u.form).toMatchObject({
      "phases[0][duration][interval]": "year",
      "phases[0][duration][interval_count]": "1",
      "phases[0][discounts][0][coupon]": "founding_year_one",
      "phases[1][duration][interval]": "year",
      "phases[1][duration][interval_count]": "1",
      "phases[1][discounts][0][coupon]": "founding_lifetime",
    });
  });

  it("tier change swaps the base item price (lookup-key price, prorated) and updates metadata", async () => {
    const m = await liveRestaurant("starter");
    await changeRestaurantTier(env.ctx, m, "pro");
    const price = one("POST", "/v1/prices");
    expect(price.form).toMatchObject({
      currency: "cad",
      unit_amount: String(RESTAURANT_PLANS.pro.priceCents),
      "recurring[interval]": "month",
      lookup_key: `ll_restaurant_pro_month_${RESTAURANT_PLANS.pro.priceCents}`,
      transfer_lookup_key: "true",
    });
    expect(one("GET", "/v1/prices").query.get("lookup_keys[0]") ?? [...one("GET", "/v1/prices").query.values()][0]).toBe(price.form.lookup_key);
    const upd = one("POST", `/v1/subscriptions/${SUB_ID}`);
    expect(upd.form).toMatchObject({ "items[0][id]": "si_base", "items[0][price]": `price_${price.form.lookup_key}`, "metadata[restaurant_tier]": "pro", proration_behavior: "create_prorations" });
  });

  it("add-on attach: one subscription item per add-on with quantity, add_on_id metadata and the right price", async () => {
    const m = await liveRestaurant("growth");
    const dto = await attachAddOn(env.ctx, m, "extra_location", { quantity: 3 });
    expect(dto).toMatchObject({ id: "extra_location", quantity: 3, active: true });
    const price = one("POST", "/v1/prices");
    expect(price.form).toMatchObject({ unit_amount: String(ADD_ONS.extra_location.priceCents), "recurring[interval]": "month", lookup_key: `ll_addon_extra_location_month_${ADD_ONS.extra_location.priceCents}` });
    expect(one("POST", "/v1/subscription_items").form).toMatchObject({
      subscription: SUB_ID,
      price: `price_${price.form.lookup_key}`,
      quantity: "3",
      "metadata[add_on_id]": "extra_location",
      proration_behavior: "create_prorations",
    });
    const [row] = await env.db.select().from(merchantAddOns).where(eq(merchantAddOns.merchantId, m.id));
    expect(row).toMatchObject({ addOnId: "extra_location", quantity: 3, stripeSubscriptionItemId: "si_addon_fixture" });
  });

  it("annual add-on is priced at 10 months", async () => {
    const m = await liveRestaurant("growth", "year");
    await attachAddOn(env.ctx, m, "phone_ai", { quantity: 1 });
    expect(one("POST", "/v1/prices").form.unit_amount).toBe(String(ADD_ONS.phone_ai.priceCents * 10));
    expect(one("POST", "/v1/prices").form["recurring[interval]"]).toBe("year");
  });

  it("add-on quantity change updates the existing item; detach deletes it prorated", async () => {
    const m = await liveRestaurant("growth");
    await attachAddOn(env.ctx, m, "extra_location", { quantity: 1 });
    calls = [];
    await attachAddOn(env.ctx, m, "extra_location", { quantity: 4 });
    const upd = one("POST", "/v1/subscription_items/si_addon_fixture");
    expect(upd.form).toMatchObject({ quantity: "4", proration_behavior: "create_prorations" });
    expect(only("POST", "/v1/subscription_items")).toHaveLength(0);
    calls = [];
    await detachAddOn(env.ctx, m, "extra_location");
    const del = one("DELETE", "/v1/subscription_items/si_addon_fixture");
    // DELETE params travel in the query string for the Stripe SDK
    expect(del.query.get("proration_behavior") ?? del.form.proration_behavior).toBe("create_prorations");
    const [row] = await env.db.select().from(merchantAddOns).where(eq(merchantAddOns.merchantId, m.id));
    expect(row).toMatchObject({ status: "cancelled", stripeSubscriptionItemId: null });
  });

  it("add-ons are blocked before Stripe is called when the tier does not allow them", async () => {
    const m = await liveRestaurant("starter");
    await expect(attachAddOn(env.ctx, m, "banquet_module", { quantity: 1 })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Webhooks: real signatures through the real SDK
// ---------------------------------------------------------------------------
describe("webhook signature verification", () => {
  const stripe = makeStripe();
  const sign = (payload: string, secret = WHSEC, timestamp?: number) => stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
  const piEvent = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "evt_pi_ok",
      object: "event",
      api_version: "2025-01-01",
      created: Math.floor(Date.now() / 1000),
      type: "payment_intent.succeeded",
      livemode: false,
      data: { object: { id: "pi_123", object: "payment_intent", amount: 5000, metadata: { ll_kind: "order", ll_id: "11111111-1111-1111-1111-111111111111" } } },
      ...extra,
    });

  it("accepts a correctly signed payment_intent.succeeded (platform event, no account)", () => {
    const body = piEvent();
    const ev = makeProvider().verifyWebhook(body, sign(body));
    expect(ev.type).toBe("payment_intent.succeeded");
    expect(ev.data.object.id).toBe("pi_123");
    expect(ev.account).toBeUndefined();
  });

  it("accepts a signed Connect event and exposes `account` (direct charges)", () => {
    const body = piEvent({ id: "evt_connect", account: ACCT });
    const ev = makeProvider().verifyWebhook(body, sign(body));
    expect(ev).toMatchObject({ id: "evt_connect", account: ACCT, type: "payment_intent.succeeded" });
  });

  it("rejects a tampered body, a wrong secret, a stale timestamp and a missing header", () => {
    const p = makeProvider();
    const body = piEvent();
    expect(() => p.verifyWebhook(body.replace("5000", "1"), sign(body))).toThrow();
    expect(() => p.verifyWebhook(body, sign(body, "whsec_other"))).toThrow();
    expect(() => p.verifyWebhook(body, sign(body, WHSEC, Math.floor(Date.now() / 1000) - 3600))).toThrow();
    expect(() => p.verifyWebhook(body, undefined)).toThrow(/Missing signature/);
    expect(() => p.verifyWebhook(body, "garbage")).toThrow();
  });

  // BUG (go-live blocker): Stripe gives the "Your account" endpoint and the "Connected accounts" endpoint
  // different signing secrets, but verifyWebhook accepts exactly one. Connect events (account.updated,
  // direct-charge payment_intent.*) or platform events would 400 depending on which secret is configured.
  // Proposed fix: STRIPE_WEBHOOK_SECRET accepts a comma-separated list and verifyWebhook tries each.
  it.fails("verifies events signed by either of two configured secrets (BUG: single secret only)", () => {
    const platformSecret = "whsec_platform";
    const connectSecret = "whsec_connect";
    const p = new StripePayments({ stripe: { secretKey: "sk_test_contract", webhookSecret: `${platformSecret},${connectSecret}`, prices: {} } }, makeStripe());
    const body = piEvent({ id: "evt_connect2", account: ACCT });
    expect(p.verifyWebhook(body, sign(body, connectSecret)).account).toBe(ACCT);
    expect(p.verifyWebhook(body, sign(body, platformSecret)).account).toBe(ACCT);
  });

  it("refuses to verify with no STRIPE_WEBHOOK_SECRET configured", () => {
    const p = new StripePayments({ stripe: { secretKey: "sk_test_contract", prices: {} } }, makeStripe());
    const body = piEvent();
    expect(() => p.verifyWebhook(body, sign(body))).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  describe("POST /v1/webhooks/stripe", () => {
    let env: TestEnv;
    beforeEach(async () => {
      env = await createTestEnv();
      env.ctx.providers.payments = makeProvider();
    });
    afterEach(async () => env.close());
    const post = (body: string, sig?: string) =>
      env.app.inject({ method: "POST", url: "/v1/webhooks/stripe", headers: { "content-type": "application/json", ...(sig ? { "stripe-signature": sig } : {}) }, payload: body });

    it("200s signed platform and Connect events, dedupes replays, 400s bad signatures", async () => {
      const platform = piEvent({ id: "evt_a" });
      expect((await post(platform, sign(platform))).json()).toEqual({ received: true, duplicate: false });
      expect((await post(platform, sign(platform))).json()).toEqual({ received: true, duplicate: true });
      const connect = piEvent({ id: "evt_b", account: ACCT });
      expect((await post(connect, sign(connect))).json()).toEqual({ received: true, duplicate: false });
      const bad = await post(platform, sign(platform, "whsec_wrong"));
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error?.code ?? bad.json().code).toBe("invalid_signature");
      expect((await post(platform)).statusCode).toBe(400);
    });
  });
});
