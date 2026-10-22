/**
 * Kitchen display: a counter order fires a ticket, the cook taps items queued -> cooking -> ready, bumps it, then recalls it.
 * Needs a running, seeded API and web (docs/engineering/web.md). Uses the Pro seed shop Nawab Biryani House.
 * Screenshots go to e2e/screenshots/restaurant/.
 */
import { expect, test } from "@playwright/test";
import { API } from "./fixtures";

const OWNER = { email: "owner+nawab-biryani-house@example.com", password: "localloyalty-demo" };
const shot = (name: string) => `e2e/screenshots/restaurant/${name}.png`;
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

test("fire -> advance items -> bump -> recall", async ({ page }) => {
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
  const { items: shops } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  const m = shops[0]!.id;
  const catalog = await call<{ items: { id: string; name: string; preorderOnly?: boolean }[] }>("GET", `/v1/merchants/${m}/catalog`, undefined, accessToken);
  const tikka = catalog.items.find((i) => i.name === "Chicken Tikka")!;
  const naan = catalog.items.find((i) => i.name === "Garlic Naan")!;

  // Fire: a counter order sends its ticket to the kitchen at once.
  const note = `e2e ${Date.now()}`;
  const placed = await call<{ number?: number; order?: { number: number } }>("POST", `/v1/merchants/${m}/orders/counter`, { items: [{ catalogItemId: tikka.id, quantity: 2 }, { catalogItemId: naan.id, quantity: 3 }], notes: note }, accessToken);
  const order = { number: (placed.order?.number ?? placed.number)! };

  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(`/m/${m}/restaurant/kitchen`);

  const ticket = page.getByRole("article", { name: `Ticket ${order.number}` });
  await expect(ticket).toBeVisible();
  await expect(ticket.getByText(note)).toBeVisible();
  await expect(page.getByRole("region", { name: "New tickets" }).getByRole("article", { name: `Ticket ${order.number}` })).toBeVisible();
  await page.screenshot({ path: shot("kitchen-fired"), fullPage: false });

  // Advance every item: New -> Cooking -> Ready.
  for (const name of ["Chicken Tikka", "Garlic Naan"]) {
    const row = ticket.getByRole("button", { name: new RegExp(`${name}, new`) });
    await row.click();
    await expect(ticket.getByRole("button", { name: new RegExp(`${name}, cooking`) })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Cooking tickets" }).getByRole("article", { name: `Ticket ${order.number}` })).toBeVisible();
  for (const name of ["Chicken Tikka", "Garlic Naan"]) {
    await ticket.getByRole("button", { name: new RegExp(`${name}, cooking`) }).click();
    await expect(ticket.getByRole("button", { name: new RegExp(`${name}, ready`) })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Ready tickets" }).getByRole("article", { name: `Ticket ${order.number}` })).toBeVisible();
  await page.screenshot({ path: shot("kitchen-ready"), fullPage: false });

  // Bump: the ticket leaves the screen and the order is ready for pickup.
  await ticket.getByRole("button", { name: "Bump" }).click();
  await expect(ticket).toBeHidden();
  await expect.poll(async () => (await call<{ items: { number: number; status: string }[] }>("GET", `/v1/merchants/${m}/orders?limit=60`, undefined, accessToken)).items.find((o) => o.number === order.number)?.status).toBe("ready");

  // Recall brings it back.
  await page.getByRole("button", { name: `Recall #${order.number}` }).click();
  await expect(page.getByRole("article", { name: `Ticket ${order.number}` })).toBeVisible();
});
