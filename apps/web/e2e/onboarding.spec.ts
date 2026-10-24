/**
 * Merchant onboarding (docs/research/merchant-onboarding.md): one-screen signup that lands on "give your first stamp",
 * the first stamp showing up on its own, the activation view on Home, the paid-tier moment for a South Asian
 * restaurant once it is active, and the admin funnel. Screenshots go to $E2E_SHOTS (default e2e/screenshots/onboarding).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/onboarding";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const rand = () => Math.random().toString(36).slice(2, 8);
const phone = () => `+1647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

async function signIn(page: Page, who: { email: string; password: string }, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A new owner and shop through the API (the signup form is covered by the first test). */
async function newShop(vertical: string, name: string) {
  const email = `owner-${rand()}@example.com`;
  const password = "onboarding-e2e-1";
  const s = await call<{ accessToken: string }>("POST", "/v1/auth/register", { name: "Imran Qureshi", email, password });
  const m = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name, vertical, address: "3250 Ridgecrest Blvd", phone: "(905) 555-0134" }, s.accessToken);
  return { id: m.merchant.id, token: s.accessToken, email, password };
}
const stamp = (id: string, token: string) => call("POST", `/v1/merchants/${id}/counter/award`, { phone: phone(), amountCents: 2500, idempotencyKey: `e2e-${rand()}-${rand()}` }, token);

test("signup is one screen and lands on the first stamp; the stamp shows up by itself; Home shows the activation view", async ({ page }) => {
  const email = `owner-${rand()}@example.com`;
  await page.goto("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("get your shop on the street");
  await expect(page.getByRole("radio", { name: "Tiffin kitchen" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "South Asian restaurant" })).toBeVisible();
  // Old fields are gone: nothing here is needed to give the first stamp.
  await expect(page.getByLabel(/Postal code/)).toHaveCount(0);
  await expect(page.getByLabel(/Shop email/)).toHaveCount(0);
  await page.getByLabel("Shop name").fill(`Sunrise Bakery ${rand()}`);
  await page.getByLabel("Your name").fill("Priya Shah");
  await page.getByRole("radio", { name: "Bakery" }).click();
  await expect(page.getByText(/We start you on: 1 stamp per visit/)).toBeVisible();
  await page.getByLabel(/Your mobile number/).fill("4165550134");
  await page.getByLabel("Street address").fill("2210 Danforth Ave");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("onboarding-e2e-1");
  await page.screenshot({ path: shot("01-signup"), fullPage: true });
  await page.getByRole("button", { name: "Create my shop and give my first stamp" }).click();

  await page.waitForURL(/\/m\/[^/]+\/setup\?step=first_stamp/);
  const id = new URL(page.url()).pathname.split("/")[2]!;
  await expect(page.getByRole("heading", { name: "Give your first stamp" })).toBeVisible();
  await expect(page.getByText("Waiting for your first stamp")).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code to join/ })).toBeVisible();
  await expect(page.getByText("1 of 5 done")).toBeVisible();
  await expect(page.getByText("Later, optional")).toBeVisible();
  await page.screenshot({ path: shot("02-setup-first-stamp"), fullPage: true });

  // Someone stamps: this page notices on its own (it polls).
  const token = (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: "onboarding-e2e-1" })).accessToken;
  await stamp(id, token);
  await expect(page.getByText("First stamp given.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2 of 5 done")).toBeVisible();

  await page.goto(`/m/${id}`);
  await expect(page.getByRole("region", { name: "Your first 30 days" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 of 25 members has visited" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Active members" })).toBeVisible();
  await expect(page.getByText("12 by day 14 is the pace that gets you to 25")).toBeVisible();
  await expect(page.getByRole("list", { name: "Milestones" })).toContainText("First stamp");
  await expect(page.getByText("Where members came from")).toBeVisible();
  await expect(page.getByRole("link", { name: "Do it" }).first()).toBeVisible();
  await expect(page.getByText(/Your regulars are on the card/)).toHaveCount(0);
  await page.screenshot({ path: shot("03-home-activation"), fullPage: true });
});

test("a South Asian restaurant sees its playbook, and the paid-tier offer only once it is active; Not now hides it", async ({ page }) => {
  const shop = await newShop("restaurant_south_asian", `Sarson Dhaba ${rand()}`);
  await signIn(page, shop, `/m/${shop.id}/setup?step=first_members`);
  await expect(page.getByRole("heading", { name: "Your first 25 members" })).toBeVisible();
  await expect(page.getByText(/Families on Friday and weekend evenings/)).toBeVisible();
  await page.goto(`/m/${shop.id}`);
  await expect(page.getByRole("region", { name: "Your first 30 days" })).toBeVisible();
  await expect(page.getByText(/Your regulars are on the card/)).toHaveCount(0);

  for (let i = 0; i < 25; i++) await stamp(shop.id, shop.token);
  await page.goto(`/m/${shop.id}`);
  await expect(page.getByRole("region", { name: "Your first 30 days" })).toHaveCount(0);
  const offer = page.getByRole("region", { name: "Next step for your shop" });
  await expect(offer).toBeVisible();
  await expect(offer).toContainText("tiffin, degh and festival orders in one place");
  await expect(offer).toContainText("$199 a month");
  await expect(offer).toContainText("50% off for 12 months");
  await page.screenshot({ path: shot("04-restaurant-upsell"), fullPage: true });
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(offer).toHaveCount(0);

  // The staff script card prints in Hindi, Urdu and Punjabi for this shop.
  await page.goto(`/m/${shop.id}/locations/kit?print=script`);
  await expect(page.getByText("क्या आपके पास कार्ड है?")).toBeVisible();
  await expect(page.locator('[lang="ur"]').first()).toBeVisible();
});

test("a café never sees the restaurant offer, and an owner can stop setup reminders", async ({ page }) => {
  const shop = await newShop("cafe", `Beanery ${rand()}`);
  await signIn(page, shop, `/m/${shop.id}/setup`);
  await expect(page.getByText(/Setup reminders by text: on/)).toBeVisible();
  await page.getByRole("button", { name: "Stop reminders" }).click();
  await expect(page.getByText(/Setup reminders by text: off/)).toBeVisible();
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText(/Setup reminders by text: on/)).toBeVisible();
  for (let i = 0; i < 25; i++) await stamp(shop.id, shop.token);
  await page.goto(`/m/${shop.id}`);
  const offer = page.getByRole("region", { name: "Next step for your shop" });
  await expect(offer).toContainText("bring them back on a slow day");
  await expect(offer).not.toContainText("Restaurant");
});

test("admin sees the activation funnel and who to call", async ({ page }) => {
  await newShop("pharmacy", `Stuck Pharmacy ${rand()}`);
  await signIn(page, ADMIN, "/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Activation funnel" })).toBeVisible();
  const funnel = page.getByRole("list", { name: "Funnel" });
  await expect(funnel).toContainText("Shop created");
  await expect(funnel).toContainText("First stamp");
  await expect(funnel).toContainText("25 members");
  await expect(page.getByText("Call these first")).toBeVisible();
  await expect(page.getByRole("table", { name: "Activation by type" })).toBeVisible();
  await page.screenshot({ path: shot("05-admin-funnel"), fullPage: true });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("signup fits a phone: no sideways scroll, chips wrap", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("radio", { name: "Café" })).toBeVisible();
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw + 1);
    await page.screenshot({ path: shot("06-signup-390"), fullPage: true });
  });
});
