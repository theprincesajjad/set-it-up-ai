/**
 * v2 dashboard screenshot sweep: every merchant, rep, admin and BIA page at 1440 and 390 px.
 * Output → e2e/screenshots/v2/dashboard/<name>-<width>.png. Needs the seeded API (see dashboard.spec.ts).
 * Paid pages are shot on Fix-It Phone Lab with a temporary pilot override for every paid feature,
 * which is removed afterwards so the seed's defaults hold.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";
import { useFreePlan } from "./freePlan";

const OUT = "e2e/screenshots/v2/dashboard";
const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const PILOT = { email: "owner+fix-it-phone-lab@example.com", password: "localloyalty-demo" };

// The seed makes this shop a pilot (paid features on); these checks are for the free plan.
let restorePilot: (() => Promise<void>) | undefined;
test.beforeAll(async () => {
  restorePilot = await useFreePlan(OWNER);
});
test.afterAll(async () => {
  await restorePilot?.();
});
const REP = { email: "rep@localloyalty.example", password: "localloyalty-rep" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

async function token(who: { email: string; password: string }) {
  const r = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who) });
  return ((await r.json()) as { accessToken: string }).accessToken;
}
async function merchantOf(who: { email: string; password: string }) {
  const r = await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${await token(who)}` } });
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}
async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function shoot(page: Page, name: string, path: string, width: number, after?: (p: Page) => Promise<void>, full = true) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1").first()).toBeVisible();
  if (after) await after(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: full });
}

for (const width of [1440, 390]) {
  test.describe(`v2 dashboard at ${width}px`, () => {
    const mobile = width < 600;
    test.use({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    test.setTimeout(240_000);

    test("merchant (free plan)", async ({ page }) => {
      const m = `/m/${await merchantOf(OWNER)}`;
      await signIn(page, OWNER);
      const pages: [string, string][] = [
        ["01-home", m], ["02-customers", `${m}/customers`], ["04-program", `${m}/program`], ["05-counter", `${m}/counter`],
        ["07-reports", `${m}/reports`], ["08-locations", `${m}/locations`], ["09-qr-kit", `${m}/locations/kit`], ["10-staff", `${m}/staff`],
        ["11-integrations", `${m}/integrations`], ["12-billing", `${m}/billing`], ["13-settings", `${m}/settings`], ["14-setup", `${m}/setup`],
        ["15-locked-promos", `${m}/promos`],
      ];
      for (const [name, path] of pages) await shoot(page, name, path, width);
      await shoot(page, "03-customer-panel", `${m}/customers`, width, async (p) => {
        await p.getByRole("table", { name: "Customers" }).getByRole("row").nth(1).click();
        await expect(p.getByRole("dialog", { name: "Customer" }).getByRole("heading", { name: "Recent" })).toBeVisible();
      }, false);
      await shoot(page, "06-counter-member", `${m}/counter`, width, async (p) => {
        for (const d of "1034") await p.getByRole("group", { name: "Keypad" }).getByRole("button", { name: d, exact: true }).click();
        // Stamped on the 1440 run; at 390 the cooldown message shows instead.
        await expect(p.getByRole("heading", { name: "Emma Wong" }).or(p.getByText(/already got stamps for this visit/))).toBeVisible();
      });
      if (mobile) await shoot(page, "16-menu", m, width, async (p) => p.getByRole("button", { name: "More" }).click(), false);
      else await shoot(page, "16-search", m, width, async (p) => {
        await p.keyboard.press("ControlOrMeta+k");
        await p.keyboard.type("emma");
        await expect(p.getByRole("dialog", { name: "Search" }).getByText("Emma Wong").first()).toBeVisible();
      }, false);
    });

    test("merchant (pilot shop, paid tools on)", async ({ page }) => {
      const id = await merchantOf(PILOT);
      const admin = await token(ADMIN);
      const set = (key: string, on: boolean) =>
        on
          ? fetch(`${API}/v1/admin/features/${key}/overrides`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${admin}` }, body: JSON.stringify({ merchantId: id, enabled: true, reason: "v2 screenshots" }) })
          : fetch(`${API}/v1/admin/features/${key}/overrides/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } });
      const feats = (await (await fetch(`${API}/v1/merchants/${id}/features`, { headers: { authorization: `Bearer ${await token(PILOT)}` } })).json()) as { features: { key: string; enabled: boolean }[] };
      const locked = feats.features.filter((f) => !f.enabled).map((f) => f.key);
      await Promise.all(locked.map((k) => set(k, true)));
      try {
        const m = `/m/${id}`;
        await signIn(page, PILOT);
        const pages: [string, string][] = [
          ["20-pilot-home", m], ["21-promos", `${m}/promos`], ["22-promo-new", `${m}/promos/new`], ["23-discount-cards", `${m}/discount-cards`],
          ["24-messages", `${m}/messages`], ["25-message-new", `${m}/messages/new`], ["26-automations", `${m}/messages/automations`], ["27-orders", `${m}/orders`],
          ["28-tickets", `${m}/tickets`], ["29-ticket-new", `${m}/tickets/new`], ["30-catalog", `${m}/catalog`], ["31-slots", `${m}/slots`],
          ["32-ads", `${m}/ads`], ["33-campaigns", `${m}/campaigns`], ["34-pilot-integrations", `${m}/integrations`], ["35-developers", `${m}/integrations/developers`],
          ["36-import", `${m}/customers/import`], ["37-pilot-reports", `${m}/reports`],
        ];
        for (const [name, path] of pages) await shoot(page, name, path, width);
      } finally {
        await Promise.all(locked.map((k) => set(k, false)));
      }
    });

    test("rep console", async ({ page }) => {
      await signIn(page, REP);
      for (const [name, path] of [["40-rep-today", "/rep"], ["41-rep-leads", "/rep/leads"], ["42-rep-merchants", "/rep/merchants"], ["43-rep-new", "/rep/new"]] as const) await shoot(page, name, path, width);
      const id = await merchantOf(OWNER);
      await shoot(page, "45-rep-merchant", `/rep/merchants/${id}`, width);
    });

    test("admin and BIA", async ({ page }) => {
      await signIn(page, ADMIN);
      const id = await merchantOf(OWNER);
      for (const [name, path] of [
        ["50-admin-network", "/admin"], ["51-admin-rollout", "/admin/rollout"], ["52-admin-merchants", "/admin/merchants"], ["53-admin-merchant", `/admin/merchants/${id}`],
        ["54-admin-neighbourhoods", "/admin/neighbourhoods"], ["55-admin-users", "/admin/users"], ["56-admin-campaigns", "/admin/campaigns"], ["57-admin-ads", "/admin/ads"],
        ["58-admin-audit", "/admin/audit"], ["59-bia", "/bia"],
      ] as const) await shoot(page, name, path, width);
    });
  });
}
