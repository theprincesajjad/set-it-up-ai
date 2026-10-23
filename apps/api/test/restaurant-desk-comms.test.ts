import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orders, phoneCalls } from "@ll/db";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { connectWhatsapp, req, restaurantShop, sendInbound, wa } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

describe("phone orders (follow-ups)", () => {
  const hook = (shop: { merchant: { id: string } }, body: Record<string, string>) =>
    env.app.inject({ method: "POST", url: `/v1/webhooks/phone/${shop.merchant.id}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(body).toString() });

  it("keeps the spoken quantity on a 'did they mean' phrase and carries it through the chip", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CAqty1", From: "+14165550191", SpeechResult: "three biryani please" });
    const list = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls`);
    const c = list.body.items[0];
    expect(c.ambiguous[0]).toMatchObject({ phrase: expect.stringContaining("biryani"), quantity: 3 });
    expect(c.ambiguous[0].options.length).toBeGreaterThanOrEqual(2);
    expect(c.ambiguous[0].options[0].catalogItemId).toBeTruthy();
  });

  it("writes 'Phone order · caller' on the order, never the call SID", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CAsecret999", From: "+14165550192", SpeechResult: "two chicken biryani" });
    const [call] = await env.db.select().from(phoneCalls);
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/phone/calls/${call!.id}/confirm`, {});
    expect(r.status).toBe(200);
    const [o] = await env.db.select().from(orders).where(eq(orders.id, r.body.order.id));
    expect(o!.notes).toMatch(/^Phone order · /);
    expect(o!.notes).not.toContain("CAsecret999");
  });

  it("refuses to confirm a call that still has an unresolved dish", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CAamb1", From: "+14165550193", SpeechResult: "two biryani and a garlic naan" });
    const [call] = await env.db.select().from(phoneCalls);
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/phone/calls/${call!.id}/confirm`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("call_needs_review");
  });

  it("looks a caller up by number", async () => {
    const shop = await restaurantShop(env, "pro");
    const r = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/lookup?phone=${encodeURIComponent("+14165550199")}`);
    expect(r.status).toBe(200);
  });
});

describe("festival planner", () => {
  it("leads a Hyderabadi shop with its own festivals and sends Karva Chauth and Bangladesh Victory Day down", async () => {
    const shop = await restaurantShop(env, "growth");
    const prefs = await req(env, shop.ownerToken, "PUT", `/v1/merchants/${shop.merchant.id}/festivals/preferences`, { cuisines: ["hyderabadi"] });
    expect(prefs.status).toBe(200);
    const r = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/festivals/upcoming?days=400`);
    const rel = (id: string) => r.body.items.find((i: { festivalId: string }) => i.festivalId === id)?.relevance;
    expect(rel("eid_al_fitr")).toBe("high");
    expect(rel("karva_chauth")).toBe("low");
    expect(rel("bangladesh_victory")).toBe("low");
    const order = r.body.items.map((i: { festivalId: string }) => i.festivalId);
    expect(order.indexOf("eid_al_fitr")).toBeLessThan(order.indexOf("karva_chauth"));
  });

  it("moves a festival's date within three days and refuses a larger move", async () => {
    const shop = await restaurantShop(env, "growth");
    const url = `/v1/merchants/${shop.merchant.id}/festivals/diwali/date-override`;
    const ok = await req(env, shop.ownerToken, "PUT", url, { year: 2026, start: "2026-11-09" });
    expect(ok.status).toBe(200);
    const up = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/festivals/upcoming?days=60`);
    expect(up.body.items.find((i: { festivalId: string }) => i.festivalId === "diwali")).toMatchObject({ startDate: "2026-11-09", moved: true });
    expect((await req(env, shop.ownerToken, "PUT", url, { year: 2026, start: "2026-11-20" })).status).toBe(400);
    expect((await req(env, shop.ownerToken, "PUT", url, { year: 2026, start: null })).status).toBe(200);
  });

  it("will not schedule a send in the quiet hours (9 pm to 8 am)", async () => {
    const shop = await restaurantShop(env, "growth");
    // 2026-11-05 03:00Z = 10 pm the night before in Toronto.
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/festivals/diwali/campaign-drafts`, { templateId: "diwali_greeting", channel: "email", scheduledAt: "2026-11-05T03:00:00.000Z" });
    expect(r.status).toBe(400);
  });
});

describe("whatsapp inbox", () => {
  it("lists threads, keeps the transcript, lets staff take over, and stays quiet while taken over", async () => {
    const shop = await restaurantShop(env, "growth");
    const pn = await connectWhatsapp(env, shop);
    await sendInbound(env, pn, "+16475550144", "hi");
    const base = `/v1/merchants/${shop.merchant.id}/whatsapp/sessions`;
    const sessions = await req(env, shop.ownerToken, "GET", base);
    expect(sessions.status).toBe(200);
    const s = (sessions.body.items ?? sessions.body.sessions ?? sessions.body)[0];
    expect(s.id).toBeTruthy();
    const msgs = await req(env, shop.ownerToken, "GET", `${base}/${s.id}/messages`);
    expect(msgs.body.items.some((m: { direction: string }) => m.direction === "in")).toBe(true);

    expect((await req(env, shop.ownerToken, "POST", `${base}/${s.id}/takeover`)).status).toBe(200);
    const sentBefore = wa(env).sent.length;
    await sendInbound(env, pn, "+16475550144", "menu");
    expect(wa(env).sent.length).toBe(sentBefore); // the assistant is quiet
    const reply = await req(env, shop.ownerToken, "POST", `${base}/${s.id}/messages`, { text: "Hi, this is the kitchen." });
    expect(reply.status).toBeLessThan(300);
    expect(wa(env).sent.length).toBe(sentBefore + 1);
    expect((await req(env, shop.ownerToken, "POST", `${base}/${s.id}/release`)).status).toBe(200);
  });
});
