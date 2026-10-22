/**
 * Data setup for restaurant-customer.spec.ts against a running, seeded API (pnpm --filter @ll/api seed).
 * The seed's Ridgeway Plaza corridor has Zeenat Catering Co. (Growth) and Nawab Biryani House (Pro, banquet hall).
 */
import { API } from "./fixtures";

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function ownerOf(slug: string) {
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: `owner+${slug}@example.com`, password: "localloyalty-demo" });
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  const m = items.find((x) => x.slug === slug) ?? items[0]!;
  return { token: accessToken, id: m.id, slug: m.slug };
}

/** In-app card payments for a shop, through the fake payments provider (nothing is charged). */
export async function enablePayments(owner: { token: string; id: string }) {
  const { accessToken: admin } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: "admin@localloyalty.example", password: "localloyalty-admin" });
  await call("PUT", "/v1/admin/features/payments.in_app/overrides", { merchantId: owner.id, enabled: true, reason: "e2e restaurant customer" }, admin);
  try {
    const { accountId } = await call<{ accountId: string }>("POST", `/v1/merchants/${owner.id}/payments/connect`, {}, owner.token);
    await call("POST", "/v1/payments/fake/simulate", { action: "complete_onboarding", id: accountId });
  } catch {
    // already connected
  }
}

interface CateringEvent {
  id: string;
  number: number;
  approvalUrl: string | null;
}

/** Staff side of a public inquiry: find it by its reference number, price a menu, send the quote. Returns the /e/<token>. */
export async function sendQuoteFor(owner: { token: string; id: string }, number: number, opts: { depositBps?: number } = {}): Promise<{ token: string; id: string }> {
  const list = await call<{ items: CateringEvent[] }>("GET", `/v1/merchants/${owner.id}/catering?limit=200`, undefined, owner.token);
  const ev = list.items.find((e) => e.number === number);
  if (!ev) throw new Error(`No catering event #${number}`);
  await call("PUT", `/v1/merchants/${owner.id}/catering/${ev.id}/menu`, {
    items: [
      { name: "Chicken biryani", pricing: "per_head", perHeadCents: 1450 },
      { name: "Goat qorma", pricing: "per_head", perHeadCents: 900 },
      { name: "Naan (tray of 25)", pricing: "tray", quantity: 6, unitPriceCents: 4500 },
      { name: "Gulab jamun", pricing: "per_head", perHeadCents: 350 },
    ],
    extras: [{ description: "Delivery and setup", quantity: 1, unitPriceCents: 15000 }],
    depositBps: opts.depositBps ?? 3000,
  }, owner.token);
  const sent = await call<CateringEvent>("POST", `/v1/merchants/${owner.id}/catering/${ev.id}/send-quote`, { channels: ["sms"] }, owner.token);
  const token = sent.approvalUrl?.split("/e/")[1];
  if (!token) throw new Error(`No approval URL: ${JSON.stringify(sent)}`);
  return { token, id: ev.id };
}

/** A customer inquiry straight through the public endpoint (for fixtures that don't drive the form). */
export async function publicInquiry(slug: string, over: Record<string, unknown> = {}): Promise<{ number: number }> {
  const date = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  const phone = `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
  return call("POST", `/v1/public/shops/${slug}/catering/inquiries`, { eventType: "walima", eventDate: date, startTime: "18:00", headcount: 120, service: "delivery", venueName: "Al-Noor Banquet", venueAddress: "55 Eglinton Ave E, Mississauga", dietaryNotes: "Halal. 20 vegetarian guests.", name: "Sana Malik", phone, ...over });
}
