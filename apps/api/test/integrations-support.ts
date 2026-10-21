/**
 * Test support for the integrations area: a recording fake `fetch` and
 * provider fixture payloads (shapes recorded from provider docs/sandboxes).
 */
import { createHmac } from "node:crypto";

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}
type Handler = (call: FakeCall) => { status?: number; json?: unknown; text?: string } | Promise<{ status?: number; json?: unknown; text?: string }>;

export function fakeFetch(routes: [string, RegExp | string, Handler][]) {
  const calls: FakeCall[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call = { method, url, headers, body: typeof init?.body === "string" ? init.body : undefined };
    calls.push(call);
    const route = routes.find(([m, p]) => m === method && (typeof p === "string" ? url === p || url.startsWith(p) : p.test(url)));
    if (!route) return new Response(JSON.stringify({ error: `no fake route for ${method} ${url}` }), { status: 599 });
    const r = await route[2](call);
    const status = r.status ?? 200;
    const body = status === 204 || status === 304 ? null : (r.text ?? JSON.stringify(r.json ?? {}));
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return Object.assign(f, { calls });
}

export const b64hmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64");
export const hexhmac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

// ---------------------------------------------------------------------------
// Square fixtures
// ---------------------------------------------------------------------------
export const SQ_MERCHANT = "MLSQ2TESTMERCHANT";
export const SQ_LOCATION = "L8TESTLOCATION01";

export const squarePaymentUpdated = (opts: { eventId: string; orderId: string; paymentId?: string; customerId?: string | null; status?: string }) => ({
  merchant_id: SQ_MERCHANT,
  type: "payment.updated",
  event_id: opts.eventId,
  created_at: "2026-11-03T15:00:00.000Z",
  data: {
    type: "payment",
    id: opts.paymentId ?? "pay_abc123",
    object: {
      payment: {
        id: opts.paymentId ?? "pay_abc123",
        order_id: opts.orderId,
        status: opts.status ?? "COMPLETED",
        amount_money: { amount: 5650, currency: "CAD" },
        total_money: { amount: 5650, currency: "CAD" },
        customer_id: opts.customerId === undefined ? "CUST_1" : opts.customerId,
        location_id: SQ_LOCATION,
        receipt_number: "PAYA",
        created_at: "2026-11-03T14:59:00.000Z",
      },
    },
  },
});

export const squareOrderUpdated = (eventId: string, orderId: string, state = "COMPLETED") => ({
  merchant_id: SQ_MERCHANT,
  type: "order.updated",
  event_id: eventId,
  created_at: "2026-11-03T15:00:01.000Z",
  data: { type: "order_updated", id: orderId, object: { order_updated: { order_id: orderId, state, location_id: SQ_LOCATION, version: 4 } } },
});

export const squareRefundUpdated = (eventId: string, refundId: string, amount: number) => ({
  merchant_id: SQ_MERCHANT,
  type: "refund.updated",
  event_id: eventId,
  data: { type: "refund", id: refundId, object: { refund: { id: refundId, status: "COMPLETED", payment_id: "pay_abc123", order_id: "RETURN_ORDER", amount_money: { amount, currency: "CAD" } } } },
});

/** $30 front-store + $20 prescription, +13% tax. */
export const squareOrder = (orderId: string, opts: { customerId?: string | null } = {}) => ({
  order: {
    id: orderId,
    location_id: SQ_LOCATION,
    state: "COMPLETED",
    customer_id: opts.customerId === undefined ? "CUST_1" : opts.customerId,
    closed_at: "2026-11-03T14:59:30.000Z",
    line_items: [
      { uid: "li1", name: "Vitamins", quantity: "2", catalog_object_id: "VAR_VIT", total_money: { amount: 3390 }, total_tax_money: { amount: 390 } },
      { uid: "li2", name: "Prescription", quantity: "1", catalog_object_id: "VAR_RX", total_money: { amount: 2260 }, total_tax_money: { amount: 260 } },
    ],
    total_money: { amount: 5650 },
    total_tax_money: { amount: 650 },
    tenders: [{ id: "tnd1", payment_id: "pay_abc123" }],
    net_amount_due_money: { amount: 0 },
  },
});

export const squareCatalog = {
  objects: [
    { type: "ITEM_VARIATION", id: "VAR_VIT", item_variation_data: { item_id: "ITEM_VIT" } },
    { type: "ITEM_VARIATION", id: "VAR_RX", item_variation_data: { item_id: "ITEM_RX" } },
  ],
  related_objects: [
    { type: "ITEM", id: "ITEM_VIT", item_data: { name: "Vitamins", categories: [{ id: "CAT_FRONT" }] } },
    { type: "ITEM", id: "ITEM_RX", item_data: { name: "Prescription", category_id: "CAT_RX" } },
  ],
};

export const squareCustomer = (phone: string | null) => ({ customer: { id: "CUST_1", given_name: "Priya", family_name: "Shah", phone_number: phone, email_address: "priya@example.com" } });

export function squareRoutes(opts: { phone: string | null; orderCustomer?: string | null }) {
  return [
    ["GET", /\/v2\/orders\/([^/?]+)$/, (c: FakeCall) => ({ json: squareOrder(decodeURIComponent(/\/v2\/orders\/([^/?]+)$/.exec(c.url)![1]!), { customerId: opts.orderCustomer }) })],
    ["POST", /\/v2\/catalog\/batch-retrieve$/, () => ({ json: squareCatalog })],
    ["GET", /\/v2\/customers\/CUST_1$/, () => ({ json: squareCustomer(opts.phone) })],
    ["GET", /\/v2\/payments\/pay_abc123$/, () => ({ json: { payment: { id: "pay_abc123", order_id: "ORDER_1", location_id: SQ_LOCATION, amount_money: { amount: 5650 } } } })],
    ["GET", /\/v2\/locations$/, () => ({ json: { locations: [{ id: SQ_LOCATION, name: "Main St", status: "ACTIVE", address: { address_line_1: "1 Main St", locality: "Toronto" } }] } })],
    ["GET", /\/v2\/catalog\/list/, () => ({ json: { objects: [{ id: "CAT_RX", type: "CATEGORY", category_data: { name: "Prescriptions" } }, { id: "CAT_FRONT", type: "CATEGORY", category_data: { name: "Front store" } }] } })],
    ["POST", /\/oauth2\/token$/, () => ({ json: { access_token: "sq_access_1", refresh_token: "sq_refresh_1", expires_at: "2026-12-03T15:00:00Z", merchant_id: SQ_MERCHANT, token_type: "bearer" } })],
    ["POST", /\/oauth2\/revoke$/, () => ({ json: { success: true } })],
  ] as [string, RegExp, Handler][];
}

// ---------------------------------------------------------------------------
// Shopify fixtures
// ---------------------------------------------------------------------------
export const SHOP = "corner-shop.myshopify.com";
export const shopifyOrderPaid = (id: number, phone: string | null) => ({
  id,
  name: "#1042",
  order_number: 1042,
  financial_status: "paid",
  processed_at: "2026-11-03T14:58:00-05:00",
  subtotal_price: "45.00",
  current_subtotal_price: "45.00",
  total_price: "50.85",
  location_id: 7788,
  email: "sam@example.com",
  phone: null,
  customer: { id: 901, first_name: "Sam", last_name: "Lee", phone, email: "sam@example.com" },
  line_items: [
    { id: 1, product_id: 111, variant_id: 1111, title: "Mug", quantity: 3, price: "10.00", total_discount: "0.00", discount_allocations: [] },
    { id: 2, product_id: 222, variant_id: 2222, title: "Beans", quantity: 1, price: "20.00", total_discount: "5.00", discount_allocations: [{ amount: "5.00" }] },
  ],
});
export const shopifyRefund = (id: number, orderId: number, subtotal: string) => ({
  id,
  order_id: orderId,
  created_at: "2026-11-04T10:00:00-05:00",
  refund_line_items: [{ id: 5, line_item_id: 1, quantity: 1, subtotal }],
  transactions: [{ id: 77, kind: "refund", status: "success", amount: subtotal }],
});

// ---------------------------------------------------------------------------
// Clover / Lightspeed / Toast fixtures
// ---------------------------------------------------------------------------
export const CLOVER_MID = "CLOVERMID01";
export const cloverPayment = { id: "PAYCLV1", amount: 2260, taxAmount: 260, result: "SUCCESS", createdTime: 1793718000000, order: { id: "ORDCLV1" }, refunds: { elements: [] } };
export const cloverOrder = (custId: string | null) => ({
  id: "ORDCLV1",
  lineItems: { elements: [{ id: "LI1", name: "Latte", price: 500, item: { id: "ITEMLATTE" } }, { id: "LI2", name: "Bagel", price: 1500, item: { id: "ITEMBAGEL" } }] },
  customers: { elements: custId ? [{ id: custId }] : [] },
});

export const lightspeedSale = (phone: string | null, total = 25.5) => ({
  id: "0af7b240-ab00-11ed-8d2b-ls1",
  outlet_id: "OUTLET1",
  status: "CLOSED",
  sale_date: "2026-11-03T14:00:00Z",
  invoice_number: "LS-1001",
  total_price: total,
  version: 123,
  customer_id: "CUSTLS1",
  customer: { id: "CUSTLS1", first_name: "Ana", last_name: "Diaz", mobile: phone, email: null },
  register_sale_products: [{ id: "rsp1", product_id: "PRODLS1", quantity: 1, price: total, price_total: total, product_type_id: "TYPE_GEN" }],
});

export const toastOrder = (phone: string | null, refunded = 0) => ({
  guid: "11111111-2222-3333-4444-555555555555",
  displayNumber: "57",
  closedDate: "2026-11-03T19:00:00.000+0000",
  checks: [
    {
      guid: "chk1",
      paymentStatus: "CLOSED",
      amount: 40.0,
      customer: phone ? { guid: "tc1", firstName: "Max", lastName: "Roy", phone, email: "max@example.com" } : null,
      selections: [
        { guid: "s1", displayName: "Burger", price: 18.0, quantity: 1, item: { guid: "itm1" }, salesCategory: { guid: "SC_FOOD" } },
        { guid: "s2", displayName: "Beer", price: 22.0, quantity: 2, item: { guid: "itm2" }, salesCategory: { guid: "SC_ALCOHOL" } },
      ],
      payments: [{ guid: "p1", amount: 45.2, refundStatus: refunded ? "PARTIAL" : "NONE", refund: refunded ? { refundAmount: refunded } : null }],
    },
  ],
});
