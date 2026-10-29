/**
 * Solo-pro onboarding (docs/design/onboarding-v1.md §3, §8; phase-solo B): a nail tech from the landing page to a live booking link
 * (the `booking_link_live` milestone) in under three minutes of wall time, at 1440 and 390, in English and Urdu (right to left: the
 * rail and the preview mirror). Selectors are structural (data attributes, roles, input names) so the Urdu run reads the same.
 * Needs a running, seeded web and API (e2e/run-all.sh). Screenshots go to $E2E_SHOTS (default e2e/screenshots/solo).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/solo";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const rand = () => Math.random().toString(36).slice(2, 8);
const digits = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

test.setTimeout(240_000);

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** The card's black button, and the step the URL is on. */
const primary = (page: Page) => page.locator("[data-step-card] footer").locator("button, a").last();
const onStep = (page: Page, step: string) => page.waitForURL(new RegExp(`/setup\\?step=${step}`), { timeout: 20_000 });

for (const run of [
  { width: 1440, height: 900, lang: "en" },
  { width: 390, height: 844, lang: "en" },
  { width: 1440, height: 900, lang: "ur" },
  { width: 390, height: 844, lang: "ur" },
] as const) {
  const tag = `${run.lang}-${run.width}`;
  test(`a nail tech goes from the landing page to a live booking link in under 3 minutes (${tag})`, async ({ page, context }) => {
    await page.setViewportSize({ width: run.width, height: run.height });
    if (run.lang !== "en") await context.addCookies([{ name: "ll_lang", value: run.lang, domain: "localhost", path: "/" }]);
    const started = Date.now();
    const email = `nails-${rand()}@example.com`;
    const password = "solo-e2e-pass-1";

    // The landing page, then its full sign-up page (the inline form is the marketing team's; the full page is the same wizard).
    await page.goto(`/for-nail-techs?lang=${run.lang}`);
    const full = page.locator('a[href^="/signup"]').first();
    if (await full.count()) await page.goto(`${(await full.getAttribute("href"))!}&lang=${run.lang}`);
    else await page.goto(`/signup?vertical=nails&src=e2e&lang=${run.lang}`);
    if (run.lang === "ur") await expect(page.locator('[dir="rtl"]').first()).toBeAttached();

    // Signup: one screen. A nail tech works from home: a postal code, never a street.
    await page.locator("[data-vertical=nails]").click();
    await expect(page.locator('[role=radio][data-value="home"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("input[name=street]")).toHaveCount(0);
    await page.locator("input[name=shopName]").fill(`Nails by Mo ${rand()}`);
    await page.locator("input[type=tel]").first().fill(digits());
    await page.locator("input[name=postal]").fill("M6R 2K1");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(password);
    await page.screenshot({ path: shot(`01-signup-${tag}`), fullPage: true });
    await page.locator("form button[type=submit]").last().click();

    // Card 1: the link, prefilled from the studio name.
    await onStep(page, "your_link");
    const id = new URL(page.url()).pathname.split("/")[2]!;
    await expect(page.locator("[data-step-card]")).toBeVisible();
    if (run.width >= 1024) await expect(page.locator("[data-preview-rail]")).toBeVisible();
    await page.screenshot({ path: shot(`02-link-${tag}`), fullPage: true });
    await primary(page).click();

    // Card 2: the usual list for the trade, ticked.
    await onStep(page, "services");
    await expect(page.locator("[data-step-card] input[type=checkbox]").first()).toBeChecked();
    await page.screenshot({ path: shot(`03-services-${tag}`), fullPage: true });
    await primary(page).click();

    // Card 3: the week. Saving it puts the link live.
    await onStep(page, "hours");
    await page.screenshot({ path: shot(`04-hours-${tag}`), fullPage: true });
    await primary(page).click();
    await onStep(page, "privacy");

    const token = (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password })).accessToken;
    const c = await call<{ path: string; solo: { live: boolean; secondsToLive: number | null; slug: string; addressVisibility: string } }>("GET", `/v1/merchants/${id}/onboarding`, undefined, token);
    expect(c.path).toBe("solo");
    expect(c.solo.live).toBe(true);
    expect(c.solo.secondsToLive).not.toBeNull();
    expect(c.solo.secondsToLive!).toBeLessThan(180);
    expect(Date.now() - started).toBeLessThan(180_000);

    // Card 4: the address stays private; the street goes on file for confirmed bookings only.
    await expect(page.locator('[role=radio][data-value="area"]')).toHaveAttribute("aria-checked", "true");
    await page.locator("[data-step-card] input[autocomplete=street-address]").fill("12 Quietlane Crescent");
    await page.screenshot({ path: shot(`05-privacy-${tag}`), fullPage: true });
    await primary(page).click();

    // Card 5: live, share it.
    await onStep(page, "share");
    await expect(page.getByTestId("booking-link")).toContainText(c.solo.slug);
    await primary(page).click();
    await expect(page.getByTestId("solo-live")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: shot(`06-share-${tag}`), fullPage: true });

    // Card 6: the invite goes from her own phone (an sms: link), so it reads as her.
    await onStep(page, "invite");
    await expect(primary(page)).toHaveAttribute("href", /^sms:/);
    await page.screenshot({ path: shot(`07-invite-${tag}`), fullPage: true });

    // The public booking page works at the chosen link, and shows the area, not a street.
    await page.goto(`/shops/${c.solo.slug}/book`);
    await expect(page.getByTestId("booking-privacy")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Quietlane");

    // No sideways scroll on a phone.
    if (run.width < 600) {
      await page.goto(`/m/${id}/setup?step=services`);
      await expect(page.locator("[data-step-card]")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });
}
