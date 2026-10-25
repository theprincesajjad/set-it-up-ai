import { expect, test, type Locator, type Page } from "@playwright/test";
import { cafeQr, newPhone } from "./fixtures";

/**
 * A slow phone on 3G: the server-rendered HTML is on screen and usable for seconds before React attaches its handlers.
 * Everything typed in that window used to be dropped (the raw text stayed in the box, state stayed empty). These specs
 * hold every JS chunk back for 3 s, type with a PLAIN fill (no retry helper) before hydration, then submit.
 */
const JS_DELAY_MS = 3_000;

async function slowJs(page: Page) {
  await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, async (route) => {
    await new Promise((r) => setTimeout(r, JS_DELAY_MS));
    await route.continue();
  });
}

/** True once React has attached to this node (it stamps __reactProps$… on hydrated elements). */
const isHydrated = (el: Locator) => el.evaluate((node) => Object.keys(node).some((k) => k.startsWith("__reactProps")));

/** Type before hydration: the field is visible and enabled, but React has not attached yet. */
async function typeBeforeHydration(field: Locator, text: string) {
  await expect(field).toBeVisible();
  expect(await isHydrated(field), "the page must still be un-hydrated when we type").toBe(false);
  await field.fill(text);
}

const formatted = (d: string) => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;

test.describe("typing before hydration (3 s JS delay)", () => {
  test("phone sign-in: phone then OTP", async ({ page }) => {
    await slowJs(page);
    const phone = newPhone();
    await page.goto("/me", { waitUntil: "domcontentloaded" });
    const field = page.getByLabel("Mobile number");
    await typeBeforeHydration(field, phone);
    // Hydration adopts and formats what was typed.
    await expect(field).toHaveValue(formatted(phone), { timeout: 20_000 });
    await page.getByRole("button", { name: "Send code" }).click();

    const otp = page.getByLabel("6-digit code");
    await expect(otp).toHaveValue(/^\d{6}$/);
    const code = await otp.inputValue();
    await otp.fill("");
    await otp.fill(code); // a plain fill of the OTP box works too
    await expect(otp).toHaveValue(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Mobile number")).toHaveCount(0);
  });

  test("join flow: phone, consent, code, name", async ({ page }) => {
    const { qrCode } = await cafeQr();
    await slowJs(page);
    const phone = newPhone();
    await page.goto(`/j/${qrCode}`, { waitUntil: "domcontentloaded" });
    const field = page.getByLabel("Mobile number");
    await typeBeforeHydration(field, phone);
    await expect(field).toHaveValue(formatted(phone), { timeout: 20_000 });
    await page.getByRole("button", { name: "Text me a code" }).click();

    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("First name").fill("Sam");
    await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
    await expect(page.getByText("You're in, Sam.")).toBeVisible();
  });

  test("join flow: a consent box ticked before hydration stays ticked", async ({ page }) => {
    const { qrCode } = await cafeQr();
    await slowJs(page);
    await page.goto(`/j/${qrCode}`, { waitUntil: "domcontentloaded" });
    const consent = page.getByLabel(/^Text me offers from Pinecone Coffee Co\./);
    await expect(consent).toBeVisible();
    expect(await isHydrated(consent)).toBe(false);
    await consent.check();
    await expect.poll(() => isHydrated(consent), { timeout: 20_000 }).toBe(true);
    await expect(consent).toBeChecked();
    await expect(page.getByText(/^Messages come from/)).toBeVisible(); // the caption only shows when React state says ticked
  });

  test("contact form (shop owners): name, shop and phone", async ({ page }) => {
    await slowJs(page);
    const phone = newPhone();
    await page.goto("/#book", { waitUntil: "domcontentloaded" });
    const form = page.locator("form", { has: page.getByRole("button", { name: "Book my visit" }) });
    const name = form.getByLabel("Your name");
    await typeBeforeHydration(name, "Sofia");
    await form.getByLabel("Shop name").fill("Pinecone Coffee Co.");
    const field = form.getByLabel("Phone");
    await field.fill(phone);
    await expect(field).toHaveValue(formatted(phone), { timeout: 20_000 });
    await expect(name).toHaveValue("Sofia");
    await form.getByRole("button", { name: "Book my visit" }).click();
    await expect(page.getByText("Thanks. A rep will call you within 1 business day.")).toBeVisible();
  });

  test("contact form (restaurants): name, restaurant and phone", async ({ page }) => {
    await slowJs(page);
    const phone = newPhone();
    await page.goto("/for-restaurants", { waitUntil: "domcontentloaded" });
    const form = page.locator("form", { has: page.getByRole("button", { name: "Book my visit" }) });
    await typeBeforeHydration(form.getByLabel("Your name"), "Imran");
    await form.getByLabel("Restaurant").fill("Karahi House");
    const field = form.getByLabel("Phone");
    await field.fill(phone);
    await expect(field).toHaveValue(formatted(phone), { timeout: 20_000 });
    await form.getByRole("button", { name: "Book my visit" }).click();
    await expect(page.getByText("Thanks. We will call or message you within 1 business day.")).toBeVisible();
  });
});
