import { expect, test } from "@playwright/test";
import { API, cafeQr, fillPhone, newPhone } from "./fixtures";

/**
 * Wave Q, customer: the kit pieces on the customer journey. The booking date strip opens a month calendar in the shop's colour and moves
 * the times to a later day; /me shows the other cards as a swipeable row of cards in their own colours; settings fold each shop into an
 * accordion row; the join code boxes are two groups of three; the stored review rating is a star image.
 */
const shot = (name: string) => `e2e/screenshots/wave-q-customer-${name}.png`;

async function api<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

test("booking: More dates opens a calendar in the shop's colour and moves the strip to a later day", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shops/arch-and-thread/book");
  await expect(page.getByRole("progressbar", { name: "Step 1 of 3" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Eyebrow threading/ }).click();
  await page.getByRole("button", { name: "Choose a time" }).click();
  const strip = page.getByRole("group", { name: "Pick a time" });
  await expect(strip.getByRole("button").first()).toBeVisible();
  // "More dates" is outside the group, so specs that click the group's last day keep working.
  await expect(strip.getByRole("button", { name: /More dates/ })).toHaveCount(0);
  await page.getByRole("button", { name: /More dates/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pick a date" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: /next month/i }).click();
  const day = sheet.locator("td button:not([disabled])").nth(10);
  await day.click();
  await expect(sheet).toBeHidden();
  // The strip now starts at the picked day (not today), and a day in it is chosen.
  await expect(strip.getByRole("button").first()).not.toContainText("Today");
  await expect(strip.locator("button[aria-pressed=true]")).toHaveCount(1);
  // The chosen day wears the shop's colour, not black.
  const on = await strip.locator("button[aria-pressed=true]").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(on).not.toBe("rgb(0, 0, 0)");
  await page.screenshot({ path: shot("book-later-390") });
});

test("/me: other cards are a carousel of cards in their shop colours; settings fold each shop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const digits = newPhone();
  const phone = `+1${digits}`;
  const start = await api<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: "Nadia" });
  const { qrCode } = await cafeQr();
  await api("POST", "/v1/me/memberships", { locationQrCode: qrCode }, accessToken);
  for (const slug of ["arch-and-thread", "crown-and-fade"]) {
    const shop = await api<{ merchant: { id: string } }>("GET", `/v1/public/shops/${slug}`);
    await api("POST", "/v1/me/memberships", { merchantId: shop.merchant.id }, accessToken);
  }
  await page.goto("/me");
  await fillPhone(page, digits);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const row = page.getByRole("region", { name: "Your other cards" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole("group")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "See all 3 cards" })).toBeVisible();
  await page.screenshot({ path: shot("me-cards-390") });

  await page.getByRole("button", { name: "Settings" }).click();
  // One accordion row per shop; the first is open, the others keep their switches mounted but hidden.
  const triggers = page.locator("[data-slot=accordion-trigger]").filter({ hasText: /Pinecone Coffee Co\.|Arch & Thread|Crown & Fade/ });
  await expect(triggers).toHaveCount(3);
  await expect(triggers.first()).toHaveAttribute("aria-expanded", "true");
  const closed = triggers.last();
  await expect(closed).toHaveAttribute("aria-expanded", "false");
  // Its switches are in the page (kept mounted), just not shown until the row opens.
  await expect(page.getByRole("switch", { name: /^Mute /, includeHidden: true })).toHaveCount(3);
  await closed.click();
  await expect(closed).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: shot("me-settings-390"), fullPage: true });
});

test("join code step: six boxes in two groups, a step bar in the shop's colour", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { qrCode } = await cafeQr();
  await page.goto(`/j/${qrCode}`);
  await fillPhone(page, newPhone());
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Step 2 of 3" })).toBeVisible();
  const boxes = page.locator("input[autocomplete=one-time-code] + div > div");
  await expect(boxes).toHaveCount(6);
  const xs = await boxes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  const gap = (i: number) => xs[i + 1]!.left - xs[i]!.right;
  expect(gap(2)).toBeGreaterThan(gap(1));
  for (const r of xs) expect(r.height).toBeGreaterThanOrEqual(44);
});

test("review page: the stars are a radio group, and pressing one fills it in the points colour", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/r/demo-review-sarson-layout");
  const four = page.getByRole("radio", { name: "4 out of 5 stars" });
  await four.click();
  await expect(four).toHaveAttribute("aria-checked", "true");
  const fill = await four.locator("svg").evaluate((e) => getComputedStyle(e).fill);
  expect(fill).not.toBe("none");
});
