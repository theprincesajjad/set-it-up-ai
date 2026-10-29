/**
 * Regulars come back (phase-pro P3): the owner's Rebooking page with the mode switch and the results strip, and the book-again link's
 * welcome on the customer's booking page at 390. Needs a running, seeded API and web (docs/engineering/web.md); uses Bloom Hair Studio.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/rebooking, untracked output).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone } from "./fixtures";

const OWNER = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/rebooking";
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2, maximumFractionDigits: 2 })}`;

async function ownerSetup() {
  const { accessToken: token } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  return { token, id: items[0]!.id };
}

async function signInOwner(page: Page, email = OWNER.email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("owner", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("the results strip shows what the reminders did, and the mode switch is a radio group", async ({ page }) => {
    const { token, id } = await ownerSetup();
    // Send whatever is due so the month has reminders in it; a client who cannot be reached is skipped, not an error.
    await call("POST", `/v1/merchants/${id}/rebooking/send-all`, {}, token).catch(() => undefined);
    const r = await call<{ month: { sent: number; booked: number; amountCents: number } }>("GET", `/v1/merchants/${id}/rebooking/results`, undefined, token);
    await signInOwner(page);
    await page.goto(`/m/${id}/rebooking`);
    await expect(page.getByRole("heading", { name: "Rebooking", level: 1 })).toBeVisible();
    const strip = page.getByTestId("rebook-results-month");
    await expect(strip).toBeVisible();
    if (r.month.sent) await expect(strip).toHaveText(`This month: ${r.month.sent} reminded · ${r.month.booked} rebooked · ${money(r.month.amountCents)}`);
    const group = page.getByRole("radiogroup", { name: "Reminders" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Remind them for me" })).toBeVisible();
    // Choosing "I'll send them myself" is kept after a reload.
    await group.getByRole("radio", { name: "I'll send them myself" }).click();
    await expect(group.getByRole("radio", { name: "I'll send them myself" })).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Reminders" }).getByRole("radio", { name: "I'll send them myself" })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: shot("rebooking-1440") });
    await call("PUT", `/v1/merchants/${id}/rebooking/settings`, { mode: "review" }, token);
  });

  // Screens to look at: the page at both widths, in English and Urdu (right to left).
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    for (const lang of ["en", "ur"] as const) {
      test(`the rebooking page at ${w} in ${lang} has no sideways scroll`, async ({ page }) => {
        const { id } = await ownerSetup();
        await page.setViewportSize({ width: w, height: h });
        await signInOwner(page);
        await page.goto(`/m/${id}/rebooking?lang=${lang}`);
        await expect(page.getByRole("radiogroup").first()).toBeVisible();
        if (lang === "ur") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        for (const r of await page.getByRole("radiogroup", { name: lang === "ur" ? /./ : "Reminders" }).first().getByRole("radio").all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
        await page.screenshot({ path: shot(`rebooking-${w}-${lang}`), fullPage: true });
      });
    }
  }
});

test.describe("a shop on Free", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the reminders switch is locked and the plan line says what Pro costs", async ({ page }) => {
    const CAFE = "owner+pinecone-coffee@example.com";
    const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: CAFE, password: OWNER.password });
    const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
    await signInOwner(page, CAFE);
    await page.goto(`/m/${items[0]!.id}/rebooking`);
    await expect(page.getByRole("heading", { name: "Rebooking", level: 1 })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Remind them for me" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(/Remind them for me · On Pro, \$29 a month/)).toBeVisible();
    await expect(page.getByRole("link", { name: "See Pro" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: shot("rebooking-free-390"), fullPage: true });
    await page.goto(`/m/${items[0]!.id}/rebooking?lang=ur`);
    await expect(page.getByText(/میری طرف سے یاد دلائیں · .*Pro/)).toBeVisible();
    await page.screenshot({ path: shot("rebooking-free-390-ur"), fullPage: true });
  });
});

test.describe("customer, phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a book-again link opens the booking page on the usual service, with 'Welcome back' once signed in", async ({ page }) => {
    const slug = "bloom-hair-studio";
    const { services } = await call<{ services: { id: string; name: string }[] }>("GET", `/v1/public/shops/${slug}/services`);
    const cut = services.find((s) => s.name.startsWith("Cut"))!;
    // A link nobody sent: the normal booking page, the service from the link still picked, no welcome.
    await page.goto(`/shops/${slug}/book?service=${cut.id}&rebook=00000000-0000-0000-0000-000000000009`);
    await expect(page.getByRole("checkbox", { name: /Cut and blow-dry/ })).toBeChecked();
    await expect(page.getByText(/Welcome back/)).toHaveCount(0);
    // Signed in as a seeded member: "Welcome back, <first name>" above the booking.
    await page.goto("/me");
    await fillPhone(page, "6475551000");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.goto(`/shops/${slug}/book?service=${cut.id}&rebook=00000000-0000-0000-0000-000000000009`);
    await expect(page.getByText(/^Welcome back/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Cut and blow-dry/ })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: shot("book-again-390") });
    await page.goto(`/shops/${slug}/book?service=${cut.id}&rebook=00000000-0000-0000-0000-000000000009&lang=ur`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText(/دوبارہ خوش آمدید/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: shot("book-again-390-ur") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/shops/${slug}/book?service=${cut.id}&rebook=00000000-0000-0000-0000-000000000009`);
    await expect(page.getByText(/^Welcome back/)).toBeVisible();
    await page.screenshot({ path: shot("book-again-1440") });
  });
});
