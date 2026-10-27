/**
 * Café and studio fix wave (docs/audits/cafes-retail.md, fitness-studios.md): join with the first name left blank, the promo cards
 * that say when, a pack that is still "Waiting for payment" with Finish and Cancel, and the door's "Sell drop-in". Nothing here
 * depends on the time of day or the weekday. Needs the seeded API and web (e2e/run-all.sh).
 */
import { expect, test } from "@playwright/test";
import { API, cafeQr, fillPhone, newPhone } from "./fixtures";

const SHOP = "sakina-studio";
const OWNER = { email: "owner+sakina-studio@example.com", password: "localloyalty-demo" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/cafe-fitness-fixes";
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A customer with a token (the dev code is returned by the API in test mode). */
async function newCustomer(first: string) {
  const digits = newPhone();
  const phone = `+1${digits}`;
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const login = await call<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: first });
  return { digits, phone, token: login.accessToken };
}

test.describe("customer, 390 wide", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("join the café card without typing a name", async ({ page }) => {
    const { qrCode } = await cafeQr();
    await page.goto(`/j/${qrCode}`);
    await fillPhone(page, newPhone());
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("First name (optional)")).toBeVisible();
    await page.screenshot({ path: shot("01-join-name-optional") });
    await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
    await expect(page.getByRole("img", { name: /Member QR code/ })).toBeVisible({ timeout: 20_000 });
  });

  test("the shop's promo cards say which days and hours, in stamps", async ({ page }) => {
    await page.goto("/shops/pinecone-coffee");
    await page.getByRole("tab", { name: /Promos/ }).click();
    await expect(page.getByText("Weekdays · 2 pm to 4 pm").first()).toBeVisible();
    await expect(page.getByText("2x stamps").first()).toBeVisible();
    await expect(page.getByText("2x points")).toHaveCount(0);
    await page.screenshot({ path: shot("02-promo-cards") });
  });

  test("a pack left at the card step shows Waiting for payment, can be finished or cancelled", async ({ page }) => {
    const c = await newCustomer("Pat");
    const shop = await call<{ products: { id: string; kind: string; introOnly: boolean; priceCents: number }[] }>("GET", `/v1/public/shops/${SHOP}/classes`);
    const pack = shop.products.find((p) => p.kind === "pack" && !p.introOnly && p.priceCents > 0)!;
    await call("POST", "/v1/me/classes/purchases", { productId: pack.id }, c.token); // the card step is never completed

    await page.goto("/me/classes");
    await fillPhone(page, c.digits);
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByText("Waiting for payment")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/10 of 10 left/)).toHaveCount(0); // an unpaid pack is not a usable pass
    await expect(page.getByRole("button", { name: "Finish payment" })).toBeVisible();
    await page.screenshot({ path: shot("03-pending-pack") });
    await page.getByRole("button", { name: "Cancel sign-up" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel sign-up" }).click();
    await expect(page.getByText("Cancelled. You were not charged.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Waiting for payment")).toHaveCount(0);
  });
});

test.describe("the studio's door, 1440 wide", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("someone with no pass: Sell drop-in at the door checks them in", async ({ page }) => {
    const { accessToken: token } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
    const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
    const shop = items.find((x) => x.slug === SHOP) ?? items[0]!;
    const base = `/v1/merchants/${shop.id}`;
    const types = await call<{ items: { id: string }[] }>("GET", `${base}/classes/types`, undefined, token);
    const made = await call<{ items: { id: string }[] }>("POST", `${base}/classes/sessions`, { classTypeId: types.items[0]!.id, startsAt: new Date(Date.now() + 20 * 60_000).toISOString(), instructorName: "Door Test" }, token);
    const walkIn = await newCustomer("Wren");

    await page.goto("/login");
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await page.goto(`/m/${shop.id}/classes/door?session=${made.items[0]!.id}`);
    await page.getByLabel("Member card, QR code or phone number").fill(walkIn.phone);
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByText(/has no membership or pass/)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: shot("04-door-no-pass") });
    await page.getByRole("button", { name: "Sell drop-in" }).click();
    await expect(page.getByText(/Selling to/)).toBeVisible();
    await page.screenshot({ path: shot("05-door-sell") });
    await page.getByRole("button", { name: "Record sale" }).click();
    await expect(page.getByText(/Added and checked in to/)).toBeVisible({ timeout: 20_000 });
  });
});
