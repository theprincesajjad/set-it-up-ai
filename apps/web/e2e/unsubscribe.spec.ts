import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { API } from "./fixtures";

/**
 * Unsubscribe links never act on GET (mail scanners and link previews open every URL in a message): the link shows a
 * confirm page, and its button POSTs. The API signs the tokens with its JWT secret, which on the e2e stack is the dev default.
 */
const SECRET = process.env.E2E_JWT_SECRET ?? "dev-only-jwt-secret-change-me-dev-only-jwt-secret";
const token = (what: string) => createHmac("sha256", SECRET).update(what).digest("hex").slice(0, 32);

async function api<T>(method: string, path: string, body?: unknown, bearer?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

test("a member's unsubscribe link asks first; only the button withdraws consent", async ({ page }) => {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/login", { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" });
  const { items: shops } = await api<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  const shop = shops[0]!.id;
  // A fresh customer who agreed to offers at the counter, so the seeded members are left alone.
  const phone = `+1647555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const awarded = await api<{ member: { memberId: string } }>(
    "POST",
    `/v1/merchants/${shop}/counter/award`,
    { phone, customerName: "Unsub Test", amountCents: 500, consent: { text: "Text me offers from Pinecone Coffee Co." }, idempotencyKey: `e2e-unsub-${Date.now()}-${phone}` },
    accessToken,
  );
  const member = awarded.member;
  const consented = async () => {
    const detail = await api<{ customer?: { marketingConsent: boolean }; marketingConsent?: boolean }>("GET", `/v1/merchants/${shop}/customers/${member.memberId}`, undefined, accessToken);
    return detail.marketingConsent ?? detail.customer?.marketingConsent;
  };
  expect(await consented()).toBe(true);

  const link = `${API}/v1/public/messaging/unsubscribe?m=${member.memberId}&t=${token(`unsub:${member.memberId}`)}`;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /Unsubscribe from Pinecone Coffee/ })).toBeVisible();
  await expect(page.getByText("Nothing changes until you press the button.")).toBeVisible();
  // Opening the link (what a scanner does) changed nothing.
  expect(await consented()).toBe(true);
  await page.reload();
  expect(await consented()).toBe(true);

  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
  expect(await consented()).toBe(false);

  // A link with a wrong token is refused without touching anything.
  const bad = await page.request.get(`${API}/v1/public/messaging/unsubscribe?m=${member.memberId}&t=wrongtokenwrongtoken`);
  expect(bad.status()).toBe(400);
});

test("the setup-reminder unsubscribe link asks first, in the reader's language", async ({ page }) => {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/login", { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" });
  const { items: shops } = await api<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  const shop = shops[0]!.id;
  const link = `${API}/v1/public/onboarding/unsubscribe?m=${shop}&t=${token(`nudge-unsub:${shop}`)}`;

  await page.goto(`${link}&lang=hi`);
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("button", { name: "रिमाइंडर बंद करें" })).toBeVisible();
  await page.goto(`${link}&lang=ur`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: /Stop setup reminders for/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop reminders" }).click();
  await expect(page.getByRole("heading", { name: "No more setup reminders" })).toBeVisible();
  // Turn them back on so the shop is as the seed left it.
  await api("PUT", `/v1/merchants/${shop}/onboarding/nudges`, { enabled: true }, accessToken).catch(() => undefined);
});
