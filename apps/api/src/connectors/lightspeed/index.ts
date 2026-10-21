/**
 * Lightspeed Retail (X-Series, formerly Vend): OAuth + `sale.update` webhooks.
 * Docs: https://x-series-api.lightspeedhq.com/docs/authorization, https://x-series-api.lightspeedhq.com/docs/webhooks
 *
 * Webhooks are POSTed form-encoded: type=sale.update&domain_prefix=..&retailer_id=..&payload=<JSON sale>.
 * X-Signature: "signature=<hex HMAC-SHA256(raw body, client secret)>, algorithm=HMAC-SHA256".
 * See docs/engineering/connectors.md for the parts of the payload we treat as uncertain.
 */
import type { ApiContext, Connector, InboundEvent, PurchaseEvent, PurchaseLineEvent } from "../types.js";
import { expiresAtFrom, fullName, header, hmacHex, isoFrom, requestJson, toCents, verifyHmac } from "../util.js";

const CLOSED = new Set(["CLOSED", "ONACCOUNT_CLOSED", "LAYBY_CLOSED"]);
const base = (domainPrefix: string) => `https://${domainPrefix}.retail.lightspeed.app`;

const api = (a: ApiContext, path: string, init: Parameters<typeof requestJson>[2] = {}) =>
  requestJson(a.fetch, `${base(a.credentials.extra?.domainPrefix ?? a.externalAccountId ?? "")}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${a.credentials.accessToken}`, ...init.headers },
  });

/** Normalize one X-Series sale. Negative totals are returns (refunds). */
export function lightspeedSaleToPurchase(sale: any, now: Date): PurchaseEvent {
  const lines: PurchaseLineEvent[] = (sale.register_sale_products ?? sale.line_items ?? [])
    .filter((l: any) => l.status !== "VOIDED" && !l.is_return)
    .map((l: any) => {
      const qty = Number(l.quantity ?? 1);
      const total = l.price_total != null ? toCents(l.price_total) : toCents(l.price) * qty;
      return {
        amountCents: Math.max(0, total),
        externalItemId: l.product_id ?? null,
        externalCategoryId: l.product_type_id ?? null,
        quantity: Math.max(1, Math.round(qty)),
        name: l.name ?? null,
      };
    });
  const c = sale.customer ?? {};
  const totalCents = sale.total_price != null ? toCents(sale.total_price) : toCents(sale.totals?.total_price);
  const ev: PurchaseEvent = {
    externalId: String(sale.id),
    externalLocationId: sale.outlet_id ?? null,
    occurredAt: isoFrom(sale.sale_date ?? sale.created_at, now),
    totalCents: Math.max(0, totalCents),
    lines,
    customer: { phone: c.mobile ?? c.phone ?? null, email: c.email ?? null, name: fullName(c.first_name, c.last_name), externalId: sale.customer_id ?? c.id ?? null },
    receiptCode: sale.invoice_number ? String(sale.invoice_number) : null,
  };
  if (totalCents < 0) {
    ev.refund = { originalExternalId: String(sale.return_for ?? sale.parent_sale_id ?? ""), amountCents: -totalCents };
  }
  return ev;
}

export function parseLightspeedWebhook(body: any): InboundEvent[] {
  const type = String(body?.type ?? "");
  const accountId = body?.domain_prefix ? String(body.domain_prefix) : null;
  let sale: any = body?.payload;
  if (typeof sale === "string") {
    try {
      sale = JSON.parse(sale);
    } catch {
      return [];
    }
  }
  if (!sale?.id) return [];
  const eventId = `${sale.id}:${sale.version ?? sale.updated_at ?? sale.status ?? ""}`;
  if (type !== "sale.update" || !CLOSED.has(String(sale.status ?? "")))
    return [{ eventId, type, accountId, kind: "ignore" }];
  const p = lightspeedSaleToPurchase(sale, new Date());
  if (p.refund && !p.refund.originalExternalId) return [{ eventId, type, accountId, kind: "ignore" }];
  return [{ eventId, type, accountId, kind: p.refund ? "refund" : "purchase", purchases: [p] }];
}

export const lightspeed: Connector = {
  id: "lightspeed",
  name: "Lightspeed Retail (X-Series)",
  category: "pos",
  description: "Award points on Lightspeed Retail sales; returns reverse points.",
  auth: "oauth",
  configured: (c) => !!(c.lightspeed.clientId && c.lightspeed.clientSecret),
  setup: { webhookPath: "/v1/webhooks/lightspeed", events: ["sale.update"], scopes: [], envVars: ["LIGHTSPEED_CLIENT_ID", "LIGHTSPEED_CLIENT_SECRET"] },
  authUrl(config, { state, redirectUri }) {
    const q = new URLSearchParams({ response_type: "code", client_id: config.lightspeed.clientId!, redirect_uri: redirectUri, state });
    return `https://secure.retail.lightspeed.app/connect?${q.toString()}`;
  },
  async exchangeCode(config, { code, redirectUri, query }, fetch) {
    const dp = query.domain_prefix;
    if (!dp || !/^[a-z0-9-]+$/i.test(dp)) throw new Error("Lightspeed callback is missing domain_prefix");
    const r = await requestJson(fetch, `${base(dp)}/api/1.0/token`, {
      method: "POST",
      form: { code, client_id: config.lightspeed.clientId!, client_secret: config.lightspeed.clientSecret!, grant_type: "authorization_code", redirect_uri: redirectUri },
    });
    return {
      credentials: {
        accessToken: r.access_token,
        refreshToken: r.refresh_token ?? null,
        expiresAt: r.expires ? new Date(Number(r.expires) * 1000).toISOString() : expiresAtFrom(new Date(), r.expires_in),
        extra: { domainPrefix: r.domain_prefix ?? dp },
      },
      externalAccountId: r.domain_prefix ?? dp,
    };
  },
  async refresh(config, creds, fetch) {
    const dp = creds.extra?.domainPrefix ?? "";
    const r = await requestJson(fetch, `${base(dp)}/api/1.0/token`, {
      method: "POST",
      form: { refresh_token: creds.refreshToken ?? "", client_id: config.lightspeed.clientId!, client_secret: config.lightspeed.clientSecret!, grant_type: "refresh_token" },
    });
    return {
      ...creds,
      accessToken: r.access_token,
      refreshToken: r.refresh_token ?? creds.refreshToken,
      expiresAt: r.expires ? new Date(Number(r.expires) * 1000).toISOString() : expiresAtFrom(new Date(), r.expires_in),
    };
  },
  async afterConnect(a) {
    const url = `${a.config.publicApiUrl}/v1/webhooks/lightspeed`;
    await api(a, "/api/webhooks", { method: "POST", form: { data: JSON.stringify({ url, active: true, type: "sale.update" }) } });
  },
  verifyWebhook(config, rawBody, headers) {
    const secret = config.lightspeed.clientSecret;
    const h = header(headers, "x-signature") ?? "";
    const sig = /signature=([0-9a-f]+)/i.exec(h)?.[1];
    return !!secret && verifyHmac(hmacHex(secret, rawBody), sig);
  },
  parseWebhook(_raw, body) {
    return { events: parseLightspeedWebhook(body) };
  },
  async resolve(a, ev) {
    const out: PurchaseEvent[] = [];
    for (const p of ev.purchases ?? []) {
      // Fill category (product type) and customer details the webhook may omit.
      const missing = [...new Set(p.lines.filter((l) => l.externalItemId && !l.externalCategoryId).map((l) => l.externalItemId!))];
      const typeByProduct = new Map<string, string>();
      for (const id of missing.slice(0, 50)) {
        try {
          const r = await api(a, `/api/2.0/products/${encodeURIComponent(id)}`);
          const t = r.data?.product_type_id ?? r.data?.type?.id;
          if (t) typeByProduct.set(id, String(t));
        } catch {
          /* ignore */
        }
      }
      if (typeByProduct.size) p.lines = p.lines.map((l) => ({ ...l, externalCategoryId: l.externalCategoryId ?? typeByProduct.get(l.externalItemId ?? "") ?? null }));
      if (!p.refund && !p.customer.phone && !p.customer.email && p.customer.externalId) {
        try {
          const r = await api(a, `/api/2.0/customers/${encodeURIComponent(p.customer.externalId)}`);
          const c = r.data ?? {};
          p.customer = { ...p.customer, phone: c.mobile ?? c.phone ?? null, email: c.email ?? null, name: fullName(c.first_name, c.last_name) };
        } catch {
          /* ignore */
        }
      }
      out.push(p);
    }
    return out;
  },
  async sync(a) {
    const outlets = await api(a, "/api/2.0/outlets");
    const types = await api(a, "/api/2.0/product_types");
    return {
      externalLocations: (outlets.data ?? []).map((o: any) => ({ id: o.id, name: o.name })),
      externalCategories: (types.data ?? []).map((t: any) => ({ id: t.id, name: t.name })),
    };
  },
};
