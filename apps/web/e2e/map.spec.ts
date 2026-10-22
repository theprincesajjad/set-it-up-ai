/** /map: real vector map (maplibre) with Corner-style pins; falls back to the list without WebGL/tiles. */
import { expect, test } from "@playwright/test";

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
test.use({ proxy, ignoreHTTPSErrors: true });

test("network map renders pins with initials and a peek card (or falls back to the list)", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByRole("heading", { name: "Shops near you" })).toBeVisible();
  const map = page.getByRole("region", { name: "Map of shops" });
  const fallback = page.getByText("The map couldn't load on this device");
  await expect(map.or(fallback)).toBeVisible({ timeout: 15000 });
  if (await map.isVisible()) {
    const pin = map.getByRole("button", { name: /Pinecone Coffee Co\./ }).first();
    await expect(pin).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500); // let tiles paint
    await pin.dispatchEvent("click");
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(800);
    await expect(page.getByRole("link", { name: /Join|View/ }).first()).toBeVisible();
    await expect(page.getByRole("group", { name: "Categories" })).toBeVisible();
  }
  await page.screenshot({ path: "e2e/screenshots/14-map.png" });
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page.getByRole("link", { name: /Pinecone Coffee Co\./ }).first()).toBeVisible();
});
