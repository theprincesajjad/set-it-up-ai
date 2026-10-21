/**
 * Clover: OAuth v2 (expiring tokens) + app webhooks.
 * Docs: https://docs.clover.com/dev/docs/use-oauth, https://docs.clover.com/dev/docs/webhooks
 *
 * Webhook payload: { appId, merchants: { <mId>: [{ objectId: "P:<paymentId>", type: "CREATE"|"UPDATE"|"DELETE", ts }] } }
 * The first POST after configuring the URL is { verificationCode } (handshake);
 * after that every POST carries X-Clover-Auth = the app's auth code.
 */
import type { Config } from "../../config.js";
import type { ApiContext, Connector, Credentials, InboundEvent, PurchaseEvent, PurchaseLineEvent } from "../types.js";
import { fullName, header, isoFrom, requestJson, scaleLines, verifyHmac } from "../util.js";

export const cloverOauthBase = (c: Config) => (c.clover.environment === "production" ? "https://www.clover.com" : "https://sandbox.dev.clover.com");
export const cloverApiBase = (c: Config) => (c.clover.environment === "production" ? "https://api.clover.com" : "https://apisandbox.dev.clover.com");

const api = (a: ApiContext, path: string) =>
  requestJson(a.fetch, `${cloverApiBase(a.config)}/v3/merchants/${encodeURIComponent(a.externalAccountId ?? "")}${path}`, {
    headers: { authorization: `Bearer ${a.credentials.accessToken}` },
  });

const tokenCreds = (r: any): Credentials => ({
  accessToken: r.access_token,
  refreshToken: r.refresh_token ?? null,
  expiresAt: r.access_token_expiration ? new Date(Number(r.access_token_expiration) * 1000).toISOString() : null,
});

export function parseCloverWebhook(body: any): { events: InboundEvent[]; verificationCode?: string } {
  if (body?.verificationCode) return { events: [], verificationCode: String(body.verificationCode) };
  const events: InboundEvent[] = [];
  for (const [mId, updates] of Object.entries<any[]>(body?.merchants ?? {})) {
    for (const u of updates ?? []) {
      const objectId = String(u.objectId ?? "");
      const [prefix, id] = objectId.split(":");
      const eventId = `${mId}:${objectId}:${u.type}:${u.ts ?? ""}`;
      const type = `${prefix}.${String(u.type ?? "").toLowerCase()}`;
      if (prefix === "P" && id && u.type === "CREATE") events.push({ eventId, type, accountId: mId, kind: "purchase", ref: { object: "payment", id } });
      else if (prefix === "P" && id && u.type === "UPDATE") events.push({ eventId, type, accountId: mId, kind: "refund", ref: { object: "payment", id } });
      else if (prefix === "A" && u.type === "DELETE") events.push({ eventId, type, accountId: mId, kind: "disconnect" });
      else events.push({ eventId, type, accountId: mId, kind: "ignore" });
    }
  }
  return { events };
}

/** Clover line items are one row per unit; price is per unit in cents, unitQty in thousandths for weighed items. */
export function cloverOrderToPurchase(
  payment: any,
  order: any,
  opts: { categoryByItem: Map<string, string>; customer?: any; merchantId: string; now: Date },
): PurchaseEvent {
  const rawLines: PurchaseLineEvent[] = (order?.lineItems?.elements ?? [])
    .filter((li: any) => !li.refunded && li.isRevenue !== false)
    .map((li: any) => {
      const qty = li.unitQty ? Number(li.unitQty) / 1000 : 1;
      return {
        amountCents: Math.round(Number(li.price ?? 0) * qty),
        externalItemId: li.item?.id ?? null,
        externalCategoryId: li.item?.id ? (opts.categoryByItem.get(li.item.id) ?? null) : null,
        quantity: Math.max(1, Math.round(qty)),
        name: li.name ?? null,
      };
    });
  const net = Math.max(0, Number(payment.amount ?? 0) - Number(payment.taxAmount ?? 0));
  const c = opts.customer ?? {};
  return {
    externalId: String(order?.id ?? payment.id),
    externalLocationId: opts.merchantId,
    occurredAt: isoFrom(payment.createdTime, opts.now),
    totalCents: net,
    lines: scaleLines(rawLines, net),
    customer: {
      phone: c.phoneNumbers?.elements?.[0]?.phoneNumber ?? null,
      email: c.emailAddresses?.elements?.[0]?.emailAddress ?? null,
      name: fullName(c.firstName, c.lastName),
      externalId: c.id ?? null,
    },
    receiptCode: order?.id ? String(order.id) : String(payment.id),
  };
}

export const clover: Connector = {
  id: "clover",
  name: "Clover",
  category: "pos",
  description: "Award points automatically on Clover payments. Refunds reverse points.",
  auth: "oauth",
  configured: (c) => !!(c.clover.appId && c.clover.appSecret),
  setup: {
    webhookPath: "/v1/webhooks/clover",
    events: ["Payments (P)", "Orders (O)", "App (A)"],
    scopes: ["Merchant R", "Customers R", "Orders R", "Payments R", "Inventory R"],
    envVars: ["CLOVER_APP_ID", "CLOVER_APP_SECRET", "CLOVER_WEBHOOK_AUTH_CODE", "CLOVER_ENV"],
  },
  authUrl(config, { state, redirectUri }) {
    const q = new URLSearchParams({ client_id: config.clover.appId!, redirect_uri: redirectUri, state, response_type: "code" });
    return `${cloverOauthBase(config)}/oauth/v2/authorize?${q.toString()}`;
  },
  async exchangeCode(config, { code, query }, fetch) {
    if (!query.merchant_id) throw new Error("Clover callback is missing merchant_id");
    const r = await requestJson(fetch, `${cloverApiBase(config)}/oauth/v2/token`, {
      method: "POST",
      json: { client_id: config.clover.appId, client_secret: config.clover.appSecret, code },
    });
    return { credentials: tokenCreds(r), externalAccountId: query.merchant_id };
  },
  async refresh(config, creds, fetch) {
    const r = await requestJson(fetch, `${cloverApiBase(config)}/oauth/v2/refresh`, {
      method: "POST",
      json: { client_id: config.clover.appId, refresh_token: creds.refreshToken },
    });
    return { ...creds, ...tokenCreds(r), refreshToken: r.refresh_token ?? creds.refreshToken };
  },
  verifyWebhook(config, rawBody, headers) {
    // The one-time handshake carries no auth header; it only echoes a code we log.
    try {
      const b = JSON.parse(rawBody);
      if (b && typeof b === "object" && "verificationCode" in b && Object.keys(b).length === 1) return true;
    } catch {
      return false;
    }
    const code = config.clover.webhookAuthCode;
    return !!code && verifyHmac(code, header(headers, "x-clover-auth"));
  },
  parseWebhook(_raw, body) {
    const r = parseCloverWebhook(body);
    if (r.verificationCode) {
      console.info(`[clover] webhook verification code: ${r.verificationCode} (paste it into the Clover developer dashboard)`);
      return { events: [], reply: { status: 200, body: { ok: true } } };
    }
    return { events: r.events };
  },
  async resolve(a, ev) {
    if (!ev.ref || ev.ref.object !== "payment") return [];
    const payment = await api(a, `/payments/${encodeURIComponent(ev.ref.id)}?expand=order,refunds`);
    if (ev.kind === "refund") {
      const refunds: any[] = payment.refunds?.elements ?? [];
      return refunds.map((r) => ({
        externalId: String(r.id),
        externalLocationId: a.externalAccountId,
        occurredAt: isoFrom(r.createdTime, a.now()),
        totalCents: 0,
        lines: [],
        customer: {},
        refund: { originalExternalId: String(payment.order?.id ?? payment.id), amountCents: Number(r.amount ?? 0), originalTotalCents: Number(payment.amount ?? 0) || null },
      }));
    }
    if (payment.result && payment.result !== "SUCCESS") return [];
    const orderId = payment.order?.id;
    const order = orderId ? await api(a, `/orders/${encodeURIComponent(orderId)}?expand=lineItems,customers`) : null;
    const itemIds = [...new Set((order?.lineItems?.elements ?? []).map((l: any) => l.item?.id).filter(Boolean))] as string[];
    const categoryByItem = new Map<string, string>();
    for (const itemId of itemIds.slice(0, 50)) {
      try {
        const item = await api(a, `/items/${encodeURIComponent(itemId)}?expand=categories`);
        const cat = item.categories?.elements?.[0]?.id;
        if (cat) categoryByItem.set(itemId, cat);
      } catch {
        /* custom/deleted item: no category */
      }
    }
    const customerId = order?.customers?.elements?.[0]?.id;
    let customer: any = null;
    if (customerId) {
      try {
        customer = await api(a, `/customers/${encodeURIComponent(customerId)}?expand=phoneNumbers,emailAddresses`);
      } catch {
        customer = null;
      }
    }
    return [cloverOrderToPurchase(payment, order, { categoryByItem, customer, merchantId: a.externalAccountId ?? "", now: a.now() })];
  },
  async sync(a) {
    const m = await api(a, "");
    const cats = await api(a, "/categories?limit=1000");
    return {
      externalLocations: [{ id: a.externalAccountId ?? m.id, name: m.name ?? "Clover merchant" }],
      externalCategories: (cats.elements ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    };
  },
};
