import { expect, test } from "@playwright/test";
import { cafeQr, repairQuote } from "./fixtures";

const shot = (name: string) => `e2e/screenshots/${name}.png`;

test("counter QR join: phone → code → name + consent → joined", async ({ page }) => {
  const { qrCode } = await cafeQr();
  const phone = `647555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const started = Date.now();
  await page.goto(`/j/${qrCode}?ref=NOTAREALCODE`);
  await expect(page.getByRole("heading", { name: "Join in 30 seconds" })).toBeVisible();
  await expect(page.getByText("Pinecone Coffee Co.").first()).toBeVisible();
  await page.screenshot({ path: shot("01-join-phone"), fullPage: true });

  await page.getByLabel("Mobile number").fill(phone);
  await expect(page.getByLabel("Mobile number")).toHaveValue(`(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`);
  await page.getByRole("button", { name: "Text me a code" }).click();

  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/); // devCode autofill
  await page.screenshot({ path: shot("02-join-code"), fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByLabel("First name")).toBeVisible();
  const consent = page.getByLabel(/Send me offers and news from Pinecone Coffee Co\. by text and email\. I can unsubscribe anytime\./);
  await expect(consent).not.toBeChecked();
  await page.getByLabel("First name").fill("Alex");
  await consent.check();
  await page.screenshot({ path: shot("03-join-details"), fullPage: true });
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();

  await expect(page.getByText("You're in, Alex.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Member QR code/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save to Google Wallet" })).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  console.log(`join flow completed in ${seconds.toFixed(1)} s (automated)`);
  await page.screenshot({ path: shot("04-join-success"), fullPage: true });

  // The same session opens the web wallet.
  await page.goto("/me");
  await expect(page.getByRole("button", { name: "Show my card" })).toBeVisible();
  await expect(page.getByText("Pinecone Coffee Co.").first()).toBeVisible();
  await page.screenshot({ path: shot("05-wallet"), fullPage: true });
  await page.getByRole("button", { name: "Show my card" }).click();
  await expect(page.getByRole("dialog", { name: "My card" })).toBeVisible();
  await page.screenshot({ path: shot("06-wallet-card-sheet") });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /Settings/ }).click();
  await expect(page.getByRole("switch", { name: "Get offers from Pinecone Coffee Co." })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: shot("07-wallet-settings"), fullPage: true });
});

test("/join/<code> alias renders the same page; bad codes explain what to do", async ({ page }) => {
  const { qrCode } = await cafeQr();
  await page.goto(`/join/${qrCode}`);
  await expect(page.getByRole("heading", { name: "Join in 30 seconds" })).toBeVisible();
  await page.goto("/j/NOPE000");
  await expect(page.getByText("This QR code isn't active. Ask staff for help.")).toBeVisible();
});

test("public shop page with rewards, promos and about tabs", async ({ page }) => {
  const { slug } = await cafeQr();
  await page.goto(`/shops/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Pinecone Coffee Co." })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Rewards/ })).toBeVisible();
  await expect(page.getByText("How you earn here")).toBeVisible();
  await page.screenshot({ path: shot("08-shop-page"), fullPage: true });
  await page.getByRole("tab", { name: /Promos/ }).click();
  await page.getByRole("tab", { name: /About/ }).click();
  await expect(page.getByRole("table", { name: "Opening hours" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join Pinecone Coffee Co." })).toBeVisible();
});

test("quote approval with typed signature and deposit (dev fake payment)", async ({ page }) => {
  const { token } = await repairQuote();
  await page.goto(`/q/${token}`);
  await expect(page.getByRole("heading", { name: /Quote for Apple iPhone 13/ })).toBeVisible();
  await expect(page.getByText("Deposit due on approval")).toBeVisible();
  await page.screenshot({ path: shot("09-quote"), fullPage: true });

  await page.getByRole("button", { name: /Approve and pay/ }).click();
  await expect(page.getByText("Type your full name to sign.")).toBeVisible();
  await page.getByLabel("Type your name to sign").fill("Alex Chen");
  await page.getByRole("button", { name: /Approve and pay/ }).click();
  await expect(page.getByText(/Approved .* by Alex Chen/)).toBeVisible();
  await expect(page.getByText("Test payment (development)")).toBeVisible();
  await page.screenshot({ path: shot("10-quote-deposit"), fullPage: true });
  await page.getByRole("button", { name: /Pay \$.* deposit/ }).click();
  await expect(page.getByText(/Deposit of \$.* paid\./)).toBeVisible({ timeout: 25_000 });
  await page.screenshot({ path: shot("11-quote-paid"), fullPage: true });
});

test("marketing pages render with live data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your regulars already walk this street." })).toBeVisible();
  await page.screenshot({ path: shot("12-home"), fullPage: false });
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1, name: "Free forever. No transaction fees. Unlimited locations." })).toBeVisible();
  await page.screenshot({ path: shot("13-pricing"), fullPage: false });
  await page.goto("/neighbourhoods/roncesvalles");
  await expect(page.getByRole("heading", { name: /Welcome to Roncesvalles/ })).toBeVisible();
  await page.goto("/map");
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.getByRole("group", { name: "Map of shops" })).toBeVisible();
  await page.screenshot({ path: shot("14-map"), fullPage: true });
  await page.goto("/legal/terms");
  await expect(page.getByText("DRAFT: not reviewed by a lawyer and not in effect.")).toBeVisible();
});
