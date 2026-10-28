/**
 * v3 shell and Today (workstream B): one shell for every trade, five sidebar sections, four Today cards, a language switcher that
 * mirrors the layout in Urdu, and the same shell on the admin console. Needs the seeded API.
 * Screenshots: e2e/screenshots/shell-v3/.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PW = "localloyalty-demo";
const shot = (name: string) => `e2e/screenshots/shell-v3/${name}.png`;

async function merchantId(email: string, password = PW) {
  const login = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const r = await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${accessToken}` } });
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}
async function signIn(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("a café: five sidebar sections, four Today cards, one primary", async ({ page }) => {
    const email = "owner+pinecone-coffee@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    // sections are lowercase labels; Settings holds Staff, POS & integrations and Billing
    for (const label of ["today", "customers", "grow", "shop"]) await expect(nav.getByText(label, { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    for (const link of ["Counter", "Customers", "Rewards", "Reports", "Locations & QR kit", "Settings", "Staff", "POS & integrations", "Billing & plans"]) await expect(nav.getByRole("link", { name: link })).toBeVisible();
    for (const card of ["Needs you", "Up next", "Quick actions"]) await expect(page.getByRole("heading", { level: 2, name: card })).toBeVisible();
    await expect(page.locator("header [data-primary-action]")).toHaveCount(1);
    await page.waitForFunction(() => !document.querySelector(".skeleton"));
    await page.screenshot({ path: shot("cafe-1440") });
  });

  test("arrow keys move between sidebar links", async ({ page }) => {
    const email = "owner+pinecone-coffee@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}`);
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await nav.getByRole("link", { name: "Home" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(nav.getByRole("link", { name: "Counter" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(nav.getByRole("link", { name: "Billing & plans" })).toBeFocused();
  });

  test("the language menu switches to Urdu: sidebar on the right, page mirrored", async ({ page }) => {
    const email = "owner+nawab-biryani-house@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}`);
    await page.getByRole("button", { name: /Language/ }).click();
    await page.getByRole("menuitemradio", { name: "اردو" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "آج" })).toBeVisible();
    await expect(page.locator("[dir=rtl]").first()).toBeVisible();
    const box = await page.locator('[data-slot="sidebar-container"]').boundingBox();
    expect(box!.x).toBeGreaterThan(700); // the sidebar sits on the right
    await page.waitForFunction(() => !document.querySelector(".skeleton"));
    await page.screenshot({ path: shot("restaurant-1440-urdu") });
  });

  test("the admin console has the same shell", async ({ page }) => {
    await signIn(page, "admin@localloyalty.example", "localloyalty-admin");
    await expect(page).toHaveURL(/\/admin$/);
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await expect(nav.getByText("today", { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Merchants" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Language/ })).toBeVisible();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.setTimeout(120_000);

  test("bottom bar: Today, Counter, Customers, More; More opens the whole menu", async ({ page }) => {
    const email = "owner+pinecone-coffee@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}`);
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    for (const tab of ["Today", "Counter", "Customers"]) await expect(bar.getByRole("link", { name: tab })).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
    // Needs you comes before the numbers on a phone
    const order = await page.evaluate(() => [...document.querySelectorAll("#needs-you, [aria-label=\"Today's numbers\"], #up-next, #quick-actions")].map((n) => n.id || n.getAttribute("aria-label")));
    expect(order).toEqual(["needs-you", "Today's numbers", "up-next", "quick-actions"]);
    await page.waitForFunction(() => !document.querySelector(".skeleton"));
    await page.screenshot({ path: shot("cafe-390"), fullPage: true });
    await bar.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Reports" })).toBeVisible();
    await page.screenshot({ path: shot("cafe-390-more") });
  });
});
