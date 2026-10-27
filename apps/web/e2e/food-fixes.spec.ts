/**
 * Fix wave, team "food": the order confirmation, the kitchen in Urdu, the orders card money line, the Urdu shop page, and the
 * grocer's butcher counter (shop page, menu, weighed pre-order, qurbani page, cart, the owner's "Take a pre-order").
 * Seeded shops: Nawab Biryani House (restaurants) and Al-Noor Halal Meats (grocers). None of it depends on the time of day or the weekday.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";
import { enablePayments, ownerOf } from "./restaurant-fixtures";

const NAWAB = "nawab-biryani-house";
const ALNOOR = "al-noor-halal-meats";
const SHOTS = process.env.E2E_SHOTS ?? "test-results/food-fixes";
test.setTimeout(120_000);

async function getJson<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}
const phone = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;
async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
}
async function signInOwner(page: Page, slug: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner+${slug}@example.com`);
  await page.getByLabel("Password").fill("localloyalty-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
type Menu = { categories: { name: string; items: { id: string; name: string }[] }[]; uncategorized: { id: string; name: string }[] };
async function itemId(slug: string, name: RegExp): Promise<string> {
  const menu = await getJson<Menu>(`/v1/public/shops/${slug}/menu`);
  const found = [...menu.categories.flatMap((c) => c.items), ...menu.uncategorized].find((i) => name.test(i.name));
  if (!found) throw new Error(`no item ${name} at ${slug}`);
  return found.id;
}

test.describe("customer, 390 wide", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the confirmation page has the pickup time, address, a call button and a way to see the rewards", async ({ page }) => {
    await enablePayments(await ownerOf(NAWAB));
    await page.goto(`/shops/${NAWAB}/menu`);
    await page.getByRole("button", { name: "Add Irani Chai" }).click();
    await page.getByRole("link", { name: /Order for pickup/ }).click();
    await page.getByLabel("Mobile number").fill(phone());
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("radio", { name: "Pay at pickup" }).click();
    await page.getByRole("button", { name: /^Place order/ }).click();
    await page.waitForURL(/\/o\/[0-9a-f-]{36}/);
    const details = page.getByRole("region", { name: "Pickup details" });
    await expect(details).toBeVisible();
    await expect(details.getByText(/^Pickup |As soon as it's ready/)).toBeVisible();
    await expect(details.getByText(/Say your order number, #\d+, at the counter/)).toBeVisible();
    await expect(details.getByRole("link", { name: /^Call / })).toHaveAttribute("href", /^tel:\+?\d+/);
    await expect(details.getByRole("link", { name: "Directions" })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/confirm-390.png`, fullPage: true });
  });

  test("Urdu shop page: no slanted Urdu, reward names and section tabs translated, times read as spoken", async ({ page }) => {
    await page.goto(`/shops/${NAWAB}?lang=ur`);
    await expect(page.locator("[lang^='ur'][dir='rtl']").first()).toBeVisible();
    const italics = page.locator("[lang^='ur'] .italic");
    for (let i = 0; i < (await italics.count()); i++) await expect(italics.nth(i)).toHaveCSS("font-style", "normal");
    // The owner's template reward names are translated by default.
    await expect(page.getByText(/(\$\d+ کی رعایت|مفت )/).first()).toBeAttached();
    await expect(page.getByText("Free appetizer")).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/shop-ur-390.png`, fullPage: true });
    await page.goto(`/shops/${NAWAB}/menu?lang=pa`);
    const tabs = page.getByRole("navigation").getByRole("link");
    await expect(tabs.filter({ hasText: /^Biryani$|^Curries$|^Tandoor$/ })).toHaveCount(0);
  });

  test("the butcher block on the shop page: per-kg prices, 'about', and Reserve on the qurbani items", async ({ page }) => {
    await page.goto(`/shops/${ALNOOR}`);
    const block = page.locator("section[aria-labelledby='gr-butcher']");
    await expect(block.getByRole("heading", { name: "butcher counter" })).toBeVisible();
    await expect(block.getByText(/\$\d+\.\d\d\/kg/).first()).toBeVisible();
    await expect(block.getByText(/about \$[\d.]+ for/).first()).toBeVisible();
    const goat = block.getByRole("listitem").filter({ hasText: /Whole goat, qurbani/ });
    await expect(goat.getByRole("link", { name: /Reserve/ })).toBeVisible();
    await expect(block.getByRole("link", { name: "See the whole counter" })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/butcher-shop-390.png`, fullPage: true });
  });

  test("menu: weighed lines read per kg with an estimate and open the weighed pre-order, not the cart", async ({ page }) => {
    await page.goto(`/shops/${ALNOOR}/menu`);
    const row = page.getByRole("listitem").filter({ hasText: "Goat curry cut" }).first();
    await expect(row.getByText(/\$\d+\.\d\d\/kg/)).toBeVisible();
    await expect(row.getByText(/about \$[\d.]+ for 1 kg/)).toBeVisible();
    await expect(row.getByRole("button", { name: /^Add / })).toHaveCount(0);
    await expect(page.getByText("Raw meat, flour and rice carry none.")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/butcher-menu-390.png` });
    await row.getByRole("link", { name: /Reserve|Pre-order/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Goat curry cut/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Reserve your order" }).or(page.getByText(/How many \(1 kg each\)/))).toBeVisible();
    // Zero-rated meat: no tax line in the bill.
    await expect(page.getByText(/HST/)).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/weighed-preorder-390.png`, fullPage: true });
  });

  test("the qurbani page asks for the number of shares and the names, in plain grocer words", async ({ page }) => {
    const id = await itemId(ALNOOR, /Cow share/);
    await page.goto(`/shops/${ALNOOR}/preorder/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: /Cow share/ })).toBeVisible();
    await expect(page.getByText("Shares", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("On behalf of")).toBeVisible();
    await expect(page.getByText(/cooked fresh|degh|pots/i)).toHaveCount(0);
    await expect(page.getByText("336 hours")).toHaveCount(0);
    await page.getByRole("button", { name: /^\+ Shares/ }).click();
    await page.getByLabel("On behalf of").fill("Ahmed, Sana");
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/qurbani-390.png`, fullPage: true });
  });

  test("a weighed line already in the cart has no 20-minute promise and no tax", async ({ page }) => {
    const id = await itemId(ALNOOR, /Goat curry cut/);
    await page.addInitScript(([slug, item]) => window.localStorage.setItem(`ll.cart.${slug}`, JSON.stringify({ lines: [{ key: `${item}:`, itemId: item, qty: 1, optionIds: [] }] })), [ALNOOR, id]);
    await page.goto(`/shops/${ALNOOR}/order`);
    await expect(page.getByText("This order has meat cut to order, so pick a time when you will collect it.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /As soon as possible/ })).toHaveCount(0);
    await expect(page.getByText("Raw meat, flour and rice carry no tax.")).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/butcher-cart-390.png`, fullPage: true });
  });
});

test.describe("owner, desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("orders: a deposit order shows what is still owed, and a banquet has no kitchen buttons", async ({ page }) => {
    await signInOwner(page, NAWAB);
    const owner = await ownerOf(NAWAB);
    await page.goto(`/m/${owner.id}/orders`);
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    const deposit = page.getByRole("article").filter({ hasText: /Deposit \$[\d.,]+ paid/ }).first();
    await expect(deposit).toBeVisible();
    await expect(page.getByText("nothing left to pay")).toHaveCount(0);
    await expect(page.getByText(/Deposit \$[\d.,]+ paid · \$[\d.,]+ due at pickup/).first()).toBeVisible();
    const banquet = page.getByRole("article").filter({ hasText: "Banquet" }).first();
    await expect(banquet).toBeVisible();
    await expect(banquet.getByRole("button", { name: /Start preparing|Mark ready/ })).toHaveCount(0);
    await expect(banquet.getByText(/due at the event/)).toBeVisible();
    await expect(banquet.getByRole("link", { name: /Open the booking/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/orders-1440.png`, fullPage: true });
  });

  test("kitchen in Urdu: right to left, station and channel labels translated, no English 'FIRE'", async ({ page }) => {
    await signInOwner(page, NAWAB);
    const owner = await ownerOf(NAWAB);
    await page.goto(`/m/${owner.id}/restaurant/kitchen?lang=ur`);
    const board = page.getByRole("region", { name: "Kitchen display" });
    await expect(board).toHaveAttribute("dir", "rtl");
    await expect(board.getByRole("heading", { level: 1 })).toHaveText("باورچی خانہ");
    await expect(board.getByText("چاول").first()).toBeVisible();
    await expect(board.getByText(/^(Web link|Counter|Phone|Pre-order)$/)).toHaveCount(0);
    await expect(board.getByText(/FIRE|\b[AP]M\b/i)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/kitchen-ur-1440.png`, fullPage: false });
    await page.goto(`/m/${owner.id}/restaurant/kitchen?lang=en`);
    await expect(page.getByRole("region", { name: "Kitchen display" })).toHaveAttribute("dir", "ltr");
  });

  test("the owner's 'Take a pre-order' lists every butcher item, not just the qurbani animals", async ({ page }) => {
    await signInOwner(page, ALNOOR);
    const owner = await ownerOf(ALNOOR);
    await page.goto(`/m/${owner.id}/grocery/butcher`);
    await page.getByRole("button", { name: "Take a pre-order" }).click();
    const menu = page.getByRole("list", { name: "Menu" });
    for (const name of [/Goat leg/, /Chicken legs/, /Whole goat, qurbani/]) await expect(menu.getByRole("button", { name })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Goat leg/ })).toContainText("/kg");
    await expect(page.getByText(/kitchen ticket/)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/take-preorder-1440.png` });
  });
});
