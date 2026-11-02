import { expect, test } from "@playwright/test";
import { API, cafeQr, fillPhone, newPhone } from "./fixtures";

async function api<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Wave P, customer journey: the join steps share one frame with a step count, booking is time → "Check and book" with one action
 * at a time (the chosen time survives signing in), /me signed out offers a way out, and settings fold the trade-only alerts.
 */
const shot = (name: string) => `e2e/screenshots/wave-p-customer-${name}.png`;
const TIMES = /^\d{1,2}:\d\d [ap]\.m\.$/;

test("QR join: the code and name steps keep the shop frame and say which step it is", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { qrCode } = await cafeQr();
  await page.goto(`/j/${qrCode}`);
  await fillPhone(page, newPhone());
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByTestId("join-step")).toHaveText("Step 2 of 3");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await expect(page.getByTestId("join-step")).toHaveText("Step 3 of 3");
  await expect(page.getByText(/You can leave it blank/)).toBeVisible();
  await page.screenshot({ path: shot("join-name-390") });
  // The name is optional: joining without one still works.
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
  await expect(page.getByTestId("joined-pass")).toBeVisible();
});

test("booking: times grouped by part of day, then Check and book; the chosen time survives signing in", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shops/arch-and-thread/book");
  await expect(page.getByText("Who would you like?")).toBeVisible();
  await page.getByRole("checkbox", { name: /Eyebrow threading/ }).click();
  await page.getByRole("button", { name: "Choose a time" }).click();
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).last().click();
  const times = page.getByRole("button", { name: TIMES });
  await expect(times.first()).toBeVisible();
  await expect(page.locator("[data-testid^=times-]").first()).toBeVisible();
  // Only the time on this step: no name field, no sign-in.
  await expect(page.getByLabel("Your first name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  const label = (await times.first().textContent())!.trim();
  await times.first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Check and book" })).toBeVisible();
  const summary = page.getByTestId("book-summary");
  await expect(summary).toContainText(label);
  await expect(summary).toContainText("Eyebrow threading");
  await expect(page.getByText(/Change or cancel free until/)).toBeVisible();
  await page.screenshot({ path: shot("book-details-390") });

  // One action at a time: "Sign in to book" turns into the phone form, and its own button goes away.
  await page.getByRole("button", { name: "Sign in to book" }).click();
  await expect(page.getByRole("heading", { name: "Your mobile number" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to book" })).toHaveCount(0);
  await page.locator("input[type=tel]").first().fill(newPhone());
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  // No name yet: it stops on the name, with the same time still chosen (it used to drop the time here).
  await expect(page.getByText("Add your first name")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("book-summary")).toContainText(label);
  await page.getByLabel("Your first name").fill("Ayesha");
  await page.getByRole("button", { name: /^Book/ }).last().click();
  await expect(page.getByTestId("booked-card")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("booked-card")).toContainText("It's saved on your card");
  await page.screenshot({ path: shot("book-done-390"), fullPage: true });

  // Manage: one ticket with directions; cancelling states the policy once.
  await page.getByRole("link", { name: "Change or cancel" }).click();
  await expect(page.getByTestId("appt-ticket")).toBeVisible();
  await expect(page.getByTestId("appt-ticket").getByRole("link", { name: "Directions" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByText("Your appointment is cancelled.")).toBeVisible({ timeout: 20_000 });
});

test("/me signed out shows the cards to come back to and a way in for newcomers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "your cards" })).toBeVisible();
  await expect(page.getByText("No card yet?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find shops near you" })).toHaveAttribute("href", "/map");
});

test("/me: other cards under the pass, a real offers switch, and trade-only alerts folded in settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // A fresh customer with two cards (the seeded customers' sign-in codes are shared with other specs and capped at 5 an hour).
  const digits = newPhone();
  const phone = `+1${digits}`;
  const start = await api<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: "Nadia" });
  const { qrCode } = await cafeQr();
  await api("POST", "/v1/me/memberships", { locationQrCode: qrCode }, accessToken);
  const shop = await api<{ merchant: { id: string } }>("GET", "/v1/public/shops/arch-and-thread");
  await api("POST", "/v1/me/memberships", { merchantId: shop.merchant.id }, accessToken);

  await page.goto("/me");
  await fillPhone(page, digits);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("region", { name: /Your other card/ })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: shot("me-other-cards-390") });
  await page.getByRole("button", { name: "Settings" }).click();
  const more = page.getByTestId("more-alerts");
  await expect(more).toBeVisible();
  await expect(page.getByRole("switch", { name: "Hall bookings" })).toBeHidden();
  // wave-q: "More alerts" is the kit Accordion now (a button in a heading, not a <summary>).
  await more.getByRole("button", { name: /More alerts/ }).click();
  await expect(page.getByRole("switch", { name: "Hall bookings" })).toBeVisible();
});
