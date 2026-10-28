/**
 * v3 counter and kiosk acceptance (docs/design/v3-strategy.md 8.2 E): scan or phone to confirmation in under 5 seconds on the seeded café
 * (3 runs), hit areas measured in the browser (counter keys at least 72 px, kiosk keys 88 px, 8 px gaps), the counter shows no page header
 * or marketing, a stamp pops only when motion is allowed, the member QR stays black on white in dark mode, and the door kiosk renders in
 * Urdu without clipping. Needs a running, seeded API and web. Screenshots go to $SHOTS_DIR (default e2e/screenshots/counter-v3).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const BARBER = { email: "owner+crown-and-fade@example.com", password: "localloyalty-demo" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/counter-v3";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1180, height: 820 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function owner(creds: { email: string; password: string }) {
  const { accessToken: token } = await call<{ accessToken: string }>("POST", "/v1/auth/login", undefined, creds);
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", token);
  return { token, id: items[0]!.id };
}
const randPhone = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

/** A member who exists but has not been stamped today (created by an award, then undone), so the next stamp is not inside the cooldown. */
async function member(token: string, id: string, name: string, phone = randPhone()) {
  const res = await call<{ transactionId: string; member: { memberCode: string } }>("POST", `/v1/merchants/${id}/counter/award`, token, { phone, customerName: name, idempotencyKey: `e2e-v3-${phone}-${Date.now()}` });
  await call("POST", `/v1/merchants/${id}/counter/transactions/${res.transactionId}/undo`, token, {});
  return { phone, code: res.member.memberCode };
}

async function signIn(page: Page, creds: { email: string; password: string }, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function counterReady(page: Page) {
  await expect(page.locator('section[aria-label="Scan a card"][data-scan-ready="true"]')).toBeVisible();
}

test.describe("counter (café)", () => {
  test("scan or phone to confirmation in under 5 seconds, three runs", async ({ page }) => {
    const { token, id } = await owner(OWNER);
    await signIn(page, OWNER, `/m/${id}/counter`);
    await counterReady(page);
    for (let run = 1; run <= 3; run++) {
      const name = `Speed Run ${run}`;
      // Run 1 is a phone: four taps on the keypad. Runs 2 and 3 are a scanner: a fast burst and Enter.
      if (run === 1) {
        const m = await member(token, id, name);
        await page.reload();
        await counterReady(page);
        const started = Date.now();
        for (const d of m.phone.slice(-4)) await page.getByRole("group", { name: "Keypad" }).getByRole("button", { name: d, exact: true }).click();
        const pick = page.getByRole("list", { name: "Matching customers" });
        if (await pick.isVisible().catch(() => false)) await pick.getByRole("button", { name: `Stamp ${name}` }).click();
        await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 5000 });
        expect(Date.now() - started).toBeLessThan(5000);
      } else {
        const m = await member(token, id, name);
        await page.getByRole("button", { name: "Next customer" }).click();
        await counterReady(page);
        await page.keyboard.type(`LL:${m.code}`, { delay: 5 });
        const started = Date.now();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 5000 });
        expect(Date.now() - started).toBeLessThan(5000);
      }
      // The toast is terse and keeps Undo.
      await expect(page.getByText(/^Added \d+ stamps?\. .+ now has \d+\.$/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Undo \d+s$/ })).toBeVisible();
    }
  });

  test("hit areas: keypad keys are at least 72 px with 8 px gaps, and the page has no page header or marketing", async ({ page }) => {
    const { id } = await owner(OWNER);
    await signIn(page, OWNER, `/m/${id}/counter`);
    await counterReady(page);
    const boxes = await page.getByRole("group", { name: "Keypad" }).getByRole("button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
    expect(boxes).toHaveLength(12);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(72);
      expect(b.w).toBeGreaterThanOrEqual(72);
    }
    // Across and down: the gap between neighbours is 8 px.
    expect(Math.round(boxes[1]!.x - (boxes[0]!.x + boxes[0]!.w))).toBe(8);
    expect(Math.round(boxes[3]!.y - (boxes[0]!.y + boxes[0]!.h))).toBe(8);
    // Two panes at tablet width: lookup on the left, the right pane beside it.
    expect(boxes[0]!.x).toBeLessThan(500);
    // One h1 (the strip says Counter), no dashboard PageHeader, no tips or upsell.
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "Counter" })).toBeVisible();
    await expect(page.locator("main").getByText(/upgrade|tip:|coming with plus/i)).toHaveCount(0);
    await page.screenshot({ path: shot("01-counter-1180"), fullPage: true });
  });

  test("chrome-free: no sidebar or top bar, a way back, the PIN chip", async ({ page }) => {
    const { id } = await owner(OWNER);
    await signIn(page, OWNER, `/m/${id}/counter`);
    await counterReady(page);
    await expect(page.locator('[data-shell="bare"]')).toBeVisible();
    await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign in with a pin/i }).or(page.getByRole("button", { name: /stamping as/i }))).toBeVisible();
    // The exit goes back to Today, which has the shell again.
    await page.getByRole("link", { name: "Exit counter" }).click();
    await expect(page).toHaveURL(new RegExp(`/m/${id}$`));
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
  });

  test("Urdu: the counter reads right to left in Nastaliq, with Urdu copy and no clipped rows", async ({ page }) => {
    const { id } = await owner(OWNER);
    await signIn(page, OWNER, `/m/${id}/counter?lang=ur`);
    await expect(page.locator('section[data-scan-ready="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "کاؤنٹر" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", /^ur/);
    // The three counter strings that used to be English are Urdu now.
    await expect(page.getByText("یا ان کے فون کے آخری 4 ہندسے لکھیں")).toBeVisible();
    await expect(page.getByRole("button", { name: "کوڈ ریڈیم کریں" })).toBeVisible();
    await expect(page.getByText("Redeem a code")).toHaveCount(0);
    // The Noto Nastaliq face is in the stack of the page text and a glyph of it was drawn.
    const family = await page.locator("main h1").evaluate((e) => getComputedStyle(e).fontFamily);
    expect(family).toMatch(/nastaliq/i);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].some((f) => /Nastaliq/i.test(f.family) && f.status === "loaded"))).toBe(true);
    // Rows hug their content: no heading or label is cut off by its own box.
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main h1, main h2, main p, main button, main label, main span")].filter((e) => e.offsetParent && !e.classList.contains("sr-only") && e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible").map((e) => e.textContent?.trim().slice(0, 30)));
    expect(clipped).toEqual([]);
    await page.screenshot({ path: shot("03-counter-ur-1180") });
  });

  test("a new stamp pops only when motion is allowed", async ({ page }) => {
    const { token, id } = await owner(OWNER);
    const m = await member(token, id, "Motion Test");
    await signIn(page, OWNER, `/m/${id}/counter`);
    await counterReady(page);
    await page.keyboard.type(`LL:${m.code}`, { delay: 5 });
    await page.keyboard.press("Enter");
    const stamps = page.getByRole("status").getByRole("img", { name: /of \d+ stamps/ }).locator("span");
    await expect(stamps.first()).toBeVisible();
    const names = await stamps.evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names.some((n) => n.includes("stamp-pop"))).toBe(true);
    await page.screenshot({ path: shot("02-stamped-1180") });

    const m2 = await member(token, id, "Motion Test Two");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Next customer" }).click();
    await counterReady(page);
    await page.keyboard.type(`LL:${m2.code}`, { delay: 5 });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Motion Test Two" })).toBeVisible();
    const reduced = await page.getByRole("status").getByRole("img", { name: /of \d+ stamps/ }).locator("span").evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(reduced.every((n) => n === "none")).toBe(true);
  });
});

test("the member QR stays black on white in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/for-shoppers");
  const figure = page.locator("figure", { has: page.locator("svg") }).first();
  await expect(figure).toBeVisible();
  const look = await figure.evaluate((el) => {
    const svg = el.querySelector("svg")!;
    const block = svg.parentElement!.closest("div")!;
    let bg = "";
    for (let n: Element | null = svg; n && n !== el; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c !== "rgba(0, 0, 0, 0)") { bg = c; break; }
    }
    return { bg, fill: getComputedStyle(svg.querySelector("path")!).fill, block: block.tagName };
  });
  expect(look.bg).toBe("rgb(255, 255, 255)");
  expect(look.fill).toBe("rgb(0, 0, 0)");
  await figure.screenshot({ path: shot("03-qr-dark") });
});

test("the door kiosk shows the four language chips and renders in Urdu without clipping", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const { token, id } = await owner(BARBER);
  const me = await call<{ user: { id: string } }>("GET", "/v1/auth/me", token);
  await call("PUT", `/v1/merchants/${id}/team/${me.user.id}/pin`, token, { pin: "4242" });
  await signIn(page, BARBER, `/door/${id}`);
  const chips = page.getByRole("group", { name: /language/i }).getByRole("button");
  await expect(chips).toHaveCount(4);
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: shot("04-door-820-en") });
  await page.waitForLoadState("networkidle");
  await page.getByRole("group", { name: /language/i }).getByRole("button", { name: "اردو" }).click();
  await expect(page.getByRole("group", { name: /language|زبان/i }).getByRole("button", { name: "اردو" })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(page.locator("[dir=rtl]").first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: shot("05-door-820-ur"), fullPage: true });
  // No horizontal scroll, and no button or chip whose text is wider than its box.
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
  const clipped = await page.locator("main button, main label, main legend, main h1").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").map((e) => e.textContent));
  expect(clipped).toEqual([]);
  // Kiosk hit areas: the join button is at least 88 px tall, the choice chips 56 px.
  const join = await page.locator("form button[type=submit]").boundingBox();
  expect(join!.height).toBeGreaterThanOrEqual(88);
  const chipBox = await page.locator("form fieldset button").first().boundingBox();
  expect(chipBox!.height).toBeGreaterThanOrEqual(56);
});
