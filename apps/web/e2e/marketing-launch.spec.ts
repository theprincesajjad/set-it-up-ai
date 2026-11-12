/**
 * The public marketing site at launch: the header menu, the visit-counting switch, the lead and start forms, the shopper page's own
 * actions, the share cards and icons, the search metadata, and the restaurant page in every language. Each test names the failure it
 * guards against. Run with E2E_WEB_URL (see docs/engineering/web.md); no screenshots are written.
 */
import { expect, test } from "@playwright/test";

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 };

test.describe("phone", () => {
  test.use(PHONE);

  test("the header menu closes on Escape, on a tap outside and when a link in it is followed", async ({ page }) => {
    await page.goto("/");
    const menu = page.locator("header details").last();
    const button = menu.locator("summary");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(button).toBeFocused();
    await button.click();
    await page.mouse.click(100, 600);
    await expect(menu).not.toHaveAttribute("open", "");
    await button.click();
    await menu.getByRole("link", { name: "Pricing" }).click();
    await page.waitForURL("**/pricing");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  });

  test("turning the visit counting off keeps the visitor on the home page and says it is off", async ({ page }) => {
    await page.goto("/");
    const notice = page.locator("[data-landing-notice]");
    await notice.getByRole("link", { name: "Turn it off" }).click();
    await page.waitForURL(/\/#counting-off$/);
    await expect(page.locator("[data-landing-off]")).toHaveText("Counting is off on this browser. Nothing else changes.");
    await expect(notice).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your regulars");
    // Later visits send nothing and still say it is off.
    let events = 0;
    page.on("request", (r) => {
      if (r.url().includes("landing-events")) events++;
    });
    await page.goto("/");
    await page.mouse.wheel(0, 4000);
    await expect(page.locator("[data-landing-off]")).toBeVisible();
    expect(events).toBe(0);
  });

  test("the sticky sign-up bar is not drawn over the footer, and the chat launcher does not cover its last line", async ({ page }) => {
    await page.goto("/");
    const last = page.locator("footer p").last();
    await last.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator(".lp-sticky")).toHaveAttribute("data-hide", "");
    await expect(last).toBeInViewport();
    const [lineBottom, launcherTop] = await page.evaluate(() => {
      const ps = document.querySelectorAll("footer p");
      const launcher = document.querySelector("[data-chat-launcher]");
      return [ps[ps.length - 1]!.getBoundingClientRect().bottom, launcher ? launcher.getBoundingClientRect().top : Number.POSITIVE_INFINITY];
    });
    expect(lineBottom).toBeLessThanOrEqual(launcherTop);
  });

  test("the trade page's start form stops a contact that is neither an email nor a mobile number", async ({ page }) => {
    await page.goto("/for-barbers#start");
    const form = page.locator("#start form");
    await form.locator("input[name=shop]").fill("Launch Check Cuts");
    const contact = form.locator("input[name=contact]");
    await contact.fill("not-an-email");
    await form.getByRole("button", { name: "Get started free" }).click();
    await expect(page).toHaveURL(/\/for-barbers#start$/);
    await expect(contact).toBeFocused();
    expect(await contact.evaluate((el: HTMLInputElement) => el.validationMessage)).toBe("Enter an email address or a 10-digit mobile number.");
    await contact.fill("(416) 555-0199");
    await form.getByRole("button", { name: "Get started free" }).click();
    await page.waitForURL(/\/signup\?.*contact=/);
  });
});

test.describe("desktop", () => {
  test.use(DESKTOP);

  test("lead forms say what the details are for, link the privacy policy and move focus to the first bad field", async ({ page }) => {
    for (const [path, section, purpose] of [
      ["/#book", "#book", "only to arrange your visit"],
      ["/for-bias#talk", "#talk", "only to reply about your campaign"],
    ] as const) {
      await page.goto(path);
      const form = page.locator(`${section} form`).first();
      await expect(form.getByTestId("lead-purpose")).toContainText(purpose);
      await expect(form.getByTestId("lead-purpose").getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/legal/privacy");
      await form.locator("button[type=submit]").click();
      await expect(form.locator('[aria-invalid="true"]').first()).toBeFocused();
    }
  });

  test("a lead that cannot be sent says why, in plain words, with a way to reach a person", async ({ page }) => {
    await page.goto("/#book");
    const form = page.locator("#book form").first();
    await form.getByLabel("Your name").fill("Launch Check");
    await form.getByLabel("Shop name").fill("Launch Check Shop");
    await form.locator("input[type=tel], input[inputmode=tel], input[inputmode=numeric]").first().fill("4165550142");
    await page.route("**/public/leads", (r) => r.fulfill({ status: 429, headers: { "retry-after": "600" }, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests" } }) }));
    await form.locator("button[type=submit]").click();
    const alert = form.getByRole("alert").last();
    await expect(alert).toContainText("Try again in 10 minutes");
    await expect(alert).not.toContainText("Too many requests");
    await expect(alert.locator('a[href^="mailto:"]')).toHaveCount(1);
  });

  test("the shopper page's header offers a shopper's actions, and no app store link without a configured listing", async ({ page }) => {
    await page.goto("/for-shoppers");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "Find shops near me" })).toHaveAttribute("href", "/map");
    await expect(banner.getByRole("link", { name: "My card" })).toHaveAttribute("href", "/me");
    await expect(banner.getByRole("link", { name: "Make your free card" })).toHaveCount(0);
    for (const a of await page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"]').all()) expect(await a.getAttribute("href")).toMatch(/\/(app|store\/apps\/details)/);
  });

  test("every trade page has its own share card, and the site has one icon set", async ({ page, request }) => {
    for (const [path, card] of [
      ["/for-barbers", "/og/solo/barber"],
      ["/for-nail-techs", "/og/solo/nail"],
      ["/for-groomers", "/og/solo/groom"],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`${card}$`));
      await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Local Loyalty");
      const res = await request.get(card);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
    for (const icon of ["/favicon.ico", "/apple-icon.png", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/opengraph-image"]) expect((await request.get(icon)).status(), icon).toBe(200);
    expect(await (await request.get("/icon.svg")).text()).not.toContain("#C8452C");
  });

  test("the home and pricing pages carry structured data, and the secondary pages their own title and description", async ({ page }) => {
    await page.goto("/");
    const types = async () => (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => (JSON.parse(t) as { "@type": string })["@type"]);
    expect(await types()).toEqual(["Organization", "SoftwareApplication", "FAQPage"]);
    await page.goto("/pricing");
    expect(await types()).toEqual(["SoftwareApplication", "FAQPage"]);
    await page.goto("/for-bias/one-pager");
    await expect(page).toHaveTitle(/A street campaign in one page/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/for-bias\/one-pager$/);
    const root = await page.locator('meta[name="description"]').getAttribute("content");
    for (const path of ["/legal/privacy", "/accessibility"]) {
      await page.goto(path);
      expect(await page.locator('meta[name="description"]').getAttribute("content"), path).not.toBe(root);
    }
  });

  test("an English page downloads no Hindi, Urdu or Punjabi font", async ({ page }) => {
    await page.goto("/pricing");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
    expect(loaded.filter((f) => /Noto/i.test(f))).toEqual([]);
  });

  for (const lang of ["hi", "ur", "pa"] as const) {
    test(`the restaurant page is in ${lang} from the hero to the visit form`, async ({ page }) => {
      await page.goto(`/for-restaurants?lang=${lang}`);
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(5);
      // No heading, paragraph, list line or button between the header and the footer is an English sentence (the phone is a marked English sample).
      const english = await page.locator("main :is(h1, h2, h3, p, li, button, figcaption)").evaluateAll((els) =>
        els.filter((el) => !el.closest('[lang^="en"]') && /^[A-Za-z][A-Za-z ,.'’·-]{14,}$/.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim().slice(0, 60)),
      );
      expect(english).toEqual([]);
      expect(await page.locator("main h2").count()).toBeGreaterThanOrEqual(7);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});
