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
      await expect(page.locator("text=Kings Cuts >> visible=true").first()).toBeVisible();
      const atRisk = page.getByRole("button", { name: /^At risk/ });
      await atRisk.click();
      const n = (await atRisk.textContent())!.replace(/\D/g, "");
      await expect(page.getByText(`${n} match these filters`)).toBeVisible();
      await expect(page.locator("text=Lumen Nail Studio >> visible=true")).toHaveCount(0);
      await expect(page.locator("text=Kings Cuts >> visible=true").first()).toBeVisible();
      if (vp.name === "desktop") {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export CSV" }).click();
        expect((await download).suggestedFilename()).toMatch(/^businesses-\d{4}-\d{2}-\d{2}\.csv$/);
      }
      await shot(page, `businesses-${vp.width}`);
      await page.getByRole("button", { name: /^All/ }).click();
      await page.getByRole("searchbox", { name: "Search businesses" }).fill("Lumen");
      await page.locator("text=Lumen Nail Studio >> visible=true").first().click();
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
      await expect(page.locator("text=Kings Cuts >> visible=true").first()).toBeVisible();
      await expect(page.locator("text=Payment failed. >> visible=true").first()).toBeVisible();
      await shot(page, `health-${vp.width}`);

      await page.goto("/admin/performance");
      await expect(page.getByRole("heading", { level: 1, name: "Performance" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Slowest routes" })).toBeVisible();
      await shot(page, `performance-${vp.width}`);
    });
  });
}

test.describe("Monday morning (wave P)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

  test("Today leads with who is slipping, who signed up and who paid; each row opens the business", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin");
    const overview = page.getByRole("region", { name: "Overview" });
    await expect(page.getByRole("link", { name: /API (healthy|slow|errors)/ })).toBeVisible();
    await expect(overview.getByRole("list", { name: "New signups" }).getByRole("link")).toHaveCount(6);
    await expect(overview.getByRole("list", { name: "Started paying" }).getByRole("link").first()).toBeVisible();
    const risk = overview.getByRole("list", { name: "Shops at risk" });
    await expect(risk.getByRole("link", { name: /Kings Cuts/ })).toBeVisible();
    await risk.getByRole("link", { name: /Kings Cuts/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Kings Cuts" })).toBeVisible();
    await expect(page.getByText(/^At risk: payment failed/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open support tools" })).toBeVisible();
  });

  test("Health tiles filter the list; Plans and payments shows money and who needs a call", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/health");
    await page.getByRole("link", { name: /Payment failed/ }).first().click();
    await expect(page).toHaveURL(/flag=payment_failed/);
    await expect(page.getByText(/Showing \d+ with “Payment failed”/)).toBeVisible();
    await expect(page.locator("text=Kings Cuts >> visible=true").first()).toBeVisible();
    await expect(page.locator("text=Tip Top Nails >> visible=true")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Plans and payments" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plans and payments" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Payments that need a call" })).toContainText("Kings Cuts");
    await expect(page.getByRole("heading", { name: "MRR by plan" })).toBeVisible();
    await page.getByRole("radio", { name: /In trial/ }).click();
    await expect(page.locator("text=Tip Top Nails >> visible=true").first()).toBeVisible();
    await shot(page, "plans-1440");

    // The old shop list folds into Businesses.
    await page.goto("/admin/merchants");
    await expect(page).toHaveURL(/\/admin\/businesses$/);
  });
});

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
    await expect(page.getByRole("heading", { name: "This area is for platform admins" })).toBeVisible();
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

test.describe("kit components (wave Q)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

  test("KPI tiles roll the API's numbers; health tiles mark the filter; the funnel shows what continued", async ({ page }) => {
    await signIn(page, ADMIN);
    const o = (await (await fetch(`${API}/v1/admin/cockpit?days=30`, { headers: { authorization: `Bearer ${await token(ADMIN)}` } })).json()) as { shops: { paying: number } };
    await page.goto("/admin");
    const growth = page.getByRole("group", { name: "Growth" });
    await expect(growth.getByRole("link", { name: /Paying shops/ }).locator(".sr-only")).toHaveText(String(o.shops.paying));
    await expect(page.getByRole("link", { name: /API (healthy|slow|errors)/ }).locator("[data-tone]")).toBeVisible();

    await page.goto("/admin/health?flag=payment_failed");
    await expect(page.getByRole("link", { name: /Payment failed/ }).first()).toHaveAttribute("aria-current", "true");

    await page.goto("/admin/funnel");
    await expect(page.getByRole("list", { name: "Conversion funnel" })).toContainText("continued");
  });

  test("businesses: sort from the header and page through; audit log is a timeline; AI spend is a meter", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/businesses");
    const grid = page.getByRole("table", { name: "Businesses" });
    await expect(grid).toBeVisible();
    await grid.getByRole("button", { name: /^MRR/ }).click();
    await expect(grid.getByRole("button", { name: /^MRR, sorted high to low/ })).toBeVisible();
    await page.getByRole("combobox", { name: "Rows per page" }).click();
    await page.getByRole("option", { name: "25" }).click();
    await page.getByRole("button", { name: "Go to page 2" }).click();
    await expect(page.getByText(/^26–\d+ of \d+$/)).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("list", { name: /^Audit entries/ }).first().getByRole("listitem").first()).toBeVisible();

    await page.goto("/admin/ai");
    await expect(page.getByRole("meter", { name: "Spent against the monthly cap" })).toBeVisible();
  });

  test("rep signup shows its steps and celebrates nothing under reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page, { email: "rep@localloyalty.example", password: "localloyalty-rep" });
    await page.goto("/rep/signup");
    await expect(page.getByRole("progressbar", { name: "Step 1 of 2: The shop" })).toBeVisible();
    await page.getByLabel("Shop name").fill(`Kit Steps Cafe ${Date.now() % 100000}`);
    await page.getByLabel("What kind of shop").selectOption("cafe");
    await page.getByLabel("Street address").fill("700 Danforth Ave");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Step 2 of 2: The owner" })).toBeVisible();
    await page.getByLabel("Owner's mobile").fill(`416555${String(1000 + Math.floor(Math.random() * 8999))}`);
    await page.getByRole("button", { name: "Create the shop" }).click();
    await expect(page.getByRole("progressbar", { name: "Done: the shop is live" })).toBeVisible();
    await expect(page.locator("body > canvas")).toHaveCount(0);
  });
});
