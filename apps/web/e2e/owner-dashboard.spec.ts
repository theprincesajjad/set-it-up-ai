/**
 * Wave P, owner team: the business dashboard after signup, walked as three people.
 *  - Amara, a home nail tech on her phone: a brand-new shop. Today leads with a setup guide, Customers and Services explain how
 *    clients arrive instead of "0 / 0", Staff lists her own row (her hours live there) and offers an invite, and a Pro page
 *    (Promos) says what Pro adds with the free trial as the first button.
 *  - Omar, a barber with chairs, at 1440: each staff row has one main action and a "more" menu, not six buttons.
 *  - Sofia, a café manager, at 1440: Customers has a search box and a "Not back in 30 days" filter, Settings lists its sections
 *    down the left, Billing marks the plan that fits and folds the restaurant plans away. Urdu once.
 * Needs the seeded API. Screenshots: e2e/screenshots/owner-dashboard/.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PW = "localloyalty-demo";
const shot = (name: string) => `e2e/screenshots/owner-dashboard/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function merchantId(email: string, password = PW) {
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password });
  return (await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken)).items[0]!.id;
}
async function signIn(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const settle = (page: Page) => page.waitForFunction(() => !document.querySelector(".skeleton"));

test.describe("Amara, a new nail tech, on her phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(120_000);

  test("a brand-new shop: setup guide, real empty states, her own staff row and a Pro page with the trial first", async ({ page }) => {
    const email = `amara+${Date.now()}@example.com`;
    const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/register", { email, password: PW, name: "Amara Okafor" });
    const { merchant } = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: "Amara Nails", vertical: "nails", address: "14 Main St N, Brampton", phone: "(416) 555-0199" }, accessToken);
    const base = `/m/${merchant.id}`;
    await signIn(page, email);

    await page.goto(base);
    const guide = page.getByTestId("setup-guide");
    await expect(guide.getByRole("heading", { name: "Get ready for your first booking" })).toBeVisible();
    await expect(guide.getByText("0 of 6 done")).toBeVisible();
    await expect(guide.getByRole("link", { name: "Pick your link" })).toHaveAttribute("href", `${base}/setup?step=your_link`);
    await guide.getByRole("button", { name: "Services and prices" }).click();
    await expect(guide.getByRole("link", { name: "Add services" })).toBeVisible();
    await expect(page).toHaveTitle(/Amara Nails/);
    await settle(page);
    await page.screenshot({ path: shot("nails-today-390"), fullPage: true });

    await page.goto(`${base}/customers`);
    await expect(page.getByText("No clients yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy your booking link" })).toBeVisible();
    await expect(page.getByText("0 / 0")).toHaveCount(0);
    await page.screenshot({ path: shot("nails-customers-390"), fullPage: true });

    await page.goto(`${base}/services`);
    await expect(page.getByText("Add what clients can book")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add the usual services" })).toBeVisible();

    await page.goto(`${base}/staff`);
    const list = page.getByRole("list", { name: "Your staff" });
    await expect(list.getByText("Amara Okafor", { exact: true })).toBeVisible();
    await expect(list.getByRole("button", { name: "Hours and services" })).toBeVisible();
    await expect(page.getByText("Working with someone?")).toBeVisible();
    await page.screenshot({ path: shot("nails-staff-390"), fullPage: true });

    await page.goto(`${base}/promos`);
    const teaser = page.getByTestId("feature-teaser");
    await expect(teaser.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();
    await expect(teaser.getByText("Included in Pro · $29 a month")).toBeVisible();
    await expect(teaser.getByRole("link", { name: "See plans" })).toBeVisible();
    await page.screenshot({ path: shot("nails-promos-locked-390"), fullPage: true });
    await teaser.getByTestId("teaser-trial").click();
    await expect(page.getByRole("link", { name: "Create a promo" })).toBeVisible();
  });
});

test.describe("at the desk, 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("Omar's staff: one main action per person and the rest in a menu", async ({ page }) => {
    const email = "owner+crown-and-fade@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}/staff`);
    const list = page.getByRole("list", { name: "Your staff" });
    await expect(list.getByText("Marcus Bailey", { exact: true })).toBeVisible();
    await expect(list.getByRole("button", { name: "Language and station" })).toHaveCount(0);
    await list.getByRole("button", { name: "More for Marcus" }).click();
    const menu = page.getByRole("menu");
    for (const item of ["Language and station", "Remove from staff"]) await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
    await page.screenshot({ path: shot("barber-staff-menu-1440") });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("Sofia finds who hasn't been back, reads Settings down the left, and sees the plan that fits", async ({ page }) => {
    const email = "owner+pinecone-coffee@example.com";
    const id = await merchantId(email);
    await signIn(page, email);

    await page.goto(`/m/${id}/customers`);
    await page.getByTestId("customer-search").fill("Mason");
    await expect(page.getByText("Mason Patel").first()).toBeVisible();
    await expect(page.getByText(/^\d+ matching ·/)).toBeVisible();
    await expect(page.getByText("Isabella Smith")).toHaveCount(0);
    await page.getByTestId("customer-search").fill("");
    await page.getByRole("radio", { name: /Not back in 30 days/ }).or(page.getByRole("button", { name: /Not back in 30 days/ })).first().click();
    await settle(page);
    await page.screenshot({ path: shot("cafe-customers-lapsed-1440") });

    await page.goto(`/m/${id}/settings`);
    const tabs = page.getByRole("tablist", { name: "Settings" });
    await expect(tabs).toHaveAttribute("data-side", "");
    const box = await tabs.boundingBox();
    expect(box!.height).toBeGreaterThan(box!.width); // a list down the left, not a row
    await tabs.getByRole("tab", { name: "Hours" }).click();
    await expect(tabs.getByRole("tab", { name: "Hours" })).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: shot("cafe-settings-1440") });

    await page.goto(`/m/${id}/billing`);
    await expect(page.locator('[data-plan="studio"]').getByText("Best fit for you")).toBeVisible();
    const food = page.getByTestId("restaurant-plans");
    await expect(food.getByText("Selling food to order online?")).toBeVisible();
    await expect(food.getByRole("heading", { name: "Restaurant Starter", exact: true })).toBeHidden();
    await food.getByText("Selling food to order online?").click();
    await expect(food.getByRole("heading", { name: "Restaurant Starter", exact: true })).toBeVisible();
  });

  test("Urdu: the staff list mirrors and reads in Urdu", async ({ page }) => {
    const email = "owner+crown-and-fade@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}/staff`);
    await page.getByRole("button", { name: /Language/ }).click();
    await page.getByRole("menuitemradio", { name: "اردو" }).click();
    await expect(page.getByRole("list", { name: "آپ کا اسٹاف" })).toBeVisible();
    await expect(page.locator("[dir=rtl]").first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: shot("barber-staff-ur-1440") });
    // The language is a cookie in this browser context only; the other specs start in English.
  });
});
