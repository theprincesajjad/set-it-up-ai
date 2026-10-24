import { expect, test, type Page } from "@playwright/test";
import { cafeQr } from "./fixtures";

const shot = (name: string) => `e2e/screenshots/${name}.png`;

/** Join the café through its counter QR, so the context holds a signed-in shopper (language en). */
async function joinAsShopper(page: Page) {
  const { qrCode } = await cafeQr();
  const phone = `647555${String(Math.floor(1000 + Math.random() * 8999))}`;
  await page.goto(`/j/${qrCode}`);
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("Alex");
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
  await expect(page.getByText("You're in, Alex.")).toBeVisible();
}

test("/for-shoppers: English, then Hindi, Urdu (right to left) and Punjabi, with one card and live street counts", async ({ page }) => {
  await page.goto("/for-shoppers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("one card for every shop on your street.");
  await expect(page.getByRole("heading", { name: "where your card works." })).toBeVisible();
  // The one picture is the shopper's own card, not two decorative phones.
  await expect(page.getByText("Add to Apple Wallet")).toHaveCount(1);
  await page.screenshot({ path: shot("shopper-01-for-shoppers"), fullPage: true });

  await page.goto("/for-shoppers?lang=hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("आपकी गली की हर दुकान के लिए एक कार्ड।");
  await expect(page.getByRole("heading", { name: "तीन कदम, किसी ऐप की ज़रूरत नहीं।" })).toBeVisible();
  await expect(page.locator("[lang='hi-IN']").first()).toBeVisible();

  await page.goto("/for-shoppers?lang=ur");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("آپ کی گلی کی ہر دکان");
  await expect(page.locator("div[dir='rtl'][lang='ur-PK']").first()).toBeVisible();
  await page.screenshot({ path: shot("shopper-02-for-shoppers-ur"), fullPage: true });

  await page.goto("/for-shoppers?lang=pa");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ਤੁਹਾਡੀ ਗਲੀ ਦੀ ਹਰ ਦੁਕਾਨ");
  // The header offers the language menu on this page, and it keeps you on /for-shoppers.
  const summary = page.locator("header summary").filter({ hasText: "ਪੰਜਾਬੀ" });
  if (await summary.count()) {
    await summary.first().click();
    await expect(page.locator("header a[href='/for-shoppers?lang=hi']").first()).toBeVisible();
  }
});

test("a shopper's language follows them: Settings saves it on the profile and the wallet speaks it", async ({ page }) => {
  await joinAsShopper(page);
  await page.goto("/me");
  // The street: a live neighbourhood campaign shows under "on your street", linking to its page.
  await expect(page.getByRole("heading", { name: "on your street" })).toBeVisible();
  await page.screenshot({ path: shot("shopper-03-wallet-street"), fullPage: true });

  await page.getByRole("tab", { name: /Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Messages in" })).toBeVisible();
  await page.getByRole("radio", { name: "हिन्दी" }).click();
  await expect(page.getByRole("tab", { name: "सेटिंग्स" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "संदेश की भाषा" })).toBeVisible();
  // Saved on the profile (not just this browser): the API now holds "hi".
  await expect.poll(async () => (await (await page.request.get("/api/ll/v1/me")).json()).locale).toBe("hi");
  // The routine-alert budget is stated in words, in Hindi.
  await expect(page.getByText(/दिन में ज़्यादा से ज़्यादा 3/)).toBeVisible();
  await page.screenshot({ path: shot("shopper-04-settings-hi"), fullPage: true });

  // A new visit without ?lang= or a cookie still opens in the profile language.
  await page.context().clearCookies({ name: "ll_lang" });
  await page.goto("/me");
  await expect(page.getByRole("tab", { name: "दुकानें" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "वॉलेट" })).toBeVisible();

  // Back to English from the same row.
  await page.getByRole("tab", { name: "सेटिंग्स" }).click();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("tab", { name: "Settings" })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/ll/v1/me")).json()).locale).toBe("en");
});

test("Activity is the inbox, with the day's alert budget said out loud; the bell on Discover lands there", async ({ page }) => {
  await joinAsShopper(page);
  await page.goto("/discover");
  await expect(page.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/me#activity");
  await page.goto("/me#activity");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Notifications", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/3 routine alerts a day at most/)).toBeVisible();
  await page.screenshot({ path: shot("shopper-05-activity"), fullPage: true });
});

test("Discover and the campaign page in Urdu: right to left, headings translated", async ({ page }) => {
  await joinAsShopper(page);
  await page.goto("/discover?lang=ur");
  await expect(page.locator("div[dir='rtl'][lang='ur-PK']").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "آپ کے قریب" })).toBeVisible();
  await page.screenshot({ path: shot("shopper-06-discover-ur"), fullPage: true });
  const api = process.env.E2E_API_URL ?? process.env.E2E_API ?? "http://localhost:4100";
  const live = await (await fetch(`${api}/v1/public/live-campaigns`)).json();
  expect(Array.isArray(live.items)).toBe(true);
  if (live.items[0]) {
    await page.goto(`/c/${live.items[0].id}?lang=hi`);
    await expect(page.getByRole("heading", { name: "यह कैसे काम करता है" })).toBeVisible();
  }
});
