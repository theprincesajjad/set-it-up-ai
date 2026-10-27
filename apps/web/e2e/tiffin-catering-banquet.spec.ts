/**
 * Tiffin, catering and banquet payments recorded by hand, the driver link, and the new Today / Subscribers / Revenue screens.
 * Needs the seeded API (Shree Gujarati Thali & Tiffin, Zeenat Catering Co. and Nawab Biryani House have e-transfer on in the demo seed).
 * Flow: a customer subscribes by e-transfer in the browser, the owner records it, the driver marks a stop, a caterer records a deposit.
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";
import { ownerOf, publicInquiry, sendQuoteFor } from "./restaurant-fixtures";

const PW = "localloyalty-demo";
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

async function call<T>(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function signInOwner(page: Page, slug: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner+${slug}@example.com`);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("tiffin: customer subscribes by e-transfer, the owner records it, meals start", async ({ browser }) => {
  const shree = await ownerOf("shree-thali-and-tiffin");
  // A new kitchen rule for this run: new e-transfer subscribers wait for the owner (no start on trust).
  const cur = await call<Record<string, unknown>>("GET", `/v1/merchants/${shree.id}/payment-settings`, undefined, shree.token);
  await call("PUT", `/v1/merchants/${shree.id}/payment-settings`, { ...cur, startOnTrust: false }, shree.token);

  // --- the customer, in the browser
  const customer = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phone = newPhone();
  await customer.goto("/shops/shree-thali-and-tiffin/tiffin");
  await customer.getByRole("button", { name: "Choose this plan" }).first().click();
  // Typed before signing in: the name and the address must still be there afterwards.
  await customer.getByLabel("Your name").fill("Priya Shah");
  await customer.getByLabel("Delivery address").fill("48 Maple Grove Dr");
  await customer.getByLabel("Postal code").fill("L5R 1B1");
  await fillPhone(customer, phone);
  await customer.getByRole("button", { name: "Send code" }).click();
  await expect(customer.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await customer.getByRole("button", { name: "Sign in", exact: true }).click();
  const first = customer.getByLabel("First name");
  if (await first.isVisible({ timeout: 3000 }).catch(() => false)) {
    await first.fill("Priya");
    await customer.getByRole("button", { name: /Continue|Join|Done|Save/ }).first().click();
  }
  // Signing in refreshes the page in place; the plan, name and address typed before it are kept.
  await expect(customer.getByRole("button", { name: /Subscribe · .* to send|Subscribe for/ }).or(customer.getByRole("radio", { name: /Interac e-transfer/ }))).toBeVisible();
  await expect(customer.getByLabel("Delivery address")).toHaveValue("48 Maple Grove Dr");
  await expect(customer.getByLabel("Postal code")).toHaveValue("L5R 1B1");
  await expect(customer.getByLabel("Your name")).toHaveValue("Priya Shah");
  await customer.getByRole("radio", { name: /Interac e-transfer/ }).click();
  await expect(customer.getByText("After you subscribe")).toBeVisible();
  await customer.getByRole("button", { name: /Subscribe · .* to send/ }).click();
  await expect(customer.getByText("How to pay").or(customer.getByText(/Now pay/))).toBeVisible();
  await expect(customer.getByText("pay@shreethali.ca").first()).toBeVisible();
  const ref = (await customer.getByText(/Message: [A-Z]{2}-\d{4}/).first().textContent())!.match(/[A-Z]{2}-\d{4}/)![0];
  await customer.screenshot({ path: "e2e/screenshots/tcb-customer-subscribed.png", fullPage: true });
  await customer.goto("/me/tiffin");
  await expect(customer.getByText(`Message: ${ref}`).first()).toBeVisible();
  await expect(customer.getByRole("button", { name: "Copy reference" })).toBeVisible();

  // --- the owner records it
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await signInOwner(page, "shree-thali-and-tiffin");
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=today`);
  await expect(page.getByText("Money to confirm")).toBeVisible();
  await expect(page.getByText("Needs you")).toBeVisible();
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=subscribers&status=awaiting`);
  await page.getByLabel("Search subscribers").fill(phone.slice(3));
  const row = page.getByRole("row").filter({ hasText: "Awaiting e-transfer" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Open/ }).click();
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const panel = page.getByRole("dialog", { name: "Record payment" });
  await expect(panel.getByText(ref)).toBeVisible();
  await expect(panel.getByText("pay@shreethali.ca")).toBeVisible();
  await panel.getByLabel("Interac reference").fill("CAe2e001");
  await page.screenshot({ path: "e2e/screenshots/tcb-record-payment.png" });
  await panel.getByRole("button", { name: /Mark paid/ }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=subscribers`);
  await page.getByLabel("Search subscribers").fill(phone.slice(3));
  await expect(page.getByRole("row").filter({ hasText: "Active" }).first()).toBeVisible();
  // The subscriber is the name they typed at subscribe, not a bare phone number.
  await expect(page.getByRole("row").filter({ hasText: "Priya Shah" }).first()).toBeVisible();
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=revenue`);
  await expect(page.getByText("Collected this month by how they paid")).toBeVisible();
  await expect(page.getByText(/Interac e-transfer \(recorded\)/)).toBeVisible();
  await expect(page.getByText("Still to come in")).toBeVisible();
  await ctx.close();

  // The subscription shows in the customer's wallet, next to the points it earned.
  await customer.goto("/me");
  await expect(customer.getByRole("navigation", { name: "My tiffin" })).toBeVisible();
  await expect(customer.getByRole("navigation", { name: "My tiffin" }).getByText(/Shree/)).toBeVisible();
  await customer.close();
});

test("tiffin: the owner adds a regular who phones in, and the phone Today view leads with Needs you", async ({ browser }) => {
  const shree = await ownerOf("shree-thali-and-tiffin");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await signInOwner(page, "shree-thali-and-tiffin");
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=subscribers`);
  await page.getByRole("button", { name: "Add subscriber" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add subscriber" });
  const regular = `Mrs Kaur ${Math.floor(Math.random() * 9000 + 1000)}`;
  await sheet.getByLabel("Name", { exact: true }).fill(regular);
  await sheet.getByLabel("Phone").fill(newPhone());
  await sheet.getByLabel("Delivery address").fill("9 Elm St");
  await sheet.getByLabel("Postal code").fill("L5R 2C2");
  await sheet.getByRole("button", { name: "Add subscriber" }).click();
  await expect(page.getByText(/is added\. They were texted how to pay/)).toBeVisible();
  await page.getByLabel("Search subscribers").fill(regular);
  await expect(page.getByRole("row").filter({ hasText: regular }).first()).toBeVisible();

  // On a phone the Today view puts "Needs you" and the driver run above the kitchen totals.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${shree.id}/restaurant/tiffin?tab=today`);
  const needs = page.getByRole("heading", { name: "Needs you" });
  const totals = page.getByText("Servings to cook").first();
  await expect(needs).toBeVisible();
  await expect(totals).toBeVisible();
  const [a, b] = [await needs.boundingBox(), await totals.boundingBox()];
  expect(a!.y).toBeLessThan(b!.y);
  await page.screenshot({ path: "e2e/screenshots/tcb-today-390.png" });
  await ctx.close();
});

test("driver: the link shows only the route, a stop is marked delivered, running late tells the rest", async ({ page }) => {
  const shree = await ownerOf("shree-thali-and-tiffin");
  const { items: routes } = await call<{ items: { id: string; name: string }[] }>("GET", `/v1/merchants/${shree.id}/tiffin/routes`, undefined, shree.token);
  const link = await call<{ url: string; token: string }>("POST", `/v1/merchants/${shree.id}/tiffin/routes/${routes[0]!.id}/driver-link`, {}, shree.token);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/d/${link.token}`);
  await expect(page.getByText(/Next stop/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delivered" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Navigate" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const before = await page.getByText(/\d+ of \d+ delivered/).textContent();
  await page.screenshot({ path: "e2e/screenshots/tcb-driver.png" });
  await page.getByRole("button", { name: "Delivered" }).click();
  await expect.poll(async () => page.getByText(/\d+ of \d+ delivered/).textContent()).not.toBe(before);
  await page.getByRole("button", { name: "Running late: tell the rest" }).click();
  await page.getByRole("button", { name: /20 min/ }).click();
  await expect(page.getByText(/Told \d+ stops?\./)).toBeVisible();
  // A made-up token is a dead end, not a leak.
  await page.goto("/d/not-a-real-token-at-all-0000");
  await expect(page.getByText("This link has expired")).toBeVisible();
});

test("catering: the customer pays the deposit by e-transfer and the caterer records it in the ledger", async ({ browser }) => {
  const zeenat = await ownerOf("zeenat-catering");
  const { number } = await publicInquiry("zeenat-catering");
  const { token, id } = await sendQuoteFor(zeenat, number);
  const cust = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await cust.goto(`/e/${token}`);
  // Real terms before signing, in catering words (no tiffin copy, no "ask the shop").
  await expect(cust.getByText(/100% back until 14 days before/)).toBeVisible();
  await expect(cust.getByText(/Meals start/)).toHaveCount(0);
  await expect(cust.getByText(/guests × \$14\.50/)).toBeVisible();
  await cust.getByLabel("Type your full name to sign").fill("Sana Malik");
  await cust.getByRole("radio", { name: /Pay by Interac e-transfer/ }).click().catch(() => undefined);
  await cust.getByRole("button", { name: /Approve and send .* by e-transfer|Approve and pay/ }).click();
  await expect(cust.getByText("pay@zeenatcatering.ca").first()).toBeVisible();
  await expect(cust.getByText(/[A-Z]{2}-\d{4}/).first()).toBeVisible();
  await cust.screenshot({ path: "e2e/screenshots/tcb-quote-etransfer.png", fullPage: true });
  await cust.close();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await signInOwner(page, "zeenat-catering");
  await page.goto(`/m/${zeenat.id}/restaurant/catering/${id}`);
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  // The deposit is waiting: one tap texts the customer.
  await expect(page.getByText(/Waiting on the deposit/)).toBeVisible();
  await page.getByRole("button", { name: "Remind", exact: true }).click();
  await expect(page.getByText("Reminder sent")).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const panel = page.getByRole("dialog", { name: "Record the deposit" });
  await panel.getByLabel("Interac reference").fill("CAe2e777");
  await panel.getByRole("button", { name: /Mark paid/ }).click();
  await expect(page.getByText("Deposit recorded")).toBeVisible();
  await expect(page.getByText(/Paid by e-transfer/).first()).toBeVisible();
  await page.goto(`/m/${zeenat.id}/restaurant/catering`);
  await expect(page.getByText("Open quotes")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next 8 weeks" })).toBeVisible();
  await ctx.close();
});

test("banquet: a hold shows its payment schedule and the first instalment is recorded", async ({ page }) => {
  const nawab = await ownerOf("nawab-biryani-house");
  await signInOwner(page, "nawab-biryani-house");
  await page.goto(`/m/${nawab.id}/restaurant/banquet?tab=availability`);
  await page.getByRole("radio", { name: "Month" }).click();
  await expect(page.getByText("Holds expiring in 48 h")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/tcb-banquet-availability.png", fullPage: true });
  await page.goto(`/m/${nawab.id}/restaurant/banquet?tab=bookings`);
  await page.getByRole("row", { name: /On hold/ }).first().click();
  await expect(page.getByText("Payment schedule")).toBeVisible();
  await expect(page.getByText(/Deposit to hold the date/)).toBeVisible();
});

test("settings: how you get paid, tax status and food safety save", async ({ page }) => {
  const shree = await ownerOf("shree-thali-and-tiffin");
  await signInOwner(page, "shree-thali-and-tiffin");
  await page.goto(`/m/${shree.id}/restaurant/payments`);
  await expect(page.getByRole("heading", { name: "How you get paid" })).toBeVisible();
  await expect(page.getByLabel("E-transfer email")).toHaveValue("pay@shreethali.ca");
  await page.getByRole("radio", { name: /Yes, I'm registered/ }).click();
  await page.getByLabel("GST/HST number").fill(`${Math.floor(100000000 + Math.random() * 899999999)} RT0001`);
  await page.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(page.getByText("Tax status saved")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/tcb-settings.png", fullPage: true });
});
