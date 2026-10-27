/**
 * Security review of the public endpoints (docs/engineering/security-review.md): webhooks refuse unsigned
 * calls in production, token pages slow down enumeration and expire, provider errors never reach callers,
 * CSV exports neutralise formulas.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cateringEvents, merchants } from "@ll/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { HttpError } from "../src/lib/errors.js";
import { toCsv } from "../src/services/csv.js";
import { reportCsv } from "../src/services/neighbourhood-reports.js";
import { customer } from "./commerce-fixtures.js";
import { createMerchant, createTestEnv, type TestEnv } from "./helpers.js";
import { req, restaurantShop } from "./restaurant-msg-fixtures.js";
import { scheduleReviewRequest, REVIEW_LINK_DAYS } from "../src/services/reviews.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const post = (url: string, payload: unknown = {}, headers: Record<string, string> = {}) => env.app.inject({ method: "POST", url, payload: payload as never, headers });

describe("webhooks in production mode", () => {
  it("every inbound webhook refuses an unsigned or wrongly signed call", async () => {
    env.ctx.config.env = "production";
    const m = await createMerchant(env);
    const targets = [
      "/v1/webhooks/stripe",
      "/v1/webhooks/whatsapp",
      "/v1/webhooks/twilio/sms",
      `/v1/webhooks/phone/${m.merchant.id}`,
      ...["square", "clover", "shopify", "lightspeed", "toast"].map((p) => `/v1/webhooks/${p}`),
    ];
    for (const url of targets) {
      const bare = await post(url, { id: "evt_1", type: "payment_intent.succeeded", data: { object: {} } });
      expect(bare.statusCode, `${url} unsigned`).toBeGreaterThanOrEqual(400);
      expect(bare.statusCode, `${url} unsigned`).toBeLessThan(500);
      const forged = await post(url, { id: "evt_1" }, { "stripe-signature": "t=1,v1=00", "x-hub-signature-256": "sha256=00", "x-twilio-signature": "AAAA", "x-square-hmacsha256-signature": "AAAA", "x-shopify-hmac-sha256": "AAAA", "x-lightspeed-signature": "AAAA", "x-toast-signature": "AAAA", "x-clover-auth": "wrong" });
      expect(forged.statusCode, `${url} forged`).toBeGreaterThanOrEqual(400);
      expect(forged.statusCode, `${url} forged`).toBeLessThan(500);
    }
  });

  it("the WhatsApp verify handshake needs the configured token, and none configured means no handshake", async () => {
    env.ctx.config.env = "production";
    const q = "hub.mode=subscribe&hub.challenge=abc&hub.verify_token=guess";
    expect((await env.app.inject({ method: "GET", url: `/v1/webhooks/whatsapp?${q}` })).statusCode).toBe(403);
    env.ctx.config.whatsapp.verifyToken = "s3cret";
    expect((await env.app.inject({ method: "GET", url: `/v1/webhooks/whatsapp?${q}` })).statusCode).toBe(403);
    const ok = await env.app.inject({ method: "GET", url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=s3cret" });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("abc");
  });

  it("the dev-only payment simulator does not exist in production", async () => {
    env.ctx.config.env = "production";
    expect((await post("/v1/payments/fake/simulate", { action: "succeed_payment", id: "pi_1" })).statusCode).toBeGreaterThanOrEqual(401);
  });

  it("a bad Stripe signature does not echo the verifier's reason", async () => {
    const r = await post("/v1/webhooks/stripe", { id: "evt_1", type: "x", data: { object: {} } }, { "stripe-signature": "t=1,v1=bad" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("invalid_signature");
    expect(r.json().error.details).toBeUndefined();
  });
});

describe("error leakage", () => {
  it("withholds provider error text (cause) from every response, keeps other details", async () => {
    const app: FastifyInstance = await buildApp(env.ctx);
    app.get("/boom", async () => {
      throw new HttpError(502, "payment_error", "We couldn't start the payment. Please try again.", { cause: "No such customer: cus_live_123 (acct_1ABC)", retryable: true });
    });
    app.get("/plain", async () => {
      throw new Error("select * from users where secret = 'x'");
    });
    const r = await app.inject({ method: "GET", url: "/boom" });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain("cus_live_123");
    expect(r.json().error).toEqual({ code: "payment_error", message: "We couldn't start the payment. Please try again.", details: { retryable: true } });
    const p = await app.inject({ method: "GET", url: "/plain" });
    expect(p.statusCode).toBe(500);
    expect(p.json().error).toEqual({ code: "internal", message: "Something went wrong" });
    await app.close();
  });

  it("unknown or malformed tokens look identical: 404 with no hint about which part was wrong", async () => {
    const urls = ["/v1/public/tickets/", "/v1/public/tiffin/driver/", "/v1/public/reviews/", "/v1/public/catering/", "/v1/public/splits/"];
    for (const u of urls) {
      const short = await env.app.inject({ method: "GET", url: `${u}abc` });
      const long = await env.app.inject({ method: "GET", url: `${u}${"x".repeat(40)}` });
      expect(short.statusCode, u).toBe(404);
      expect(long.statusCode, u).toBe(404);
      expect(Object.keys(short.json().error).sort()).toEqual(["code", "message"]);
    }
    expect((await env.app.inject({ method: "GET", url: "/v1/public/payments/pi_unknown?cs=pi_unknown_secret_x" })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "GET", url: "/v1/public/payments/pi_unknown" })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "GET", url: "/v1/public/payments/setup/seti_unknown?cs=x" })).statusCode).toBe(404);
  });
});

describe("client address behind a proxy", () => {
  it("trusts only the configured hops, so a caller cannot choose its own address", async () => {
    const ipOf = async (trustProxy: boolean | number, xff: string) => {
      const app = await buildApp({ ...env.ctx, config: { ...env.ctx.config, trustProxy } });
      app.get("/ip", async (req) => ({ ip: req.ip }));
      const r = await app.inject({ method: "GET", url: "/ip", headers: { "x-forwarded-for": xff } });
      await app.close();
      return r.json().ip as string;
    };
    // One trusted hop (the load balancer appends the real address): a forged leftmost entry is ignored.
    expect(await ipOf(1, "6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
    expect(await ipOf(0, "6.6.6.6, 203.0.113.7")).toBe("127.0.0.1");
    expect(await ipOf(true, "6.6.6.6, 203.0.113.7")).toBe("6.6.6.6");
  });

  it("production defaults to one hop; development and test trust the header", async () => {
    const { loadConfig } = await import("../src/config.js");
    expect(loadConfig({ NODE_ENV: "production", JWT_SECRET: "x".repeat(40), ENCRYPTION_KEY: "0".repeat(64), DATABASE_URL: "postgres://x", ALLOW_CONSOLE_SMS: "1" } as never).trustProxy).toBe(1);
    expect(loadConfig({ NODE_ENV: "development" }).trustProxy).toBe(true);
    expect(loadConfig({ NODE_ENV: "production", TRUST_PROXY_HOPS: "2", JWT_SECRET: "x".repeat(40), ENCRYPTION_KEY: "0".repeat(64), DATABASE_URL: "postgres://x", ALLOW_CONSOLE_SMS: "1" } as never).trustProxy).toBe(2);
  });
});

describe("production config", () => {
  it("refuses to start without a real SMS provider (sign-in codes would only reach the log), unless it is a staging server", async () => {
    const { loadConfig } = await import("../src/config.js");
    const base = { NODE_ENV: "production", JWT_SECRET: "x".repeat(40), ENCRYPTION_KEY: "0".repeat(64), DATABASE_URL: "postgres://x" };
    expect(() => loadConfig(base as never)).toThrow(/TWILIO_ACCOUNT_SID/);
    expect(() => loadConfig({ ...base, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" } as never)).toThrow(/TWILIO_FROM/);
    expect(loadConfig({ ...base, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+14165550100" } as never).sms.provider).toBe("twilio");
    expect(loadConfig({ ...base, ALLOW_CONSOLE_SMS: "1" } as never).sms.provider).toBe("console");
  });
});

describe("enumeration guard on secret-link pages", () => {
  it("slows an address that keeps asking for links that do not exist, only that address, only those pages", async () => {
    const hit = (ip: string, path = "/v1/public/tickets/nope") => env.app.inject({ method: "GET", url: path, headers: { "x-forwarded-for": ip } });
    for (let i = 0; i < 40; i++) expect((await hit("203.0.113.9", `/v1/public/tickets/${"a".repeat(20)}${i}`)).statusCode).toBe(404);
    const blocked = await hit("203.0.113.9");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("rate_limited");
    // Other pages that carry secret links are covered too; ordinary public pages are not.
    expect((await hit("203.0.113.9", "/v1/public/reviews/zzzzzzzzzzzzzzzzzzzz")).statusCode).toBe(429);
    expect((await hit("203.0.113.9", "/v1/public/plans")).statusCode).toBe(200);
    // Somebody else on another address is unaffected, and the window slides.
    expect((await hit("198.51.100.4")).statusCode).toBe(404);
    env.clock.now = new Date(env.clock.now.getTime() + 11 * 60_000);
    expect((await hit("203.0.113.9")).statusCode).toBe(404);
  });

  it("a person who typos an answer on a form is not counted as a scanner", async () => {
    const hit = () => env.app.inject({ method: "POST", url: "/v1/public/join/NOSUCHQR", payload: { phone: "bad" } as never, headers: { "x-forwarded-for": "192.0.2.50" } });
    for (let i = 0; i < 5; i++) expect([400, 404]).toContain((await hit()).statusCode);
  });
});

describe("expiry", () => {
  it("review links take answers for 90 days", async () => {
    const shop = await restaurantShop(env, "starter");
    const c = await customer(env, { name: "Aisha Khan" });
    const r = await scheduleReviewRequest(env.ctx, { merchantId: shop.merchant.id, userId: c.user.id, sourceId: crypto.randomUUID() });
    env.clock.now = new Date(env.clock.now.getTime() + (REVIEW_LINK_DAYS + 1) * 86_400_000);
    const late = await req(env, null, "POST", `/v1/public/reviews/${r!.token}`, { rating: 5 });
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe("link_expired");
    env.clock.now = new Date(env.clock.now.getTime() - 40 * 86_400_000);
    expect((await req(env, null, "POST", `/v1/public/reviews/${r!.token}`, { rating: 5 })).status).toBe(200);
  });

  it("a catering quote cannot be signed after the event date", async () => {
    const shop = await restaurantShop(env, "growth");
    const cust = await customer(env);
    await env.db.update(merchants).set({ timezone: "America/Toronto" }).where(eq(merchants.id, shop.merchant.id));
    const [e] = await env.db
      .insert(cateringEvents)
      .values({ merchantId: shop.merchant.id, userId: cust.user.id, number: 1, eventDate: "2026-11-05", headcount: 40, status: "quoted", approvalToken: "q".repeat(32), quoteSentAt: env.clock.now, totalCents: 100000, depositCents: 0 })
      .returning();
    expect(e).toBeTruthy();
    env.clock.now = new Date("2026-11-06T15:00:00Z");
    const late = await req(env, null, "POST", `/v1/public/catering/${"q".repeat(32)}/approve`, { signatureName: "Ayesha Khan" });
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe("quote_expired");
    env.clock.now = new Date("2026-11-04T15:00:00Z");
    expect((await req(env, null, "POST", `/v1/public/catering/${"q".repeat(32)}/approve`, { signatureName: "Ayesha Khan" })).status).toBe(200);
  });
});

describe("CSV injection", () => {
  const EVIL = ["=HYPERLINK(\"http://evil\",\"x\")", "+SUM(1+1)", "-2+3", "@cmd", "\t=1+1", "\r=1+1"];
  it("neutralises formula starters in every text cell and header", () => {
    const csv = toCsv(EVIL, [EVIL]);
    const lines = csv.split("\r\n");
    for (const cell of lines[1]!.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []) {
      const bare = cell.replace(/,$/, "").replace(/^"|"$/g, "");
      if (bare) expect(bare, cell).toMatch(/^'/);
    }
    // Numbers stay numbers; ordinary text is untouched; commas and quotes are quoted.
    expect(toCsv(["a"], [[-5], ["Roncy, Repair \"Co\""], ["ok"]])).toBe('a\r\n-5\r\n"Roncy, Repair ""Co"""\r\nok\r\n');
  });

  it("the BIA board report is safe even when a campaign, shop or street is named like a formula", () => {
    const evil = "=cmd|' /C calc'!A0";
    const period = { from: "2026-11-01T00:00:00.000Z", to: "2026-11-30T00:00:00.000Z" };
    const campaignReport = { visits: 1, baselineVisits: 1, visitLiftPct: 0, uniqueCustomers: 1, newMembers: 0, baselineNewMembers: 0, participants: 0, completions: 0, returnedWithin30d: 0, returnedWithin30dPct: 0, returnWindowEndsAt: "2026-12-30T00:00:00.000Z" };
    const csv = reportCsv({
      neighbourhood: { id: "x", name: evil },
      period,
      overview: { shops: { live: 1, members: 1, joinedInPeriod: 0 }, activeMembers: { value: 1, delta: 0 }, multiShopPct: { value: 0, deltaPoints: 0 }, visits: { value: 1, deltaPct: 0 }, shopsTable: [{ name: evil, status: "active", activated: true, visits: 1, newMembers: 0 }] },
      campaigns: [{ id: "c", name: "@SUM(A1)", kind: "x", status: "ended", startsAt: period.from, endsAt: period.to, shops: 1, report: campaignReport }],
    } as never);
    for (const line of csv.split("\r\n")) for (const cell of line.split(",")) expect(cell.replace(/^"/, ""), line).not.toMatch(/^[=+@]/);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'@SUM(A1)");
  });
});
