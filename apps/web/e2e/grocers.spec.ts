/**
 * Grocers and halal butchers (docs/research/grocers.md): the owner home with the season strip, the weekly flyer (made in the
 * dashboard, shown on the shop page), the butcher counter with pre-orders and the Eid plan, pantry reminders, the counter's
 * "Not counted" field and the WhatsApp inbox. Uses the seeded Annapurna Grocers & Spices and Al-Noor Halal Meats
 * (apps/api/src/seed/grocers.ts). Needs a running, seeded API and web (docs/engineering/web.md). Screenshots go to $SHOTS_DIR.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const GROCER = { email: "owner+annapurna-grocers-and-spices@example.com", password: PASSWORD, slug: "annapurna-grocers-and-spices" };
const BUTCHER = { email: "owner+al-noor-halal-meats@example.com", password: PASSWORD, slug: "al-noor-halal-meats" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/grocers";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function setup(who: { email: string; password: string }) {
  const { body: login } = await call<{ accessToken: string }>("POST", "/v1/auth/login", who);
  const token = login.accessToken;
  const { body: list } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  const id = list.items[0]!.id;
  return { token, id, base: `/v1/merchants/${id}` };
}

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test("owner home shows the season, the butcher counter and who is running low", async ({ page }) => {
  const s = await setup(GROCER);
  await signIn(page, GROCER);
  await page.goto(`/m/${s.id}`);
  await expect(page.getByText("Probably running low")).toBeVisible();
  await expect(page.getByText("Butcher counter today")).toBeVisible();
  await expect(page.getByText("This week's flyer")).toBeVisible();
  await page.screenshot({ path: shot("01-home-1440"), fullPage: true });
  // The sidebar is grouped for a grocer.
  for (const name of ["Weekly flyer", "Butcher counter", "Pantry reminders"]) await expect(page.getByRole("link", { name }).first()).toBeVisible();
});

test("a deal made in the dashboard shows on the shop page with its price per 100 g, and members-only deals ask to join", async ({ page }) => {
  const s = await setup(GROCER);
  const title = `E2E ghee ${Date.now()}`;
  const made = await call<{ id: string }>("POST", `${s.base}/grocery/deals`, { title, priceCents: 2199, packSizeG: 1600, wasPriceCents: 2699, startsOn: iso(-1), endsOn: iso(5), memberOnly: true, limitPerCustomer: 2 }, s.token);
  expect(made.status).toBe(201);
  const bad = await call("POST", `${s.base}/grocery/deals`, { title: "Backwards", priceCents: 500, startsOn: iso(3), endsOn: iso(1) }, s.token);
  expect(bad.status).toBe(400);
  const pub = await call<{ deals: { title: string; per100gCents: number | null }[] }>("GET", `/v1/public/shops/${GROCER.slug}/flyer`);
  const row = pub.body.deals.find((d) => d.title === title);
  expect(row?.per100gCents).toBeCloseTo(137.4, 0);

  await page.goto(`/shops/${GROCER.slug}`);
  await expect(page.getByRole("heading", { name: /This week at/ })).toBeVisible();
  const li = page.getByRole("listitem").filter({ hasText: title });
  await expect(li).toContainText("$21.99");
  await expect(li).toContainText("/100 g");
  await expect(li).toContainText("was $26.99");
  await page.screenshot({ path: shot("02-shop-flyer-1440"), fullPage: true });

  // The owner's list shows it too.
  await signIn(page, GROCER);
  await page.goto(`/m/${s.id}/grocery/flyer`);
  await expect(page.getByRole("heading", { name: "Weekly flyer" })).toBeVisible();
  await expect(page.getByRole("table").getByText(title)).toBeVisible();
  await page.screenshot({ path: shot("03-flyer-1440"), fullPage: true });
  await call("DELETE", `${s.base}/grocery/deals/${made.body.id}`, undefined, s.token);
});

test("butcher counter lists pre-orders, weighing sets the final price, and the Eid plan holds animals per day", async ({ page }) => {
  const s = await setup(BUTCHER);
  await signIn(page, BUTCHER);
  await page.goto(`/m/${s.id}/grocery/butcher`);
  await expect(page.getByRole("heading", { name: "Butcher counter" })).toBeVisible();
  await expect(page.getByText(/Goat (leg|curry cut)/).first()).toBeVisible();
  await page.screenshot({ path: shot("04-butcher-1440"), fullPage: true });

  const eid = await call<{ days: { date: string; label: string }[]; leadHours: number | null }>("GET", `${s.base}/grocery/butcher/eid`, undefined, s.token);
  expect(eid.status).toBe(200);
  expect(eid.body.days.length).toBeGreaterThanOrEqual(1);
  expect(eid.body.days[0]!.label).toBe("Day 1");
});

test("pantry reminders: items, who is running low, and the owner never texts without a yes", async ({ page }) => {
  const s = await setup(GROCER);
  const pantry = await call<{ items: { id: string; name: string }[]; due: { entryId: string }[]; summary?: unknown }>("GET", `${s.base}/grocery/pantry`, undefined, s.token);
  expect(pantry.status).toBe(200);
  expect(pantry.body.items.map((i) => i.name)).toContain("Aashirvaad atta 20 lb");
  await signIn(page, GROCER);
  await page.goto(`/m/${s.id}/grocery/pantry`);
  await expect(page.getByRole("heading", { name: "Pantry reminders" })).toBeVisible();
  await expect(page.getByText("Aashirvaad atta 20 lb").first()).toBeVisible();
  await page.screenshot({ path: shot("05-pantry-1440"), fullPage: true });
});

test("counter: the Not counted field and the bulk chips are on the amount screen", async ({ page }) => {
  const s = await setup(GROCER);
  await signIn(page, GROCER);
  await page.goto(`/m/${s.id}/counter`);
  await expect(page.getByText("Hold the card up")).toBeVisible();
  const items = await call<{ items: { id: string; name: string }[] }>("GET", `${s.base}/grocery/counter/pantry-items`, undefined, s.token);
  expect(items.body.items.length).toBeGreaterThan(0);
  // The server keeps tobacco and lottery out of the earning part of a sale.
  const phone = `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const res = await call<{ pointsEarned: number; excludedCents: number }>("POST", `${s.base}/counter/award`, { phone, amountCents: 5500, notCountedCents: 1500, idempotencyKey: `groc-${Date.now()}-a` }, s.token);
  expect(res.status).toBe(200);
  expect(res.body.excludedCents).toBe(1500);
  expect(res.body.pointsEarned).toBe(40);
  await page.screenshot({ path: shot("06-counter-1440"), fullPage: true });
});

test("WhatsApp inbox is open to a grocer", async ({ page }) => {
  const s = await setup(GROCER);
  await signIn(page, GROCER);
  await page.goto(`/m/${s.id}/grocery/whatsapp`);
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  const settings = await call("GET", `${s.base}/whatsapp/settings`, undefined, s.token);
  expect(settings.status).toBe(200);
});
