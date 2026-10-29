/**
 * Home-based privacy end to end (docs/business/solo-pro-launch.md §2.3; phase-solo B). A nail tech who works from home is on the
 * map by her area only: her street address is absent from the shop page (HTML and structured data), its Open Graph image source,
 * the map API, the sitemap and the booking page, and appears on the confirmation only after the deposit step.
 * Needs a running, seeded web and API (e2e/run-all.sh). Screenshots go to $E2E_SHOTS (default e2e/screenshots/solo).
 */
import { expect, test } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/solo";
const shot = (name: string) => `${SHOTS}/${name}.png`;

test.setTimeout(180_000);

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const rand = () => Math.random().toString(36).slice(2, 8);
const phone = () => `+1647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

/** A home studio set up through the API: area visibility, a private street, one service with a $15 deposit, every day open, Stripe connected. */
async function homeStudio() {
  const street = `${100 + Math.floor(Math.random() * 800)} Quietlane Crescent`;
  const email = `nails-${rand()}@example.com`;
  const s = await call<{ accessToken: string }>("POST", "/v1/auth/register", { name: "Mo Ahmed", email, password: "privacy-e2e-1" });
  const token = s.accessToken;
  const m = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: `Nails by Mo ${rand()}`, vertical: "nails", workSetting: "home", postalCode: "M6R 2K1", phone: "(416) 555-0134" }, token);
  const id = m.merchant.id;
  const b = `/v1/merchants/${id}/onboarding/solo`;
  await call("POST", `${b}/privacy`, { visibility: "area", address: street }, token);
  await call("POST", `${b}/services`, { items: [{ name: "Gel manicure", durationMin: 60, priceCents: 5500, depositCents: 1500 }] }, token);
  await call("POST", `${b}/hours`, { days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "08:00", endsLocal: "22:00" })) }, token);
  const { accountId } = await call<{ accountId: string }>("POST", `/v1/merchants/${id}/payments/connect`, {}, token);
  await call("POST", "/v1/payments/fake/simulate", { action: "complete_onboarding", id: accountId });
  // One visited client puts the shop on the map and in the sitemap.
  await call("POST", `/v1/merchants/${id}/counter/award`, { phone: phone(), amountCents: 5500, idempotencyKey: `e2e-${rand()}` }, token);
  const detail = await call<{ merchant: { slug: string } }>("GET", `/v1/merchants/${id}`, undefined, token);
  return { id, token, street, slug: detail.merchant.slug };
}

test("an area shop's street is nowhere before booking, and on the confirmation after the deposit", async ({ page, request }) => {
  const s = await homeStudio();
  const streetRe = new RegExp(s.street.split(" ")[1]!, "i");

  // The API everything public reads: shop, map list, booking page data.
  const shopApi = await (await request.get(`${API}/v1/public/shops/${s.slug}`)).text();
  expect(shopApi).not.toMatch(streetRe);
  expect(shopApi).not.toContain("M6R 2K1");
  const mapApi = await (await request.get(`${API}/v1/network/shops?limit=200`)).json();
  const listed = (mapApi.items as { merchant: { id: string }; location: { address: string; addressVisibility?: string } | null }[]).find((x) => x.merchant.id === s.id);
  expect(listed?.location?.addressVisibility).toBe("area");
  expect(JSON.stringify(mapApi)).not.toMatch(streetRe);
  expect(await (await request.get(`${API}/v1/public/shops/${s.slug}/services`)).text()).not.toMatch(streetRe);

  // The shop page: HTML (with its JSON-LD), what a person sees, and no route to a door.
  const html = await (await request.get(`/shops/${s.slug}`)).text();
  expect(html).not.toMatch(streetRe);
  expect(html).not.toContain("M6R 2K1");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/shops/${s.slug}`);
  await expect(page.locator("body")).not.toContainText(streetRe);
  await expect(page.getByRole("link", { name: "Directions" })).toHaveCount(0);
  await page.screenshot({ path: shot("privacy-shop-390"), fullPage: true });

  // The Open Graph image renders from the same public data (no address field exists there), and the sitemap lists the shop without it.
  expect((await request.get(`/shops/${s.slug}/opengraph-image`)).status()).toBe(200);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toMatch(streetRe);

  // The booking page says the address comes after booking.
  await page.goto(`/shops/${s.slug}/book`);
  await expect(page.getByTestId("booking-privacy")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(streetRe);
  await page.getByRole("checkbox", { name: /Gel manicure/ }).click();
  await page.getByRole("button", { name: "Choose a time" }).click();
  const TIMES = page.getByRole("button", { name: /^\d{1,2}:\d{2}/ });
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).last().click();
  await expect(TIMES.first()).toBeVisible();
  await TIMES.first().click();
  await page.getByLabel("Your first name").fill("Ava");
  await page.getByRole("button", { name: "Sign in to book" }).click();
  await page.locator("input[type=tel]").first().fill(phone().slice(2));
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  // The deposit step: the hold is on, the address is still not shown.
  await expect(page.getByText(/We are holding this time until/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText(streetRe);
  await page.getByRole("button", { name: "Book and pay $15 deposit" }).click();
  await expect(page.getByRole("heading", { name: "you are booked" })).toBeVisible({ timeout: 20_000 });
  // Confirmed: now, and only now, the street.
  await expect(page.getByTestId("booked-address")).toContainText(s.street);
  await page.screenshot({ path: shot("privacy-booked-390"), fullPage: true });
});
