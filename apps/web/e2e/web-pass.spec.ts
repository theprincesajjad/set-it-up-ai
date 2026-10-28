import { expect, test } from "@playwright/test";
import { cafeQr, fillPhone, repairQuote, newPhone } from "./fixtures";

const shot = (name: string) => `e2e/screenshots/${name}.png`;

test("counter QR join: phone → code → name + consent → joined", async ({ page }) => {
  const { qrCode } = await cafeQr();
  const phone = newPhone();
  const started = Date.now();
  await page.goto(`/j/${qrCode}?ref=NOTAREALCODE`);
  await expect(page.getByRole("heading", { name: "get a stamp for today’s coffee" })).toBeVisible();
  await expect(page.getByText("Pinecone Coffee Co.").first()).toBeVisible();
  // CASL: optional, unticked, offered with the phone (canvas Join).
  const consent = page.getByLabel("Text me offers from Pinecone Coffee Co. (optional). Not ticked for you. Reply STOP any time. Your stamps work either way.");
  await expect(consent).not.toBeChecked();
  await page.screenshot({ path: shot("01-join-phone"), fullPage: true });

  await consent.check();
  await fillPhone(page, phone);
  await page.getByRole("button", { name: "Text me a code" }).click();

  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/); // devCode autofill
  await page.screenshot({ path: shot("02-join-code"), fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByLabel("First name")).toBeVisible();
  await page.getByLabel("First name").fill("Alex");
  await page.screenshot({ path: shot("03-join-details"), fullPage: true });
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();

  await expect(page.getByText("You're in, Alex.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Member QR code/ })).toBeVisible();
  // The wallet team's <WalletButtons> hides a pass the server can't issue (local API: not configured).
  const google = page.getByRole("button", { name: "Add to Google Wallet" });
  if (await google.count()) await expect(google).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  console.log(`join flow completed in ${seconds.toFixed(1)} s (automated)`);
  await page.screenshot({ path: shot("04-join-success"), fullPage: true });

  // The same session opens the web wallet.
  await page.goto("/me");
  await expect(page.getByRole("link", { name: "Show my card" })).toBeVisible();
  await expect(page.getByText("Pinecone Coffee Co.").first()).toBeVisible();
  await page.screenshot({ path: shot("05-wallet"), fullPage: true });
  // The card is the first thing on the pass: the QR is on the page, no sheet to open.
  await expect(page.getByRole("img", { name: /Member QR code/ })).toBeVisible();
  await page.screenshot({ path: shot("06-wallet-card-sheet") });
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: "Get offers from Pinecone Coffee Co." })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: shot("07-wallet-settings"), fullPage: true });

  // Settings: "Download my data" gives a JSON file with a section for every feature (PIPEDA access, Law 25 portability).
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  for (const key of ["profile", "memberships", "consents", "visits", "orders", "appointments", "tiffinSubscriptions", "cateringEvents", "hallBookings", "whatsapp", "phoneCalls", "reviews", "serviceTickets", "waitlist", "referrals", "notificationPrefs", "walletPasses", "doNotContact"]) expect(data, key).toHaveProperty(key);
  expect(data.consents[0]).toMatchObject({ merchantName: "Pinecone Coffee Co." });
});

test("/join/<code> alias renders the same page; bad codes explain what to do", async ({ page }) => {
  const { qrCode } = await cafeQr();
  await page.goto(`/join/${qrCode}`);
  await expect(page.getByRole("heading", { name: "get a stamp for today’s coffee" })).toBeVisible();
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
  await page.getByRole("tab", { name: /Offers/ }).click();
  await page.getByRole("tab", { name: /About/ }).click();
  await expect(page.getByRole("table", { name: "Opening hours" })).toBeVisible();
  // One black action at a time: the sticky Join bar shows unless the join form itself is on screen.
  const sticky = page.getByRole("link", { name: "Join Pinecone Coffee Co.", includeHidden: true });
  await expect(sticky).toBeAttached();
  if (!(await sticky.isVisible())) await expect(page.locator("#join")).toBeInViewport({ ratio: 0.15 });
});

test("quote approval with typed signature and deposit (dev fake payment)", async ({ page }) => {
  const { token } = await repairQuote();
  await page.goto(`/q/${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "your repair quote" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Deposit due now/ })).toBeVisible();
  await page.screenshot({ path: shot("09-quote"), fullPage: true });

  await page.getByRole("button", { name: /Approve and pay/ }).click();
  await expect(page.getByText("Type your full name, at least 2 letters.")).toBeVisible();
  await page.getByLabel("Type your full name to sign").fill("Alex Chen");
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
  await expect(page.getByRole("heading", { level: 1, name: "free forever for your loyalty program. flat prices for the rest." })).toBeVisible();
  await page.screenshot({ path: shot("13-pricing"), fullPage: false });
  await page.goto("/neighbourhoods/roncesvalles");
  await expect(page.getByRole("heading", { name: /Welcome to Roncesvalles/ })).toBeVisible();
  await page.goto("/map");
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: "Shops near you" })).toBeVisible();
  // The vector map itself (and the 14-map screenshot) is covered by e2e/map.spec.ts.
  await page.goto("/legal/terms");
  await expect(page.getByText("DRAFT: not reviewed by a lawyer and not in effect.")).toBeVisible();
});
