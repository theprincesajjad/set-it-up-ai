/**
 * Website builder (phase solo, workstream G): an annual shop (Bloom Hair Studio, given the site.builder grant) picks Studio,
 * drafts (the AI path when the API runs with SITE_AI_FAKE=1, else the starter words: the real model is never called), edits a
 * line, publishes, and the public site at /s/<slug> shows its live services with a working Book button. A monthly shop
 * (Pinecone Coffee) sees the preview and the plan line and has no Publish. Also: the address rule on the site, axe on the
 * public page and the builder, and screenshots at 1440 and 390 in Clear light and Urdu.
 * Run: PW_ARGS="e2e/site-builder.spec.ts" (screenshots to $SHOTS_DIR, default e2e/screenshots/site).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const ANNUAL = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
const MONTHLY = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/site";
const shot = (name: string) => `${SHOTS}/${name}.png`;

let axeSource: string | null = null;
try {
  axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
} catch {
  axeSource = null;
}

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = async (u: { email: string; password: string }) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", u)).accessToken;
async function shopOf(token: string) {
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  return items[0]!;
}

async function signIn(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function axe(page: Page) {
  if (!axeSource) return;
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
  expect(violations).toEqual([]);
}

const desktop = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } as const;

test.describe("annual shop", () => {
  test.use(desktop);

  test("picks Studio, drafts, edits a line, publishes; /s/<slug> has live services and Book works", async ({ page }) => {
    const owner = await login(ANNUAL);
    const admin = await login(ADMIN);
    const m = await shopOf(owner);
    // The annual entitlement, the way a pilot shop gets it (an admin grant on the feature key).
    await call("PUT", `/v1/admin/features/site.builder/overrides`, { merchantId: m.id, enabled: true, reason: "e2e annual" }, admin);
    await call("POST", `/v1/merchants/${m.id}/site/reset`, { preset: "studio" }, owner);
    const services = (await call<{ items: { name: string; active: boolean; kind?: string }[] }>("GET", `/v1/merchants/${m.id}/services`, undefined, owner)).items.filter((s) => s.active !== false);

    await signIn(page, ANNUAL);
    await page.goto(`/m/${m.id}/site`);
    await expect(page.getByRole("heading", { name: "Website", level: 1 })).toBeVisible();
    await expect(page.getByText("Your website goes live with the annual plan.")).toHaveCount(0);
    await page.getByRole("radio", { name: /Studio/ }).click();
    await expect(page.getByRole("radio", { name: /Studio/ })).toHaveAttribute("aria-checked", "true");

    const write = page.getByRole("button", { name: /Write it for me|Write a new draft/ });
    if (await write.isVisible()) {
      await write.click();
      await expect(page.getByText("Here's your draft. Edit anything you like.")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("site-usage")).toContainText("1 of 10 drafts this month");
      // One line rewritten with the small model (fake in e2e).
      await page.getByRole("button", { name: "Rewrite Line under the headline" }).click();
      await expect(page.getByTestId("site-usage")).toContainText("1 of 40 rewrites this month");
    } else {
      await expect(page.getByText(/Writing with AI isn't on here/)).toBeVisible();
    }

    // Inline edit: pick the headline in the preview, type over it in the panel.
    const preview = page.locator('[aria-labelledby="sb-preview"]');
    await preview.locator('[data-field="hero.headline"]').click();
    const headline = page.getByLabel("Headline", { exact: true });
    await expect(headline).toBeFocused();
    await headline.fill("Bloom, booked in a minute");
    await expect(preview.getByRole("heading", { level: 1 })).toHaveText("Bloom, booked in a minute");
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: shot("builder-1440-en"), fullPage: false });
    await axe(page);

    await page.getByTestId("site-publish").click();
    await expect(page.getByText("Your website is live.")).toBeVisible();
    await expect(page.getByText(`/s/${m.slug}`).first()).toBeVisible();

    await page.goto(`/s/${m.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bloom, booked in a minute");
    const svcSection = page.locator("#site-services");
    for (const s of services.slice(0, 2)) await expect(svcSection.getByText(s.name, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: shot("public-1440-en"), fullPage: true });
    await axe(page);

    // The address rule on the site: only a storefront shows its street address.
    const data = await call<{ location: { visibility: string; address: string | null } | null }>("GET", `/v1/public/sites/${m.slug}`);
    const detail = await call<{ locations: { address: string }[] }>("GET", `/v1/merchants/${m.id}`, undefined, owner);
    const street = detail.locations[0]?.address;
    if (street) {
      const html = await page.content();
      if (data.location?.visibility === "exact") expect(html).toContain(street);
      else expect(html).not.toContain(street);
    }

    await page.locator('#site-hero [data-action="book"]').click();
    await page.waitForURL(new RegExp(`/shops/${m.slug}/book`));
    await expect(page.locator("main")).toBeVisible();
  });

  test("Urdu: the public site and the builder read right to left", async ({ page }) => {
    const owner = await login(ANNUAL);
    const m = await shopOf(owner);
    await page.goto(`/s/${m.slug}?lang=ur`);
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
    await page.screenshot({ path: shot("public-1440-ur"), fullPage: true });
    await signIn(page, ANNUAL);
    await page.goto(`/m/${m.id}/site?lang=ur`);
    await expect(page.getByRole("heading", { name: "Website", level: 1 })).toBeVisible();
    await page.screenshot({ path: shot("builder-1440-ur") });
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("the public site and the builder at 390 (en and ur), no sideways scroll", async ({ page }) => {
    const owner = await login(ANNUAL);
    const m = await shopOf(owner);
    for (const lang of ["en", "ur"] as const) {
      await page.goto(`/s/${m.slug}?lang=${lang}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: shot(`public-390-${lang}`), fullPage: true });
    }
    await signIn(page, ANNUAL);
    for (const lang of ["en", "ur"] as const) {
      await page.goto(`/m/${m.id}/site?lang=${lang}`);
      await expect(page.getByRole("heading", { name: "Website", level: 1 })).toBeVisible();
      await page.screenshot({ path: shot(`builder-390-${lang}`) });
      await page.getByRole("radio", { name: "Preview" }).click();
      await expect(page.locator('[aria-labelledby="sb-preview"]')).toBeVisible();
      await page.screenshot({ path: shot(`builder-390-${lang}-preview`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });
});

test.describe("monthly shop", () => {
  test.use(desktop);

  test("sees the preview and the plan line, and cannot publish", async ({ page }) => {
    const owner = await login(MONTHLY);
    const m = await shopOf(owner);
    await signIn(page, MONTHLY);
    await page.goto(`/m/${m.id}/site`);
    await expect(page.getByText("Your website goes live with the annual plan.")).toBeVisible();
    await expect(page.getByRole("link", { name: "See the annual plan" })).toHaveAttribute("href", `/m/${m.id}/billing`);
    await expect(page.locator('[aria-labelledby="sb-preview"]').getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("site-publish")).toHaveCount(0);
    await page.screenshot({ path: shot("builder-monthly-1440-en") });
    const res = await fetch(`${API}/v1/merchants/${m.id}/site/publish`, { method: "POST", headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(402);
    expect((await fetch(`${API}/v1/public/sites/${m.slug}`)).status).toBe(404);
  });
});

test.describe("preset thumbnails", () => {
  test.use(desktop);

  /** One picture per preset from the builder's live preview (for the marketing PresetsBand). Leaves Bloom on Studio. */
  test("studio, portfolio and shopfront", async ({ page }) => {
    const owner = await login(ANNUAL);
    const m = await shopOf(owner);
    await signIn(page, ANNUAL);
    for (const preset of ["portfolio", "shopfront", "studio"] as const) {
      await call("POST", `/v1/merchants/${m.id}/site/reset`, { preset }, owner);
      await page.goto(`/m/${m.id}/site`);
      const pane = page.locator('[aria-labelledby="sb-preview"]');
      await expect(pane.locator(`[data-preset="${preset}"]`)).toBeVisible();
      await page.mouse.move(0, 0);
      await pane.screenshot({ path: shot(`preset-${preset}`) });
    }
  });
});
