/**
 * Toast (restaurants): partner client-credentials auth + orders webhooks.
 * Docs: https://doc.toasttab.com/doc/devguide/authentication.html,
 *       https://doc.toasttab.com/doc/devguide/apiWebhooks.html (orders webhook)
 *
 * Toast has no merchant-facing OAuth: the restaurant grants our partner
 * integration access in Toast, then the merchant gives us the restaurant GUID.
 * All requests carry Toast-Restaurant-External-ID. Webhook signature:
 * Toast-Signature = base64(HMAC-SHA256(raw body, webhook secret)).
 */
import type { Config } from "../../config.js";
import type { ApiContext, Connector, Credentials, Fetch, InboundEvent, PurchaseEvent, PurchaseLineEvent } from "../types.js";
import { expiresAtFrom, fullName, header, hmacBase64, isoFrom, requestJson, toCents, verifyHmac } from "../util.js";

const GUID_RE = /^[0-9a-f-]{20,64}$/i;

async function login(config: Config, fetch: Fetch): Promise<Credentials> {
  const r = await requestJson(fetch, `${config.toast.apiHost}/authentication/v1/authentication/login`, {
    method: "POST",
    json: { clientId: config.toast.clientId, clientSecret: config.toast.clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" },
  });
  return { accessToken: r.token?.accessToken, expiresAt: expiresAtFrom(new Date(), r.token?.expiresIn) };
}

const api = (a: ApiContext, path: string) =>
  requestJson(a.fetch, `${a.config.toast.apiHost}${path}`, {
    headers: { authorization: `Bearer ${a.credentials.accessToken}`, "toast-restaurant-external-id": a.externalAccountId ?? "" },
  });

const PAID = new Set(["PAID", "CLOSED"]);

/** Normalize a Toast order (amounts are decimal dollars). Returns the sale and any refunds. */
export function toastOrderToEvents(order: any, restaurantGuid: string, now: Date): { purchase: PurchaseEvent | null; refunds: PurchaseEvent[] } {
  const checks: any[] = (order.checks ?? []).filter((c: any) => !c.voided && !c.deleted);
  const lines: PurchaseLineEvent[] = [];
  let customer: any = null;
  for (const check of checks) {
    customer ??= check.customer ?? null;
    for (const s of check.selections ?? []) {
      if (s.voided || s.deferred) continue;
      lines.push({
        amountCents: Math.max(0, toCents(s.price)),
        externalItemId: s.item?.guid ?? null,
        externalCategoryId: s.salesCategory?.guid ?? null,
        quantity: Math.max(1, Math.round(Number(s.quantity ?? 1))),
        name: s.displayName ?? null,
      });
    }
  }
  const allPaid = checks.length > 0 && checks.every((c) => PAID.has(String(c.paymentStatus ?? "")));
  const totalCents = checks.reduce((s, c) => s + toCents(c.amount), 0);
  const purchase: PurchaseEvent | null =
    allPaid && !order.voided
      ? {
          externalId: String(order.guid),
          externalLocationId: restaurantGuid,
          occurredAt: isoFrom(order.closedDate ?? order.paidDate ?? order.openedDate, now),
          totalCents,
          lines,
          customer: { phone: customer?.phone ?? null, email: customer?.email ?? null, name: fullName(customer?.firstName, customer?.lastName), externalId: customer?.guid ?? null },
          receiptCode: order.displayNumber ? String(order.displayNumber) : (checks[0]?.displayNumber ?? null),
        }
      : null;
  // Toast reports refunds on payments; refundAmount is treated as the running total per payment.
  let refunded = 0;
  let gross = 0;
  for (const c of checks)
    for (const p of c.payments ?? []) {
      gross += toCents(p.amount);
      if (p.refundStatus && p.refundStatus !== "NONE") refunded += toCents(p.refund?.refundAmount);
    }
  const refunds: PurchaseEvent[] =
    refunded > 0
      ? [
          {
            externalId: `${order.guid}:refund:${refunded}`,
            externalLocationId: restaurantGuid,
            occurredAt: now.toISOString(),
            totalCents: 0,
            lines: [],
            customer: {},
            refund: { originalExternalId: String(order.guid), amountCents: refunded, originalTotalCents: gross || null, cumulative: true },
          },
        ]
      : [];
  return { purchase, refunds };
}

export function parseToastWebhook(body: any, headers: Record<string, string | string[] | undefined>): InboundEvent[] {
  const eventId = String(body?.guid ?? body?.eventGuid ?? "");
  const type = `${body?.eventCategory ?? ""}.${body?.eventType ?? ""}`;
  const restaurant = header(headers, "toast-restaurant-external-id") ?? body?.details?.restaurantGuid ?? null;
  if (!eventId) return [];
  if (String(body?.eventCategory ?? "").toLowerCase() !== "orders") return [{ eventId, type, accountId: restaurant, kind: "ignore" }];
  const order = body?.details?.order ?? null;
  const orderGuid = order?.guid ?? body?.details?.orderGuid ?? body?.details?.entityGuid ?? null;
  if (!orderGuid) return [{ eventId, type, accountId: restaurant, kind: "ignore" }];
  return [{ eventId, type, accountId: restaurant, kind: "purchase", ref: { object: "order", id: String(orderGuid), order } }];
}

export const toast: Connector = {
  id: "toast",
  name: "Toast",
  category: "pos",
  description: "Award points on Toast restaurant checks.",
  auth: "credentials",
  configured: (c) => !!(c.toast.clientId && c.toast.clientSecret),
  connectFields: [{ key: "restaurantGuid", label: "Toast restaurant GUID", required: true }],
  setup: { webhookPath: "/v1/webhooks/toast", events: ["orders"], scopes: ["orders:read", "config:read", "restaurants:read"], envVars: ["TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET", "TOAST_WEBHOOK_SECRET", "TOAST_API_HOST"] },
  async connectDirect(config, body, fetch) {
    const guid = typeof body.restaurantGuid === "string" ? body.restaurantGuid.trim() : "";
    if (!GUID_RE.test(guid)) throw new Error("A valid Toast restaurant GUID is required");
    const credentials = await login(config, fetch);
    const r = await requestJson(fetch, `${config.toast.apiHost}/restaurants/v1/restaurants/${encodeURIComponent(guid)}`, {
      headers: { authorization: `Bearer ${credentials.accessToken}`, "toast-restaurant-external-id": guid },
    });
    return { credentials, externalAccountId: guid, settings: { restaurantName: r.general?.name ?? null } };
  },
  async refresh(config, creds, fetch) {
    return { ...creds, ...(await login(config, fetch)) };
  },
  verifyWebhook(config, rawBody, headers) {
    const secret = config.toast.webhookSecret;
    return !!secret && verifyHmac(hmacBase64(secret, rawBody), header(headers, "toast-signature"));
  },
  parseWebhook(_raw, body, headers) {
    return { events: parseToastWebhook(body, headers) };
  },
  async resolve(a, ev) {
    if (!ev.ref) return [];
    const order = (ev.ref.order as any) ?? (await api(a, `/orders/v2/orders/${encodeURIComponent(ev.ref.id)}`));
    const { purchase, refunds } = toastOrderToEvents(order, a.externalAccountId ?? "", a.now());
    return [...(purchase ? [purchase] : []), ...refunds];
  },
  async sync(a) {
    const cats = await api(a, "/config/v2/salesCategories");
    return {
      externalLocations: [{ id: a.externalAccountId ?? "", name: (a.settings.restaurantName as string) ?? "Toast restaurant" }],
      externalCategories: (Array.isArray(cats) ? cats : []).map((c: any) => ({ id: c.guid, name: c.name })),
    };
  },
};
