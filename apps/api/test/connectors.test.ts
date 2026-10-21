import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { clover, cloverOrderToPurchase } from "../src/connectors/clover/index.js";
import { placeIdFromInput } from "../src/connectors/google-business/index.js";
import { lightspeed, parseLightspeedWebhook } from "../src/connectors/lightspeed/index.js";
import { normalizeShop, parseShopifyWebhook, shopify, verifyShopifyQuery } from "../src/connectors/shopify/index.js";
import { parseSquareWebhook, square, squareOrderToPurchase } from "../src/connectors/square/index.js";
import { parseToastWebhook, toast, toastOrderToEvents } from "../src/connectors/toast/index.js";
import { scaleLines, toCents } from "../src/connectors/util.js";
import { twilioSignature, verifyTwilioSignature } from "../src/providers/twilio.js";
import { CLOVER_MID, b64hmac, cloverOrder, cloverPayment, hexhmac, lightspeedSale, shopifyOrderPaid, squareOrder, squarePaymentUpdated, toastOrder } from "./integrations-support.js";

const config = {
  ...loadConfig({ NODE_ENV: "test" }),
};
config.square = { ...config.square, webhookSignatureKey: "sq_sig_key" };
config.clover = { ...config.clover, webhookAuthCode: "clover-auth-code" };
config.shopify = { apiKey: "shp_key", apiSecret: "shp_secret" };
config.lightspeed = { clientId: "ls_id", clientSecret: "ls_secret" };
config.toast = { ...config.toast, webhookSecret: "toast_secret" };

describe("webhook signature verification", () => {
  it("square: HMAC-SHA256 over notification URL + raw body", () => {
    const url = "https://api.example.com/v1/webhooks/square";
    const raw = JSON.stringify(squarePaymentUpdated({ eventId: "e1", orderId: "O1" }));
    const good = b64hmac("sq_sig_key", url + raw);
    expect(square.verifyWebhook!(config, raw, { "x-square-hmacsha256-signature": good }, url)).toBe(true);
    expect(square.verifyWebhook!(config, raw, { "x-square-hmacsha256-signature": good }, "https://evil.example.com/v1/webhooks/square")).toBe(false);
    expect(square.verifyWebhook!(config, raw + " ", { "x-square-hmacsha256-signature": good }, url)).toBe(false);
    expect(square.verifyWebhook!(config, raw, {}, url)).toBe(false);
    expect(square.verifyWebhook!({ ...config, square: { ...config.square, webhookSignatureKey: undefined } }, raw, { "x-square-hmacsha256-signature": good }, url)).toBe(false);
  });

  it("clover: verification handshake passes, then X-Clover-Auth must match", () => {
    expect(clover.verifyWebhook!(config, JSON.stringify({ verificationCode: "abc-123" }), {}, "")).toBe(true);
    const raw = JSON.stringify({ appId: "APP", merchants: { [CLOVER_MID]: [{ objectId: "P:PAYCLV1", type: "CREATE", ts: 1 }] } });
    expect(clover.verifyWebhook!(config, raw, { "x-clover-auth": "clover-auth-code" }, "")).toBe(true);
    expect(clover.verifyWebhook!(config, raw, { "x-clover-auth": "wrong" }, "")).toBe(false);
    expect(clover.verifyWebhook!(config, raw, {}, "")).toBe(false);
    // A "handshake" smuggling extra fields is not a handshake.
    expect(clover.verifyWebhook!(config, JSON.stringify({ verificationCode: "x", merchants: {} }), {}, "")).toBe(false);
  });

  it("shopify: X-Shopify-Hmac-Sha256 over raw body; OAuth callback query HMAC", () => {
    const raw = JSON.stringify(shopifyOrderPaid(1, "+14165550123"));
    expect(shopify.verifyWebhook!(config, raw, { "x-shopify-hmac-sha256": b64hmac("shp_secret", raw) }, "")).toBe(true);
    expect(shopify.verifyWebhook!(config, raw, { "x-shopify-hmac-sha256": b64hmac("other", raw) }, "")).toBe(false);
    const q: Record<string, string> = { code: "c1", shop: "corner-shop.myshopify.com", state: "s", timestamp: "1700000000" };
    const msg = Object.keys(q).sort().map((k) => `${k}=${q[k]}`).join("&");
    const hmac = createHmac("sha256", "shp_secret").update(msg).digest("hex");
    expect(verifyShopifyQuery("shp_secret", { ...q, hmac })).toBe(true);
    expect(verifyShopifyQuery("shp_secret", { ...q, shop: "evil.myshopify.com", hmac })).toBe(false);
    expect(normalizeShop("https://Corner-Shop.myshopify.com/admin")).toBe("corner-shop.myshopify.com");
    expect(normalizeShop("corner-shop")).toBe("corner-shop.myshopify.com");
    expect(normalizeShop("evil.com")).toBeNull();
  });

  it("lightspeed: X-Signature signature=<hex> over raw form body", () => {
    const raw = new URLSearchParams({ type: "sale.update", domain_prefix: "cornershop", payload: JSON.stringify(lightspeedSale("4165550123")) }).toString();
    expect(lightspeed.verifyWebhook!(config, raw, { "x-signature": `signature=${hexhmac("ls_secret", raw)}, algorithm=HMAC-SHA256` }, "")).toBe(true);
    expect(lightspeed.verifyWebhook!(config, raw, { "x-signature": `signature=${hexhmac("nope", raw)}, algorithm=HMAC-SHA256` }, "")).toBe(false);
    expect(lightspeed.verifyWebhook!(config, raw, {}, "")).toBe(false);
  });

  it("toast: Toast-Signature base64 HMAC over raw body", () => {
    const raw = JSON.stringify({ guid: "evt1", eventCategory: "orders", details: { orderGuid: "o1" } });
    expect(toast.verifyWebhook!(config, raw, { "toast-signature": b64hmac("toast_secret", raw) }, "")).toBe(true);
    expect(toast.verifyWebhook!(config, raw, { "toast-signature": b64hmac("x", raw) }, "")).toBe(false);
  });

  it("twilio: X-Twilio-Signature = base64 HMAC-SHA1(url + sorted params)", () => {
    const url = "https://api.example.com/v1/webhooks/twilio/sms";
    const params = { From: "+14165550123", Body: "STOP", To: "+14165550000", MessageSid: "SM1" };
    // Reference value computed per Twilio's documented algorithm.
    const data = url + "BodySTOP" + "From+14165550123" + "MessageSidSM1" + "To+14165550000";
    const expected = createHmac("sha1", "tw_token").update(data).digest("base64");
    expect(twilioSignature("tw_token", url, params)).toBe(expected);
    expect(verifyTwilioSignature("tw_token", url, params, expected)).toBe(true);
    expect(verifyTwilioSignature("tw_token", url, { ...params, Body: "START" }, expected)).toBe(false);
    expect(verifyTwilioSignature("tw_token", url, params, undefined)).toBe(false);
  });
});

describe("payload normalization", () => {
  const now = new Date("2026-11-03T15:00:00Z");

  it("square: payment + order events point at the same order; lines are pre-tax with categories", () => {
    const [pay] = parseSquareWebhook(squarePaymentUpdated({ eventId: "e1", orderId: "ORDER_1" }));
    expect(pay).toMatchObject({ kind: "purchase", accountId: "MLSQ2TESTMERCHANT", ref: { object: "order", id: "ORDER_1" } });
    const [pending] = parseSquareWebhook(squarePaymentUpdated({ eventId: "e2", orderId: "ORDER_1", status: "APPROVED" }));
    expect(pending!.kind).toBe("ignore");
    const p = squareOrderToPurchase(squareOrder("ORDER_1").order, { categoryByVariation: new Map([["VAR_RX", "CAT_RX"]]), customer: { phone_number: "+14165550111" }, now });
    expect(p.externalId).toBe("ORDER_1");
    expect(p.totalCents).toBe(5000);
    expect(p.lines.map((l) => [l.amountCents, l.externalCategoryId])).toEqual([
      [3000, null],
      [2000, "CAT_RX"],
    ]);
    expect(p.customer.phone).toBe("+14165550111");
  });

  it("clover: per-unit lines scaled to the pre-tax payment amount", () => {
    const p = cloverOrderToPurchase(cloverPayment, cloverOrder("C1"), { categoryByItem: new Map([["ITEMBAGEL", "CAT_BAKERY"]]), merchantId: CLOVER_MID, now });
    expect(p.totalCents).toBe(2000);
    expect(p.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(2000);
    expect(p.lines[1]!.externalCategoryId).toBe("CAT_BAKERY");
    expect(p.externalLocationId).toBe(CLOVER_MID);
  });

  it("shopify: discounts allocated per line; refund uses pre-tax line subtotals", () => {
    const [ev] = parseShopifyWebhook(shopifyOrderPaid(55, "+14165550199"), { "x-shopify-topic": "orders/paid", "x-shopify-shop-domain": "corner-shop.myshopify.com", "x-shopify-webhook-id": "w1" }, now);
    const p = ev!.purchases![0]!;
    expect(p.lines.map((l) => l.amountCents)).toEqual([3000, 1500]);
    expect(p.totalCents).toBe(4500);
    expect(p.receiptCode).toBe("1042");
    expect(ev!.eventId).toBe("w1");
  });

  it("lightspeed: closed sales are purchases; returns (negative totals) are refunds", () => {
    const [ev] = parseLightspeedWebhook({ type: "sale.update", domain_prefix: "cornershop", payload: JSON.stringify(lightspeedSale("4165550123")) });
    expect(ev!.kind).toBe("purchase");
    expect(ev!.purchases![0]!.totalCents).toBe(2550);
    const ret = { ...lightspeedSale(null, -10), id: "ret1", return_for: "0af7b240-ab00-11ed-8d2b-ls1", register_sale_products: [] };
    const [rev] = parseLightspeedWebhook({ type: "sale.update", domain_prefix: "cornershop", payload: JSON.stringify(ret) });
    expect(rev!.kind).toBe("refund");
    expect(rev!.purchases![0]!.refund).toMatchObject({ originalExternalId: "0af7b240-ab00-11ed-8d2b-ls1", amountCents: 1000 });
    const [open] = parseLightspeedWebhook({ type: "sale.update", domain_prefix: "cornershop", payload: JSON.stringify({ ...lightspeedSale(null), status: "SAVED" }) });
    expect(open!.kind).toBe("ignore");
  });

  it("toast: paid checks become a purchase with sales categories; refunds are cumulative", () => {
    const { purchase, refunds } = toastOrderToEvents(toastOrder("+14165550177", 10), "rest-guid", now);
    expect(purchase!.totalCents).toBe(4000);
    expect(purchase!.lines.map((l) => l.externalCategoryId)).toEqual(["SC_FOOD", "SC_ALCOHOL"]);
    expect(refunds[0]!.refund).toMatchObject({ amountCents: 1000, cumulative: true, originalTotalCents: 4520 });
    const [ev] = parseToastWebhook({ guid: "evt9", eventCategory: "orders", eventType: "order_updated", details: { restaurantGuid: "rest-guid", order: toastOrder(null) } }, {});
    expect(ev).toMatchObject({ kind: "purchase", accountId: "rest-guid", ref: { object: "order" } });
  });

  it("helpers", () => {
    expect(toCents("12.345")).toBe(1235);
    expect(toCents(null)).toBe(0);
    const scaled = scaleLines([{ amountCents: 1000 }, { amountCents: 3000 }], 2000);
    expect(scaled.reduce((s, l) => s + l.amountCents, 0)).toBe(2000);
    expect(placeIdFromInput({ listingUrl: "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4" })).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });
});
