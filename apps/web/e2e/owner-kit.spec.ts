/**
 * Wave Q, owner team: the dashboard after onboarding wears the kit (docs: scratchpad wave-q kit.md).
 *  - Reports: the key numbers roll in (NumberFlow) and "joiners who came back" are meters.
 *  - Billing: usage quotas are meters, the questions and the restaurant plans are accordions, plan prices roll on the period switch.
 *  - Settings: the brand colour is the kit ColorField, the logo and cover links fold into an accordion.
 *  - Promo editor: start and end days come from the kit DatePicker (a month in a popover).
 *  - Calendar: "Pick a day" opens the kit DayCalendar and moves the day.
 *  - Today (a new shop): the setup guide is an accordion with a meter.
 * Needs the seeded API. Screenshots: e2e/screenshots/owner-kit/.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PW = "localloyalty-demo";
const shot = (name: string) => `e2e/screenshots/owner-kit/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function merchantId(email: string) {
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: PW });
  return (await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken)).items[0]!.id;
}
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const settle = (page: Page) => page.waitForFunction(() => !document.querySelector(".skeleton"));

test.describe("Sofia at the desk, 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("reports, billing, settings and the promo editor use the kit", async ({ page }) => {
    const email = "owner+pinecone-coffee@example.com";
    const id = await merchantId(email);
    await signIn(page, email);

    await page.goto(`/m/${id}/reports`);
    const keys = page.getByRole("group", { name: /Key numbers/ });
    await expect(keys.locator("number-flow-react").first()).toBeAttached({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "Joiners who came back" }).getByRole("meter")).toHaveCount(3);
    await settle(page);
    await page.screenshot({ path: shot("cafe-reports-1440"), fullPage: true });

    await page.goto(`/m/${id}/billing`);
    const usage = page.getByTestId("plan-usage");
    await expect(usage.getByRole("meter").first()).toBeVisible();
    const faq = page.getByRole("button", { name: "What happens if I cancel?" });
    await expect(faq).toHaveAttribute("aria-expanded", "false");
    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Your loyalty program keeps running on Free. Your customers")).toBeVisible();
    await page.getByRole("radio", { name: "Pay yearly: 2 months free" }).first().click();
    await expect(page.getByTestId("billing-plans").locator("[data-plan=studio]")).toContainText("$590");
    await page.screenshot({ path: shot("cafe-billing-1440"), fullPage: true });

    await page.goto(`/m/${id}/settings`);
    const colours = page.getByRole("radiogroup", { name: "Brand colour" });
    await expect(colours).toBeVisible();
    const links = page.getByRole("button", { name: "Logo and cover photo links" });
    await links.click();
    await expect(page.getByLabel(/Logo URL/)).toBeVisible();
    await colours.getByRole("radio").nth(1).click();
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
    await page.screenshot({ path: shot("cafe-settings-1440"), fullPage: true });

    await page.goto(`/m/${id}/promos/new`);
    const starts = page.getByRole("button", { name: /^Starts:/ });
    await starts.scrollIntoViewIfNeeded();
    await starts.click();
    const month = page.getByRole("grid");
    await expect(month).toBeVisible();
    await month.locator('td:not([data-outside="true"]) button').filter({ hasText: /^28$/ }).click();
    await expect(month).toBeHidden();
    await expect(page.getByRole("button", { name: /^Starts:.*28/ })).toBeVisible();
    await page.screenshot({ path: shot("cafe-promo-when-1440") });
  });

  test("Omar picks a day from the calendar's month", async ({ page }) => {
    const email = "owner+crown-and-fade@example.com";
    const id = await merchantId(email);
    await signIn(page, email);
    await page.goto(`/m/${id}/calendar`);
    const jump = page.getByTestId("calendar-jump");
    const before = await jump.innerText();
    await jump.click();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("grid").locator('td:not([data-outside="true"]) button').filter({ hasText: /^15$/ }).click();
    await expect(jump).not.toHaveText(before);
    await expect(jump).toContainText("15");
    await page.screenshot({ path: shot("barber-calendar-jump-1440") });
  });
});

test.describe("Amara, a new nail tech, on her phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.setTimeout(120_000);

  test("the setup guide is an accordion with a meter", async ({ page }) => {
    const email = `amara+kit${Date.now()}@example.com`;
    const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/register", { email, password: PW, name: "Amara Okafor" });
    const { merchant } = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: "Amara Nails", vertical: "nails", address: "14 Main St N, Brampton", phone: "(416) 555-0199" }, accessToken);
    await signIn(page, email);
    await page.goto(`/m/${merchant.id}`);
    const guide = page.getByTestId("setup-guide");
    await expect(guide.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    const services = guide.getByRole("button", { name: "Services and prices" });
    await expect(services).toHaveAttribute("aria-expanded", "false");
    await services.click();
    await expect(services).toHaveAttribute("aria-expanded", "true");
    await expect(guide.getByRole("link", { name: "Add services" })).toBeVisible();
    await expect(guide.getByRole("link", { name: "Pick your link" })).toBeHidden();
    await settle(page);
    await page.screenshot({ path: shot("nails-today-390"), fullPage: true });
  });
});
