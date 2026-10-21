/**
 * Shopify (online store + Shopify POS retail): OAuth + webhooks
 * orders/paid, refunds/create, app/uninstalled (+ mandatory GDPR topics).
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 *       https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "../../lib/crypto.js";
import type { ApiContext, Connector, InboundEvent, PurchaseEvent, PurchaseLineEvent } from "../types.js";
import { fullName, header, hmacBase64, isoFrom, requestJson, toCents, verifyHmac } from "../util.js";

export const SHOPIFY_API_VERSION = "2025-01";
export const SHOPIFY_SCOPES = ["read_orders", "read_customers", "read_products", "read_locations"];
export const SHOPIFY_TOPICS = ["orders/paid", "refunds/create", "app/uninstalled"];
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShop(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const shop = s.includes(".") ? s : `${s}.myshopify.com`;
  return SHOP_RE.test(shop) ? shop : null;
}

/** OAuth callback query HMAC: hex HMAC-SHA256 over sorted "k=v" pairs joined with "&" (excluding hmac/signature). */
export function verifyShopifyQuery(secret: string, query: Record<string, string>): boolean {
  const { hmac, signature: _s, ...rest } = query;
  if (!hmac) return false;
  const msg = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  return safeEqual(createHmac("sha256", secret).update(msg).digest("hex"), hmac);
}

const admin = (a: ApiContext, path: string, init: Parameters<typeof requestJson>[2] = {}) =>
  requestJson(a.fetch, `https://${a.credentials.extra?.shop ?? a.externalAccountId}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    ...init,
    headers: { "x-shopify-access-token": a.credentials.accessToken, ...init.headers },
  });

export function shopifyOrderToPurchase(order: any, opts: { categoryByProduct?: Map<string, string>; now: Date }): PurchaseEvent {
  const lines: PurchaseLineEvent[] = (order.line_items ?? []).map((li: any) => {
    const discounts = (li.discount_allocations ?? []).reduce((s: number, d: any) => s + toCents(d.amount), 0) || toCents(li.total_discount);
    const pid = li.product_id != null ? String(li.product_id) : null;
    return {
      amountCents: Math.max(0, toCents(li.price) * Number(li.quantity ?? 1) - discounts),
      externalItemId: pid,
      externalCategoryId: pid ? (opts.categoryByProduct?.get(pid) ?? null) : null,
      quantity: Number(li.quantity ?? 1),
      name: li.title ?? li.name ?? null,
    };
  });
  const c = order.customer ?? {};
  return {
    externalId: String(order.id),
    externalLocationId: order.location_id != null ? String(order.location_id) : null,
    occurredAt: isoFrom(order.processed_at ?? order.created_at, opts.now),
    totalCents: toCents(order.current_subtotal_price ?? order.subtotal_price),
    lines,
    customer: {
      phone: c.phone ?? order.phone ?? order.billing_address?.phone ?? order.shipping_address?.phone ?? null,
      email: c.email ?? order.email ?? order.contact_email ?? null,
      name: fullName(c.first_name, c.last_name) ?? fullName(order.billing_address?.first_name, order.billing_address?.last_name),
      externalId: c.id != null ? String(c.id) : null,
    },
    receiptCode: order.order_number != null ? String(order.order_number) : order.name ? String(order.name).replace(/^#/, "") : null,
  };
}

export function shopifyRefundToPurchase(refund: any, now: Date): PurchaseEvent {
  const lineSubtotal = (refund.refund_line_items ?? []).reduce((s: number, r: any) => s + toCents(r.subtotal), 0);
  const txTotal = (refund.transactions ?? [])
    .filter((t: any) => t.kind === "refund" && t.status === "success")
    .reduce((s: number, t: any) => s + toCents(t.amount), 0);
  return {
    externalId: String(refund.id),
    occurredAt: isoFrom(refund.processed_at ?? refund.created_at, now),
    totalCents: 0,
    lines: [],
    customer: {},
    // Line subtotals are pre-tax, matching what we awarded on; fall back to money refunded.
    refund: { originalExternalId: String(refund.order_id), amountCents: lineSubtotal || txTotal },
  };
}

export function parseShopifyWebhook(body: any, headers: Record<string, string | string[] | undefined>, now: Date): InboundEvent[] {
  const topic = header(headers, "x-shopify-topic") ?? "";
  const shop = header(headers, "x-shopify-shop-domain") ?? null;
  const eventId = header(headers, "x-shopify-webhook-id") ?? header(headers, "x-shopify-event-id") ?? `${topic}:${body?.id ?? ""}`;
  if (topic === "orders/paid") {
    if (body?.financial_status && !["paid", "partially_refunded", "refunded"].includes(body.financial_status)) return [{ eventId, type: topic, accountId: shop, kind: "ignore" }];
    return [{ eventId, type: topic, accountId: shop, kind: "purchase", purchases: [shopifyOrderToPurchase(body, { now })] }];
  }
  if (topic === "refunds/create") return [{ eventId, type: topic, accountId: shop, kind: "refund", purchases: [shopifyRefundToPurchase(body, now)] }];
  if (topic === "app/uninstalled") return [{ eventId, type: topic, accountId: shop, kind: "disconnect" }];
  // customers/data_request, customers/redact, shop/redact: we hold no Shopify customer data beyond the award itself.
  return [{ eventId, type: topic, accountId: shop, kind: "ignore" }];
}

export const shopify: Connector = {
  id: "shopify",
  name: "Shopify",
  category: "ecommerce",
  description: "Award points on Shopify online and Shopify POS orders.",
  auth: "oauth",
  configured: (c) => !!(c.shopify.apiKey && c.shopify.apiSecret),
  connectFields: [{ key: "shop", label: "Shop domain (yourshop.myshopify.com)", required: true }],
  setup: {
    webhookPath: "/v1/webhooks/shopify",
    events: [...SHOPIFY_TOPICS, "customers/data_request", "customers/redact", "shop/redact"],
    scopes: SHOPIFY_SCOPES,
    envVars: ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"],
  },
  authUrl(config, { state, redirectUri, body }) {
    const shop = normalizeShop(body.shop);
    if (!shop) throw new Error("A valid shop domain (yourshop.myshopify.com) is required");
    const q = new URLSearchParams({ client_id: config.shopify.apiKey!, scope: SHOPIFY_SCOPES.join(","), redirect_uri: redirectUri, state });
    return `https://${shop}/admin/oauth/authorize?${q.toString()}`;
  },
  async exchangeCode(config, { code, query }, fetch) {
    const shop = normalizeShop(query.shop);
    if (!shop) throw new Error("Invalid shop");
    if (!verifyShopifyQuery(config.shopify.apiSecret!, query)) throw new Error("Shopify callback HMAC mismatch");
    const r = await requestJson(fetch, `https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      json: { client_id: config.shopify.apiKey, client_secret: config.shopify.apiSecret, code },
    });
    return { credentials: { accessToken: r.access_token, scope: r.scope ?? null, extra: { shop } }, externalAccountId: shop };
  },
  async afterConnect(a) {
    const address = `${a.config.publicApiUrl}/v1/webhooks/shopify`;
    for (const topic of SHOPIFY_TOPICS) {
      try {
        await admin(a, "/webhooks.json", { method: "POST", json: { webhook: { topic, address, format: "json" } } });
      } catch (err) {
        // 422 = already registered.
        if ((err as { status?: number }).status !== 422) throw err;
      }
    }
  },
  verifyWebhook(config, rawBody, headers) {
    const secret = config.shopify.apiSecret;
    return !!secret && verifyHmac(hmacBase64(secret, rawBody), header(headers, "x-shopify-hmac-sha256"));
  },
  parseWebhook(_raw, body, headers) {
    return { events: parseShopifyWebhook(body, headers, new Date()) };
  },
  async resolve(a, ev) {
    // Enrich purchases with product_type as the category (Shopify line items don't carry it).
    const out: PurchaseEvent[] = [];
    for (const p of ev.purchases ?? []) {
      const ids = [...new Set(p.lines.map((l) => l.externalItemId).filter(Boolean))] as string[];
      if (ids.length && !p.refund) {
        try {
          const r = await admin(a, `/products.json?ids=${ids.join(",")}&fields=id,product_type`);
          const map = new Map<string, string>((r.products ?? []).filter((x: any) => x.product_type).map((x: any) => [String(x.id), String(x.product_type)]));
          p.lines = p.lines.map((l) => ({ ...l, externalCategoryId: l.externalCategoryId ?? (l.externalItemId ? (map.get(l.externalItemId) ?? null) : null) }));
        } catch {
          /* award without categories rather than fail */
        }
      }
      out.push(p);
    }
    return out;
  },
  async sync(a) {
    const { locations = [] } = await admin(a, "/locations.json");
    const { products = [] } = await admin(a, "/products.json?limit=250&fields=id,product_type");
    const types = [...new Set(products.map((p: any) => p.product_type).filter(Boolean))] as string[];
    return {
      externalLocations: locations.map((l: any) => ({ id: String(l.id), name: l.name, detail: l.address1 ?? null })),
      externalCategories: types.map((t) => ({ id: t, name: t })),
    };
  },
};
