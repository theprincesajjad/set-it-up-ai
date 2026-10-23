/**
 * Restaurant messaging public pages: the review page (/r/<token>) and the WhatsApp pay link.
 *
 * Review tokens are only ever sent to customers (the API never returns them), so the star flows use the two
 * unanswered review requests the seed creates for Sarson Dhaba (apps/api/src/seed/restaurants.ts):
 * demo-review-sarson-5 and demo-review-sarson-low. Each can be answered once per seeded database; override with
 * E2E_REVIEW_TOKEN / E2E_REVIEW_TOKEN_LOW (e.g. tokens from a reseeded shop) if a previous run already used them.
 */
import { expect, test } from "@playwright/test";

const TOKEN = process.env.E2E_REVIEW_TOKEN ?? "demo-review-sarson-5";
const TOKEN_LOW = process.env.E2E_REVIEW_TOKEN_LOW ?? "demo-review-sarson-low";

test.describe("review page", () => {
  test("an unknown link says so plainly, in the chosen language", async ({ page }) => {
    await page.goto("/r/not-a-real-token");
    await expect(page.getByRole("heading", { name: "This link doesn't work anymore" })).toBeVisible();
    await page.getByRole("radio", { name: "हिन्दी" }).click();
    await expect(page.getByRole("heading", { name: "यह लिंक अब काम नहीं करता" })).toBeVisible();
    await expect(page.locator("[lang='hi-IN']")).toBeVisible();
  });

  test("a pay link without its token is refused", async ({ page }) => {
    await page.goto("/pay/order/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "This payment link doesn't work anymore" })).toBeVisible();
  });

  test("5 stars: the same two options as any other rating, then thanks", async ({ page }) => {
    await page.goto(`/r/${TOKEN}`);
    await expect(page.getByRole("heading", { name: /How was your visit/ })).toBeVisible();
    // Both choices are on the page before a star is picked, at the same weight (Google's policy: ask everyone the same way).
    await expect(page.getByRole("button", { name: "Send to the restaurant" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Also leave a public Google review" })).toBeVisible();
    await page.getByRole("radio", { name: "5 out of 5 stars" }).click();
    await page.getByRole("textbox").fill("Best karahi on the street.");
    await page.getByRole("button", { name: "Send to the restaurant" }).click();
    await expect(page.getByRole("heading", { name: /reads every answer/ })).toBeVisible();
    const google = page.getByRole("link", { name: "Also leave a public Google review" });
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute("href", /^https:\/\//);
    // Answered once: a reload shows the stored rating, not the picker.
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: /out of 5 stars/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  });

  test("2 stars: the same page, the same thanks and the same Google button", async ({ page }) => {
    await page.goto(`/r/${TOKEN_LOW}`);
    await expect(page.getByRole("link", { name: "Also leave a public Google review" })).toBeVisible();
    await page.getByRole("radio", { name: "2 out of 5 stars" }).click();
    await page.getByRole("textbox").fill("Waited 40 minutes for a pickup order.");
    await page.getByRole("button", { name: "Send to the restaurant" }).click();
    await expect(page.getByRole("heading", { name: /reads every answer/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Also leave a public Google review" })).toBeVisible();
  });
});
