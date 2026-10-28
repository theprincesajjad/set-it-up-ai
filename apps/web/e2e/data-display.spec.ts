/**
 * Workstream C: every list has loading, error and empty states (Figma 12:349), the Customers grid is keyboard driven, and the
 * calendar's shortest block is a real target. Needs a running, seeded API and web (docs/engineering/web.md).
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { API } from "./fixtures";

const CAFE = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const SALON = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function merchantId(who: { email: string; password: string }) {
  const t = ((await (await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who) })).json()) as { accessToken: string }).accessToken;
  return ((await (await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${t}` } })).json()) as { items: { id: string }[] }).items[0]!.id;
}

const LIST = /\/customers\?/;

test("customers: loading, error with Try again, and empty", async ({ page }) => {
  const id = await merchantId(CAFE);
  await signIn(page, CAFE);

  // loading: hold the list request
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(LIST, async (route: Route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/m/${id}/customers`);
  await expect(page.locator('[data-state="loading"]')).toBeVisible();
  release();
  await expect(page.getByRole("table", { name: "Customers" })).toBeVisible();
  await page.unroute(LIST);

  // error
  await page.route(LIST, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "internal", message: "boom" } }) }));
  await page.goto(`/m/${id}/customers`);
  await expect(page.getByText("We could not load your customers.")).toBeVisible();
  await page.unroute(LIST);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table", { name: "Customers" })).toBeVisible();

  // empty
  await page.route(LIST, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], nextCursor: null, total: 0 }) }));
  await page.goto(`/m/${id}/customers`);
  await expect(page.getByText("No customers yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Print your QR stand" })).toBeVisible();
});

test("customers grid: arrows move rows, Enter opens the sheet, Escape closes it and focus returns", async ({ page }) => {
  const id = await merchantId(CAFE);
  await signIn(page, CAFE);
  await page.goto(`/m/${id}/customers`);
  const rows = page.getByRole("table", { name: "Customers" }).locator("tbody tr[data-row-id]");
  await expect(rows.first()).toBeVisible();
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Customer" });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/[?&]member=/);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(rows.first()).toBeFocused();
});

test("calendar: a 15-minute block is at least 24 px and opens on a tap, next to another block", async ({ page }) => {
  const id = await merchantId(SALON);
  const tok = ((await (await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(SALON) })).json()) as { accessToken: string }).accessToken;
  const h = { "content-type": "application/json", authorization: `Bearer ${tok}` };
  const base = `${API}/v1/merchants/${id}`;
  const staff = ((await (await fetch(`${base}/appointments/staff`, { headers: h })).json()) as { items: { userId: string; name: string }[] }).items;
  const svcs = ((await (await fetch(`${base}/services`, { headers: h })).json()) as { items: { id: string; name: string }[] }).items;
  const brow = svcs.find((s) => s.name.startsWith("Threading, brows"))!;
  const d = new Date(Date.now() + (500 + Math.floor(Math.random() * 300)) * 86_400_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "longOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "-05:00";
  const book = async (hhmm: string) => {
    const r = await fetch(`${base}/appointments`, { method: "POST", headers: h, body: JSON.stringify({ staffId: staff[0]!.userId, serviceIds: [brow.id], startsAt: new Date(`${day}T${hhmm}:00${off}`).toISOString(), customer: { phone: `+1416555${Math.floor(1000 + Math.random() * 8999)}`, name: "Tiny Client" } }) });
    return ((await r.json()) as { id: string }).id;
  };
  const a = await book("11:00");
  const b = await book("11:15");
  await signIn(page, SALON);
  await page.goto(`/m/${id}/calendar?date=${day}`);
  const blockA = page.locator(`[data-appt="${a}"]`);
  const blockB = page.locator(`[data-appt="${b}"]`);
  await expect(blockA).toBeVisible();
  const ba = (await blockA.boundingBox())!;
  const bb = (await blockB.boundingBox())!;
  expect(ba.height).toBeGreaterThanOrEqual(24);
  expect(bb.y).toBeGreaterThanOrEqual(ba.y + ba.height - 0.5); // no overlap: the next block starts below this one
  // The block is what a tap at its centre reaches (nothing, not even the now line, sits on top).
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-appt]")?.getAttribute("data-appt"), { x: ba.x + ba.width / 2, y: ba.y + ba.height / 2 });
  expect(hit).toBe(a);
  await blockA.click();
  await expect(page.getByRole("complementary", { name: "Appointment" })).toBeVisible();
});
