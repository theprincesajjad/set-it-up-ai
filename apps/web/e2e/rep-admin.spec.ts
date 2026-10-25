/**
 * Rep street day (phone) and the founder's admin console (desktop), against the seeded API.
 * The seed (apps/api/src/seed/repAdmin.ts) plans a street day today on the Danforth with 14 open shops,
 * a remote setup session and a website lead. Screenshots go to OPS_SHOTS when set (untracked).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const REP = { email: "rep@localloyalty.example", password: "localloyalty-rep" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const shot = async (page: Page, name: string) => {
  if (process.env.OPS_SHOTS) await page.screenshot({ path: `${process.env.OPS_SHOTS}/${name}.png`, fullPage: true });
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
async function api<T>(path: string, t: string): Promise<T> {
  return (await (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${t}` } })).json()) as T;
}

test.describe("rep on a street day (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test("today leads to the route; outcomes work with no signal and sync when it returns", async ({ page, context }) => {
    await signIn(page, REP);
    await page.goto("/rep");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Street day" })).toContainText("The Danforth");
    await expect(page.getByText("Biryani Hub")).toBeVisible();
    await expect(page.getByText(/Setup session/)).toBeVisible();
    await shot(page, "rep-today");
    await page.getByRole("link", { name: /Start the route|Continue the route/ }).click();
    await expect(page).toHaveURL(/\/rep\/day$/);

    const next = page.getByRole("region", { name: "Next shop" });
    await expect(next).toBeVisible();
    const first = (await next.getByRole("heading", { level: 2 }).textContent())!;
    await shot(page, "rep-streetday");

    // Pitch sheet: the proof is computed from the real network.
    await next.getByRole("button", { name: "Pitch" }).click();
    const sheet = page.getByRole("dialog", { name: "Pitch" });
    await expect(sheet.getByText("The proof, live from the network")).toBeVisible();
    await expect(sheet.getByText("customers joined")).toBeVisible();
    await shot(page, "rep-pitch");
    await page.keyboard.press("Escape");

    // Online: one tap moves the shop to "Done today".
    await next.getByRole("button", { name: "Not in", exact: true }).click();
    await expect(page.getByRole("region", { name: "Done today" })).toBeVisible();
    await expect(page.getByText(first, { exact: true }).last()).toBeVisible();

    // Offline: the tap is queued, shown, and sent when the connection returns.
    const second = (await page.getByRole("region", { name: "Next shop" }).getByRole("heading", { level: 2 }).textContent())!;
    expect(second).not.toBe(first);
    await context.setOffline(true);
    await page.getByRole("region", { name: "Next shop" }).getByRole("button", { name: "Come back" }).click();
    await expect(page.getByText("1 to sync")).toBeVisible();
    await expect(page.getByText("Offline")).toBeVisible();
    await shot(page, "rep-streetday-offline");
    await context.setOffline(false);
    await expect(page.getByText(/to sync/)).toHaveCount(0, { timeout: 20000 });

    // The server has both visits, once each.
    const t = await token(REP);
    const day = await api<{ counts: { visited: number; comeBack: number; notIn: number } }>("/v1/rep/street-day", t);
    expect(day.counts.notIn).toBeGreaterThanOrEqual(2);
    expect(day.counts.comeBack).toBeGreaterThanOrEqual(2);
    await page.reload();
    await expect(page.getByText(second, { exact: true }).last()).toBeVisible();
  });

  test("two-minute signup creates a live shop with its QR code", async ({ page }) => {
    await signIn(page, REP);
    await page.goto("/rep/signup");
    const name = `Quick Signup Cafe ${Date.now() % 100000}`;
    await page.getByLabel("Shop name").fill(name);
    await page.getByLabel("What kind of shop").selectOption("cafe");
    await page.getByLabel("Street address").fill("620 Danforth Ave");
    await page.getByLabel("Owner's mobile").fill(`416555${String(1000 + Math.floor(Math.random() * 8999))}`);
    await shot(page, "rep-signup");
    await page.getByRole("button", { name: "Create the shop" }).click();
    await expect(page.getByRole("heading", { name: `${name} is live` })).toBeVisible();
    await expect(page.getByRole("img", { name: new RegExp(`QR code for ${name}`) })).toBeVisible();
    await shot(page, "rep-signup-done");
    await expect(page.getByRole("link", { name: "Back to the street day" })).toBeVisible();
  });

  test("no paid reps: no Earnings page, no commission API, no bonus column", async ({ page }) => {
    await signIn(page, REP);
    const res = await page.goto("/rep/earnings");
    expect(res?.status()).toBe(404);
    expect((await fetch(`${API}/v1/rep/commission`, { headers: { authorization: `Bearer ${await token(REP)}` } })).status).toBe(404);
    await page.goto("/rep/merchants");
    await expect(page.getByRole("heading", { level: 1, name: "My merchants" })).toBeVisible();
    await expect(page.getByText(/Activation bonus|Earnings|commission/i)).toHaveCount(0);
  });
});

test.describe("founder's console (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("today shows pace, money, funnel by area and at-risk shops; costs add up", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByText("Pace against the plan")).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "MRR" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: "Fee revenue, 30 days" })).toBeVisible();
    const funnel = page.getByRole("table", { name: "Funnel by area" });
    await expect(funnel.getByRole("row", { name: /The Danforth/ })).toBeVisible();
    await expect(page.getByText("Shops at risk")).toBeVisible();
    await shot(page, "admin-today");

    // The numbers on the page are the API's numbers.
    const t = await token(ADMIN);
    const o = await api<{ money: { mrrCents: number }; funnel: { name: string; leads: number; targetShops: number }[] }>("/v1/admin/overview", t);
    expect(o.money.mrrCents).toBeGreaterThan(0);
    const dan = o.funnel.find((f) => f.name === "The Danforth")!;
    expect(dan.leads).toBeGreaterThanOrEqual(14);
    await expect(funnel.getByRole("row", { name: /The Danforth/ })).toContainText(`of ${dan.targetShops}`);

    await page.goto("/admin/costs");
    await expect(page.getByRole("heading", { level: 1, name: "Costs" })).toBeVisible();
    await expect(page.getByText("Cost this month")).toBeVisible();
    await shot(page, "admin-costs");
  });

  test("areas: the launch calendar shows the street day and who walks it", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin/neighbourhoods");
    await expect(page.getByRole("heading", { level: 1, name: "Areas & perks" })).toBeVisible();
    await expect(page.getByText(/Street day .* Riley Onboarding Rep/).first()).toBeVisible();
    await page.getByRole("button", { name: "Edit The Danforth" }).click();
    await expect(page.getByLabel("Who walks it")).toBeVisible();
    await expect(page.getByLabel("Shop target")).toHaveValue("30");
    await shot(page, "admin-areas");
  });

  test("support session needs a reason, lands in the shop with the banner, and is in the audit log", async ({ page }) => {
    await signIn(page, ADMIN);
    const t = await token(ADMIN);
    const list = await api<{ items: { id: string; name: string }[] }>("/v1/admin/merchants?q=Pinecone", t);
    const shop = list.items[0]!;
    await page.goto(`/admin/merchants/${shop.id}`);
    await expect(page.getByRole("heading", { level: 1, name: shop.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payments set-up" })).toBeVisible();
    await expect(page.getByText("Follow-up calls")).toBeVisible();
    await shot(page, "admin-merchant");
    await page.getByRole("button", { name: "Open as support" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Start support session" })).toBeDisabled();
    const reason = `e2e support ${Date.now() % 100000}`;
    await dialog.getByLabel("Reason (audit log)").fill(reason);
    await dialog.getByRole("button", { name: "Start support session" }).click();
    await expect(page).toHaveURL(new RegExp(`/m/${shop.id}`));
    await expect(page.getByText(/Changes are logged/)).toBeVisible();

    await page.goto("/admin/audit");
    await page.getByLabel("Area").selectOption("support.");
    const row = page.getByRole("row", { name: /support.session_started/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Details" }).click();
    await expect(page.getByText(reason).first()).toBeVisible();
  });
  test("inside a shop the banner starts a support session with one reason; writes are refused until then", async ({ page }) => {
    await signIn(page, ADMIN);
    const t = await token(ADMIN);
    const list = await api<{ items: { id: string; name: string }[] }>("/v1/admin/merchants?q=Hearth", t);
    const shop = list.items[0]!;
    const write = (welcomeBonus: number) => fetch(`${API}/v1/merchants/${shop.id}/program`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify({ welcomeBonus }) });
    const refused = await write(7);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("support_session_required");

    await page.goto(`/m/${shop.id}`);
    const banner = page.getByTestId("support-banner");
    await expect(banner).toContainText("start a support session");
    await shot(page, "support-banner-before");
    const start = banner.getByRole("button", { name: "Start support session" });
    await expect(start).toBeDisabled();
    await banner.getByLabel("Reason (audit log)").fill(`e2e banner ${Date.now() % 100000}`);
    await start.click();
    await expect(banner).toContainText("Support session open until");
    await shot(page, "support-banner-open");
    expect((await write(7)).status).toBe(200);
    await banner.getByRole("button", { name: "End session" }).click();
    await expect(banner).toContainText("start a support session");
    expect((await write(8)).status).toBe(403);
  });

  test("Today splits MRR into plans, restaurant tiers and add-ons", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/admin");
    const split = page.getByTestId("mrr-split");
    await expect(split).toBeVisible();
    for (const label of ["Plus and Pro", "Restaurant tiers", "WhatsApp packs", "Extra locations", "Other add-ons"]) await expect(split.getByText(label)).toBeVisible();
    await shot(page, "admin-today-mrr-split");
    const o = await api<{ money: { mrrCents: number; mrrSplit: Record<string, number> } }>("/v1/admin/overview", await token(ADMIN));
    expect(Object.values(o.money.mrrSplit).reduce((a, b) => a + b, 0)).toBe(o.money.mrrCents);
  });
});
