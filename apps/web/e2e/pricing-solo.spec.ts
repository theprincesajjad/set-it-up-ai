/**
 * phase-solo A: the pricing page's three solo plans (Free, Pro, Annual) and the billing page that mirrors it,
 * at 390 and 1440, in Clear light and in Urdu. Screenshots go to SOLO_SHOTS (default: e2e/screenshots/solo-a, not tracked).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
/** axe (wcag2a, wcag2aa) inside one selector. */
async function axe(page: Page, selector: string): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (sel) => {
    const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }, selector);
}

const DIR = process.env.SOLO_SHOTS ?? "e2e/screenshots/solo-a";
const shot = (name: string) => `${DIR}/${name}.png`;
const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };

async function signIn(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function pineconeId(): Promise<string> {
  const login = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(OWNER) });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const r = await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${accessToken}` } });
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}

const SIZES = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
] as const;

test.describe("solo pricing", () => {
  for (const { w, h } of SIZES) {
    test(`three plans, the table, the comparison and the founding strip at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/pricing?theme=clear");
      const shops = page.locator("#shops");
      await expect(shops.locator("[data-plan=free]")).toContainText("$0");
      await expect(shops.locator("[data-plan=plus]")).toContainText("$39");
      await expect(shops.locator("[data-plan=annual]")).toContainText("$390");
      await expect(shops.locator("[data-plan=annual]")).toContainText("48 promos a year");
      await expect(shops.locator("[data-plan=plus]")).toContainText("4 promos a month");
      await expect(shops.locator("[data-plan=pro]")).toContainText("$99");
      await expect(shops).toContainText("Prices in CAD");
      await expect(shops.getByTestId("founding-strip")).toContainText("$290 for your first year, then $390");
      await expect(shops.getByTestId("founding-strip")).toContainText("of 200 spots left");
      await expect(page.getByRole("table", { name: "Compare Free, Pro and the annual plan" })).toBeVisible();
      await expect(page.getByTestId("solo-table")).toContainText("30 a month, then email");
      await expect(page.getByTestId("solo-compare")).toContainText("Fresha");
      await expect(page.getByTestId("solo-compare")).toContainText("Oct 28, 2026");
      // No horizontal page scroll at phone width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: shot(`pricing-${w}`), fullPage: true });
      await page.goto("/pricing?theme=clear&lang=ur");
      await page.screenshot({ path: shot(`pricing-${w}-ur`), fullPage: true });
    });
  }

  test("is axe-clean", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pricing?theme=clear");
    expect(await axe(page, "#shops")).toEqual([]);
  });
});

test.describe("billing mirrors it", () => {
  for (const { w, h } of SIZES) {
    test(`usage panel and the annual line at ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const base = `/m/${await pineconeId()}`;
      await signIn(page, `${base}/billing`);
      await page.goto(`${base}/billing?theme=clear`);
      await expect(page.getByTestId("plan-usage")).toContainText("Bookable calendars");
      await expect(page.getByTestId("plan-usage")).toContainText("Reminder texts");
      await page.screenshot({ path: shot(`billing-${w}`), fullPage: true });
      await page.getByRole("radio", { name: "Pay yearly: 2 months free" }).first().click();
      await expect(page.getByText("The annual plan includes your website and one .ca domain.")).toBeVisible();
      await page.screenshot({ path: shot(`billing-${w}-yearly`), fullPage: true });
      await page.goto(`${base}/billing?theme=clear&lang=ur`);
      await expect(page.getByTestId("plan-usage")).toBeVisible();
      await page.screenshot({ path: shot(`billing-${w}-ur`), fullPage: true });
      expect(await axe(page, "main")).toEqual([]);
    });
  }
});
