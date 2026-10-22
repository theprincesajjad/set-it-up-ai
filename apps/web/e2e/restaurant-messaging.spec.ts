/**
 * Restaurant messaging public pages: the review page (/r/<token>) and the WhatsApp pay link.
 *
 * Review tokens are only ever sent to customers (the API never returns them), so the full star flow needs
 * a token for an unanswered review request on a shop with a Google link: set E2E_REVIEW_TOKEN (and
 * E2E_REVIEW_TOKEN_LOW for the 1-3 star path). Without them those tests skip; the "link doesn't work"
 * and language checks always run.
 */
import { expect, test } from "@playwright/test";

const TOKEN = process.env.E2E_REVIEW_TOKEN;
const TOKEN_LOW = process.env.E2E_REVIEW_TOKEN_LOW;

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

  test("5 stars: thanks, then the Google link leads", async ({ page }) => {
    test.skip(!TOKEN, "set E2E_REVIEW_TOKEN to an unanswered review request");
    await page.goto(`/r/${TOKEN}`);
    await expect(page.getByRole("heading", { name: /How was your visit/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toHaveCount(0); // appears after a star is picked
    await page.getByRole("radio", { name: "5 out of 5 stars" }).click();
    await page.getByRole("textbox").fill("Best karahi on the street.");
    await page.getByRole("button", { name: "Send" }).click();
    const google = page.getByRole("link", { name: "Leave a Google review" });
    await expect(google).toBeVisible();
    await expect(google).toHaveAttribute("href", /^https:\/\//);
    // Answered once: a reload shows the stored rating, not the picker.
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: /out of 5 stars/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  });

  test("2 stars: the note stays private but the Google link is still offered", async ({ page }) => {
    test.skip(!TOKEN_LOW, "set E2E_REVIEW_TOKEN_LOW to an unanswered review request");
    await page.goto(`/r/${TOKEN_LOW}`);
    await page.getByRole("radio", { name: "2 out of 5 stars" }).click();
    await page.getByRole("textbox").fill("Waited 40 minutes for a pickup order.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/will read this and may reach out/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Leave a Google review too" })).toBeVisible();
  });
});
