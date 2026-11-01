/**
 * The founder's cockpit (wave N, team admin) against the seeded API: the overview on /admin, the businesses list (filters, CSV),
 * a business's detail (audited), the signup funnel, health and performance, and the refusal for a shop owner.
 * The seed (apps/api/src/seed/adminCockpit.ts) adds 30 shops with plans, trials, churn, activity curves and landing sources.
 * Screenshots go to ADMIN_SHOTS when set (untracked).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const shot = async (page: Page, name: string) => {
  if (process.env.ADMIN_SHOTS) await page.screenshot({ path: `${process.env.ADMIN_SHOTS}/${name}.png`, fullPage: true });
};

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function token(who: { email: string; password: string }) {
  const r = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who) });
  return ((await r.json()) as { accessToken: string }).accessToken;
}

for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const) {
  test.describe(`founder's cockpit (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.name === "phone", hasTouch: vp.name === "phone" });

    test("overview, businesses, a business, funnel, health and performance", async ({ page }) => {
      await signIn(page, ADMIN);
      await page.goto("/admin");
      await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
      const overview = page.getByRole("region", { name: "Overview" });
      await expect(overview.getByText("Signups this week")).toBeVisible();
      await expect(overview.getByText("MRR", { exact: true })).toBeVisible();
      await expect(overview.getByText("Trial to paid")).toBeVisible();
      await expect(page.getByTestId("gmv-split")).toContainText("POS sales");
      await overview.getByRole("radio", { name: "7 days" }).click();
      await expect(overview.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("region", { name: "Money processed per week" })).toBeVisible();
      await shot(page, `cockpit-overview-${vp.width}`);

      // Businesses: the at-risk chip narrows the list; the CSV downloads.
      await page.goto("/admin/businesses");
      await expect(page.getByRole("heading", { level: 1, name: "Businesses" })).toBeVisible();
      await expect(page.getByText("Kings Cuts").first()).toBeVisible();
      await page.getByRole("button", { name: /^At risk/ }).click();
      await expect(page.getByText("Lumen Nail Studio")).toHaveCount(0);
      await expect(page.getByText("Kings Cuts").first()).toBeVisible();
      if (vp.name === "desktop") {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export CSV" }).click();
        expect((await download).suggestedFilename()).toMatch(/^businesses-\d{4}-\d{2}-\d{2}\.csv$/);
      }
      await shot(page, `businesses-${vp.width}`);
      await page.getByRole("button", { name: /^All/ }).click();
      await page.getByRole("searchbox", { name: "Search businesses" }).fill("Lumen");
      await page.getByText("Lumen Nail Studio").first().click();
      await expect(page.getByRole("heading", { level: 1, name: "Lumen Nail Studio" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Funnel progress" })).toContainText("Booking link live");
      await expect(page.getByText("/for-nail-techs").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Plan and billing" })).toBeVisible();
      await shot(page, `business-detail-${vp.width}`);

      await page.goto("/admin/funnel");
      await expect(page.getByRole("heading", { level: 1, name: "Signup funnel" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Conversion funnel" })).toContainText("Completed signup");
      await page.getByRole("radio", { name: "Source" }).click();
      await expect(page.getByRole("table", { name: "Funnel by source" })).toContainText("tiktok");
      await shot(page, `funnel-${vp.width}`);

      await page.goto("/admin/health");
      await expect(page.getByRole("heading", { level: 1, name: "Health" })).toBeVisible();
      await expect(page.getByText("Kings Cuts").first()).toBeVisible();
      await expect(page.getByText("Payment failed.").first()).toBeVisible();
      await shot(page, `health-${vp.width}`);

      await page.goto("/admin/performance");
      await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Slowest routes" })).toBeVisible();
      await shot(page, `performance-${vp.width}`);
    });
  });
}

test.describe("security", () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

  test("opening a business is written to the audit log", async () => {
    const t = await token(ADMIN);
    const list = (await (await fetch(`${API}/v1/admin/businesses?q=Glossbox`, { headers: { authorization: `Bearer ${t}` } })).json()) as { items: { id: string }[] };
    const id = list.items[0]!.id;
    expect((await fetch(`${API}/v1/admin/businesses/${id}`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(200);
    const audit = (await (await fetch(`${API}/v1/admin/audit?merchantId=${id}&action=admin.business_viewed`, { headers: { authorization: `Bearer ${t}` } })).json()) as { items: { action: string }[] };
    expect(audit.items.length).toBeGreaterThan(0);
  });

  test("a shop owner gets no admin page and a 403 from every cockpit endpoint", async ({ page }) => {
    const t = await token(OWNER);
    for (const path of ["/v1/admin/cockpit", "/v1/admin/businesses", "/v1/admin/funnel", "/v1/admin/health", "/v1/admin/performance"]) {
      expect((await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${t}` } })).status, path).toBe(403);
    }
    await signIn(page, OWNER);
    await page.goto("/admin/businesses");
    await expect(page.getByText("This area is for platform admins.")).toBeVisible();
    await expect(page.getByText("Kings Cuts")).toHaveCount(0);
  });

  test("the menu is translated (Urdu, right to left)", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/health?lang=ur");
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    await expect(page.getByRole("link", { name: "صحت" }).first()).toBeVisible();
    await shot(page, "health-ur-1440");
  });
});
