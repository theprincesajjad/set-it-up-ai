/**
 * The open items from the grocer and pharmacy work (docs/research/grocers.md, pharmacies-wellness.md), at phone width:
 *  - a restock text's link opens a one-item reserve page for that staple (frame 12), and Reserve places an ordinary pickup order;
 *  - the qurbani pre-order days are the butcher's Eid plan days with their own animal counts (frame 11), not "14 days from now";
 *  - the pharmacy "You're booked" screen shows the exact reminder text we will send (frame 05b).
 * Uses the seeded Annapurna Grocers & Spices, Al-Noor Halal Meats and Village Apothecary. Needs a running, seeded API and web.
 * Screenshots go to $SHOTS_DIR.
 */
import { expect, test, type Page } from "@playwright/test";
import { API, newPhone } from "./fixtures";

const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/open-items";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const PASSWORD = "localloyalty-demo";
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}
async function owner(slug: string) {
  const { body: login } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: `owner+${slug}@example.com`, password: PASSWORD });
  const { body: list } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, login.accessToken);
  return { token: login.accessToken, base: `/v1/merchants/${list.items[0]!.id}` };
}
async function signInShopper(page: Page) {
  await page.locator("input[type=tel]").first().fill(newPhone());
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Enter");
}
const noSideScroll = async (page: Page) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
};

test("a restock link opens a one-item reserve page, and Reserve places the pickup order for that staple", async ({ page }) => {
  const slug = "annapurna-grocers-and-spices";
  const o = await owner(slug);
  const pantry = await call<{ items: { id: string; name: string; catalogItemId: string | null; active: boolean }[] }>("GET", `${o.base}/grocery/pantry`, undefined, o.token);
  const item = pantry.body.items.find((i) => i.active && i.catalogItemId)!;
  expect(item, "a pantry item linked to a catalog item").toBeTruthy();
  const pub = await call<{ item: { id: string; name: string } }>("GET", `/v1/public/shops/${slug}/pantry/${item.id}`);
  expect(pub.status).toBe(200);

  await page.goto(`/shops/${slug}/restock/${item.id}`);
  await expect(page.getByRole("heading", { level: 1, name: item.name })).toBeVisible();
  // Prefilled: the price and when it is ready, three-hour pick-up windows, one button. Nothing else to pick.
  await expect(page.getByText(/ready .* from /)).toBeVisible();
  const windows = page.getByRole("radiogroup", { name: "Pick-up time" }).getByRole("radio");
  await expect(windows.first()).toBeVisible();
  expect(await windows.count()).toBeGreaterThanOrEqual(1);
  await expect(windows.first()).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Pay at the counter when you pick it up/)).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({ path: shot("restock-390") });

  // Signed out: the button waits for the phone code. After it, Reserve is the order.
  await expect(page.getByRole("button", { name: "Reserve it" })).toHaveCount(0);
  await signInShopper(page);
  await page.getByRole("button", { name: "Reserve it" }).click();
  await page.waitForURL(/\/o\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText(item.name).first()).toBeVisible();
  await page.screenshot({ path: shot("restock-reserved-390") });
});

test("a restock link for an item that is gone is a 404, not the generic order page", async ({ page }) => {
  const res = await page.goto("/shops/annapurna-grocers-and-spices/restock/00000000-0000-4000-8000-000000000000");
  expect(res?.status()).toBe(404);
});

test("qurbani pre-order days are the Eid plan's days with their own animal counts", async ({ page }) => {
  const slug = "al-noor-halal-meats";
  const o = await owner(slug);
  const plan = await call<{ start: string; moved: boolean; days: { date: string; cap: number | null; booked: number }[]; items: { id: string; name: string }[] }>("GET", `${o.base}/grocery/butcher/eid`, undefined, o.token);
  expect(plan.status).toBe(200);
  const qurbani = plan.body.items.find((i) => /qurbani/i.test(i.name))!;
  expect(qurbani).toBeTruthy();
  const avail = await call<{ plan: { start: string } | null; days: { date: string; potsLeft: number | null }[] }>("GET", `/v1/public/shops/${slug}/preorders/availability?itemId=${qurbani.id}`);
  expect(avail.body.plan?.start).toBe(plan.body.start);
  expect(avail.body.days.map((d) => d.date)).toEqual(plan.body.days.map((d) => d.date));

  await page.goto(`/shops/${slug}/preorder/${qurbani.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/qurbani/i);
  await expect(page.getByText(/Eid al-Adha, .*\(date confirmed after moon sighting\)\./)).toBeVisible();
  const chips = page.getByRole("radiogroup", { name: "When" }).getByRole("radio");
  await expect(chips).toHaveCount(plan.body.days.length);
  // Each chip carries the day's animals left (the plan's cap less what is booked).
  for (const [i, d] of plan.body.days.entries()) {
    if (d.cap == null) continue;
    await expect(chips.nth(i)).toContainText(`${Math.max(0, d.cap - d.booked)} left`);
  }
  await noSideScroll(page);
  await page.screenshot({ path: shot("qurbani-390") });
});

test("pharmacy: the booked screen shows the exact reminder text, with no service and no health details", async ({ page }) => {
  await page.goto("/shops/village-apothecary/book");
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: /Choose a time|Pick a time/i }).click();
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).nth(1).click();
  const times = page.getByRole("button", { name: /^\d{1,2}:\d\d [ap]\.m\.$/ });
  await expect(times.first()).toBeVisible();
  await times.first().click();
  await page.getByRole("button", { name: /Sign in to book|Book/ }).first().click();
  await signInShopper(page);
  await expect(page.getByTestId("pharmacy-reminder")).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId("pharmacy-reminder");
  await expect(card).toContainText("Reminder we will send");
  const text = (await card.locator("p").textContent())!;
  expect(text).toMatch(/^Reminder: your appointment is \w{3},? \d{1,2}:\d\d [ap]m\. Change it: .+\/shops\/village-apothecary\/book\/[0-9a-f-]{36}\. Reply STOP to opt out\.$/);
  expect(text.toLowerCase()).not.toMatch(/flu|shot|vaccin|medic|prescri|\$/);
  expect(text.split("Change it:")[0]).not.toContain("Apothecary");
  await noSideScroll(page);
  await page.screenshot({ path: shot("pharmacy-booked-390") });
});
