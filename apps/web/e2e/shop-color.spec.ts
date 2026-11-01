import { expect, test, type Locator } from "@playwright/test";
import { cafeQr, fillPhone, newPhone } from "./fixtures";

/**
 * Customer screens wear the shop's own colour (lib/shopColor.ts): Pinecone Coffee Co. has the brand colour #2F5D50 in the seed, so
 * the shop page hero, the join card, the join success pass and the Book/Join buttons are that green, with text on it that reads (AA).
 */
const PINECONE = "rgb(47, 93, 80)"; // #2F5D50

const bg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
/** WCAG contrast between an element's text colour and its background, computed in the page. */
const contrast = (l: Locator) =>
  l.evaluate((e) => {
    const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const s = getComputedStyle(e);
    const [a, b] = [lum(rgb(s.color)), lum(rgb(s.backgroundColor))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });

test("the shop page, the join and the join success wear the shop's brand colour", async ({ page }) => {
  await page.goto("/shops/pinecone-coffee");
  const hero = page.getByTestId("shop-hero");
  await expect(hero).toBeVisible();
  expect(await bg(hero)).toBe(PINECONE);
  expect(await contrast(hero)).toBeGreaterThanOrEqual(4.5);
  await expect(hero.getByRole("heading", { level: 1, name: "Pinecone Coffee Co." })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/color-01-shop.png" });

  const { qrCode } = await cafeQr();
  await page.goto(`/j/${qrCode}`);
  const card = page.locator("[data-brand-card]").first();
  await expect(card).toBeVisible();
  expect(await bg(card)).toBe(PINECONE);
  const cta = page.getByRole("button", { name: "Text me a code" });
  expect(await bg(cta)).toBe(PINECONE);
  expect(await contrast(cta)).toBeGreaterThanOrEqual(4.5);

  await fillPhone(page, newPhone());
  await cta.click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("Priya");
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();

  const pass = page.getByTestId("joined-pass");
  await expect(pass.getByText("You're in, Priya.")).toBeVisible();
  expect(await bg(pass)).toBe(PINECONE);
  expect(await contrast(pass)).toBeGreaterThanOrEqual(4.5);
  // Apple's and Google's buttons keep their own black artwork, on a soft panel in the shop's colour, above the fold on a phone.
  const wallet = page.getByTestId("shop-wallet");
  if (await wallet.count()) {
    const box = await wallet.boundingBox();
    expect(box!.y).toBeLessThan(page.viewportSize()!.height);
    expect(await bg(wallet)).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.screenshot({ path: "e2e/screenshots/color-02-joined.png" });

  // The pass on /me: the field is the brand colour too.
  await page.goto("/me");
  await expect(page.getByRole("region", { name: "Pinecone Coffee Co." }).first()).toBeVisible();
  const field = await page.getByRole("region", { name: "Pinecone Coffee Co." }).first().evaluate((e) => getComputedStyle(e).getPropertyValue("--trade").trim().toUpperCase());
  expect(field).toBe("#2F5D50");
});

test("Clear dark switches a brand colour to its dark values, still AA", async ({ page }) => {
  await page.goto("/shops/pinecone-coffee?theme=clear-dark");
  const hero = page.getByTestId("shop-hero");
  await expect(hero).toBeVisible();
  const dark = await bg(hero);
  expect(dark).not.toBe(PINECONE);
  expect(await contrast(hero)).toBeGreaterThanOrEqual(4.5);
});
