/**
 * wave-n: promo. The owner opens "Create a promo", lets Claude write a door crasher ("Write it for me", PROMO_AI_FAKE=1 on the
 * API: a deterministic stand-in, no key, no network), checks the pre-filled fields and the customer preview, edits the spots and
 * publishes. A customer who joined with consent sees it in the Deals inbox on /me with the live counter and saves a spot; the
 * owner's page shows the results. Also /admin/ai (masked key state) and the Urdu Deals inbox once.
 * Needs a running, seeded API (PROMO_AI_FAKE=1) and web. Screenshots: $SHOTS_DIR (default e2e/screenshots/promo).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";

const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/promo";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const rand = () => Math.random().toString(36).slice(2, 8);
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}
const login = async (who: { email: string; password: string }) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", who)).body.accessToken;

async function signIn(page: Page, who: { email: string; password: string }, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A new nail studio on its Pro trial, promos on (admin override, as pilot shops get them), one service. */
async function newStudio() {
  const email = `promo-${rand()}@example.com`;
  const password = "promo-e2e-1";
  const reg = await call<{ accessToken: string }>("POST", "/v1/auth/register", { name: "Amara Okafor", email, password });
  const token = reg.body.accessToken;
  const m = await call<{ merchant: { id: string; slug: string } }>("POST", "/v1/merchants", { name: `Priya Nails ${rand()}`, vertical: "nails", address: "22 Gerrard St E", phone: "(416) 555-0177" }, token);
  const id = m.body.merchant.id;
  await call("POST", `/v1/merchants/${id}/billing/trial`, {}, token);
  const admin = await login(ADMIN);
  for (const key of ["promos.basic", "promos.double_points"]) await call("PUT", `/v1/admin/features/${key}/overrides`, { merchantId: id, enabled: true, reason: "e2e promo" }, admin);
  await call("POST", `/v1/merchants/${id}/services`, { name: "Gel manicure", durationMin: 45, priceCents: 4500 }, token);
  return { id, slug: m.body.merchant.slug, email, password, token };
}

/** A customer who joined the studio and said yes to its offers. */
async function customer(merchantId: string) {
  const digits = newPhone();
  const phone = `+1${digits}`;
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const r = await call<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: start.body.devCode, firstName: "Meera" });
  const join = await call("POST", "/v1/me/memberships", { merchantId, consent: { text: "Yes, send me offers and deals." } }, r.body.accessToken);
  expect(join.status).toBeLessThan(300);
  return { digits, token: r.body.accessToken };
}

async function customerSignIn(page: Page, digits: string) {
  await page.goto("/me?lang=en");
  await fillPhone(page, digits);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/); // devCode autofill
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("Promos: AI-prefilled door crasher, customer Deals inbox", () => {
  test("owner lets Claude write a door crasher, edits it and publishes; a customer sees it in Deals and saves a spot", async ({ page, browser }) => {
    const studio = await newStudio();
    const cust = await customer(studio.id);

    // ---- Owner, 1440 ----
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, studio, `/m/${studio.id}/promos/new`);
    await expect(page.getByRole("heading", { name: "Create a promo" })).toBeVisible();
    const ai = page.getByTestId("promo-ai");
    await expect(ai).toBeVisible();
    await ai.getByRole("button", { name: "A door crasher" }).click();
    await ai.getByLabel("A detail (optional)").fill("free nail art upgrade");
    await page.screenshot({ path: shot("new-promo-ai-1440"), fullPage: true });
    await page.getByTestId("promo-ai-write").click();
    await expect(page.getByText(/Drafted for you/)).toBeVisible();
    // Pre-filled: the type, the spots, the words. Nothing published yet.
    await expect(page.getByTestId("promo-type-door_crasher")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Spots (first come)")).toHaveValue("20");
    await expect(page.getByLabel("Title")).not.toHaveValue("");
    await expect(page.getByLabel("Notification text")).toHaveValue(/Priya Nails/);
    const list0 = await call<{ items: unknown[] }>("GET", `/v1/merchants/${studio.id}/promos`, undefined, studio.token);
    expect(list0.body.items).toHaveLength(0);
    // The owner edits: 12 spots, starting now so it can be claimed today.
    await page.getByLabel("Spots (first come)").fill("12");
    await page.getByLabel("Title").fill("First 12 get free nail art");
    await page.getByRole("button", { name: "Today only" }).click();
    const preview = page.getByTestId("promo-preview");
    await expect(preview.getByText("First 12 get free nail art")).toBeVisible();
    await expect(preview.getByTestId("deal-remaining")).toHaveText("12 spots left");
    await page.screenshot({ path: shot("new-promo-prefilled-1440"), fullPage: true });
    await page.getByTestId("promo-publish").click();
    await page.waitForURL(new RegExp(`/m/${studio.id}/promos/[0-9a-f-]{36}$`));
    await expect(page.getByRole("heading", { name: "First 12 get free nail art" })).toBeVisible();
    await expect(page.getByText("12 of 12")).toBeVisible();
    const promoId = page.url().split("/").pop()!;

    // ---- Customer, 390: the Deals inbox on /me ----
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const cp = await ctx.newPage();
    await customerSignIn(cp, cust.digits);
    const inbox = cp.getByTestId("deals-inbox");
    await expect(inbox).toBeVisible({ timeout: 20_000 });
    const card = inbox.locator(`[data-deal-id="${promoId}"]`);
    await expect(card.getByText("First 12 get free nail art")).toBeVisible();
    await expect(card.getByTestId("deal-remaining")).toHaveText("12 spots left");
    await cp.screenshot({ path: shot("me-deals-390"), fullPage: true });
    await card.getByRole("button", { name: "Save my spot" }).click();
    await expect(card.getByTestId("deal-claim-code")).toContainText("Show code");
    await expect(card.getByTestId("deal-remaining")).toHaveText("11 spots left");
    await cp.screenshot({ path: shot("me-deals-claimed-390"), fullPage: true });

    // ---- Urdu once ----
    await cp.goto("/me?lang=ur");
    await expect(cp.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(cp.getByTestId("deals-inbox").getByRole("heading", { name: "آفرز" })).toBeVisible();
    await cp.screenshot({ path: shot("me-deals-390-ur"), fullPage: true });
    await ctx.close();

    // ---- Owner results ----
    await page.reload();
    await expect(page.getByText("11 of 12")).toBeVisible();
    await page.screenshot({ path: shot("promo-results-1440"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: shot("promo-results-390"), fullPage: true });
    // Pause hides it from customers.
    await page.getByTestId("promo-pause").click();
    await expect(page.getByTestId("promo-resume")).toBeVisible();
    const deals = await call<{ items: { id: string }[] }>("GET", "/v1/me/deals", undefined, cust.token);
    expect(deals.body.items.some((d) => d.id === promoId)).toBe(false);
  });

  test("/admin/ai shows the key state masked, the limits and usage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, ADMIN, "/admin/ai");
    await expect(page.getByRole("heading", { level: 1, name: "AI" })).toBeVisible();
    await expect(page.getByTestId("ai-key")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /key/i })).toHaveAttribute("type", "password");
    await expect(page.getByText(/sk-ant-api/)).toHaveCount(0);
    await page.screenshot({ path: shot("admin-ai-1440"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: shot("admin-ai-390"), fullPage: true });
  });
});
