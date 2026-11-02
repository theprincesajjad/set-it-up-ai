/**
 * Wave Q, visitor: the marketing site on the component kit. The home page has the trades Marquee (read once by screen readers), the
 * where-do-you-fit BentoGrid with whole-card links, and the questions on the kit Accordion with every answer in the HTML; /pricing
 * highlights Pro with the struck first-year price; the footer keeps plain anchors into the A/B pages; legal pages have a contents rail;
 * the neighbourhood cards and the 404 keep their ways on.
 */
import { expect, test } from "@playwright/test";

test.describe("home on the kit", () => {
  test("trades marquee: one readable list, moving copies hidden, still under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const trades = page.getByRole("region", { name: "Made for the shops on your street" });
    await expect(trades).toContainText("Cafés, Bakeries, Hair salons");
    const row = trades.locator("[aria-hidden=true]").first();
    await expect(row).toBeAttached();
    const anim = await row.locator(":scope > div").first().evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe("none");
  });

  test("where do you fit is a bento: each card is one link, 44px or taller", async ({ page }) => {
    await page.goto("/");
    const router = page.getByRole("region", { name: "Where do you fit?" });
    await expect(router.locator(".hm-bento")).toHaveCount(1);
    const link = router.getByRole("link", { name: /See booking/ });
    await expect(link).toHaveAttribute("href", "/for-nail-techs");
    // The link's hit area is the whole card (after:inset-0), so clicking the card's heading follows it.
    const box = await link.evaluate((e) => {
      const r = e.closest(".group")!.getBoundingClientRect();
      return { h: r.height };
    });
    expect(box.h).toBeGreaterThanOrEqual(44);
  });

  test("questions: the kit accordion, answers in the HTML, opens and closes", async ({ page }) => {
    await page.goto("/");
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("Stamps and points, rewards, the wallet card");
    const q = page.getByRole("button", { name: "Is there a contract?" });
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("There's no contract and no setup fee.")).toBeVisible();
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("pricing on the kit", () => {
  test("Pro is the highlighted card with the first-year price; the FAQ is an accordion", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pricing");
    const pro = page.locator("#shops [data-plan=plus]");
    await expect(pro.getByText("Most popular")).toBeVisible();
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
