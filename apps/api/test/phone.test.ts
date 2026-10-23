import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { orders, phoneCalls } from "@ll/db";
import { extractOrderLines, matchOne, normalize, rankItems, similarity } from "../src/lib/menu-match.js";
import { twilioSignature } from "../src/providers/twilio.js";
import { parseTranscript, voiceResponse } from "../src/services/phone.js";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { req, restaurantShop } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const menu = [
  { id: "chicken", name: "Chicken Biryani", translations: { hi: { name: "चिकन बिरयानी" }, ur: { name: "چکن بریانی" }, pa: { name: "ਚਿਕਨ ਬਿਰਯਾਨੀ" } } },
  { id: "mutton", name: "Mutton Biryani" },
  { id: "naan", name: "Garlic Naan" },
  { id: "nihari", name: "Beef Nihari" },
  { id: "lassi", name: "Mango Lassi" },
  { id: "dal", name: "Dal" },
];
const names = (t: string) => extractOrderLines(t, menu).lines.map((l) => `${l.quantity} ${l.name}`);

describe("menu matching (pure)", () => {
  it("normalizes punctuation, case, accents and non-Latin digits", () => {
    expect(normalize("  Chicken,  BIRYANI!! ")).toBe("chicken biryani");
    expect(normalize("Café ٢ ۳ ४")).toBe("cafe 2 3 4");
    expect(similarity("biryani", "biryani")).toBe(1);
    expect(similarity("biriyani", "biryani")).toBeGreaterThan(0.7);
  });

  it("ranks by closeness and reports ambiguity", () => {
    expect(rankItems("chiken biriyani", menu)[0]!.item.id).toBe("chicken");
    expect(matchOne("mutton biryani", menu).match?.item.id).toBe("mutton");
    const amb = matchOne("biryani", menu);
    expect(amb.match).toBeNull();
    expect(amb.ambiguous.map((m) => m.item.id).sort()).toEqual(["chicken", "mutton"]);
    expect(matchOne("pizza", menu).match).toBeNull();
  });
});

describe("transcript parser (pure)", () => {
  it("reads quantities written as words or digits", () => {
    expect(names("I would like two chicken biryani and one garlic naan please")).toEqual(["2 Chicken Biryani", "1 Garlic Naan"]);
    expect(names("3 mango lassi, 2 beef nihari")).toEqual(["3 Mango Lassi", "2 Beef Nihari"]);
    expect(names("a chicken biryani")).toEqual(["1 Chicken Biryani"]);
    expect(names("chicken biryani x2")).toEqual(["2 Chicken Biryani"]);
    expect(names("chicken biryani")).toEqual(["1 Chicken Biryani"]);
  });

  it("tolerates speech-to-text misspellings", () => {
    expect(names("two chiken biriyani and a garlik nan")).toEqual(["2 Chicken Biryani", "1 Garlic Naan"]);
    expect(names("one beef nehari")).toEqual(["1 Beef Nihari"]);
  });

  it("understands romanized Hindi, Urdu and Punjabi number words", () => {
    expect(names("do chicken biryani aur teen garlic naan")).toEqual(["2 Chicken Biryani", "3 Garlic Naan"]);
    expect(names("ek mutton biryani chaar mango lassi")).toEqual(["1 Mutton Biryani", "4 Mango Lassi"]);
    expect(names("dho beef nihari te panj naan")).toContain("2 Beef Nihari");
  });

  it("matches translated names in native scripts", () => {
    expect(names("दो चिकन बिरयानी")).toEqual(["2 Chicken Biryani"]);
    expect(names("تین چکن بریانی")).toEqual(["3 Chicken Biryani"]);
    expect(names("ਦੋ ਚਿਕਨ ਬਿਰਯਾਨੀ")).toEqual(["2 Chicken Biryani"]);
    expect(names("٢ چکن بریانی")).toEqual(["2 Chicken Biryani"]);
  });

  it("merges repeats, caps at 50, and reports what it could not place", () => {
    expect(names("one garlic naan and another two garlic naan")).toEqual(["3 Garlic Naan"]);
    expect(names("99 garlic naan")).toEqual(["50 Garlic Naan"]);
    const r = extractOrderLines("two chicken biryani and 3 pizza", menu);
    expect(r.lines).toMatchObject([{ catalogItemId: "chicken", quantity: 2 }]);
    expect(r.unmatched).toEqual(["pizza"]);
  });

  it("flags a word that fits several items instead of guessing", () => {
    const r = extractOrderLines("two biryani please", menu);
    expect(r.lines).toEqual([]);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]!.options.map((o) => o.name).sort()).toEqual(["Chicken Biryani", "Mutton Biryani"]);
    // but a unique partial name is fine
    expect(names("one nihari")).toEqual(["1 Beef Nihari"]);
  });

  it("reads two distinctive words in a row as one phrase, not two orders", () => {
    const long = [
      { id: "hyd", name: "Hyderabadi Chicken Dum Biryani" },
      { id: "degh", name: "Chicken Biryani Degh (serves 15)" },
      { id: "goat", name: "Hyderabadi Goat Dum Biryani" },
      { id: "tikka", name: "Chicken Tikka" },
    ];
    const r = extractOrderLines("two chicken biryani please", long);
    expect(r.lines).toEqual([]);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0]!.phrase).toBe("chicken biryani");
    expect(r.ambiguous[0]!.options.map((o) => o.catalogItemId).sort()).toEqual(["degh", "hyd"]);
    // narrowed to one item: it is a plain line
    expect(extractOrderLines("one goat biryani", long).lines).toMatchObject([{ catalogItemId: "goat", quantity: 1 }]);
  });

  it("does not match tiny names by accident or fire on fillers", () => {
    expect(names("do you take card? I want to order")).toEqual([]);
    expect(names("two dal")).toEqual(["2 Dal"]);
    expect(names("hello can I get some water")).toEqual([]);
  });

  it("picks up a pickup hint", () => {
    const a = parseTranscript("one chicken biryani, pickup in 30 minutes", menu, new Date("2026-11-03T15:00:00Z"));
    expect(a.draft.pickupAt).toBe("2026-11-03T15:30:00.000Z");
    expect(parseTranscript("one chicken biryani in an hour", menu, new Date("2026-11-03T15:00:00Z")).draft.pickupAt).toBe("2026-11-03T16:00:00.000Z");
    const b = parseTranscript("one chicken biryani for pickup at 6 pm", menu, new Date());
    expect(b.draft.notes).toMatch(/at 6 pm/);
    expect(b.draft.pickupAt).toBeUndefined();
    expect(parseTranscript("", menu, new Date()).draft.items).toEqual([]);
  });

  it("builds TwiML", () => {
    expect(voiceResponse({ say: "Hi & welcome", gatherAction: "https://x/y?a=1&b=2", language: "hi-IN" })).toContain('<Gather input="speech" action="https://x/y?a=1&amp;b=2"');
    expect(voiceResponse({ say: "Bye" })).toContain("<Hangup/>");
  });
});

describe("phone webhook and call handling (Pro)", () => {
  const hook = (shop: { merchant: { id: string } }, body: Record<string, string>) =>
    env.app.inject({ method: "POST", url: `/v1/webhooks/phone/${shop.merchant.id}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(body).toString() });

  it("asks for the order on the first request, then stores the transcript with a draft", async () => {
    const shop = await restaurantShop(env, "pro");
    const first = await hook(shop, { CallSid: "CA1", From: "+14165550177" });
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toContain("text/xml");
    expect(first.body).toContain("<Gather");
    expect(await env.db.select().from(phoneCalls)).toHaveLength(0);

    const second = await hook(shop, { CallSid: "CA1", From: "+14165550177", SpeechResult: "Hi, two chicken biryani and one garlic naan, pickup in 20 minutes", Language: "en-US" });
    expect(second.body).toContain("We heard 2 Chicken Biryani, 1 Garlic Naan");
    const [call] = await env.db.select().from(phoneCalls);
    expect(call).toMatchObject({ merchantId: shop.merchant.id, fromPhone: "+14165550177", language: "en", status: "drafted", providerCallId: "CA1" });
    expect(call!.draftOrder!.items).toEqual([
      { catalogItemId: shop.items.chicken.id, name: "Chicken Biryani", quantity: 2 },
      { catalogItemId: shop.items.naan.id, name: "Garlic Naan", quantity: 1 },
    ]);
    expect(call!.draftOrder!.pickupAt).toBe(new Date(env.clock.now.getTime() + 20 * 60_000).toISOString());

    // The same call again (provider retry) updates, not duplicates.
    await hook(shop, { CallSid: "CA1", From: "+14165550177", TranscriptionText: "three mango lassi", Language: "en-US" });
    const rows = await env.db.select().from(phoneCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.draftOrder!.items).toMatchObject([{ name: "Mango Lassi", quantity: 3 }]);
  });

  it("matches a Hindi call against translated names", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CA2", From: "+14165550178", SpeechResult: "दो चिकन बिरयानी", Language: "hi-IN" });
    const [call] = await env.db.select().from(phoneCalls);
    expect(call).toMatchObject({ language: "hi", status: "drafted" });
    expect(call!.draftOrder!.items).toMatchObject([{ catalogItemId: shop.items.chicken.id, quantity: 2 }]);
  });

  it("keeps a call with nothing recognised as received, with the unmatched words", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CA3", From: "+14165550179", SpeechResult: "I want 2 pizza" });
    const list = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls`);
    expect(list.body.items[0]).toMatchObject({ status: "received", unmatched: ["pizza"], draftOrder: { items: [] } });
  });

  it("confirms a draft into a phone-channel order, once", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CA4", From: "+14165550180", SpeechResult: "two chicken biryani" });
    const [call] = await env.db.select().from(phoneCalls);
    const url = `/v1/merchants/${shop.merchant.id}/phone/calls/${call!.id}`;
    const r = await req(env, shop.ownerToken, "POST", `${url}/confirm`, {});
    expect(r.status).toBe(200);
    expect(r.body.call).toMatchObject({ status: "confirmed" });
    expect(r.body.order).toMatchObject({ subtotalCents: 2800, paymentMethod: "at_pickup" });
    const [o] = await env.db.select().from(orders).where(eq(orders.id, r.body.order.id));
    expect(o).toMatchObject({ channel: "phone", merchantId: shop.merchant.id });
    expect(o!.notes).toContain("Phone order");
    expect((await env.db.select().from(phoneCalls))[0]!.orderId).toBe(o!.id);
    expect((await req(env, shop.ownerToken, "POST", `${url}/confirm`, {})).status).toBe(409);
    expect((await req(env, shop.ownerToken, "POST", `${url}/discard`)).status).toBe(409);
  });

  it("lets staff correct the items before confirming, and discard a draft", async () => {
    const shop = await restaurantShop(env, "pro");
    await hook(shop, { CallSid: "CA5", From: "+14165550181", SpeechResult: "one nihari" });
    await hook(shop, { CallSid: "CA6", From: "+14165550182", SpeechResult: "one chicken biryani" });
    const calls = (await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls`)).body.items;
    const empty = calls.find((c: { fromPhone: string }) => c.fromPhone === "+14165550181");
    const noItems = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/phone/calls/${empty.id}/confirm`, {});
    expect(noItems.status).toBe(400); // "nihari" is not on this shop's menu
    const fixed = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/phone/calls/${empty.id}/confirm`, { items: [{ catalogItemId: shop.items.mutton.id, name: "Mutton Biryani", quantity: 1 }], notes: "no onions" });
    expect(fixed.status).toBe(200);
    expect(fixed.body.order.notes).toContain("no onions");
    const other = calls.find((c: { fromPhone: string }) => c.fromPhone === "+14165550182");
    const gone = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/phone/calls/${other.id}/discard`);
    expect(gone.body).toMatchObject({ status: "discarded" });
    const filtered = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls?status=discarded`);
    expect(filtered.body.items).toHaveLength(1);
    expect(await env.db.select().from(orders)).toHaveLength(1);
  });

  it("is a Pro feature: Growth shops get a polite answer and nothing is stored; their staff are locked out", async () => {
    const shop = await restaurantShop(env, "growth");
    const r = await hook(shop, { CallSid: "CA7", From: "+14165550183", SpeechResult: "one chicken biryani" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("call back");
    expect(await env.db.select().from(phoneCalls)).toHaveLength(0);
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls`)).status).toBe(402);
  });

  it("checks the Twilio signature when an auth token is set and keeps calls per shop", async () => {
    const shop = await restaurantShop(env, "pro");
    const other = await restaurantShop(env, "pro");
    env.ctx.config.phone.authToken = "twilio-token";
    const params = { CallSid: "CA8", From: "+14165550184", SpeechResult: "one chicken biryani" };
    const url = `/v1/webhooks/phone/${shop.merchant.id}`;
    const bad = await env.app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "nope" }, payload: new URLSearchParams(params).toString() });
    expect(bad.statusCode).toBe(403);
    const sig = twilioSignature("twilio-token", `${env.ctx.config.publicApiUrl}${url}`, params);
    const ok = await env.app.inject({ method: "POST", url, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, payload: new URLSearchParams(params).toString() });
    expect(ok.statusCode).toBe(200);
    const [call] = await env.db.select().from(phoneCalls);
    expect((await req(env, other.ownerToken, "GET", `/v1/merchants/${other.merchant.id}/phone/calls/${call!.id}`)).status).toBe(404);
    expect((await req(env, other.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/phone/calls`)).status).toBe(403);
  });
});
