import { expect, test } from "@playwright/test";
import { enablePayments, ownerOf, publicInquiry, sendQuoteFor } from "./restaurant-fixtures";

const SHOP = "zeenat-catering";

function futureDay(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
}

test("catering inquiry → reference number → quote approval with typed signature and deposit", async ({ page }) => {
  // 1. Customer sends an inquiry from the shop's public form (no login).
  await page.goto(`/shops/${SHOP}/catering`);
  await expect(page.getByRole("heading", { level: 1, name: "Catering inquiry" })).toBeVisible();
  await page.getByRole("button", { name: "Walima" }).click();
  await page.getByLabel("Event date").fill(futureDay(40));
  await page.getByLabel("Number of guests").fill("120");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByLabel(/Dietary needs and allergies/).fill("Halal. 20 vegetarian guests.");
  await page.getByLabel("Your name").fill("Sana Malik");
  await page.getByLabel("Phone number").fill("416555" + String(Math.floor(1000 + Math.random() * 8999)));
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("heading", { name: "Inquiry sent" })).toBeVisible();
  const ref = await page.getByText(/^Reference #\d+$/).textContent();
  const number = Number(/#(\d+)/.exec(ref ?? "")?.[1]);
  expect(number).toBeGreaterThan(0);
  await expectNoHorizontalScroll(page);

  // 2. The kitchen prices a menu and sends the quote (staff API).
  const owner = await ownerOf(SHOP);
  await enablePayments(owner);
  const { token } = await sendQuoteFor(owner, number);

  // 3. The approval page: summary, menu lines, totals, deposit, signature.
  await page.goto(`/e/${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "Your catering quote" })).toBeVisible();
  await expect(page.getByText(`Quote #${number}`)).toBeVisible();
  await expect(page.getByText("Walima", { exact: true })).toBeVisible();
  await expect(page.getByText("120 guests × $14.50")).toBeVisible();
  await expect(page.getByText("6 trays × $45")).toBeVisible();
  await expect(page.getByText("$4,135.80")).toBeVisible();
  await expect(page.getByText("Deposit due now (30%)")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Typed signature is required.
  await page.getByRole("button", { name: /Approve and pay \$1,240\.74 deposit/ }).click();
  await expect(page.getByText("Type your full name, at least 2 letters.")).toBeVisible();
  await page.getByLabel("Type your full name to sign").fill("Sana Malik");
  await page.getByRole("button", { name: /Approve and pay \$1,240\.74 deposit/ }).click();

  // 4. Deposit through the dev fake provider, then the confirmed state.
  await expect(page.getByRole("heading", { name: "Pay your deposit" })).toBeVisible();
  await page.getByRole("button", { name: "Pay $1,240.74 deposit" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/We received your \$1,240\.74 deposit/)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Reloading shows the confirmed state, not the form.
  await page.reload();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await expect(page.getByLabel("Type your full name to sign")).toHaveCount(0);
});

test("quote with no deposit confirms on approval; Urdu lays out right to left", async ({ page }) => {
  const owner = await ownerOf(SHOP);
  const inquiry = await publicInquiry(SHOP, { eventType: "birthday", headcount: 40 });
  const { token } = await sendQuoteFor(owner, inquiry.number, { depositBps: 0 });

  await page.goto(`/e/${token}?lang=ur`);
  await expect(page.locator("[lang^='ur'][dir='rtl']").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("آپ کا کیٹرنگ کوٹیشن");
  await expectNoHorizontalScroll(page);

  await page.goto(`/e/${token}?lang=en`);
  await expect(page.getByText(/Deposit due now/)).toHaveCount(0);
  await page.getByLabel("Type your full name to sign").fill("Sana Malik");
  await page.getByRole("button", { name: "Approve quote" }).click();
  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await expect(page.getByText("No deposit is needed for this event.")).toBeVisible();
});

test("unknown quote links explain what to do", async ({ page }) => {
  await page.goto("/e/not-a-real-token-0000000000");
  await expect(page.getByText("This link doesn't work anymore")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find the shop" })).toBeVisible();
});

test("restaurant pages: menu filters, tiffin plans, banquet calendar, shop links", async ({ page }) => {
  await page.goto("/shops/nawab-biryani-house");
  await expect(page.getByRole("link", { name: /Menu/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Banquet halls/ })).toBeVisible();

  await page.goto("/shops/nawab-biryani-house/menu");
  await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
  await expect(page.getByText("Order ahead in the app")).toBeVisible();
  const all = await page.locator("li", { hasText: "$" }).count();
  await page.getByRole("button", { name: "Vegetarian" }).click();
  expect(await page.locator("li", { hasText: "$" }).count()).toBeLessThan(all);
  await expectNoHorizontalScroll(page);

  await page.goto("/shops/shree-thali-and-tiffin/tiffin");
  await expect(page.getByRole("heading", { level: 1, name: "Tiffin plans" })).toBeVisible();
  await page.getByRole("button", { name: "Choose this plan" }).first().click();
  await expect(page.getByRole("link", { name: "Sign in to subscribe" })).toHaveAttribute("href", /\/login\?next=%2Fshops%2Fshree-thali-and-tiffin%2Ftiffin/);
  await page.getByRole("button", { name: "+ Servings" }).click();
  await expect(page.getByText("2 servings")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/shops/nawab-biryani-house/banquet");
  await expect(page.getByRole("heading", { level: 1, name: "Banquet halls" })).toBeVisible();
  await expect(page.getByText(/Up to \d+ guests/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // A shop without these features shows no restaurant links.
  await page.goto("/shops/pinecone-coffee");
  await expect(page.getByRole("link", { name: /Tiffin plans|Banquet halls/ })).toHaveCount(0);
});
