/**
 * Wave Q, visitor: the marketing site on the component kit (the home page was rebuilt in wave R: a plain trades line and hairline
 * where-do-you-fit rows replace the Marquee and the BentoGrid); the questions are on the kit Accordion with every answer in the HTML; /pricing
 * highlights Pro with the struck first-year price; the footer keeps plain anchors into the A/B pages; legal pages have a contents rail;
 * the neighbourhood cards and the 404 keep their ways on.
 */
import { expect, test } from "@playwright/test";

test.describe("home on the kit", () => {
  // Wave R (unslop): the trades are a plain line, nothing loops; where-do-you-fit is four hairline rows, each row one link.
  test("trades: one plain list under the live counts, nothing moving", async ({ page }) => {
    await page.goto("/");
    const trades = page.getByRole("region", { name: "Set up for" });
    await expect(trades.getByRole("listitem")).toHaveCount(13);
    await expect(trades.getByRole("listitem").first()).toHaveText("Cafés");
    const moving = await page.evaluate(() => [...document.querySelectorAll(".lp *")].filter((e) => getComputedStyle(e).animationIterationCount === "infinite").length);
    expect(moving).toBe(0);
  });

  test("where do you fit: four rows, each row one link, 44px or taller", async ({ page }) => {
    await page.goto("/");
    const router = page.getByRole("region", { name: "Where do you fit?" });
    await expect(router.locator(".lp-door")).toHaveCount(4);
    const link = router.getByRole("link", { name: /See booking/ });
    await expect(link).toHaveAttribute("href", "/for-nail-techs");
    // The link's hit area is the whole row (::after inset 0), so clicking the row's title follows it.
    const h = await link.evaluate((e) => e.closest(".lp-door")!.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    expect(await link.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
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
