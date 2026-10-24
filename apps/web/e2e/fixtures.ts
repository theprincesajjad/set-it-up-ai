/**
 * E2E data setup against a running, seeded API (pnpm --filter @ll/api seed).
 * Uses the seed's demo credentials (apps/api/src/seed/demo.ts) and the API directly.
 */
export const API = process.env.E2E_API_URL ?? "http://localhost:4100";

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

async function login(email: string, password: string) {
  return (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password })).accessToken;
}

async function merchant(token: string) {
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items[0]!;
  const detail = await call<{ locations: { id: string; qrCode: string }[] }>("GET", `/v1/merchants/${m.id}`, undefined, token);
  return { id: m.id, slug: m.slug, location: detail.locations[0]! };
}

/** The café's counter QR code (for /j/<code>). */
export async function cafeQr(): Promise<{ qrCode: string; slug: string }> {
  const t = await login("owner+pinecone-coffee@example.com", "localloyalty-demo");
  const m = await merchant(t);
  return { qrCode: m.location.qrCode, slug: m.slug };
}

/**
 * A sent repair quote with a 25% deposit at Fix-It Phone Lab. Pro features are hidden by
 * default, so an admin overrides them for this pilot shop and Connect onboarding is
 * completed through the fake payments simulator.
 */
export async function repairQuote(): Promise<{ token: string }> {
  const admin = await login("admin@localloyalty.example", "localloyalty-admin");
  const owner = await login("owner+fix-it-phone-lab@example.com", "localloyalty-demo");
  const m = await merchant(owner);
  for (const key of ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "payments.in_app"]) {
    await call("PUT", `/v1/admin/features/${key}/overrides`, { merchantId: m.id, enabled: true, reason: "e2e pilot" }, admin);
  }
  const { accountId } = await call<{ accountId: string }>("POST", `/v1/merchants/${m.id}/payments/connect`, {}, owner);
  await call("POST", "/v1/payments/fake/simulate", { action: "complete_onboarding", id: accountId });
  const phone = `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const ticket = await call<{ ticket: { id: string } }>(
    "POST",
    `/v1/merchants/${m.id}/tickets`,
    { customer: { phone, name: "Alex Chen" }, locationId: m.location.id, itemKind: "device", itemDetails: { make: "Apple", model: "iPhone 13" }, issue: "Cracked screen", termsAccepted: true },
    owner,
  );
  const quote = await call<{ approvalUrl: string | null }>(
    "POST",
    `/v1/merchants/${m.id}/tickets/${ticket.ticket.id}/quotes`,
    {
      diagnosis: "Screen and digitizer cracked. Battery health is fine.",
      lineItems: [
        { description: "iPhone 13 screen (OEM)", quantity: 1, unitPriceCents: 18900, kind: "part" },
        { description: "Labour", quantity: 1, unitPriceCents: 5000, kind: "labour" },
      ],
      depositPercent: 25,
      send: true,
    },
    owner,
  );
  const token = quote.approvalUrl?.split("/q/")[1];
  if (!token) throw new Error(`No approval URL: ${JSON.stringify(quote)}`);
  return { token };
}
