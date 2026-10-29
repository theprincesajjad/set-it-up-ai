/**
 * Google review request after every visit (phase pro, workstream P4; docs/business/pro-value.md P4):
 *   1. Settings, Reviews on Free: the switch is locked behind the quiet plan line, the missing link is warned about, and the link saves.
 *   2. After a checkout on Free, the success state carries "Ask {name} for a Google review? On Pro this goes out by itself ...".
 *   3. On Pro the switch turns on and the checkout success reads "A review request goes to {name} at {time}.".
 *   4. The public page /r/<token> keeps two equal options at 390 (viewed, never answered, so it can be re-run).
 * Seed shops: Arch & Thread Brow Bar (free), Rangrez Beauty Studio (put on Pro here, like people-side.spec.ts).
 * Screenshots: $SHOTS_DIR (default e2e/screenshots/reviews-appointments). Language: E2E_LANG (en, ur, hi, pa).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, newPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/reviews-appointments";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const LANG = process.env.E2E_LANG ?? "en";
const RTL = LANG === "ur";
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = async (email: string) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: PASSWORD })).accessToken;
async function owner(slug: string) {
  const token = await login(`owner+${slug}@example.com`);
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items.find((x) => x.slug === slug) ?? items[0]!;
  return { token, id: m.id, base: `/v1/merchants/${m.id}`, email: `owner+${slug}@example.com` };
}
type Shop = Awaited<ReturnType<typeof owner>>;
async function signIn(page: Page, email: string, path: string) {
  await page.goto(`/login?lang=${LANG}`);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(path);
}
/** The shop on Pro through the fake Stripe checkout (a second run finds it already there). */
async function goPro(shop: Shop) {
  const co = await call<{ sessionId: string }>("POST", `${shop.base}/billing/checkout`, { plan: "plus", interval: "month" }, shop.token).catch(() => null);
  if (co) await call("POST", "/v1/payments/fake/simulate", { action: "complete_checkout", id: co.sessionId }).catch(() => undefined);
}
const farDay = (weeks: number) => {
  const d = new Date(Date.now() + weeks * 7 * 86_400_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const toronto = (day: string, hhmm: string) => {
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "longOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "-05:00";
  return new Date(`${day}T${hhmm}:00${off}`).toISOString();
};

/** A booked visit for a named client on a far-off Wednesday, in the shop's first calendar. Returns the day and the id. */
async function visit(shop: Shop, name: string, userId?: string) {
  const staff = (await call<{ items: { userId: string }[] }>("GET", `${shop.base}/appointments/staff`, undefined, shop.token)).items;
  const svc = (await call<{ items: { id: string; active: boolean }[] }>("GET", `${shop.base}/services`, undefined, shop.token)).items.find((s) => s.active)!;
  const day = farDay(6 + Math.floor(Math.random() * 300));
  const customer = userId ? { userId } : { phone: `+1${newPhone()}`, name };
  const a = await call<{ id: string }>("POST", `${shop.base}/appointments`, { customer, staffId: staff[0]!.userId, serviceIds: [svc.id], startsAt: toronto(day, "11:00"), force: true }, shop.token);
  return { id: a.id, day };
}
async function checkOut(page: Page, shop: Shop, a: { id: string; day: string }) {
  await page.goto(`/m/${shop.id}/calendar?date=${a.day}&lang=${LANG}`);
  await page.locator(`[data-appt="${a.id}"]`).click();
  const side = page.getByRole("complementary").filter({ has: page.getByRole("button", { name: "Check in" }) });
  await side.getByRole("button", { name: "Check in" }).click();
  await side.getByRole("button", { name: "Start service" }).click();
  await side.getByRole("button", { name: /^Check out/ }).click();
  const sheet = page.getByRole("dialog", { name: "Check out" });
  const done = page.waitForResponse((r) => r.url().includes("/checkout") && r.request().method() === "POST");
  await sheet.getByRole("button", { name: /^Take \$/ }).click();
  await done;
  return sheet;
}

test("1, 2: on Free the switch is locked, the missing link is warned about and saves, and the checkout line offers Pro", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  await call("PUT", `${arch.base}/reviews/appointments/settings`, { googleReviewUrl: null }, arch.token);
  await signIn(page, arch.email, `/m/${arch.id}/settings/reviews?lang=${LANG}`);
  const card = page.getByTestId("review-settings");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("review-locked")).toBeVisible();
  await expect(card.getByTestId("review-locked").getByRole("link")).toHaveAttribute("href", `/m/${arch.id}/billing`);
  await expect(card.getByRole("switch")).toHaveCount(0);
  await expect(card.getByTestId("review-nolink")).toBeVisible();
  await expect(card.getByTestId("review-last30")).toContainText("0");
  await page.screenshot({ path: shot(`settings-free-1440-${LANG}`), fullPage: true });

  const url = `https://g.page/r/arch-and-thread-${Date.now()}/review`;
  await card.locator("input[type=url]").fill(url);
  await card.getByRole("button", { name: /Save link|लिंक सहेजें|لنک محفوظ کریں|ਲਿੰਕ ਸੰਭਾਲੋ/ }).click();
  await expect(card.getByTestId("review-nolink")).toHaveCount(0);
  await expect.poll(async () => (await call<{ googleReviewUrl: string | null }>("GET", `${arch.base}/reviews/appointments/settings`, undefined, arch.token)).googleReviewUrl).toBe(url);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("review-settings")).toBeVisible();
  await page.screenshot({ path: shot(`settings-free-390-${LANG}`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // The checkout success state on Free.
  const a = await visit(arch, "Review Client");
  const sheet = await checkOut(page, arch, a);
  const line = sheet.getByTestId("review-line-free");
  await expect(line).toBeVisible();
  await expect(line.getByRole("link")).toHaveAttribute("href", `/m/${arch.id}/billing`);
  if (LANG === "en") await expect(line).toContainText(/Ask Review for a Google review\? On Pro this goes out by itself two hours after every visit\./);
  await page.screenshot({ path: shot(`checkout-free-1440-${LANG}`) });
});

test("3: on Pro the switch turns on and the checkout says when the request goes out", async ({ page }) => {
  const rz = await owner("rangrez-beauty-studio");
  await goPro(rz);
  // A regular who agreed to hear from the shop (text is the best channel she has).
  const phone = `+1${newPhone()}`;
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const reg = await call<{ accessToken: string; user: { id: string } }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: "Hina" });
  await call("POST", "/v1/me/memberships", { merchantId: rz.id, consent: { text: "Yes, send me offers from Rangrez Beauty Studio. I can opt out anytime." } }, reg.accessToken);

  await signIn(page, rz.email, `/m/${rz.id}/settings/reviews?lang=${LANG}`);
  const card = page.getByTestId("review-settings");
  await expect(card.getByTestId("review-locked")).toHaveCount(0);
  const sw = card.getByRole("switch");
  await expect(sw).toBeVisible();
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await call<{ mode: string }>("GET", `${rz.base}/reviews/appointments/settings`, undefined, rz.token)).mode).toBe("on");
  await page.screenshot({ path: shot(`settings-pro-1440-${LANG}`), fullPage: true });

  const a = await visit(rz, "Hina", reg.user.id);
  const sheet = await checkOut(page, rz, a);
  const line = sheet.getByTestId("review-line-pro");
  await expect(line).toBeVisible();
  if (LANG === "en") await expect(line).toContainText(/^A review request goes to Hina at \d{1,2}:\d\d/);
  await page.screenshot({ path: shot(`checkout-pro-1440-${LANG}`) });
  const status = await call<{ scheduled: boolean }>("GET", `${rz.base}/reviews/appointments/${a.id}`, undefined, rz.token);
  expect(status.scheduled).toBe(true);
});

test("4: the public page keeps both options at 390 (the same two for every rating)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/r/demo-review-sarson-low?lang=${LANG}`);
  const send = page.locator("form").getByRole("button").last();
  await expect(send).toBeVisible();
  const google = page.getByRole("link", { name: /Google/ });
  await expect(google).toBeVisible();
  const [s, g] = [await send.boundingBox(), await google.boundingBox()];
  expect(s!.width).toBeGreaterThan(300);
  expect(Math.abs(s!.width - g!.width)).toBeLessThan(2);
  expect(g!.height).toBeGreaterThanOrEqual(44);
  if (RTL) expect(await page.evaluate(() => document.dir)).toBe("rtl");
  await page.screenshot({ path: shot(`token-page-390-${LANG}`), fullPage: true });
});
