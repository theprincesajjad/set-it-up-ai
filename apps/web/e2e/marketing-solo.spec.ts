/**
 * Solo-pro landing pages, v2 direction B (docs/marketing/landing-pages.md): /for-nail-techs (+ ?trade=brows|lashes|makeup),
 * /for-barbers, /for-groomers. Checks the hook and the trade swap, the three-field start into the sign-up wizard, the ll_src
 * source (and ?src=client from the PoweredBy line), the floating cards never covering the phone's screen, CSS-only motion that
 * stops under reduced motion, 44 px hit areas, axe, phone width and a right-to-left document. Needs a running, seeded web and
 * API (e2e/run-all.sh). Screenshots go to $SHOTS_DIR only when it is set.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.SHOTS_DIR;
const shot = (name: string) => (SHOTS ? { path: `${SHOTS}/${name}.png`, fullPage: true } : undefined);

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
async function axe(page: Page, selector: string): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (sel) => {
    const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(sel, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }, selector);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Every visible floating card beside the phone, and whether it overlaps the phone's screen. */
const floatsOverScreen = (page: Page) =>
  page.evaluate(() => {
    const screen = document.querySelector(".sl-screen")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>(".sl-float")]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > screen.left + 0.5 && r.left < screen.right - 0.5 && r.bottom > screen.top + 0.5 && r.top < screen.bottom - 0.5;
      })
      .map((el) => el.className);
  });

/** Links, buttons and chips on the page itself (the shared site footer is not part of it) under 44 px. */
const smallTargets = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".sl a, .sl button, .sl .sl-chip-r")]
      .filter((el) => el.getClientRects().length > 0 && !el.closest("[aria-hidden=true], [role=img]"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44 || r.width < 44)
      .map(({ el, r }) => `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
  );

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test("nail page: the hook, the phone, the source cookie and a prerendered response", async ({ page }) => {
  const res = await page.goto("/for-nail-techs");
  // Prerendered: served from the static output, never rendered per request.
  expect(res!.headers()["cache-control"] ?? "").not.toMatch(/no-store|private/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop booking in your DMs.");
  await expect(page.locator("[data-solo-trade=nails][data-trade=nails]")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "The booking flow, as a client sees it" })).toBeVisible();
  // The awning is Warm-only; the solo pages have none, and no gradient on any block.
  await expect(page.getByTestId("awning")).toHaveCount(0);
  expect(await page.evaluate(() => [...document.querySelectorAll(".sl *")].filter((el) => /gradient/.test(getComputedStyle(el).backgroundImage)).length)).toBe(0);
  // The source is remembered for sign-up.
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "ll_src")?.value).toBe("nail-techs");
  await expect(page.locator("#start input[name=src]")).toHaveValue("nail-techs");
  // The price under the button is a real link to the price block.
  const price = page.getByRole("link", { name: /\$0 to start, then \$39 a month/ });
  await expect(price).toHaveAttribute("href", "#plans");
  await price.click();
  await expect(page.locator("#plans")).toBeInViewport();
  await expect(page.locator("#plans [data-plan=monthly]")).toContainText("$39");
  await expect(page.locator("#plans [data-plan=yearly]")).toContainText("$390");
  await expect(page.locator("#plans").getByRole("link", { name: /compare with Fresha/ })).toHaveAttribute("href", "/pricing#booking-apps");
  // The comparison table, the FAQ and the twelve-field wizard are off the page.
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/licen[cs]e|inspection/i);
  expect(await noSideScroll(page)).toBe(true);
  if (SHOTS) await page.screenshot(shot("nail-1440")!);
});

test("the other looks of the nail page swap the words, the photos and the sign-up preset", async ({ page }) => {
  for (const [trade, hook, chip, vertical, photo, nav] of [
    ["brows", "Stop booking in your DMs.", "Brows", "brows_lashes", "brows-", "Brow techs"],
    ["lashes", "Stop booking in your DMs.", "Lashes", "brows_lashes", "lashes-", "Lash techs"],
    ["makeup", "Get the deposit before the date.", "Makeup", "makeup", "lashes-", null],
  ] as const) {
    await page.goto(`/for-nail-techs?trade=${trade}`);
    await expect(page).toHaveURL(new RegExp(`/for-nail-techs\\?trade=${trade}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(hook);
    await expect(page.locator(`[data-solo-trade=${trade}][data-trade=${vertical}]`)).toHaveCount(1);
    await expect(page.locator(".sl-work img")).toHaveAttribute("src", new RegExp(`/marketing/${photo}`));
    await expect(page.locator("#start").getByRole("radio", { name: chip })).toBeChecked();
    await expect(page.locator("#start").getByRole("link", { name: "Prefer the full sign-up page?" })).toHaveAttribute("href", `/signup?vertical=${vertical}&src=nail-techs`);
    const current = page.getByRole("navigation", { name: "Booking for" }).locator("[aria-current=page]");
    if (nav) await expect(current).toHaveText(nav);
    else await expect(current).toHaveCount(0);
  }
  await page.goto("/for-nail-techs?trade=nonsense");
  await expect(page.locator("[data-solo-trade=nails]")).toHaveCount(1);
});

test("barber page: no per-chair charge, the barber preset, and the comparison on /pricing", async ({ page }) => {
  await page.goto("/for-barbers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No per-chair charge. Ever.");
  await expect(page.locator("[data-trade=barber]")).toHaveCount(1);
  await expect(page.locator("#start").getByRole("radio", { name: "Barber" })).toBeChecked();
  await expect(page.locator("#start").getByRole("link", { name: "Prefer the full sign-up page?" })).toHaveAttribute("href", "/signup?vertical=barber&src=barbers");
  await expect(page.locator("table")).toHaveCount(0);
  if (SHOTS) await page.screenshot(shot("barber-1440")!);

  await page.goto("/pricing#booking-apps");
  const table = page.locator("#booking-apps table");
  await expect(table).toBeVisible();
  expect(await table.locator("tbody tr").count()).toBe(6); // five rows plus four chairs
  await expect(table).toContainText("Oct 28, 2026");
  await expect(table).toContainText("currency not stated");
  expect(await table.locator("tbody td:not(:first-of-type)").filter({ hasText: /Fresha|\$|Free|None|Included|Not on/ }).count()).toBeGreaterThan(10);
});

test("groomer page and home chips", async ({ page }) => {
  await page.goto("/for-groomers");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vaccines checked.");
  await expect(page.locator("[data-solo-trade=groom][data-trade=pet]")).toHaveCount(1);
  await expect(page.locator(".sl-work img")).toHaveAttribute("src", "/marketing/groom-900.webp");
  expect(await page.locator(".sl-work img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0 && /groom-900\.avif$/.test(i.currentSrc))).toBe(true);
  await expect(page.locator("#start").getByRole("radio", { name: "Groomer" })).toBeChecked();
  await page.goto("/");
  for (const [name, href] of [["Nail techs", "/for-nail-techs"], ["Barbers", "/for-barbers"], ["Pet groomers", "/for-groomers"]] as const)
    await expect(page.getByRole("navigation", { name: "Booking for" }).getByRole("link", { name })).toHaveAttribute("href", href);
});

test("the three-field start leads into the sign-up wizard, prefilled", async ({ page }) => {
  await page.goto("/for-nail-techs");
  const start = page.locator("#start");
  await start.getByLabel("Your name or studio").fill("Mira Brow Bar");
  await start.getByRole("radio", { name: "Brows" }).check();
  await start.getByLabel("Email or mobile").fill("mira@example.com");
  await start.getByRole("button", { name: "Get your booking link, free" }).click();
  await page.waitForURL(/\/signup\?/);
  const url = new URL(page.url());
  expect(Object.fromEntries(url.searchParams)).toMatchObject({ shop: "Mira Brow Bar", trade: "brows", contact: "mira@example.com", src: "nail-techs" });
  await expect(page.locator("input[name=shopName]")).toHaveValue("Mira Brow Bar");
  await expect(page.locator("[data-vertical=brows_lashes]")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("input[name=email]")).toHaveValue("mira@example.com");

  // A mobile number goes to the phone field instead.
  await page.goto("/for-barbers");
  await page.locator("#start").getByLabel("Your name or studio").fill("Corner Cuts");
  await page.locator("#start").getByLabel("Email or mobile").fill("(416) 555-0123");
  await page.locator("#start").getByRole("button", { name: "Get your booking link, free" }).click();
  await page.waitForURL(/\/signup\?/);
  await expect(page.locator("[data-vertical=barber]")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("input[type=tel]").first()).toHaveValue(/416/);
  await expect(page.locator("input[name=email]")).toHaveValue("");
});

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`floating cards never cover the phone, targets are 44 px and the pages are axe-clean at ${w}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: w, height: h });
    for (const [path, tag] of [["/for-nail-techs", "nail"], ["/for-nail-techs?trade=brows", "brows"], ["/for-barbers", "barber"], ["/for-groomers", "groom"]] as const) {
      await page.goto(path);
      expect(await floatsOverScreen(page), `${path} at ${w}`).toEqual([]);
      expect(await smallTargets(page), `${path} at ${w}`).toEqual([]);
      expect(await noSideScroll(page)).toBe(true);
      expect(await axe(page, ".sl"), `${path} at ${w}`).toEqual([]);
      if (SHOTS && w === 390) await page.screenshot(shot(`${tag}-390`)!);
    }
  });
}

test("motion is CSS only and stops under reduced motion", async ({ page }) => {
  await page.goto("/for-nail-techs");
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation).length)).toBeGreaterThan(10);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length)).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  expect(await page.evaluate(() => document.querySelector(".sl")!.getAnimations({ subtree: true }).length)).toBe(0);
  // The finished frame: the first booking screen, every demo filled in.
  expect(await page.locator(".sl-app").evaluateAll((els) => els.map((e) => getComputedStyle(e).visibility))).toEqual(["visible", "hidden", "hidden", "hidden"]);
});

test("right to left: the page mirrors without breaking at phone width", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const path of ["/for-nail-techs", "/for-barbers", "/for-groomers"]) {
      await page.goto(path);
      await page.evaluate(() => {
        document.documentElement.dir = "rtl";
      });
      expect(await noSideScroll(page), `${path} rtl at ${w}`).toBe(true);
      expect(await floatsOverScreen(page), `${path} rtl at ${w}`).toEqual([]);
      // The phone sits on the start side's opposite edge: on the left in RTL at desktop width.
      if (w === 1440) {
        const [phone, work] = await Promise.all([page.locator(".sl-phone").boundingBox(), page.locator(".sl-work").boundingBox()]);
        expect(phone!.x).toBeLessThan(work!.x);
      }
    }
    if (SHOTS) await page.screenshot(shot(`nail-${w}-rtl`)!);
  }
});

test("PoweredBy on a booking page leads to the matching landing page with src=client", async ({ page }) => {
  const api = await fetch(`${API}/v1/public/plans`).catch(() => null);
  test.skip(!api?.ok, "needs the seeded API");
  await page.goto("/shops/bloom-hair-studio/book");
  const link = page.locator("[data-powered-by] a");
  await expect(link).toHaveAttribute("href", "/for-nail-techs?src=client");
  await expect(link).toContainText("Powered by Local Loyalty");
  await link.click();
  await expect(page).toHaveURL(/\/for-nail-techs\?src=client$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("DMs");
  // The visit is counted as the client loop: the form and the cookie carry src=client.
  await expect(page.locator("#start input[name=src]")).toHaveValue("client");
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "ll_src")?.value).toBe("client");
});
