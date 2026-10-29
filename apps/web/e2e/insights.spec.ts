/**
 * Pro value P6 (docs/business/pro-value.md 3.2 P6): the "This week" tile on Today, Reports > Week, and Settings > Weekly goal.
 * Free shop: Rangrez Beauty Studio (a full day is made through the public availability endpoint, which writes the full_day_views signal).
 * Pro shop: Bloom Hair Studio with insights.weekly switched on by an admin override. At 390 and 1440, in Clear light and in Urdu.
 * Needs a running, seeded API and web (e2e/run-all.sh). Screenshots go to $E2E_SHOTS (default e2e/screenshots/pro-p6, untracked).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/pro-p6";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const PASSWORD = "localloyalty-demo";
const FREE = { email: "owner+rangrez-beauty-studio@example.com", slug: "rangrez-beauty-studio" };
const PRO = { email: "owner+bloom-hair-studio@example.com", slug: "bloom-hair-studio" };

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = async (email: string) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: PASSWORD })).accessToken;
async function shop(email: string) {
  const token = await login(email);
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  return { token, id: items[0]!.id };
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Block every stylist for the next open day and look at it twice, so the Free shop has a full day that people looked at and left. */
async function makeFullDay(f: { token: string; id: string }): Promise<void> {
  const pub = await call<{ services: { id: string }[]; staff: { id: string }[] }>("GET", `/v1/public/shops/${FREE.slug}/services`);
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const q = (d: string) => `serviceIds=${pub.services[0]!.id}&staffId=any&from=${d}&to=${d}`;
  let open: string | null = null;
  for (let n = 1; n <= 14 && !open; n++) {
    const av = await call<{ days: { date: string; times: unknown[] }[] }>("GET", `/v1/public/shops/${FREE.slug}/availability?${q(day(n))}`);
    if (av.days[0]!.times.length) open = day(n);
  }
  if (!open) return;
  for (const s of pub.staff) {
    await call("POST", `/v1/merchants/${f.id}/staff/${s.id}/time-off`, { startsAt: `${open}T00:00:00Z`, endsAt: `${open}T23:59:59Z`, reason: "e2e full day" }, f.token).catch(() => undefined);
    await call("POST", `/v1/merchants/${f.id}/staff/${s.id}/time-off`, { startsAt: `${open}T05:00:00Z`, endsAt: `${open}T23:00:00Z`, reason: "e2e full day" }, f.token).catch(() => undefined);
  }
  for (let i = 0; i < 2; i++) await call("GET", `/v1/public/shops/${FREE.slug}/availability?${q(open)}`);
}

async function proOn(): Promise<{ token: string; id: string }> {
  const p = await shop(PRO.email);
  const adminToken = (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: "admin@localloyalty.example", password: "localloyalty-admin" })).accessToken;
  await call("PUT", `/v1/admin/features/insights.weekly/overrides`, { merchantId: p.id, enabled: true, reason: "e2e Pro week" }, adminToken);
  await call("PUT", `/v1/merchants/${p.id}/insights/settings`, { weeklyGoalCents: 250000 }, p.token);
  return p;
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test.describe("Today tile on a Free shop", () => {
  test("shows the numbers and the locked lines with real counts, one See Pro link (390)", async ({ page }) => {
    const f = await shop(FREE.email);
    await makeFullDay(f);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, FREE.email);
    const tile = page.getByTestId("this-week");
    await expect(tile).toBeVisible();
    await expect(page.getByTestId("week-revenue")).toContainText("$");
    const locked = page.getByTestId("week-locked");
    await expect(locked).toContainText(/was full\. 2 people looked and left\. Pro keeps them on a waitlist\./);
    await expect(locked).toContainText(/in your inbox every .+, on Pro\./);
    await expect(locked.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", /\/billing\?plan=plus$/);
    await expect(tile.getByTestId("week-signals")).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: shot("tile-free-390"), fullPage: true });
  });

  test("Reports > Week shows the week and a PlanLine instead of the history (1440)", async ({ page }) => {
    const f = await shop(FREE.email);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, FREE.email);
    await page.goto(`/m/${f.id}/reports/week`);
    await expect(page.getByTestId("week-hero")).toBeVisible();
    await expect(page.getByTestId("week-locked").getByRole("link", { name: "See Pro" })).toBeVisible();
    await expect(page.getByTestId("week-signal-list")).toHaveCount(0);
    await page.screenshot({ path: shot("week-free-1440"), fullPage: true });
  });
});

test.describe("Pro shop", () => {
  test("Today tile: money, goal bar and no locked lines (390), and in Urdu", async ({ page, context }) => {
    await proOn();
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, PRO.email);
    await expect(page.getByTestId("this-week")).toBeVisible();
    await expect(page.getByTestId("week-revenue")).toContainText("$");
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByTestId("week-locked")).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: shot("tile-pro-390"), fullPage: true });
    await context.addCookies([{ name: "ll_lang", value: "ur", domain: "localhost", path: "/" }]);
    await page.reload();
    await expect(page.locator('[dir="rtl"]').first()).toBeAttached();
    await expect(page.getByTestId("this-week")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: shot("tile-pro-390-ur"), fullPage: true });
  });

  test("Reports > Week: the hero, the signals and 12 weeks of history (1440), and in Urdu", async ({ page, context }) => {
    const p = await proOn();
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, PRO.email);
    await page.goto(`/m/${p.id}/reports/week`);
    await expect(page.getByTestId("week-hero")).toBeVisible();
    await expect(page.getByTestId("week-signal-list").locator("li")).toHaveCount(6);
    await expect(page.getByRole("table", { name: "The last 12 weeks" }).locator("tbody tr")).toHaveCount(12);
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(page.getByRole("button", { name: "Next week" })).toBeEnabled();
    await page.getByRole("button", { name: "Next week" }).click();
    await page.screenshot({ path: shot("week-pro-1440"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.screenshot({ path: shot("week-pro-390"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await context.addCookies([{ name: "ll_lang", value: "ur", domain: "localhost", path: "/" }]);
    await page.reload();
    await expect(page.getByTestId("week-hero")).toBeVisible();
    await page.screenshot({ path: shot("week-pro-1440-ur"), fullPage: true });
  });

  test("Settings > Weekly goal saves the goal and the report time", async ({ page }) => {
    const p = await proOn();
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, PRO.email);
    await page.goto(`/m/${p.id}/settings/goal`);
    const goal = page.getByLabel("Goal per week (dollars)");
    await expect(goal).toHaveValue("2500");
    await goal.fill("3000");
    await page.getByLabel("Send my week on").selectOption("5");
    await page.getByLabel("At", { exact: true }).selectOption("9");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
    const w = await call<{ goal: { cents: number }; report: { weekday: number; hour: number } }>("GET", `/v1/merchants/${p.id}/insights/week`, undefined, p.token);
    expect(w.goal.cents).toBe(300000);
    expect(w.report).toEqual({ weekday: 5, hour: 9 });
    await page.screenshot({ path: shot("goal-1440"), fullPage: true });
    await call("PUT", `/v1/merchants/${p.id}/insights/settings`, { weeklyGoalCents: 250000, weeklyReportWeekday: 0, weeklyReportHour: 18 }, p.token);
  });
});
