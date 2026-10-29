/**
 * Website builder (workstream G): template copy with no AI, AI drafts and rewrites through a scripted client (never the real
 * API), the monthly caps (the 11th draft is refused), publish only on the annual plan, the public page with live services and
 * the address rule, the lapse grace period, and custom domains on the manual and automatic paths.
 */
import { eq } from "drizzle-orm";
import { createMerchant, createTestEnv, createUser, grantFeatures, tokenFor, type TestEnv } from "./helpers.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locations, merchants, reviewRequests, services, siteAiCalls, sites } from "@ll/db";
import { SITE_AI_EDITS_PER_MONTH, SITE_AI_GENERATIONS_PER_MONTH, SITE_COPY_FIELDS, defaultCopy, tradeLabelFor } from "@ll/shared";
import type { SiteAiClient, SiteAiRequest, SiteAiResponse } from "../src/services/site-ai.js";
import { DRAFT_MAX_TOKENS, DRAFT_SYSTEM, EDIT_MAX_TOKENS } from "../src/services/site-ai.js";
import type { DomainProvider } from "../src/services/site-domains.js";
import { allowanceWindow, FALLBACK_MESSAGE } from "../src/services/site.js";
import { req } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const usage = { input: 5200, output: 1900, cacheRead: 0, cacheWrite: 0 };
type Scripted = SiteAiClient & { calls: SiteAiRequest[] };
function scripted(reply: (r: SiteAiRequest) => Partial<SiteAiResponse>): Scripted {
  const calls: SiteAiRequest[] = [];
  return {
    name: "scripted",
    calls,
    async complete(r) {
      calls.push(r);
      return { json: null, outcome: "ok", model: r.kind === "draft" ? "claude-opus-5-5" : "claude-haiku-5-5", usage, ...reply(r) };
    },
  };
}

const goodDraft = {
  order: ["hero", "reviews", "services", "loyalty", "about", "hours", "map", "contact"],
  copy: {
    hero: { headline: "Nails by Priya", subhead: "Gel, acrylic and nail art in a quiet home studio.", cta: "Book a time" },
    about: { title: "Hi, I'm Priya", body: "I've been doing nails for friends for years. Now it's my studio." },
    services: { title: "What I do", intro: "Pick a service to see open times." },
    reviews: { title: "Kind words" },
    loyalty: { title: "Rewards for regulars", body: "A stamp every visit." },
    promos: { title: "On now", intro: "This week only." },
    hours: { title: "When I'm in" },
    map: { title: "Where I am", note: "In Bloor West. Address after you book." },
    contact: { title: "Say hi", body: "Message me with any question." },
    seo: { title: "Nails by Priya · Bloor West", description: "Gel and acrylic nails in Bloor West." },
  },
};

async function shop(opts: { annual?: boolean; plan?: "free" | "plus"; visibility?: "exact" | "area" } = {}) {
  const m = await createMerchant(env, { vertical: "nails", slug: `priya-${Math.random().toString(36).slice(2, 8)}` });
  await env.db.update(merchants).set({ name: "Priya Nails", plan: opts.plan ?? (opts.annual ? "plus" : "free"), annualSiteEntitled: !!opts.annual }).where(eq(merchants.id, m.merchant.id));
  await env.db.insert(locations).values({
    merchantId: m.merchant.id,
    name: "Home studio",
    address: "42 Secret Lane",
    city: "Toronto",
    postalCode: "M6S 1A1",
    qrCode: `QR${m.merchant.slug}`,
    lat: 43.65,
    lng: -79.48,
    addressVisibility: opts.visibility ?? "area",
    areaLabel: "Bloor West",
    mapLat: 43.651,
    mapLng: -79.482,
    hours: { mon: [["10:00", "18:00"]] },
  });
  await grantFeatures(env, m.merchant.id, ["booking.appointments"]);
  await env.db.insert(services).values({ merchantId: m.merchant.id, kind: "appointment", name: "Gel manicure", durationMin: 60, priceCents: 5500 });
  const base = `/v1/merchants/${m.merchant.id}/site`;
  return { ...m, base };
}

describe("zero AI: presets and template copy", () => {
  it("opens with a studio preset and template copy, and the draft endpoint falls back without touching the counters", async () => {
    const s = await shop();
    const r = await req(env, s.ownerToken, "GET", s.base);
    expect(r.status).toBe(200);
    expect(r.body.aiAvailable).toBe(false);
    expect(r.body.site.draft.preset).toBe("studio");
    expect(r.body.site.draft.copy.hero.headline).toBe("Priya Nails");
    expect(r.body.site.draft.copy.map.note).toContain("Bloor West");
    expect(r.body.site.status).toBe("draft");
    expect(r.body.usage.drafts).toEqual({ used: 0, limit: SITE_AI_GENERATIONS_PER_MONTH });

    const d = await req(env, s.ownerToken, "POST", `${s.base}/draft`, {});
    expect(d.status).toBe(200);
    expect(d.body.outcome).toBe("fallback");
    expect(d.body.usage.drafts.used).toBe(0);
  });

  it("template copy fits every field's limit for every preset", () => {
    for (const preset of ["studio", "portfolio", "shopfront"] as const) {
      const copy = defaultCopy(preset, { name: "A very long shop name that goes on and on Ltd.", tradeLabel: tradeLabelFor("salon"), areaLabel: "Bloor West Village", city: "Toronto", books: true, hasLoyalty: true });
      for (const [field, max] of Object.entries(SITE_COPY_FIELDS)) {
        const [a, b] = field.split(".") as [keyof typeof copy, string];
        expect((copy[a] as Record<string, string>)[b]!.length, field).toBeLessThanOrEqual(max);
      }
    }
  });

  it("an annual shop publishes the preset in one tap and the public page has live services and the Book flow", async () => {
    const s = await shop({ annual: true });
    const p = await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    expect(p.status).toBe(200);
    expect(p.body.site.status).toBe("published");
    const pub = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.booking.enabled).toBe(true);
    expect(pub.body.services.map((x: { name: string }) => x.name)).toEqual(["Gel manicure"]);
    expect(pub.body.loyalty.program).toBeTruthy();
    // A price change shows at once: nothing about services is stored in the site.
    await env.db.update(services).set({ priceCents: 6000 }).where(eq(services.merchantId, s.merchant.id));
    const again = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    expect(again.body.services[0].priceCents).toBe(6000);
  });
});

describe("publish needs the annual plan", () => {
  it("a monthly shop can build and preview but not publish (402, offer annual)", async () => {
    const s = await shop({ plan: "plus" });
    const b = await req(env, s.ownerToken, "GET", s.base);
    expect(b.body.entitlement).toMatchObject({ entitled: false, reason: "monthly" });
    expect((await req(env, s.ownerToken, "GET", `${s.base}/preview`)).status).toBe(200);
    const p = await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    expect(p.status).toBe(402);
    expect(p.body.error.details).toMatchObject({ feature: "site.builder", offer: "annual" });
    expect((await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`)).status).toBe(404);
  });

  it("a staff member cannot publish; unpublish takes the page down", async () => {
    const s = await shop({ annual: true });
    const staff = await createUser(env.db);
    const { merchantStaff } = await import("@ll/db");
    await env.db.insert(merchantStaff).values({ merchantId: s.merchant.id, userId: staff.id, role: "staff" });
    expect((await req(env, await tokenFor(env, staff), "POST", `${s.base}/publish`)).status).toBe(403);
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    await req(env, s.ownerToken, "POST", `${s.base}/unpublish`);
    expect((await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`)).status).toBe(404);
  });
});

describe("AI drafts and rewrites (scripted model)", () => {
  it("a draft carries the preset, services and area (never the address), uses the copy schema and logs usage", async () => {
    const s = await shop({ annual: true });
    const ai = scripted(() => ({ json: goodDraft }));
    env.ctx.providers.siteAi = ai;
    const r = await req(env, s.ownerToken, "POST", `${s.base}/draft`, { brief: "Mention I do nail art." });
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("ai");
    expect(r.body.site.draft.copy.hero.headline).toBe("Nails by Priya");
    expect(r.body.site.draft.order.slice(0, 3)).toEqual(["hero", "reviews", "services"]);
    expect(r.body.usage.drafts.used).toBe(1);
    const call = ai.calls[0]!;
    expect(call.kind).toBe("draft");
    expect(call.maxTokens).toBe(DRAFT_MAX_TOKENS);
    expect(call.system).toBe(DRAFT_SYSTEM);
    expect(call.user).toContain("Gel manicure");
    expect(call.user).toContain("$55");
    expect(call.user).toContain("Bloor West");
    expect(call.user).not.toContain("Secret Lane");
    expect(call.user).not.toContain("M6S");
    expect((call.schema as { required: string[] }).required).toEqual(["order", "copy"]);
    const logged = await env.db.select().from(siteAiCalls).where(eq(siteAiCalls.merchantId, s.merchant.id));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ kind: "draft", outcome: "ok", inputTokens: 5200, outputTokens: 1900, model: "claude-opus-5-5" });
  });

  it("the system prompt is the same for every shop (cacheable) and carries no shop data", async () => {
    expect(DRAFT_SYSTEM).not.toMatch(/Priya|Bloor/);
    const a = await shop();
    const b = await shop();
    const ai = scripted(() => ({ json: goodDraft }));
    env.ctx.providers.siteAi = ai;
    await req(env, a.ownerToken, "POST", `${a.base}/draft`, {});
    await req(env, b.ownerToken, "POST", `${b.base}/draft`, {});
    expect(ai.calls[0]!.system).toBe(ai.calls[1]!.system);
  });

  it("a refusal or a schema failure falls back to the template with a plain message", async () => {
    const s = await shop();
    env.ctx.providers.siteAi = scripted(() => ({ json: null, outcome: "refusal" }));
    const r1 = await req(env, s.ownerToken, "POST", `${s.base}/draft`, {});
    expect(r1.body).toMatchObject({ outcome: "fallback", message: FALLBACK_MESSAGE });
    expect(r1.body.site.draft.copy.hero.headline).toBe("Priya Nails");
    env.ctx.providers.siteAi = scripted(() => ({ json: { order: [], copy: { hero: { headline: 1 } } } }));
    const r2 = await req(env, s.ownerToken, "POST", `${s.base}/draft`, {});
    expect(r2.body.outcome).toBe("fallback");
    expect(r2.body.usage.drafts.used).toBe(2);
  });

  it("an outage before the model answered is not counted", async () => {
    const s = await shop();
    env.ctx.providers.siteAi = scripted(() => ({ json: null, outcome: "error", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }));
    const r = await req(env, s.ownerToken, "POST", `${s.base}/draft`, {});
    expect(r.body.outcome).toBe("fallback");
    expect(r.body.usage.drafts.used).toBe(0);
  });

  it("refuses the 11th draft this month without calling the model, and resets next month", async () => {
    const s = await shop();
    const ai = scripted(() => ({ json: goodDraft }));
    env.ctx.providers.siteAi = ai;
    for (let i = 0; i < SITE_AI_GENERATIONS_PER_MONTH; i++) expect((await req(env, s.ownerToken, "POST", `${s.base}/draft`, {})).status).toBe(200);
    const over = await req(env, s.ownerToken, "POST", `${s.base}/draft`, {});
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("site_ai_cap");
    expect(ai.calls).toHaveLength(SITE_AI_GENERATIONS_PER_MONTH);
    // Typing still works when the AI allowance is spent.
    expect((await req(env, s.ownerToken, "PUT", s.base, { copy: { hero: { headline: "Typed by hand" } } })).body.site.draft.copy.hero.headline).toBe("Typed by hand");
    env.clock.now = new Date("2026-12-02T15:00:00Z");
    const next = await req(env, await tokenFor(env, s.owner), "POST", `${s.base}/draft`, {});
    expect(next.status).toBe(200);
    expect(next.body.usage.drafts.used).toBe(1);
  });

  it("rewrites one line with the small model, inside the field's limit, and caps rewrites", async () => {
    const s = await shop();
    const ai = scripted((r) => ({ json: { text: `Fresh, tidy nails in Bloor West. ${"x".repeat(r.kind === "rewrite" ? 200 : 0)}` } }));
    env.ctx.providers.siteAi = ai;
    const r = await req(env, s.ownerToken, "POST", `${s.base}/rewrite`, { field: "hero.subhead", instruction: "shorter" });
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("ai");
    expect(r.body.text.length).toBeLessThanOrEqual(SITE_COPY_FIELDS["hero.subhead"]);
    expect(ai.calls[0]!.maxTokens).toBe(EDIT_MAX_TOKENS);
    expect(ai.calls[0]!.user).toContain("shorter");
    expect(r.body.usage.edits.used).toBe(1);
    const saved = (await req(env, s.ownerToken, "GET", s.base)).body.site.draft.copy.hero.subhead;
    expect(saved).toBe(r.body.text);
    await env.db.update(sites).set({ aiEditsPeriod: SITE_AI_EDITS_PER_MONTH }).where(eq(sites.merchantId, s.merchant.id));
    expect((await req(env, s.ownerToken, "POST", `${s.base}/rewrite`, { field: "hero.headline" })).status).toBe(429);
  });

  it("allowance windows follow the billing day", () => {
    const w = allowanceWindow(new Date("2026-11-03T15:00:00Z"), new Date("2027-08-20T10:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    const cal = allowanceWindow(new Date("2026-11-03T15:00:00Z"), null);
    expect(cal.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("the address rule", () => {
  it("an area shop's site carries the area label and pin, never the street address", async () => {
    const s = await shop({ annual: true, visibility: "area" });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    const pub = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    const raw = JSON.stringify(pub.body);
    expect(raw).not.toContain("Secret Lane");
    expect(raw).not.toContain("M6S");
    expect(pub.body.location).toMatchObject({ visibility: "area", areaLabel: "Bloor West", address: null, pin: { lat: 43.651, lng: -79.482 } });
  });

  it("a storefront shows its address", async () => {
    const s = await shop({ annual: true, visibility: "exact" });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    const pub = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    expect(pub.body.location.address).toBe("42 Secret Lane");
  });

  it("reviews show as an average once there are three ratings", async () => {
    const s = await shop({ annual: true });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    for (const rating of [5, 4, 5]) {
      const u = await createUser(env.db);
      await env.db.insert(reviewRequests).values({ merchantId: s.merchant.id, userId: u.id, channel: "sms", token: `t${Math.random()}`, rating });
    }
    const pub = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    expect(pub.body.reviews).toEqual({ count: 3, average: 4.7 });
  });
});

describe("domains and the lapse rule", () => {
  it("manual path: the request is an admin task; marked live, the host resolves", async () => {
    const s = await shop({ annual: true });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    const chk = await req(env, s.ownerToken, "GET", `${s.base}/domain/check?name=priyanails`);
    expect(chk.body).toMatchObject({ hostname: "priyanails.ca", available: null, auto: false, included: true });
    const d = await req(env, s.ownerToken, "POST", `${s.base}/domain`, { hostname: "priyanails.ca", mode: "register" });
    expect(d.body.site.domain).toMatchObject({ hostname: "priyanails.ca", status: "requested" });
    expect((await req(env, s.ownerToken, "POST", `${s.base}/domain`, { hostname: "priya.com", mode: "register" })).status).toBe(400);
    const admin = await createUser(env.db, { platformRole: "admin" });
    const at = await tokenFor(env, admin);
    const list = await req(env, at, "GET", "/v1/admin/site-domains");
    expect(list.body.items[0]).toMatchObject({ hostname: "priyanails.ca", status: "requested", merchantSlug: s.merchant.slug });
    expect((await req(env, s.ownerToken, "GET", "/v1/admin/site-domains")).status).toBe(403);
    expect((await req(env, null, "GET", "/v1/public/sites/by-host/priyanails.ca")).status).toBe(404);
    await req(env, at, "POST", `/v1/admin/site-domains/${list.body.items[0].id}`, { status: "live", registrarRef: "manual-1" });
    const host = await req(env, null, "GET", "/v1/public/sites/by-host/www.priyanails.ca");
    expect(host.status).toBe(200);
    expect(host.body.canonicalHost).toBe("priyanails.ca");
  });

  it("automatic path (SITE_DOMAINS_ENABLED): an owner-held name is routed and goes live when the hostname is active", async () => {
    const s = await shop({ annual: true });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    let state: "pending" | "live" = "pending";
    const fake: DomainProvider = {
      name: "cloudflare",
      available: async () => true,
      addHostname: async (h) => ({ ref: `cf_${h}`, state: "pending", dns: [{ type: "CNAME", name: h, value: "sites.localloyalty.ca" }] }),
      hostnameState: async () => state,
      removeHostname: async () => {},
    };
    env.ctx.config.site = { ...env.ctx.config.site, domainsEnabled: true };
    env.ctx.providers.siteDomains = fake;
    expect((await req(env, s.ownerToken, "GET", `${s.base}/domain/check?name=priyanails.ca`)).body).toMatchObject({ available: true, auto: true });
    const d = await req(env, s.ownerToken, "POST", `${s.base}/domain`, { hostname: "priya-studio.com", mode: "connect" });
    expect(d.body.site.domain).toMatchObject({ status: "pending", dns: [{ type: "CNAME" }] });
    state = "live";
    expect((await req(env, s.ownerToken, "GET", s.base)).body.site.domain.status).toBe("live");
    expect((await req(env, null, "GET", "/v1/public/sites/by-host/priya-studio.com")).status).toBe(200);
  });

  it("a lapsed annual plan: banner for 30 days, then the custom domain stops and /s/<slug> stays", async () => {
    const s = await shop({ annual: true });
    await req(env, s.ownerToken, "POST", `${s.base}/publish`);
    await env.db.update(sites).set({ domain: "priyanails.ca", domainStatus: "live" }).where(eq(sites.merchantId, s.merchant.id));
    await env.db.update(merchants).set({ annualSiteEntitled: false, plan: "plus" }).where(eq(merchants.id, s.merchant.id));
    const b = await req(env, s.ownerToken, "GET", s.base);
    expect(b.body.entitlement.lapsed).toMatchObject({ domainRouted: true });
    const host = await req(env, null, "GET", "/v1/public/sites/by-host/priyanails.ca");
    expect(host.status).toBe(200);
    expect(host.body.lapseBannerUntil).toBe(b.body.entitlement.lapsed.graceEndsAt);
    env.clock.now = new Date(env.clock.now.getTime() + 31 * 86_400_000);
    expect((await req(env, null, "GET", "/v1/public/sites/by-host/priyanails.ca")).status).toBe(404);
    const slug = await req(env, null, "GET", `/v1/public/sites/${s.merchant.slug}`);
    expect(slug.status).toBe(200);
    expect(slug.body.lapseBannerUntil).toBeNull();
    // Back on the annual plan: the lapse clears.
    await env.db.update(merchants).set({ annualSiteEntitled: true }).where(eq(merchants.id, s.merchant.id));
    expect((await req(env, null, "GET", "/v1/public/sites/by-host/priyanails.ca")).status).toBe(200);
  });
});
