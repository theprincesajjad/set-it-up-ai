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

test("privacy policy prints the retention periods the jobs use and the deletion promise", async ({ page }) => {
  await page.goto("/legal/privacy");
  const body = page.locator("article");
  for (const text of ["90 days", "24 months", "12 months", "30 days", "7 days"]) await expect(body).toContainText(text);
  await expect(body).toContainText("replied STOP");
  await expect(body).not.toContainText("these periods are targets");
  await expect(body).not.toContainText("{{");
});

test("rewards terms carry no internal finance or counsel notes", async ({ page }) => {
  await page.goto("/legal/rewards");
  const body = page.locator("article");
  await expect(body).toContainText("Your points never expire");
  for (const text of ["Finance note", "Counsel", "expected redemption", "Model cost"]) await expect(body).not.toContainText(text);
});

test("marketing says what Free really costs: nothing for loyalty, 1.5% on online orders", async ({ page }) => {
  for (const url of ["/", "/pricing"]) {
    await page.goto(url);
    await expect(page.locator("body")).not.toContainText(/no transaction fees/i);
  }
  await page.goto("/pricing");
  await expect(page.locator("body")).toContainText("1.5%");
});
