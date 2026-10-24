import { expect, test } from "@playwright/test";

// Legal pages render their prices and fees from plans.ts (docs/legal/*.md tokens).
test("merchant agreement shows the real plans and fees", async ({ page }) => {
  await page.goto("/legal/merchants");
  await expect(page.getByRole("heading", { name: /Merchant Agreement/ })).toBeVisible();
  await expect(page.getByText("DRAFT: not reviewed by a lawyer and not in effect.")).toBeVisible();
  const body = page.locator("article");
  for (const text of ["Café & Retail", "$39/month", "$99/month", "Restaurant Starter", "Restaurant Growth", "Restaurant Pro", "$349/month", "$0.49 per order"]) {
    await expect(body).toContainText(text);
  }
  await expect(body.getByRole("row", { name: /Online orders, any paid plan or restaurant plan.*0%/ })).toBeVisible();
  await expect(body.getByRole("row", { name: /Online orders, Free plan.*1\.5%/ })).toBeVisible();
  await expect(body).not.toContainText("0.75%");
  await expect(body).not.toContainText("{{");
});

test("privacy policy lists the newer modules and keeps the promises", async ({ page }) => {
  await page.goto("/legal/privacy");
  const body = page.locator("article");
  await expect(body).toContainText("birthday (day and month only)");
  await expect(body).toContainText("We do not sell your personal information.");
  for (const text of ["Phone-call transcripts", "WhatsApp messages", "Driver links", "Retention", "Law 25", "Commercial messages (CASL)"]) {
    await expect(body).toContainText(text);
  }
});
