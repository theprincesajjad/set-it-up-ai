import { and, eq } from "drizzle-orm";
import { RESTAURANT_PLANS } from "@ll/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, catalogItems, merchantMembers, merchantStaff, merchants, orders, users, whatsappSessions } from "@ll/db";
import { extractOrderLines } from "../src/lib/menu-match.js";
import { hubSignature, metaWhatsApp, parseInboundWebhook, verifyHubSignature, verifyWebhookChallenge } from "../src/providers/whatsapp.js";
import { notifyCustomer } from "../src/services/commerceShared.js";
import { converse, menuMessages, type MenuView } from "../src/services/whatsapp-conversation.js";
import { getSession, resetWhatsappCreditsIfNewMonth, sendWhatsApp, whatsappUsage } from "../src/services/whatsapp.js";
import { customer } from "./commerce-fixtures.js";
import { createTestEnv, createUser, nextPhone, tokenFor, type TestEnv } from "./helpers.js";
import { connectWhatsapp, optIn, req, restaurantShop, sendInbound, wa, waBody } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const menuView = (): MenuView => ({
  merchantName: "Biryani House",
  cardPayments: true,
  items: [
    { id: "i-naan", number: 1, name: "Garlic Naan", priceCents: 300, category: "Breads" },
    { id: "i-chicken", number: 2, name: "Chicken Biryani", priceCents: 1400, category: "Mains", translations: { hi: { name: "चिकन बिरयानी" } } },
    { id: "i-mutton", number: 3, name: "Mutton Biryani", priceCents: 1700, category: "Mains" },
  ],
});

describe("provider", () => {
  it("verifies the hub.challenge handshake and the X-Hub-Signature-256 header", () => {
    expect(verifyWebhookChallenge({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "1234" }, "vt")).toBe("1234");
    expect(verifyWebhookChallenge({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1234" }, "vt")).toBeNull();
    expect(verifyWebhookChallenge({ "hub.mode": "subscribe", "hub.verify_token": "vt", "hub.challenge": "1" }, undefined)).toBeNull();
    const body = JSON.stringify({ a: 1 });
    const sig = hubSignature("secret", body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyHubSignature("secret", body, sig)).toBe(true);
    expect(verifyHubSignature("secret", body + " ", sig)).toBe(false);
    expect(verifyHubSignature("secret", body, undefined)).toBe(false);
  });

  it("sends templates and text through the Graph API shape", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = metaWhatsApp({ accessToken: "tok", apiVersion: "v21.0" }, fetchImpl);
    expect((await p.sendTemplate({ phoneNumberId: "pn1", to: "+14165550123", template: "order_ready", language: "hi", params: ["Biryani House", "12"] })).id).toBe("wamid.X");
    await p.sendText({ phoneNumberId: "pn1", to: "+14165550123", body: "hello" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/pn1/messages");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const t = JSON.parse(calls[0]!.init.body as string);
    expect(t).toMatchObject({ messaging_product: "whatsapp", to: "14165550123", type: "template", template: { name: "order_ready", language: { code: "hi" }, components: [{ type: "body", parameters: [{ type: "text", text: "Biryani House" }, { type: "text", text: "12" }] }] } });
    expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({ type: "text", text: { body: "hello" } });
    const failing = metaWhatsApp({ accessToken: "t" }, (async () => new Response(JSON.stringify({ error: { message: "bad", code: 131047 } }), { status: 400 })) as unknown as typeof fetch);
    await expect(failing.sendText({ phoneNumberId: "pn1", to: "+1", body: "x" })).rejects.toThrow(/131047/);
  });

  it("parses inbound messages and ignores status callbacks", () => {
    const msgs = parseInboundWebhook(waBody("pn_1", "+1 (416) 555-0123", "Menu", "wamid.1"));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ phoneNumberId: "pn_1", from: "+14165550123", text: "Menu", id: "wamid.1", name: "Aisha" });
    expect(parseInboundWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "pn" }, statuses: [{ id: "x", status: "read" }] } }] }] })).toEqual([]);
  });
});

describe("webhook endpoint", () => {
  it("answers the verify handshake with the challenge", async () => {
    env.ctx.config.whatsapp.verifyToken = "vt";
    const ok = await req(env, null, "GET", "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=abc123");
    expect(ok.status).toBe(200);
    expect(ok.body).toBe("abc123");
    expect((await req(env, null, "GET", "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=zzz&hub.challenge=abc")).status).toBe(403);
  });

  it("rejects a bad signature when an app secret is set and accepts a good one", async () => {
    env.ctx.config.whatsapp.appSecret = "app-secret";
    const payload = JSON.stringify(waBody("pn_unknown", "+14165550123", "menu"));
    const headers = { "content-type": "application/json" };
    const bad = await env.app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { ...headers, "x-hub-signature-256": "sha256=00" }, payload });
    expect(bad.statusCode).toBe(403);
    const good = await env.app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { ...headers, "x-hub-signature-256": hubSignature("app-secret", payload) }, payload });
    expect(good.statusCode).toBe(200);
    expect(JSON.parse(good.body)).toMatchObject({ ok: true, ignored: 1 });
  });

  it("refuses unsigned requests in production", async () => {
    env.ctx.config.env = "production";
    const r = await env.app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "content-type": "application/json" }, payload: JSON.stringify(waBody("pn", "+1", "x")) });
    expect(r.statusCode).toBe(403);
  });
});

describe("settings and connection", () => {
  it("lets the owner connect a number, rejects a number used by another shop, and reports usage", async () => {
    const shop = await restaurantShop(env, "growth");
    const other = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop, ["eid_preorder"], "pn_a");
    const s = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/whatsapp/settings`);
    expect(s.body).toMatchObject({ connected: true, phoneNumberId: "pn_a", approvedTemplates: ["eid_preorder"], features: { notifications: true, ordering: true, marketing: true }, usage: { used: 0, planAllowance: 1000, extra: 0, allowance: 1000, remaining: 1000 } });
    expect(s.body.webhookUrl).toMatch(/\/v1\/webhooks\/whatsapp$/);
    expect(s.body.requiredTemplates.map((t: { name: string }) => t.name)).toContain("order_ready");
    const clash = await req(env, other.ownerToken, "PUT", `/v1/merchants/${other.merchant.id}/whatsapp/settings`, { phoneNumberId: "pn_a" });
    expect(clash.status).toBe(409);
    const manager = await createUser(env.db);
    await env.db.insert(merchantStaff).values({ merchantId: shop.merchant.id, userId: manager.id, role: "manager" });
    expect((await req(env, await tokenFor(env, manager), "PUT", `/v1/merchants/${shop.merchant.id}/whatsapp/settings`, { phoneNumberId: "pn_z" })).status).toBe(403);
  });

  it("gates by restaurant tier: no restaurant tier means locked", async () => {
    const shop = await restaurantShop(env, "starter");
    await env.db.update(merchants).set({ restaurantTier: null }).where(eq(merchants.id, shop.merchant.id));
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/whatsapp/settings`)).status).toBe(402);
  });
});

describe("conversation state machine (pure)", () => {
  const base = { state: "browsing", language: "en" as const, cart: [], menu: menuView() };

  it("lists the menu with numbers, grouped by category", () => {
    const out = converse({ ...base, text: "menu" });
    const text = out.replies.join("\n");
    expect(text).toContain("*Breads*");
    expect(text).toContain("1. Garlic Naan  $3.00");
    expect(text).toContain("3. Mutton Biryani  $17.00");
  });

  it("splits a long menu into several messages", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: `i${i}`, number: i + 1, name: `Dish number ${i + 1} with a long descriptive name`, priceCents: 1000 + i, category: i < 60 ? "Starters" : "Mains" }));
    const msgs = menuMessages({ merchantName: "Big Kitchen", cardPayments: true, items }, "en");
    expect(msgs.length).toBeGreaterThan(1);
    expect(msgs.every((m) => m.length < 4000)).toBe(true);
    expect(msgs.join("\n")).toContain("120. Dish number 120");
  });

  it("adds by number, by number x quantity, and by name with a quantity", () => {
    let o = converse({ ...base, text: "2" });
    expect(o.cart).toEqual([{ catalogItemId: "i-chicken", quantity: 1 }]);
    o = converse({ ...base, cart: o.cart, state: o.state, text: "3 x 2" });
    expect(o.cart).toEqual([{ catalogItemId: "i-chicken", quantity: 1 }, { catalogItemId: "i-mutton", quantity: 2 }]);
    o = converse({ ...base, cart: o.cart, state: o.state, text: "add 2 garlic naan" });
    expect(o.cart.find((c) => c.catalogItemId === "i-naan")?.quantity).toBe(2);
    expect(o.state).toBe("cart");
    expect(o.replies.join("\n")).toContain("Subtotal: $");
  });

  it("asks which one when a name fits two items", () => {
    const o = converse({ ...base, text: "add 2 biryani" });
    expect(o.cart).toEqual([]);
    expect(o.replies.join("\n")).toMatch(/Which "biryani"/);
  });

  it("removes, clears and reports an unknown item number", () => {
    const cart = [{ catalogItemId: "i-naan", quantity: 2 }, { catalogItemId: "i-mutton", quantity: 1 }];
    let o = converse({ ...base, cart, state: "cart", text: "remove naan" });
    expect(o.cart).toEqual([{ catalogItemId: "i-mutton", quantity: 1 }]);
    o = converse({ ...base, cart, state: "cart", text: "clear" });
    expect(o.cart).toEqual([]);
    expect(converse({ ...base, text: "9" }).replies[0]).toMatch(/no item 9/);
  });

  it("checkout needs a cart, then returns the checkout action", () => {
    expect(converse({ ...base, text: "checkout" }).action).toBeNull();
    const o = converse({ ...base, cart: [{ catalogItemId: "i-naan", quantity: 1 }], state: "cart", text: "Checkout" });
    expect(o.action).toEqual({ type: "checkout" });
    expect(o.state).toBe("checkout");
  });

  it("STOP opts out, only START brings the customer back", () => {
    const stopped = converse({ ...base, text: "STOP" });
    expect(stopped.action).toEqual({ type: "opt_out" });
    expect(stopped.state).toBe("opted_out");
    expect(converse({ ...base, state: "opted_out", text: "menu" }).replies).toEqual([]);
    const back = converse({ ...base, state: "opted_out", text: "start" });
    expect(back.action).toEqual({ type: "opt_in" });
    expect(back.state).toBe("browsing");
  });

  it("replies in Hindi, Urdu and Punjabi and uses translated item names", () => {
    const hi = converse({ ...base, text: "language hindi" });
    expect(hi.language).toBe("hi");
    expect(hi.replies[0]).toContain("हिंदी");
    const menu = converse({ ...base, language: "hi", text: "मेन्यू" });
    expect(menu.replies.join("\n")).toContain("2. चिकन बिरयानी  $14.00");
    expect(menu.replies.join("\n")).toContain("3. Mutton Biryani");
    const added = converse({ ...base, language: "hi", text: "2" });
    expect(added.replies[0]).toContain("चिकन बिरयानी");
    expect(converse({ ...base, text: "lang ur" }).language).toBe("ur");
    expect(converse({ ...base, text: "ਪੰਜਾਬੀ" }).language).toBe("pa");
    expect(converse({ ...base, language: "ur", text: "blah blah" }).replies[0]).toContain("معذرت");
  });

  it("reads Hindi, Urdu and Punjabi number words and translated names", () => {
    const items = menuView().items;
    expect(extractOrderLines("do chicken biryani aur teen garlic naan", items).lines.map((l) => [l.name, l.quantity])).toEqual([["Chicken Biryani", 2], ["Garlic Naan", 3]]);
    expect(extractOrderLines("दो चिकन बिरयानी", items).lines).toMatchObject([{ catalogItemId: "i-chicken", quantity: 2 }]);
  });
});

describe("ordering over WhatsApp", () => {
  const phone = "+14165550123";

  async function chat(pn: string, text: string, from = phone) {
    const before = wa(env).sent.length;
    const r = await sendInbound(env, pn, from, text);
    expect(r.status).toBe(200);
    return wa(env).sent.slice(before).map((m) => (m.kind === "text" ? m.body : `[template ${m.template}]`));
  }

  it("menu -> add -> checkout creates a whatsapp order and sends a pay link", async () => {
    const shop = await restaurantShop(env, "growth");
    const pn = await connectWhatsapp(env, shop);
    const menu = await chat(pn, "hi");
    expect(menu.join("\n")).toContain("1. Garlic Naan");
    expect(menu.join("\n")).toContain("3. Chicken Biryani  $14.00");
    expect(menu.join("\n")).not.toContain("Biryani Pot");
    const added = await chat(pn, "add 2 chicken biryani");
    expect(added.join("\n")).toContain("Added 2 x Chicken Biryani.");
    const done = await chat(pn, "checkout");
    const text = done.join("\n");
    expect(text).toMatch(/Order #1 is placed/);
    const link = /\/pay\/order\/([0-9a-f-]{36})\?t=([0-9a-f]{32})/.exec(text);
    expect(link).toBeTruthy();

    const [o] = await env.db.select().from(orders).where(eq(orders.merchantId, shop.merchant.id));
    expect(o).toMatchObject({ channel: "whatsapp", paymentMethod: "in_app", subtotalCents: 2800 });
    expect(link![1]).toBe(o!.id);
    const s = await getSession(env.ctx, shop.merchant.id, phone);
    expect(s).toMatchObject({ state: "awaiting_payment", orderId: o!.id, cart: [] });
    expect(s!.lastInboundAt).toBeTruthy();
    // the customer exists now, found by phone
    const [u] = await env.db.select().from(users).where(eq(users.phone, phone));
    expect(o!.userId).toBe(u!.id);

    // Pay page data (token protected).
    const view = await req(env, null, "GET", `/v1/public/whatsapp/pay/${o!.id}?t=${link![2]}`);
    expect(view.status).toBe(200);
    expect(view.body.order).toMatchObject({ number: 1, totalCents: o!.totalCents });
    expect(view.body.payment.clientSecret).toBeTruthy();
    expect((await req(env, null, "GET", `/v1/public/whatsapp/pay/${o!.id}?t=${"0".repeat(32)}`)).status).toBe(404);
    expect((await req(env, null, "GET", `/v1/public/whatsapp/pay/${o!.id}`)).status).toBe(403);

    // A status ping while waiting for payment.
    expect((await chat(pn, "checkout")).join("\n")).toMatch(/waiting for payment/);
    // New order starts clean.
    await chat(pn, "menu");
    const s2 = await getSession(env.ctx, shop.merchant.id, phone);
    expect(s2).toMatchObject({ state: "browsing", cart: [] });
  });

  it("falls back to pay at pickup when the shop has no card payments", async () => {
    const shop = await restaurantShop(env, "growth", { connect: false });
    const pn = await connectWhatsapp(env, shop);
    await chat(pn, "add 1 chicken biryani");
    const out = (await chat(pn, "checkout")).join("\n");
    expect(out).toContain("Pay at Biryani House when you pick it up");
    const [o] = await env.db.select().from(orders).where(eq(orders.merchantId, shop.merchant.id));
    expect(o).toMatchObject({ channel: "whatsapp", paymentMethod: "at_pickup" });
  });

  it("ignores a repeated message id (Meta retries)", async () => {
    const shop = await restaurantShop(env, "growth");
    const pn = await connectWhatsapp(env, shop);
    await sendInbound(env, pn, phone, "3", "wamid.same");
    await sendInbound(env, pn, phone, "3", "wamid.same");
    const s = await getSession(env.ctx, shop.merchant.id, phone);
    expect(s!.cart).toEqual([{ catalogItemId: shop.items.chicken.id, quantity: 1 }]);
  });

  it("answers in the customer's language: detected from the script of the first message", async () => {
    const shop = await restaurantShop(env, "growth");
    const pn = await connectWhatsapp(env, shop);
    const out = (await chat(pn, "मेन्यू")).join("\n");
    expect(out).toContain("चिकन बिरयानी");
    expect((await getSession(env.ctx, shop.merchant.id, phone))!.language).toBe("hi");
  });

  it("does not order for a Starter shop (growth feature) but still honours STOP", async () => {
    const shop = await restaurantShop(env, "starter");
    const pn = await connectWhatsapp(env, shop);
    expect(await chat(pn, "menu")).toEqual([]);
    expect(await chat(pn, "STOP")).toHaveLength(1);
    expect((await getSession(env.ctx, shop.merchant.id, phone))!.state).toBe("opted_out");
  });

  it("reports an item that became unavailable at checkout and keeps the cart", async () => {
    const shop = await restaurantShop(env, "growth");
    const pn = await connectWhatsapp(env, shop);
    await chat(pn, "3");
    await env.db.update(catalogItems).set({ available: false }).where(eq(catalogItems.id, shop.items.chicken.id));
    const out = (await chat(pn, "checkout")).join("\n");
    expect(out).toMatch(/isn't available/);
    expect((await getSession(env.ctx, shop.merchant.id, phone))!.cart).toHaveLength(1);
  });
});

describe("24 hour window and credits", () => {
  it("sends free-form inside the window, a template (one credit) outside it, and nothing without either", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const phone = "+14165550124";
    // No session: free text is not allowed, template is.
    expect(await sendWhatsApp(env.ctx, shop.merchant, phone, { text: "hello" })).toMatchObject({ sent: false, reason: "outside_window" });
    const t = await sendWhatsApp(env.ctx, shop.merchant, phone, { text: "hello", template: { name: "order_ready", params: ["Biryani House", "5"] } });
    expect(t).toMatchObject({ sent: true, via: "template" });
    expect(wa(env).sent.at(-1)).toMatchObject({ kind: "template", template: "order_ready", to: phone });
    const used = async () => (await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id)))[0]!.whatsappCreditsUsed;
    expect(await used()).toBe(1);

    // Customer writes in: free-form works for 24h and costs nothing.
    await sendInbound(env, "pn_1001", phone, "hello?");
    const inside = await sendWhatsApp(env.ctx, shop.merchant, phone, { text: "ready", template: { name: "order_ready", params: ["x", "1"] } });
    expect(inside).toMatchObject({ sent: true, via: "text" });
    expect(await used()).toBe(1);

    env.clock.now = new Date(env.clock.now.getTime() + 25 * 3600_000);
    const later = await sendWhatsApp(env.ctx, shop.merchant, phone, { text: "ready", template: { name: "order_ready", params: ["x", "1"] } });
    expect(later).toMatchObject({ sent: true, via: "template" });
    expect(await used()).toBe(2);
  });

  it("stops at the allowance (plan + add-on pack) and refunds a failed send", async () => {
    const shop = await restaurantShop(env, "starter");
    await connectWhatsapp(env, shop);
    const included = RESTAURANT_PLANS.starter.whatsappPerMonth;
    await env.db.update(merchants).set({ whatsappCreditsUsed: included }).where(eq(merchants.id, shop.merchant.id));
    const send = () => sendWhatsApp(env.ctx, shop.merchant, "+14165550125", { template: { name: "order_ready", params: ["a", "1"] } });
    expect(await send()).toMatchObject({ sent: false, reason: "no_credits" });
    await env.db.update(merchants).set({ whatsappCreditsExtra: 2 }).where(eq(merchants.id, shop.merchant.id));
    expect((await send()).sent).toBe(true);
    expect((await send()).sent).toBe(true);
    expect(await send()).toMatchObject({ sent: false, reason: "no_credits" });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id));
    expect(whatsappUsage(m!)).toMatchObject({ used: included + 2, allowance: included + 2, remaining: 0 });

    await env.db.update(merchants).set({ whatsappCreditsExtra: 5, whatsappCreditsUsed: included }).where(eq(merchants.id, shop.merchant.id));
    wa(env).failNext = 1;
    expect(await send()).toMatchObject({ sent: false, reason: "send_failed" });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id)))[0]!.whatsappCreditsUsed).toBe(included);
  });

  it("monthly reset renews the plan allowance and burns used pack messages once", async () => {
    const shop = await restaurantShop(env, "growth");
    await env.db.update(merchants).set({ whatsappCreditsUsed: 1200, whatsappCreditsExtra: 500 }).where(eq(merchants.id, shop.merchant.id));
    expect(await resetWhatsappCreditsIfNewMonth(env.ctx)).toBe(true);
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id));
    expect(m).toMatchObject({ whatsappCreditsUsed: 0, whatsappCreditsExtra: 300 });
    expect(await resetWhatsappCreditsIfNewMonth(env.ctx)).toBe(false);
    const logs = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "whatsapp_credits.reset"));
    expect(logs).toHaveLength(1);
  });
});

describe("order notifications on WhatsApp", () => {
  async function placeAndAccept(shop: Awaited<ReturnType<typeof restaurantShop>>, c: Awaited<ReturnType<typeof customer>>) {
    const place = await req(env, c.token, "POST", "/v1/me/orders", {
      merchantId: shop.merchant.id,
      locationId: shop.location.id,
      items: [{ catalogItemId: shop.items.chicken.id, quantity: 1 }],
      paymentMethod: "at_pickup",
      idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    });
    expect(place.status).toBe(201);
    const orderId = place.body.order.id;
    const status = (s: string) => req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/orders/${orderId}/status`, { status: s });
    return { orderId, status };
  }

  it("sends order confirmed and ready to an opted-in customer, as templates with credits", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const c = await customer(env, { name: "Aisha Khan" });
    await optIn(env, shop.merchant.id, c.user.id);
    const { status } = await placeAndAccept(shop, c);
    expect((await status("accepted")).status).toBe(200);
    expect((await status("ready")).status).toBe(200);
    const sent = wa(env).sent.filter((m) => m.to === c.user.phone);
    expect(sent.map((m) => (m.kind === "template" ? m.template : "text"))).toEqual(["order_confirmed", "order_ready"]);
    expect(sent[0]).toMatchObject({ kind: "template", params: ["Biryani House", "1", "$15.82"] });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id));
    expect(m!.whatsappCreditsUsed).toBe(2);
  });

  it("sends nothing without opt-in, after STOP, or when the shop lacks the feature", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const c = await customer(env);
    const { status } = await placeAndAccept(shop, c);
    await status("accepted");
    expect(wa(env).sent).toHaveLength(0); // never opted in

    await optIn(env, shop.merchant.id, c.user.id);
    await sendInbound(env, "pn_1001", c.user.phone!, "STOP");
    wa(env).reset();
    await status("ready");
    expect(wa(env).sent).toHaveLength(0); // opted out
    const s = await getSession(env.ctx, shop.merchant.id, c.user.phone!);
    expect(s).toMatchObject({ state: "opted_out", marketingOptInAt: null });

    // START opts back in.
    await sendInbound(env, "pn_1001", c.user.phone!, "START");
    expect((await getSession(env.ctx, shop.merchant.id, c.user.phone!))!.marketingOptInAt).toBeTruthy();

    // No restaurant tier -> feature off.
    await env.db.update(merchants).set({ restaurantTier: null }).where(eq(merchants.id, shop.merchant.id));
    wa(env).reset();
    await notifyCustomer(env.ctx, { userId: c.user.id, merchantId: shop.merchant.id, title: "t", body: "b", data: { type: "order_status", orderId: (await env.db.select().from(orders))[0]!.id, status: "ready" } });
    expect(wa(env).sent).toHaveLength(0);
  });

  it("a customer who messaged the shop counts as consenting to order updates and gets free-form text in the window", async () => {
    const shop = await restaurantShop(env, "starter");
    await connectWhatsapp(env, shop);
    const c = await customer(env);
    await sendInbound(env, "pn_1001", c.user.phone!, "hello");
    const { status } = await placeAndAccept(shop, c);
    await status("accepted");
    const sent = wa(env).sent.filter((m) => m.to === c.user.phone);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "text" });
    expect(sent[0]!.kind === "text" && sent[0]!.body).toContain("we got your order #1");
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id));
    expect(m!.whatsappCreditsUsed).toBe(0); // starter has 0 included, in-window replies are free
  });

  it("customer consent endpoint", async () => {
    const shop = await restaurantShop(env, "growth");
    const c = await customer(env);
    const on = await req(env, c.token, "PUT", `/v1/me/merchants/${shop.merchant.id}/whatsapp-consent`, { optIn: true, language: "ur" });
    expect(on.body).toMatchObject({ optedIn: true, phone: c.user.phone });
    expect((await req(env, c.token, "GET", `/v1/me/merchants/${shop.merchant.id}/whatsapp-consent`)).body.optedIn).toBe(true);
    expect((await getSession(env.ctx, shop.merchant.id, c.user.phone!))!.language).toBe("ur");
    const off = await req(env, c.token, "PUT", `/v1/me/merchants/${shop.merchant.id}/whatsapp-consent`, { optIn: false });
    expect(off.body.optedIn).toBe(false);
    expect((await req(env, null, "GET", `/v1/me/merchants/${shop.merchant.id}/whatsapp-consent`)).status).toBe(401);
  });
});

describe("marketing broadcast", () => {
  async function audience(shop: Awaited<ReturnType<typeof restaurantShop>>) {
    const mk = async (opts: { casl: boolean; optIn: boolean; muted?: boolean; name: string }) => {
      const u = await createUser(env.db, { name: opts.name, phone: nextPhone() });
      await env.db.insert(merchantMembers).values({ merchantId: shop.merchant.id, userId: u.id, marketingConsentAt: opts.casl ? env.clock.now : null, muted: !!opts.muted });
      if (opts.optIn) await optIn(env, shop.merchant.id, u.id);
      return u;
    };
    return {
      both: await mk({ casl: true, optIn: true, name: "Both Consents" }),
      both2: await mk({ casl: true, optIn: true, name: "Second Consent" }),
      noCasl: await mk({ casl: false, optIn: true, name: "No Casl" }),
      noOpt: await mk({ casl: true, optIn: false, name: "No Optin" }),
      muted: await mk({ casl: true, optIn: true, muted: true, name: "Muted" }),
    };
  }
  const url = (shop: { merchant: { id: string } }) => `/v1/merchants/${shop.merchant.id}/whatsapp/broadcasts`;

  it("sends an approved template only to members with CASL consent AND a WhatsApp opt-in, not muted", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop, ["eid_preorder"]);
    const a = await audience(shop);
    const dry = await req(env, shop.ownerToken, "POST", url(shop), { templateName: "eid_preorder", params: ["{{first_name}}", "{{merchant}}"], dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ dryRun: true, matched: 5, recipients: 2, excludedNoConsent: 1, excludedMuted: 1, excludedNoWhatsappOptIn: 1, creditsNeeded: 2, sent: 0 });
    expect(wa(env).sent).toHaveLength(0);

    const res = await req(env, shop.ownerToken, "POST", url(shop), { templateName: "eid_preorder", language: "en", params: ["{{first_name}}", "{{merchant}}"] });
    expect(res.body).toMatchObject({ sent: 2, failed: 0, creditsRemaining: 998 });
    const to = wa(env).sent.map((m) => m.to).sort();
    expect(to).toEqual([a.both.phone, a.both2.phone].sort());
    expect(wa(env).sent.find((m) => m.to === a.both.phone)).toMatchObject({ kind: "template", template: "eid_preorder", params: ["Both", "Biryani House"] });
    const [m] = await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id));
    expect(m!.whatsappCreditsUsed).toBe(2);
    const logs = await env.db.select().from(auditLogs).where(and(eq(auditLogs.action, "whatsapp.broadcast"), eq(auditLogs.merchantId, shop.merchant.id)));
    expect(logs).toHaveLength(1);
  });

  it("rejects templates that are not approved, shops without Growth, and sends beyond the allowance", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop, ["eid_preorder"]);
    await audience(shop);
    expect((await req(env, shop.ownerToken, "POST", url(shop), { templateName: "made_up" })).status).toBe(400);

    await env.db.update(merchants).set({ whatsappCreditsUsed: 999 }).where(eq(merchants.id, shop.merchant.id));
    const over = await req(env, shop.ownerToken, "POST", url(shop), { templateName: "eid_preorder" });
    expect(over.status).toBe(402);
    expect(over.body.error).toMatchObject({ code: "whatsapp_credits_exhausted", details: { needed: 2, remaining: 1 } });
    expect(wa(env).sent).toHaveLength(0);

    const starter = await restaurantShop(env, "starter");
    await connectWhatsapp(env, starter, ["eid_preorder"], "pn_2002");
    expect((await req(env, starter.ownerToken, "POST", url(starter), { templateName: "eid_preorder" })).status).toBe(402);
  });

  it("refunds credits for sends that fail and holds marketing during quiet hours", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop, ["eid_preorder"]);
    await audience(shop);
    wa(env).failNext = 1;
    const res = await req(env, shop.ownerToken, "POST", url(shop), { templateName: "eid_preorder" });
    expect(res.body).toMatchObject({ sent: 1, failed: 1 });
    expect((await env.db.select().from(merchants).where(eq(merchants.id, shop.merchant.id)))[0]!.whatsappCreditsUsed).toBe(1);

    env.clock.now = new Date("2026-11-04T03:00:00Z"); // 22:00 in Toronto
    const token = await tokenFor(env, shop.owner);
    expect((await req(env, token, "POST", url(shop), { templateName: "eid_preorder" })).status).toBe(409);
  });

  it("members can be opted in by staff and the session list shows the 24h window", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop);
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/whatsapp/opt-ins`, { phone: "(416) 555-0199", source: "in_store" });
    expect(r.body).toMatchObject({ optedIn: true, phone: "+14165550199" });
    await sendInbound(env, "pn_1001", "+14165550199", "hello");
    const list = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/whatsapp/sessions`);
    expect(list.body.items[0]).toMatchObject({ phone: "+14165550199", optedIn: true });
    expect(list.body.items[0].windowOpenUntil).toBeTruthy();
    const rows = await env.db.select().from(whatsappSessions).where(eq(whatsappSessions.merchantId, shop.merchant.id));
    expect(rows).toHaveLength(1);
  });
});
