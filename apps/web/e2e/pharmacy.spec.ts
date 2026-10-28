/**
 * Pharmacy (docs/research/pharmacies-wellness.md): the locked dispensary categories and why, the Pharmacy rules page, the front-store
 * confirmation at the counter, the messages check, the pharmacist appointment types and booking with no notes, and the fixed
 * "order ready" text. Uses the seeded pharmacy Village Apothecary (apps/api/src/seed/pharmacy.ts).
 * Needs a running, seeded API and web (docs/engineering/web.md). Screenshots go to $SHOTS_DIR.
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";

const OWNER = { email: "owner+village-apothecary@example.com", password: "localloyalty-demo" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/pharmacy";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function setup() {
  const { body: login } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
  const token = login.accessToken;
  const { body: list } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  const id = list.items[0]!.id;
  return { token, id, base: `/v1/merchants/${id}` };
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("rewards: the dispensary categories are locked, with the reason", async ({ page }) => {
  const s = await setup();
  await signIn(page);
  await page.goto(`/m/${s.id}/program`);
  await expect(page.getByText("Prescriptions and pharmacy services can never earn points or be discounted")).toBeVisible();
  await expect(page.getByText("Ontario pharmacy rules do not allow a loyalty benefit")).toBeVisible();
  const locked = page.getByTestId("locked-tag");
  await expect(locked.nth(2)).toBeVisible();
  await expect(page.getByTestId("pharmacy-also-blocked")).toContainText("Points for a visit or a stamp");
  // No visit or stamp mode, and no referral field, for a pharmacy.
  await expect(page.getByRole("radio", { name: /One per visit/ })).toHaveCount(0);
  await expect(page.getByLabel("Referral reward")).toHaveCount(0);
  await page.getByRole("button", { name: "Why?" }).first().click();
  await expect(page.getByText("inducement under Ontario's pharmacy conflict-of-interest rules")).toBeVisible();
  await page.getByTestId("pharmacy-also-blocked").scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("01-rewards-locked-1440"), fullPage: true });
  // The server says no too: a look-alike name is locked the moment it is made.
  const made = await call<{ earnEligible: boolean; protected: boolean }>("POST", `${s.base}/categories`, { name: "Vaccines" }, s.token);
  expect(made.body).toMatchObject({ earnEligible: false, protected: true });
});

test("Pharmacy rules page shows the rules, the confirmation and the retention periods", async ({ page }) => {
  const s = await setup();
  await signIn(page);
  await page.goto(`/m/${s.id}/pharmacy`);
  await expect(page.getByRole("heading", { name: "Pharmacy rules" })).toBeVisible();
  await expect(page.getByTestId("pharmacy-confirmation")).toContainText("Confirmed");
  await expect(page.getByTestId("pharmacy-confirmation")).toContainText("Amira Rahman");
  expect(await page.getByTestId("pharmacy-rule").count()).toBeGreaterThanOrEqual(8);
  await expect(page.getByText("No points for a visit or a stamp")).toBeVisible();
  await expect(page.getByText("30 days").first()).toBeVisible();
  await page.screenshot({ path: shot("02-pharmacy-rules-1440"), fullPage: true });
  // The sidebar has it.
  await expect(page.getByRole("link", { name: "Pharmacy rules" }).first()).toBeVisible();
});

test("counter: the front-store confirmation is on screen, the server refuses a sale without it, and Pickup ready sends the fixed text", async ({ page }) => {
  const s = await setup();
  const phone = `+1${newPhone()}`;
  const refused = await call<{ error: { code: string } }>("POST", `${s.base}/counter/award`, { phone, amountCents: 4200, idempotencyKey: `pharm-${Date.now()}-a` }, s.token);
  expect(refused.status).toBe(422);
  expect(refused.body.error.code).toBe("front_store_confirmation_required");
  const ok = await call<{ pointsEarned: number }>("POST", `${s.base}/counter/award`, { phone, amountCents: 4200, frontStoreOnly: true, idempotencyKey: `pharm-${Date.now()}-b` }, s.token);
  expect(ok.status).toBe(200);
  expect(ok.body.pointsEarned).toBe(42);
  const rx = await call<{ error: { code: string } }>("POST", `${s.base}/counter/award`, { phone, lines: [{ amountCents: 9000, categoryId: (await call<{ items: { id: string; name: string }[] }>("GET", `${s.base}/categories`, undefined, s.token)).body.items.find((c) => c.name === "Prescriptions")!.id }], idempotencyKey: `pharm-${Date.now()}-c` }, s.token);
  expect(rx.status).toBe(422);
  expect(rx.body.error.code).toBe("pharmacy_no_front_store");

  await signIn(page);
  await page.goto(`/m/${s.id}/counter`);
  await expect(page.getByTestId("front-store-confirm")).toContainText("This total has no prescriptions or pharmacy services");
  await expect(page.getByTestId("pickup-ready")).toBeVisible();
  const send = page.getByRole("button", { name: "Send pickup text" });
  await expect(send).toBeDisabled();
  await fillPhone(page, newPhone());
  await expect(send).toBeDisabled(); // needs "the customer asked"
  await page.getByLabel("The customer asked for a text when their order is ready").check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText(/^Sent to \(\d{3}\) \d{3} ••\d\d$/)).toBeVisible();
  await expect(page.getByTestId("pickup-ready")).toContainText("never says");
  await page.screenshot({ path: shot("03-counter-1440"), fullPage: true });
});

test("messages: dispensary words are caught while typing and Send stays off", async ({ page }) => {
  const s = await setup();
  await signIn(page);
  await page.goto(`/m/${s.id}/messages/new`);
  const body = page.locator("#msg-body");
  await expect(body).toBeVisible();
  await body.fill("Your prescription refill is ready, 10% off with points");
  await expect(page.getByTestId("pharmacy-text-blocked")).toContainText("This can't be sent");
  await expect(page.getByTestId("pharmacy-text-blocked")).toContainText("Pickup ready");
  await page.screenshot({ path: shot("04-messages-blocked-1440"), fullPage: true });
  await body.fill("Vitamins, tissues and cold remedies earn double points until Sunday. Front-store items only.");
  await expect(page.getByTestId("pharmacy-text-blocked")).toHaveCount(0);
  // And the server refuses it even if the page is bypassed.
  const r = await call<{ error: { code: string } }>("POST", `${s.base}/messages`, { channel: "email", subject: "Hello", body: "Your refill is ready", segment: { kind: "all" } }, s.token);
  expect(r.status).toBe(422);
  expect(r.body.error.code).toBe("pharmacy_text");
});

test("appointments: types have no price, and the shopper books with no notes and no price", async ({ page }) => {
  const s = await setup();
  await signIn(page);
  await page.goto(`/m/${s.id}/services`);
  await expect(page.getByRole("heading", { name: "Pharmacist appointments" })).toBeVisible();
  await expect(page.getByText("Flu shot").first()).toBeVisible();
  await expect(page.getByText("Not charged here").first()).toBeVisible();
  await expect(page.getByTestId("pharmacy-keep")).toContainText("What we never ask for or keep");
  await page.getByRole("button", { name: "Add appointment type" }).click();
  await expect(page.getByTestId("pharmacy-presets")).toBeVisible();
  await expect(page.getByLabel("Price")).toHaveCount(0);
  await expect(page.getByLabel("Deposit")).toHaveCount(0);
  await page.screenshot({ path: shot("05-appointment-types-1440"), fullPage: true });

  await page.context().clearCookies();
  await page.goto("/shops/village-apothecary/book");
  await expect(page.getByText("No charge here").first()).toBeVisible();
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: /Choose a time|Pick a time/i }).click();
  await expect(page.getByTestId("pharmacy-privacy")).toContainText("No notes, no health details");
  await expect(page.getByRole("textbox", { name: /note/i })).toHaveCount(0);
  await page.screenshot({ path: shot("06-book-390-desktop"), fullPage: true });
});

test("a new pharmacy: confirming the rules is a setup step, needs the OCP number, and points stay off until then", async ({ page }) => {
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `rx-owner-${tag}@example.com`;
  const reg = await call<{ accessToken: string }>("POST", "/v1/auth/register", { name: "Imran Qureshi", email, password: "pharmacy-e2e-1" });
  const created = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: `Rx Setup ${tag}`, vertical: "pharmacy", address: "3250 Ridgecrest Blvd", phone: "(905) 555-0134" }, reg.body.accessToken);
  const id = created.body.merchant.id;
  const base = `/v1/merchants/${id}`;
  const refused = await call<{ error: { code: string } }>("POST", `${base}/counter/award`, { phone: `+1647${String(Math.floor(2000000 + Math.random() * 7999999))}`, amountCents: 1000, frontStoreOnly: true, idempotencyKey: `rx-${tag}-1` }, reg.body.accessToken);
  expect(refused.status).toBe(422);
  expect(refused.body.error.code).toBe("pharmacy_not_confirmed");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("pharmacy-e2e-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(`/m/${id}/setup?step=pharmacy_rules`);
  await expect(page.getByRole("heading", { name: "Pharmacist confirms the rules" })).toBeVisible();
  await page.getByRole("link", { name: "Open pharmacy rules" }).click();
  await expect(page.getByText("Your rep")).toHaveCount(0);
  const confirm = page.getByRole("button", { name: "Confirm" });
  await page.getByLabel(/I am the pharmacist-owner/).check();
  await page.getByLabel("Your full name").fill("Imran Qureshi");
  await expect(confirm).toBeDisabled(); // the OCP accreditation number is required
  await page.getByLabel("OCP accreditation number").fill("1234567");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByTestId("pharmacy-confirmation")).toContainText("OCP accreditation 1234567");
  const ok = await call("POST", `${base}/counter/award`, { phone: `+1647${String(Math.floor(2000000 + Math.random() * 7999999))}`, amountCents: 1000, frontStoreOnly: true, idempotencyKey: `rx-${tag}-2` }, reg.body.accessToken);
  expect(ok.status).toBe(200);
});
