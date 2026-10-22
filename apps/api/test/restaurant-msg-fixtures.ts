/** Fixtures for the restaurant messaging suites (whatsapp, reviews, festivals, phone). */
import { eq } from "drizzle-orm";
import { catalogItems, merchantCategories, merchants } from "@ll/db";
import { getWhatsApp, hubSignature, type FakeWhatsApp } from "../src/providers/whatsapp.js";
import { recordOptIn } from "../src/services/whatsapp.js";
import { paidMerchant } from "./commerce-fixtures.js";
import type { TestEnv } from "./helpers.js";

export async function req(env: TestEnv, token: string | null, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await env.app.inject({
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.statusCode, body: (res.body && res.headers["content-type"]?.toString().includes("json") ? JSON.parse(res.body) : res.body) as any, headers: res.headers };
}

export const wa = (env: TestEnv) => getWhatsApp(env.ctx) as FakeWhatsApp;

export type Tier = "starter" | "growth" | "pro";

/** A restaurant on the free loyalty plan whose restaurant tier alone unlocks everything for that tier. */
export async function restaurantShop(env: TestEnv, tier: Tier = "growth", opts: { connect?: boolean } = {}) {
  const base = await paidMerchant(env, { plan: "free", connect: opts.connect });
  await env.db
    .update(merchants)
    .set({ restaurantTier: tier, whatsappNumber: "+14165550100", googleReviewUrl: "https://g.page/r/test-biryani/review", languages: ["en", "hi", "ur", "pa"], name: "Biryani House" })
    .where(eq(merchants.id, base.merchant.id));
  const [mains] = await env.db.insert(merchantCategories).values({ merchantId: base.merchant.id, name: "Mains" }).returning();
  const [breads] = await env.db.insert(merchantCategories).values({ merchantId: base.merchant.id, name: "Breads" }).returning();
  const [drinks] = await env.db.insert(merchantCategories).values({ merchantId: base.merchant.id, name: "Drinks" }).returning();
  const add = async (name: string, priceCents: number, categoryId: string, extra: Partial<typeof catalogItems.$inferInsert> = {}) =>
    (await env.db.insert(catalogItems).values({ merchantId: base.merchant.id, name, priceCents, categoryId, ...extra }).returning())[0]!;
  const chicken = await add("Chicken Biryani", 1400, mains!.id, { translations: { hi: { name: "चिकन बिरयानी" }, ur: { name: "چکن بریانی" }, pa: { name: "ਚਿਕਨ ਬਿਰਯਾਨੀ" } } });
  const mutton = await add("Mutton Biryani", 1700, mains!.id);
  const naan = await add("Garlic Naan", 300, breads!.id);
  const lassi = await add("Mango Lassi", 500, drinks!.id);
  const pot = await add("Biryani Pot (serves 10)", 12000, mains!.id, { preorderOnly: true, serves: 10 });
  const [merchant] = await env.db.select().from(merchants).where(eq(merchants.id, base.merchant.id));
  return { ...base, merchant: merchant!, items: { chicken, mutton, naan, lassi, pot } };
}

/** Connect the shop's WhatsApp number through the API (owner). */
export async function connectWhatsapp(env: TestEnv, shop: { merchant: { id: string }; ownerToken: string }, approvedTemplates: string[] = ["eid_preorder"], phoneNumberId = "pn_1001") {
  const r = await req(env, shop.ownerToken, "PUT", `/v1/merchants/${shop.merchant.id}/whatsapp/settings`, { phoneNumberId, displayNumber: "+14165550100", approvedTemplates });
  if (r.status !== 200) throw new Error(`connect failed ${r.status} ${JSON.stringify(r.body)}`);
  return phoneNumberId;
}

export const optIn = (env: TestEnv, merchantId: string, userId: string) => recordOptIn(env.ctx, { id: merchantId } as never, null, { userId, source: "form" });

/** Meta webhook body for one inbound text message. */
export function waBody(phoneNumberId: string, from: string, text: string, id = `wamid.${Math.random().toString(36).slice(2)}`) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "14165550100", phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Aisha" }, wa_id: from.replace(/\D/g, "") }],
              messages: [{ from: from.replace(/\D/g, ""), id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

export const sendInbound = (env: TestEnv, phoneNumberId: string, from: string, text: string, id?: string) =>
  req(env, null, "POST", "/v1/webhooks/whatsapp", waBody(phoneNumberId, from, text, id));

export { hubSignature };
