/**
 * Square: OAuth + webhooks (payment.updated, order.updated, refund.updated).
 * Docs: https://developer.squareup.com/docs/oauth-api/overview,
 *       https://developer.squareup.com/docs/webhooks/step3validate
 */
import type { Config } from "../../config.js";
import type { ApiContext, Connector, Credentials, InboundEvent, PurchaseEvent, PurchaseLineEvent, SyncResult } from "../types.js";
import { fullName, header, hmacBase64, isoFrom, requestJson, verifyHmac } from "../util.js";

export const SQUARE_VERSION = "2025-01-23";
export const SQUARE_SCOPES = ["MERCHANT_PROFILE_READ", "PAYMENTS_READ", "ORDERS_READ", "CUSTOMERS_READ", "ITEMS_READ"];

export const squareBase = (config: Config) =>
  config.square.environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

const api = (a: ApiContext, path: string, init: Parameters<typeof requestJson>[2] = {}) =>
  requestJson(a.fetch, `${squareBase(a.config)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${a.credentials.accessToken}`, "square-version": SQUARE_VERSION, ...init.headers },
  });

function tokenToCreds(r: { access_token: string; refresh_token?: string; expires_at?: string; merchant_id?: string }): Credentials {
  return { accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: r.expires_at ?? null };
}

/** Parse only: everything Square-specific about the webhook payload shape lives here. */
export function parseSquareWebhook(body: any): InboundEvent[] {
  const type = String(body?.type ?? "");
  const eventId = String(body?.event_id ?? "");
  const accountId = body?.merchant_id ? String(body.merchant_id) : null;
  const obj = body?.data?.object ?? {};
  if (!eventId) return [];
  if (type === "payment.updated" || type === "payment.created") {
    const p = obj.payment ?? {};
    if (p.status !== "COMPLETED" || !p.order_id) return [{ eventId, type, accountId, kind: "ignore" }];
    return [
      {
        eventId,
        type,
        accountId,
        kind: "purchase",
        ref: {
          object: "order",
          id: String(p.order_id),
          paymentId: p.id,
          customerId: p.customer_id ?? null,
          receiptNumber: p.receipt_number ?? null,
        },
      },
    ];
  }
  if (type === "order.updated" || type === "order.created") {
    const o = obj.order_updated ?? obj.order_created ?? {};
    if (o.state !== "COMPLETED" || !o.order_id) return [{ eventId, type, accountId, kind: "ignore" }];
    return [{ eventId, type, accountId, kind: "purchase", ref: { object: "order", id: String(o.order_id) } }];
  }
  if (type === "refund.updated" || type === "refund.created") {
    const r = obj.refund ?? {};
    if (r.status !== "COMPLETED") return [{ eventId, type, accountId, kind: "ignore" }];
    return [
      {
        eventId,
        type,
        accountId,
        kind: "refund",
        ref: { object: "refund", id: String(r.id), paymentId: r.payment_id ?? null, amountCents: Number(r.amount_money?.amount ?? 0) },
      },
    ];
  }
  if (type === "oauth.authorization.revoked") return [{ eventId, type, accountId, kind: "disconnect" }];
  return [{ eventId, type, accountId, kind: "ignore" }];
}

/** Map a Square order (+ catalog items + customer) to a PurchaseEvent. */
export function squareOrderToPurchase(
  order: any,
  opts: { categoryByVariation?: Map<string, string>; customer?: any; receiptNumber?: string | null; now: Date },
): PurchaseEvent {
  const lines: PurchaseLineEvent[] = (order.line_items ?? []).map((li: any) => ({
    amountCents: Math.max(0, Number(li.total_money?.amount ?? 0) - Number(li.total_tax_money?.amount ?? 0)),
    externalItemId: li.catalog_object_id ?? null,
    externalCategoryId: li.catalog_object_id ? (opts.categoryByVariation?.get(li.catalog_object_id) ?? null) : null,
    quantity: Math.max(1, Math.round(Number(li.quantity ?? 1))),
    name: li.name ?? null,
  }));
  const total = Number(order.total_money?.amount ?? 0) - Number(order.total_tax_money?.amount ?? 0) - Number(order.total_tip_money?.amount ?? 0);
  const c = opts.customer ?? {};
  const paymentId = order.tenders?.[0]?.payment_id ?? order.tenders?.[0]?.id ?? null;
  return {
    externalId: String(order.id),
    externalLocationId: order.location_id ?? null,
    occurredAt: isoFrom(order.closed_at ?? order.created_at, opts.now),
    totalCents: Math.max(0, total),
    lines,
    customer: { phone: c.phone_number ?? null, email: c.email_address ?? null, name: fullName(c.given_name, c.family_name), externalId: c.id ?? null },
    receiptCode: opts.receiptNumber ?? (paymentId ? String(paymentId).slice(0, 4).toUpperCase() : null),
  };
}

async function loadOrderPurchase(a: ApiContext, orderId: string, hints: { customerId?: string | null; receiptNumber?: string | null }) {
  const { order } = await api(a, `/v2/orders/${encodeURIComponent(orderId)}`);
  if (!order) return [];
  const paid = order.state === "COMPLETED" || (order.state === "OPEN" && Number(order.net_amount_due_money?.amount ?? 1) === 0 && (order.tenders?.length ?? 0) > 0);
  if (!paid) return [];
  // Category of each line: variation -> item -> category.
  const variationIds = [...new Set((order.line_items ?? []).map((l: any) => l.catalog_object_id).filter(Boolean))] as string[];
  const categoryByVariation = new Map<string, string>();
  if (variationIds.length) {
    const r = await api(a, "/v2/catalog/batch-retrieve", { method: "POST", json: { object_ids: variationIds, include_related_objects: true } });
    const items = new Map<string, any>();
    for (const o of [...(r.objects ?? []), ...(r.related_objects ?? [])]) if (o.type === "ITEM") items.set(o.id, o);
    for (const o of r.objects ?? []) {
      if (o.type !== "ITEM_VARIATION") continue;
      const item = items.get(o.item_variation_data?.item_id);
      const cat = item?.item_data?.categories?.[0]?.id ?? item?.item_data?.category_id ?? item?.item_data?.reporting_category?.id;
      if (cat) categoryByVariation.set(o.id, cat);
    }
  }
  const customerId = order.customer_id ?? hints.customerId ?? null;
  let customer: any = null;
  if (customerId) {
    try {
      customer = (await api(a, `/v2/customers/${encodeURIComponent(customerId)}`)).customer ?? null;
    } catch {
      customer = null; // deleted customer: purchase becomes unmatched instead of failing
    }
  }
  return [squareOrderToPurchase(order, { categoryByVariation, customer, receiptNumber: hints.receiptNumber, now: a.now() })];
}

async function listAll(a: ApiContext, path: string, key: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await api(a, cursor ? `${path}${sep}cursor=${encodeURIComponent(cursor)}` : path);
    out.push(...(r[key] ?? []));
    cursor = r.cursor;
    if (!cursor) break;
  }
  return out;
}

export const square: Connector = {
  id: "square",
  name: "Square",
  category: "pos",
  description: "Award points automatically on every Square POS sale. Refunds reverse points.",
  auth: "oauth",
  configured: (c) => !!(c.square.appId && c.square.appSecret),
  setup: {
    webhookPath: "/v1/webhooks/square",
    events: ["payment.updated", "order.updated", "refund.updated", "oauth.authorization.revoked"],
    scopes: SQUARE_SCOPES,
    envVars: ["SQUARE_APP_ID", "SQUARE_APP_SECRET", "SQUARE_WEBHOOK_SIGNATURE_KEY", "SQUARE_ENV"],
  },
  authUrl(config, { state, redirectUri }) {
    const q = new URLSearchParams({ client_id: config.square.appId!, scope: SQUARE_SCOPES.join(" "), session: "false", state, redirect_uri: redirectUri });
    return `${squareBase(config)}/oauth2/authorize?${q.toString()}`;
  },
  async exchangeCode(config, { code, redirectUri }, fetch) {
    const r = await requestJson(fetch, `${squareBase(config)}/oauth2/token`, {
      method: "POST",
      headers: { "square-version": SQUARE_VERSION },
      json: { client_id: config.square.appId, client_secret: config.square.appSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri },
    });
    return { credentials: tokenToCreds(r), externalAccountId: String(r.merchant_id) };
  },
  async refresh(config, creds, fetch) {
    const r = await requestJson(fetch, `${squareBase(config)}/oauth2/token`, {
      method: "POST",
      headers: { "square-version": SQUARE_VERSION },
      json: { client_id: config.square.appId, client_secret: config.square.appSecret, refresh_token: creds.refreshToken, grant_type: "refresh_token" },
    });
    return { ...creds, ...tokenToCreds(r), refreshToken: r.refresh_token ?? creds.refreshToken };
  },
  async revoke(a) {
    await requestJson(a.fetch, `${squareBase(a.config)}/oauth2/revoke`, {
      method: "POST",
      headers: { authorization: `Client ${a.config.square.appSecret}`, "square-version": SQUARE_VERSION },
      json: { client_id: a.config.square.appId, access_token: a.credentials.accessToken },
    });
  },
  verifyWebhook(config, rawBody, headers, url) {
    const key = config.square.webhookSignatureKey;
    if (!key) return false;
    return verifyHmac(hmacBase64(key, url + rawBody), header(headers, "x-square-hmacsha256-signature"));
  },
  parseWebhook(_raw, body) {
    return { events: parseSquareWebhook(body) };
  },
  async resolve(a, ev) {
    if (!ev.ref) return [];
    if (ev.ref.object === "order") {
      return loadOrderPurchase(a, ev.ref.id, { customerId: ev.ref.customerId as string | null, receiptNumber: ev.ref.receiptNumber as string | null });
    }
    if (ev.ref.object === "refund") {
      const paymentId = ev.ref.paymentId as string | null;
      if (!paymentId) return [];
      const { payment } = await api(a, `/v2/payments/${encodeURIComponent(paymentId)}`);
      if (!payment?.order_id) return [];
      return [
        {
          externalId: ev.ref.id,
          externalLocationId: payment.location_id ?? null,
          occurredAt: a.now().toISOString(),
          totalCents: 0,
          lines: [],
          customer: {},
          refund: {
            originalExternalId: String(payment.order_id),
            amountCents: Number(ev.ref.amountCents ?? 0),
            originalTotalCents: Number(payment.amount_money?.amount ?? 0) || null,
          },
        },
      ];
    }
    return [];
  },
  async sync(a): Promise<SyncResult> {
    const { locations = [] } = await api(a, "/v2/locations");
    const cats = await listAll(a, "/v2/catalog/list?types=CATEGORY", "objects");
    return {
      externalLocations: locations
        .filter((l: any) => l.status !== "INACTIVE")
        .map((l: any) => ({ id: l.id, name: l.name, detail: [l.address?.address_line_1, l.address?.locality].filter(Boolean).join(", ") || null })),
      externalCategories: cats.map((c: any) => ({ id: c.id, name: c.category_data?.name ?? c.id })),
    };
  },
};
