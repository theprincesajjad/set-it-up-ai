import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/people";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const LANG = process.env.E2E_LANG ?? "en";
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = async (email: string, password = PASSWORD) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password })).accessToken;
async function owner(slug: string) {
  const token = await login(`owner+${slug}@example.com`);
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items.find((x) => x.slug === slug) ?? items[0]!;
  return { token, id: m.id, base: `/v1/merchants/${m.id}` };
}
async function customer(first: string) {
  const phone = `+1${newPhone()}`;
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const r = await call<{ accessToken: string; user: { id: string } }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: first });
  return { phone, token: r.accessToken, userId: r.user.id };
}
async function signIn(page: Page, email: string, path: string) {
  await page.goto(`/login?lang=${LANG}`);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(path);
}
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const at = (d: Date, h: number) => {
  const x = new Date(d);
  x.setUTCHours(h + 4, 0, 0, 0); // h o'clock Toronto (EDT/EST close enough for a booking time with force)
  return x.toISOString();
};

/** A client with a finished visit (with a visit note) and a booked one, by phone. */
async function clientWithVisits(shop: Awaited<ReturnType<typeof owner>>, name: string, phone = `+1${newPhone()}`, shift = 0) {
  const staff = (await call<{ items: { userId: string; name: string }[] }>("GET", `${shop.base}/appointments/staff`, undefined, shop.token)).items;
  const services = (await call<{ items: { id: string; name: string; active: boolean }[] }>("GET", `${shop.base}/services`, undefined, shop.token)).items.filter((s) => s.active);
  const past = await call<{ id: string }>("POST", `${shop.base}/appointments`, { customer: { phone, name }, staffId: staff[0]!.userId, serviceIds: [services[0]!.id], startsAt: at(days(-21 + shift), 11 + shift), force: true }, shop.token);
  await call("POST", `${shop.base}/appointments/${past.id}/status`, { status: "completed" }, shop.token);
  await call("PUT", `${shop.base}/appointments/${past.id}/visit-note`, { visitNote: "Thin natural arch, sensitive skin: aloe after" }, shop.token);
  const next = await call<{ id: string }>("POST", `${shop.base}/appointments`, { customer: { phone, name }, staffId: staff[0]!.userId, serviceIds: [services[services.length > 1 ? 1 : 0]!.id], startsAt: at(days(6 + shift), 14 + shift), force: true }, shop.token);
  return { phone, pastId: past.id, nextId: next.id, staff: staff[0]!, service: services[0]! };
}


test("F: Urdu inbox and client profile at 390", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  const c = await customer("Zara");
  await clientWithVisits(arch, "Zara Ali", c.phone);
  await call("POST", "/v1/me/memberships", { merchantId: arch.id }, c.token);
  const conv = await call<{ id: string }>("POST", `${arch.base}/inbox`, { userId: c.userId }, arch.token);
  await call("POST", `${arch.base}/inbox/${conv.id}/messages`, { body: "Your brow tint is ready to book." }, arch.token);
  await signIn(page, "owner+arch-and-thread@example.com", `/m/${arch.id}/inbox?lang=ur`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${arch.id}/inbox?lang=ur`);
  await expect(page.getByTestId("inbox-list")).toBeVisible();
  await page.screenshot({ path: shot("inbox-list-390-ur"), fullPage: true });
  await page.getByTestId("inbox-list").locator("button").first().click();
  await expect(page.getByTestId("inbox-thread")).toBeVisible();
  await page.screenshot({ path: shot("inbox-thread-390-ur"), fullPage: true });
  await page.goto(`/m/${arch.id}/customers?lang=ur`);
  await expect(page.getByTestId("clients-list")).toBeVisible();
  await page.screenshot({ path: shot("customers-390-ur"), fullPage: true });
  await page.getByTestId("clients-list").getByText(/Zara/).first().click();
  await expect(page.getByTestId("client-people")).toBeVisible();
  await page.screenshot({ path: shot("profile-390-ur"), fullPage: true });
});
