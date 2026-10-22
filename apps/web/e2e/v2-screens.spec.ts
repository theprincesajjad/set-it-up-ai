/**
 * v2 design review shots (docs/design/foundations.md): every customer + marketing page at 390 px
 * (phone) and 1280 px (desktop) → e2e/screenshots/v2/<name>-<width>.png. Needs the seeded API +
 * web server (see playwright.config.ts). Map tiles go through HTTPS_PROXY when set.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { API, cafeQr, repairQuote } from "./fixtures";

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const BASE = process.env.E2E_WEB_URL ?? "http://localhost:3100";
const SIZES = [
  { w: 390, h: 844, mobile: true },
  { w: 1280, h: 860, mobile: false },
] as const;

test.setTimeout(240_000);

async function ctx(browser: Browser, s: (typeof SIZES)[number]): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE,
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    isMobile: s.mobile,
    hasTouch: s.mobile,
    userAgent: s.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" : undefined,
    proxy,
    ignoreHTTPSErrors: true,
  });
}

const shot = (page: Page, name: string, w: number, full = true) => page.screenshot({ path: `e2e/screenshots/v2/${name}-${w}.png`, fullPage: full });

for (const s of SIZES) {
  test(`marketing pages @${s.w}`, async ({ browser }) => {
    const c = await ctx(browser, s);
    const page = await c.newPage();
    for (const [path, name] of [
      ["/", "home"],
      ["/for-shoppers", "for-shoppers"],
      ["/for-bias", "for-bias"],
      ["/pricing", "pricing"],
      ["/neighbourhoods", "neighbourhoods"],
      ["/neighbourhoods/roncesvalles", "neighbourhood"],
      ["/signup", "signup"],
      ["/login", "login"],
      ["/legal/terms", "legal"],
      ["/accessibility", "accessibility"],
      ["/nope-not-a-page", "not-found"],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, name, s.w);
    }
    await c.close();
  });

  test(`map @${s.w}`, async ({ browser }) => {
    const c = await ctx(browser, s);
    const page = await c.newPage();
    await page.goto("/map");
    const map = page.getByRole("region", { name: "Map of shops" });
    await expect(map).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3500); // tiles
    await shot(page, "map", s.w, false);
    const pin = map.getByRole("button", { name: /Pinecone Coffee Co\./ }).first();
    await pin.dispatchEvent("click");
    await page.waitForTimeout(1200);
    await shot(page, "map-sheet", s.w, false);
    await page.getByRole("radio", { name: "List" }).click();
    await shot(page, "map-list", s.w);
    await c.close();
  });

  test(`join + wallet + shop @${s.w}`, async ({ browser }) => {
    const { qrCode, slug } = await cafeQr();
    const c = await ctx(browser, s);
    const page = await c.newPage();
    const phone = `647555${String(Math.floor(1000 + Math.random() * 8999))}`;
    await page.goto(`/j/${qrCode}`);
    await expect(page.getByRole("heading", { name: "join in 30 seconds" })).toBeVisible();
    await shot(page, "join-1-phone", s.w);
    await page.getByLabel("Mobile number").fill(phone);
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    await shot(page, "join-2-code", s.w);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("First name").fill("Alex");
    await shot(page, "join-3-details", s.w);
    await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
    await expect(page.getByText("You're in, Alex.")).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, "join-4-joined", s.w);

    // Give the new member a few stamps so the wallet has something real to show.
    await page.goto("/me");
    await expect(page.getByRole("button", { name: "Show my card" })).toBeVisible();
    await shot(page, "wallet", s.w);
    await page.getByRole("button", { name: "Show my card" }).click();
    await page.waitForTimeout(400);
    await shot(page, "wallet-card", s.w, false);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Pinecone Coffee Co\./ }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "wallet-shop-sheet", s.w, false);
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Rewards" }).click();
    await page.waitForTimeout(600);
    await shot(page, "wallet-rewards", s.w);
    await page.getByRole("tab", { name: "Settings" }).click();
    await shot(page, "wallet-settings", s.w);

    await page.goto(`/shops/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "Pinecone Coffee Co." })).toBeVisible();
    await shot(page, "shop-member", s.w);
    await c.close();

    const anon = await ctx(browser, s);
    const p2 = await anon.newPage();
    await p2.goto(`/shops/${slug}`);
    await shot(p2, "shop", s.w);
    await p2.getByRole("tab", { name: /About/ }).click();
    await shot(p2, "shop-about", s.w);
    await p2.goto("/me");
    await shot(p2, "me-signed-out", s.w);
    await anon.close();
  });

  test(`quote @${s.w}`, async ({ browser }) => {
    const { token } = await repairQuote();
    const c = await ctx(browser, s);
    const page = await c.newPage();
    await page.goto(`/q/${token}`);
    await expect(page.getByText("Deposit due on approval")).toBeVisible();
    await shot(page, "quote", s.w);
    await page.getByLabel("Type your name to sign").fill("Alex Chen");
    await page.getByRole("button", { name: /Approve and pay/ }).click();
    await expect(page.getByText("Test payment (development)")).toBeVisible();
    await shot(page, "quote-deposit", s.w);
    await page.getByRole("button", { name: /Pay \$.* deposit/ }).click();
    await expect(page.getByText(/Deposit of \$.* paid\./)).toBeVisible({ timeout: 25_000 });
    await shot(page, "quote-paid", s.w);
    await c.close();
  });
}

test("API reachable", async () => {
  const r = await fetch(`${API}/v1/network/neighbourhoods`);
  expect(r.ok).toBe(true);
});

test("dark mode spot check", async ({ browser }) => {
  const { qrCode } = await cafeQr();
  for (const s of SIZES) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, colorScheme: "dark", isMobile: s.mobile });
    const page = await c.newPage();
    for (const [path, name] of [["/", "dark-home"], ["/pricing", "dark-pricing"], [`/j/${qrCode}`, "dark-join"]] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await shot(page, name, s.w, false);
    }
    await c.close();
  }
});
