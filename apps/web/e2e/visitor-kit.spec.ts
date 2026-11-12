/**
 * Wave Q, visitor: the marketing site on the component kit (the home page was rebuilt in wave V: the card maker under the hero, and
 * photo tiles for the shop types that preset it); the questions are on the kit Accordion with every answer in the HTML; /pricing
 * highlights Pro with the struck first-year price; the footer keeps plain anchors into the A/B pages; legal pages have a contents rail;
 * the neighbourhood cards and the 404 keep their ways on.
 */
import { expect, test } from "@playwright/test";

test.describe("home on the kit", () => {
  // Wave V: the trades list became the card maker's trade picker; nothing on the page loops.
  test("the card maker: type a name, pick a trade and a colour, and the card and the sign-up link follow", async ({ page }) => {
    await page.goto("/");
    const moving = await page.evaluate(() => [...document.querySelectorAll(".lp *")].filter((e) => getComputedStyle(e).animationIterationCount === "infinite").length);
    expect(moving).toBe(0);
    const tryIt = page.locator("#try");
    const pass = tryIt.locator(".lp-try-pass");
    const cta = tryIt.locator("[data-cta=tryit]");
    // Before typing: the café card with its own reward, and a plain sign-up link for a café.
    await expect(tryIt.getByRole("radio", { name: "Café" })).toBeChecked();
    await expect(tryIt.getByText("Free drink after 10 stamps", { exact: true })).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/signup?vertical=cafe&src=home-try");
    // Wave W: the button names the shop once one is typed.
    await expect(cta).toHaveText("Keep this card, start free");
    await tryIt.getByLabel("Your shop’s name").fill("Fix-It Phone Lab");
    // The radios are visually hidden inside their labels (the chips and swatches): click what a person clicks.
    await tryIt.locator(".lp-chip", { hasText: "Repair shop" }).click();
    await tryIt.locator(".lp-swatch", { has: page.getByRole("radio", { name: "Blue" }) }).click();
    await expect(tryIt.getByRole("radio", { name: "Repair shop" })).toBeChecked();
    await expect(pass.locator(".wu-pass-name")).toHaveText("Fix-It Phone Lab");
    await expect(cta).toHaveText("Keep Fix-It Phone Lab’s card, start free");
    await expect(pass.locator(".wu-pass-logo")).toHaveText("F");
    await expect(pass).toContainText("Free screen protector");
    await expect(tryIt.getByText("Free screen protector at 150 points, 1 point a dollar", { exact: true })).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/signup?shop=Fix-It+Phone+Lab&vertical=repair_electronics&color=2F55D4&src=home-try");
    // A shop tile further down presets the trade and brings the card maker into view.
    await page.locator("#shops").getByRole("link", { name: /Make a barber card/ }).click();
    await expect(tryIt.getByRole("radio", { name: "Barber" })).toBeChecked();
    await expect(page).toHaveURL(/#try$/);
    // Keep this card: the sign-up flow starts at the name, already filled in, with the trade picked.
    await cta.click();
    await expect(page).toHaveURL(/\/signup\?.*shop=Fix-It/);
    await expect(page.getByRole("textbox").first()).toHaveValue("Fix-It Phone Lab");
  });

  test("shop tiles: six, each one link with a 44px target that covers the tile", async ({ page }) => {
    await page.goto("/");
    const tiles = page.locator("#shops .lp-tile");
    await expect(tiles).toHaveCount(6);
    const link = page.locator("#shops").getByRole("link", { name: /Make a corner store card/ });
    expect(await link.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    // The link's hit area is the whole tile (::after inset 0).
    const after = await link.evaluate((e) => getComputedStyle(e, "::after").position);
    expect(after).toBe("absolute");
  });

  test("questions: the kit accordion, answers in the HTML, opens and closes", async ({ page }) => {
    await page.goto("/");
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("Stamps and points, rewards, the wallet card");
    const q = page.getByRole("button", { name: "Is there a contract?" });
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("There’s no contract and no setup fee.")).toBeVisible();
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("pricing on the kit", () => {
  test("Pro is the highlighted card with the first-year price and no popularity badge; the FAQ is an accordion", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pricing");
    const pro = page.locator("#shops [data-plan=plus]");
    // Nothing backs "Most popular" yet, so no plan says it, here or on the home page.
    await expect(page.getByText("Most popular")).toHaveCount(0);
    await expect(pro).toBeVisible();
    await expect(pro.getByTestId("first-year-price").locator("s")).toHaveText("$290");
    await expect(pro.getByTestId("first-year-price")).toContainText("$199");
    const [proH, freeH] = await Promise.all([pro.evaluate((e) => e.getBoundingClientRect().height), page.locator("#shops [data-plan=free]").evaluate((e) => e.getBoundingClientRect().height)]);
    expect(proH).toBeGreaterThan(freeH);
    await expect(page.locator("main")).not.toContainText(/founding/i);
    const faq = page.locator("[data-faq]");
    await expect(faq.getByRole("button").first()).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("footer, legal, neighbourhoods, 404", () => {
  test("footer: the ask, four columns, the trade pages", async ({ page }) => {
    await page.goto("/pricing");
    // Wave W: the header's button says what the home page's buttons say.
    // Both copies: the desktop button and the one in the phone menu sheet (closed here, so matched by its href, not its role).
    await expect(page.locator('header a[href="/signup"]')).toHaveText(["Make your free card", "Make your free card"]);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
    for (const h of ["Shops", "Neighbourhoods", "Company", "Legal"]) await expect(footer.getByRole("heading", { name: h, exact: true })).toBeVisible();
    // The A/B pages stay plain anchors (no prefetch; e2e/landing-ab.spec.ts checks nothing is fetched ahead).
    await expect(footer.getByRole("link", { name: "For barbers", exact: true })).toHaveAttribute("href", "/for-barbers");
  });

  test("legal: a contents rail links every section", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/legal/privacy");
    const toc = page.getByRole("navigation", { name: "On this page" });
    const first = toc.getByRole("link").first();
    const href = (await first.getAttribute("href"))!;
    expect(href).toMatch(/^#s1-/);
    await expect(page.locator(`article h2${href}`)).toHaveCount(1);
  });

  test("neighbourhoods are cards and the 404 keeps both ways on", async ({ page }) => {
    await page.goto("/neighbourhoods");
    await expect(page.locator('main a[href^="/neighbourhoods/"]').first()).toBeVisible();
    await page.goto("/no-such-page-at-all?lang=ur");
    await expect(page.getByTestId("not-found-business").getByRole("link")).toHaveCount(2);
  });
});
