/**
 * Landing-page A/B tests end to end (ab-spec §3, §4, §5, §8): an ad URL with ?v= lands its variant on the public URL and sticks, the
 * beacon counts the visit, the start form and the wizard carry the variant into signup, the shop's live link shows up under that
 * variant in the admin report, GPC gets control with no cookie and no beacon, the off switch works, and /admin/experiments renders.
 * The e2e runner pins the experiment clock before any test starts (run-all.sh); this spec moves it into T1 per request with the
 * x-ll-experiments-now header (honoured only with EXPERIMENTS_TEST_CLOCK=1 on the web app and outside production on the API).
 * Needs a running, seeded web and API (e2e/run-all.sh). Screenshots go to $AB_SHOTS when it is set.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API } from "./fixtures";

const IN_T1 = { "x-ll-experiments-now": "2026-11-15T15:00:00Z" };
const SHOTS = process.env.AB_SHOTS;
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const rand = () => Math.random().toString(36).slice(2, 8);

test.setTimeout(180_000);

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const adminToken = async () => (await call<{ accessToken: string }>("POST", "/v1/auth/login", ADMIN)).accessToken;

const cookie = async (context: BrowserContext, name: string) => {
  const v = (await context.cookies()).find((c) => c.name === name)?.value;
  return v === undefined ? undefined : decodeURIComponent(v);
};
const beacons = (page: Page) => {
  const seen: { k: string; d?: string }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/public/landing-events")) seen.push(...(JSON.parse(r.postData() ?? "{}").ev ?? []));
  });
  return seen;
};

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, extraHTTPHeaders: IN_T1 });

test("an ad URL with ?v=price lands the price variant, sticks, and the signup carries it to link live in the report", async ({ page, context }) => {
  const sent = beacons(page);
  const before = await call<{ arms: { variant: string; exposures: number; signedUp: number; linkLive: number }[] }>("GET", "/v1/admin/experiments/t1-barber-lead", undefined, await adminToken());
  const was = before.arms.find((a) => a.variant === "price")!;

  const res = await page.goto("/for-barbers?v=price&src=ad-9");
  expect(new URL(page.url()).pathname).toBe("/for-barbers");
  await expect(page.locator(".sl[data-variant=price]")).toHaveCount(1);
  // Copy-independent: the variant's headline is not control's (the words live in LANDING_VARIANTS and may change).
  const priceHook = await page.getByRole("heading", { level: 1 }).textContent();
  expect(res!.headers()["x-robots-tag"]).toBeUndefined();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/for-barbers$/);
  expect(await cookie(context, "ll_v")).toBe("t1-barber-lead:price");
  expect(await cookie(context, "ll_aid")).toMatch(/^[A-Za-z0-9_-]{22}$/);
  await expect(page.locator("[data-landing-notice]")).toContainText("No ad trackers.");
  await expect.poll(() => sent.map((e) => e.k)).toContain("view");

  const control = await context.browser()!.newContext({ extraHTTPHeaders: { ...IN_T1, "Sec-GPC": "1" } });
  const cp = await control.newPage();
  await cp.goto(new URL("/for-barbers", page.url()).toString());
  expect(priceHook).not.toBe(await cp.getByRole("heading", { level: 1 }).textContent());
  await control.close();

  // Sticky: no ?v=, or an unknown one, keeps the arm.
  await page.goto("/for-barbers");
  await expect(page.locator(".sl[data-variant=price]")).toHaveCount(1);
  await page.goto("/for-barbers?v=nope&src=ad-9");
  await expect(page.locator(".sl[data-variant=price]")).toHaveCount(1);

  // The hero button is a counted CTA; the start form carries the variant into /signup.
  await page.locator(".sl-hero .sl-btn").click();
  await expect.poll(() => sent.filter((e) => e.k === "cta_click").map((e) => e.d)).toEqual(["hero"]);
  const email = `barber-ab-${rand()}@example.com`;
  const start = page.locator("#start");
  await start.locator("input[name=shop]").fill(`Fades ${rand()}`);
  await start.locator("input[name=contact]").fill(email);
  await start.locator("button[type=submit]").click();
  await page.waitForURL(/\/signup\?/);
  expect(new URL(page.url()).searchParams.get("v")).toBe("t1-barber-lead:price");
  expect(sent.map((e) => e.k)).toContain("start_submit");

  // The wizard: a barber working from home (solo setup), then services and hours put the link live.
  await page.locator('[role=radio][data-value="home"]').click();
  await page.locator("input[type=tel]").first().fill(`647${String(Math.floor(2000000 + Math.random() * 7999999))}`);
  await page.locator("input[name=postal]").fill("M6R 2K1");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill("ab-e2e-pass-1");
  await page.locator("form button[type=submit]").last().click();
  await page.waitForURL(/\/setup\?step=your_link/, { timeout: 30_000 });
  const merchantId = new URL(page.url()).pathname.split("/")[2]!;
  const next = () => page.locator("[data-step-card] footer").locator("button, a").last().click();
  await next();
  await page.waitForURL(/step=services/);
  await next();
  await page.waitForURL(/step=hours/);
  await next();
  await page.waitForURL(/step=privacy/);
  const owner = (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: "ab-e2e-pass-1" })).accessToken;
  expect((await call<{ solo: { live: boolean } }>("GET", `/v1/merchants/${merchantId}/onboarding`, undefined, owner)).solo.live).toBe(true);

  const after = await call<{ arms: { variant: string; exposures: number; signedUp: number; linkLive: number; unmatchedSignups: number }[]; look: string }>("GET", "/v1/admin/experiments/t1-barber-lead", undefined, await adminToken());
  const now = after.arms.find((a) => a.variant === "price")!;
  expect(now.exposures).toBe(was.exposures + 1);
  expect(now.signedUp).toBe(was.signedUp + 1);
  expect(now.linkLive).toBe(was.linkLive + 1);
  expect(after.look).toBe("none");
  expect(JSON.stringify(after)).not.toContain('"lift"');
});

test("assignment on the nail page: a fresh visitor gets an arm, the lash look keeps it, the variant path is noindexed, the off switch stops counting", async ({ page, context }) => {
  await page.goto("/for-nail-techs");
  const variant = await page.locator(".sl").getAttribute("data-variant");
  expect(["control", "yours"]).toContain(variant);
  expect(await cookie(context, "ll_v")).toBe(`t1-nails-lead:${variant}`);
  await page.goto("/for-nail-techs?trade=lashes");
  await expect(page.locator(`.sl[data-variant=${variant}][data-solo-trade=lashes]`)).toHaveCount(1);
  await page.goto("/for-nail-techs?v=yours");
  await expect(page.locator(".sl[data-variant=yours]")).toHaveCount(1);
  expect(await cookie(context, "ll_v")).toBe("t1-nails-lead:yours");
  // `privacy` is a variant but not an arm of T1: the cookie wins.
  await page.goto("/for-nail-techs?v=privacy");
  await expect(page.locator(".sl[data-variant=yours]")).toHaveCount(1);

  const direct = await page.request.get("/for-nail-techs/nails/yours");
  expect(direct.headers()["x-robots-tag"]).toBe("noindex");

  await page.locator("[data-landing-notice] a").click();
  await page.waitForURL(/\/for-nail-techs$/);
  expect(await cookie(context, "ll_aid")).toBe("off");
  expect(await cookie(context, "ll_v")).toBeUndefined();
  const sent = beacons(page);
  await page.goto("/for-nail-techs");
  await expect(page.locator(".sl[data-variant=control]")).toHaveCount(1);
  await expect(page.locator("[data-landing-notice]")).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(sent).toEqual([]);
});

test.describe("Global Privacy Control", () => {
  test.use({ extraHTTPHeaders: { ...IN_T1, "Sec-GPC": "1" } });
  test("renders control, sets no cookie and sends no beacon, even with ?v=", async ({ page, context }) => {
    const sent = beacons(page);
    await page.goto("/for-nail-techs?v=yours");
    await expect(page.locator(".sl[data-variant=control]")).toHaveCount(1);
    await page.goto("/for-nail-techs?trade=brows");
    await expect(page.locator(".sl[data-variant=control][data-solo-trade=brows]")).toHaveCount(1);
    await page.waitForTimeout(800);
    const names = (await context.cookies()).map((c) => c.name);
    expect(names).not.toContain("ll_aid");
    expect(names).not.toContain("ll_v");
    expect(sent).toEqual([]);
  });
});

test("the admin experiments page renders the tests, the horizon and the variants without p-values", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/admin/experiments");
  await expect(page.getByRole("heading", { level: 1, name: "Landing tests" })).toBeVisible();
  await expect(page.locator("[data-experiment=t1-nails-lead]")).toContainText("control vs yours");
  await expect(page.locator("[data-experiment=t1-barber-lead]")).toContainText("control vs price");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-experiments-1440.png`, fullPage: true });

  await page.locator("[data-experiment=t1-barber-lead] a").click();
  await page.waitForURL(/\/admin\/experiments\/t1-barber-lead$/);
  await expect(page.getByText(/^Horizon:/)).toContainText("of 880 exposures");
  await expect(page.getByText("Not time to decide yet")).toBeVisible();
  await expect(page.locator("[data-arm=price]")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Lift on submits" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record interim look" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End experiment" })).toBeVisible();
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("t1-barber-lead.csv");
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/admin-experiment-detail-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${SHOTS}/admin-experiment-detail-390.png`, fullPage: true });
  }
});
