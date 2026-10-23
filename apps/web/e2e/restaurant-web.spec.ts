/**
 * Restaurant customer web pages (desi1) against a seeded API (Nawab Biryani House, Pro; Ridgeway Plaza corridor):
 * shop page, menu with a cart, pickup checkout, degh pre-order with a deposit, the reservation page (share, calendar,
 * cancel), Urdu right to left, the review page's equal options, and the owner's halal certification and private feedback.
 * Screenshots go to $E2E_SHOTS (default e2e/screenshots/desi1, not tracked).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";
import { enablePayments, ownerOf } from "./restaurant-fixtures";

const SHOP = "nawab-biryani-house";
const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/desi1";

test.setTimeout(120_000);

const phone = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw + 1);
}

/** Phone sign-in on the page (dev API returns the code and the page fills it in). Works in English; pass the labels for other languages. */
async function signInByPhone(page: Page, labels = { phone: "Mobile number", send: "Send code", go: "Sign in" }) {
  await page.getByLabel(labels.phone).fill(phone());
  await page.getByRole("button", { name: labels.send }).click();
  await page.getByRole("button", { name: labels.go, exact: true }).click();
}

async function getJson<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

test.beforeAll(async () => {
  await enablePayments(await ownerOf(SHOP));
});

test("shop page leads with food: halal block, order buttons, this weekend, most ordered, rewards last", async ({ page }) => {
  await page.goto(`/shops/${SHOP}`);
  await expect(page.getByRole("heading", { name: "All meat is zabihah" })).toBeVisible();
  await expect(page.getByText(/Certified by Crescent Halal Council · valid to Mar 2027/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Order for pickup" })).toHaveAttribute("href", `/shops/${SHOP}/menu`);
  await expect(page.getByRole("link", { name: "Pre-order a degh for the weekend" })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/19055550101/);
  await expect(page.getByRole("heading", { name: "This weekend" })).toBeVisible();
  await expect(page.getByText(/pots? left|Open|Full/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most ordered" })).toBeVisible();
  // Rewards come after the food: the join block sits below "also here".
  const order = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? Infinity;
    const heading = (t: string) => [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === t)?.getBoundingClientRect().top ?? Infinity;
    return { order: y("a[href$='/menu']"), weekend: heading("This weekend"), popular: heading("Most ordered"), join: y("#join") };
  });
  expect(order.order).toBeLessThan(order.weekend);
  expect(order.weekend).toBeLessThan(order.popular);
  expect(order.popular).toBeLessThan(order.join);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/shop-390.png`, fullPage: true });
});

test("menu: one halal banner, no certifier per dish, Without nuts, cart and pickup order from the web", async ({ page }) => {
  await page.goto(`/shops/${SHOP}/menu`);
  await expect(page.getByRole("heading", { name: "All meat is zabihah" })).toBeVisible();
  await expect(page.getByText("Certified by", { exact: false })).toHaveCount(1); // the banner only
  await expect(page.getByRole("link", { name: "App Store" })).toBeVisible(); // a small footer link, not a block

  // Category tabs with Degh last.
  const tabs = page.getByRole("navigation", { name: "Jump to a section" }).getByRole("link");
  await expect(tabs.last()).toHaveText("Degh");

  // Without nuts hides every dish whose allergens include peanut or tree nut.
  await expect(page.getByText("Butter Chicken").first()).toBeVisible();
  await page.getByRole("button", { name: "Without nuts" }).click();
  await expect(page.getByText("Butter Chicken")).toHaveCount(0);
  await expect(page.getByText("Hyderabadi Chicken Dum Biryani")).toBeVisible();
  await page.getByRole("button", { name: "Without nuts" }).click();

  // A dish with options opens a sheet; a plain dish adds directly.
  await page.getByRole("button", { name: "Add Hyderabadi Chicken Dum Biryani" }).click();
  const sheet = page.getByRole("dialog", { name: "Hyderabadi Chicken Dum Biryani" });
  await sheet.getByLabel(/Raita cup/).check({ force: true });
  await sheet.getByRole("button", { name: /Add · \$21\.48/ }).click();
  await page.getByRole("button", { name: "Add Irani Chai" }).click();
  const bar = page.getByRole("link", { name: /Order for pickup.*2 items · \$25\.47/ });
  await expect(bar).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/menu-390.png` });
  await bar.click();

  // Checkout: signed out first, so the page asks for the phone number. No account, no password.
  await expect(page.getByRole("heading", { level: 1, name: "Your order" })).toBeVisible();
  await expect(page.getByText("Hyderabadi Chicken Dum Biryani")).toBeVisible();
  await expect(page.getByText("Raita cup")).toBeVisible();
  await signInByPhone(page);
  await page.getByLabel("Name for the pickup").fill("Hira Siddiqui");
  await page.getByRole("radio", { name: "Pay at pickup" }).click();
  await expect(page.getByText("$28.78").first()).toBeVisible(); // 25.47 + 13% HST
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/order-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Place order · $28.78" }).click();
  await page.waitForURL(/\/o\/[0-9a-f-]{36}/);

  // The shop sees it, tagged as a web order.
  const owner = await ownerOf(SHOP);
  const queue = await getJson<{ items: { channel: string; subtotalCents: number; items: { name: string; modifiers: { option: string }[] }[] }[] }>(`/v1/merchants/${owner.id}/orders?limit=5`, owner.token);
  const mine = queue.items.find((o) => o.items.some((i) => i.modifiers.some((m) => m.option === "Raita cup")));
  expect(mine).toMatchObject({ channel: "web", subtotalCents: 2547 });
});

test("a degh pre-order: size, spice, add-ons, a day, a window, a deposit, then the reservation page", async ({ page }) => {
  const summary = await getJson<{ preorderItems: { id: string; name: string }[] }>(`/v1/public/shops/${SHOP}/restaurant`);
  const degh = summary.preorderItems.find((i) => /Chicken Biryani Degh/.test(i.name))!;
  await page.goto(`/shops/${SHOP}/preorder/${degh.id}`);
  await expect(page.getByRole("heading", { level: 1, name: /Chicken Biryani Degh/ })).toBeVisible();

  await page.getByLabel(/Half degh/).check({ force: true });
  await page.getByRole("button", { name: "Hot", exact: true }).click();
  await page.getByLabel(/Raita, 1 L/).check({ force: true });
  await page.getByLabel(/Garlic naan/).check({ force: true });

  // The next days show pots left; pick the first with room and the first free window.
  const day = page.getByRole("radio", { name: /left|open/i }).first();
  await day.click();
  await page.getByRole("radiogroup", { name: "Pickup time" }).getByRole("radio").filter({ hasNotText: "busy" }).first().click();
  // 9900 + 800 + 3000 = 137.00, HST 17.81, total 154.81, 30% deposit 46.44, balance 108.37.
  await expect(page.getByText("$154.81")).toBeVisible();
  await expect(page.getByText("Pay now, 30% deposit")).toBeVisible();
  await expect(page.getByText(/\$108\.37 at pickup\. Cancel free until/)).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/preorder-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Reserve, pay $46.44 deposit" }).click();

  // Step two: the phone number is the account, then the deposit through the dev payment button.
  await expect(page.getByRole("heading", { level: 1, name: "Reserve your degh" })).toBeVisible();
  await signInByPhone(page);
  await page.getByLabel("Name for the pickup").fill("Hira Siddiqui");
  await page.screenshot({ path: `${SHOTS}/preorder-pay-390.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: /^Pay \$\d+\.\d\d deposit$/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Reserved" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^NB-\d+$/)).toBeVisible();
  await expect(page.getByText("Deposit paid")).toBeVisible();
  await expect(page.getByText("Pay at pickup")).toBeVisible();
  await expect(page.getByText(/Change or cancel free until/)).toBeVisible();
  const share = page.getByRole("link", { name: "Share with the family on WhatsApp" });
  await expect(share).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent((await share.getAttribute("href")) ?? "")).toContain("/shops/nawab-biryani-house");
  const cal = page.getByRole("link", { name: "Add to calendar" });
  const href = (await cal.getAttribute("href"))!;
  const ics = await page.request.get(href);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toMatch(/BEGIN:VEVENT[\s\S]*SUMMARY:Pick up at Nawab Biryani House[\s\S]*END:VEVENT/);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/reserved-390.png`, fullPage: true });

  // Free cancellation before the cutoff puts the deposit back.
  await page.getByRole("button", { name: "Cancel this reservation" }).click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cancelled" })).toBeVisible();
  await expect(page.getByText("Your deposit has been refunded.")).toBeVisible();
});

test("double tap on pay cannot make two orders: the same attempt returns the same order", async ({ page }) => {
  const summary = await getJson<{ preorderItems: { id: string; name: string }[] }>(`/v1/public/shops/${SHOP}/restaurant`);
  const veg = summary.preorderItems.find((i) => /Vegetable/.test(i.name))!;
  await page.goto(`/shops/${SHOP}/preorder/${veg.id}`);
  await page.getByRole("radio", { name: /left|open/i }).first().click();
  await page.getByRole("radiogroup", { name: "Pickup time" }).getByRole("radio").filter({ hasNotText: "busy" }).first().click();
  await page.getByRole("button", { name: /^Reserve, pay \$/ }).click();
  await signInByPhone(page);
  const orders: string[] = [];
  page.on("response", async (r) => {
    if (r.url().endsWith("/api/ll/v1/me/orders") && r.request().method() === "POST") orders.push(((await r.json()) as { order: { id: string } }).order.id);
  });
  const go = page.getByRole("button", { name: "Continue to payment" });
  await go.dblclick();
  await expect(page.getByRole("button", { name: /^Pay \$\d+\.\d\d deposit$/ })).toBeVisible();
  expect(new Set(orders).size).toBe(1);
});

test("Urdu menu reads right to left with the English name beneath", async ({ page }) => {
  await page.goto(`/shops/${SHOP}/menu?lang=ur`);
  await expect(page.locator("[lang^='ur'][dir='rtl']").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("مینو");
  await expect(page.getByText("تمام گوشت ذبیحہ ہے")).toBeVisible();
  await expect(page.getByText("Hyderabadi Chicken Dum Biryani", { exact: true })).toBeVisible();
  await expect(page.getByText(/Crescent Halal Council/).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/menu-ur-390.png` });

  const summary = await getJson<{ preorderItems: { id: string }[] }>(`/v1/public/shops/${SHOP}/restaurant`);
  await page.goto(`/shops/${SHOP}/preorder/${summary.preorderItems[0]!.id}?lang=ur`);
  await expect(page.locator("[dir='rtl']").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /بک کریں/ }).first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("owner: halal certification block on Menu & dietary, and private feedback to read first", async ({ page }) => {
  const owner = await ownerOf(SHOP);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner+${SHOP}@example.com`);
  await page.getByLabel("Password").fill("localloyalty-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto(`/m/${owner.id}/restaurant/menu`);
  await expect(page.getByText("Certifier (shown to guests)")).toBeVisible();
  await expect(page.getByText("Crescent Halal Council", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Guests read: All meat is zabihah\. Certified by Crescent Halal Council/)).toBeVisible();
  await expect(page.getByText("Halal claims are yours. We print the certifier only when you name one", { exact: false })).toBeVisible();
  // No certifier text repeated on the dish rows.
  await expect(page.locator("ul li").getByText(/certified by/i)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/dash-menu-1440.png`, fullPage: true });

  await page.getByRole("button", { name: "Edit certification" }).click();
  const sheet = page.getByRole("dialog", { name: "Halal certification" });
  await sheet.getByLabel("Certifier").fill("");
  await sheet.getByRole("button", { name: "Save certification" }).click();
  await expect(sheet.getByText(/Name your certifier/)).toBeVisible();
  await sheet.getByLabel("Certifier").fill("Crescent Halal Council");
  await sheet.getByLabel("Certificate number").fill("CHC-20418");
  await sheet.getByRole("button", { name: "Save certification" }).click();
  await expect(page.getByText("Halal certification saved")).toBeVisible();

  await page.goto(`/m/${owner.id}/restaurant/reviews`);
  await expect(page.getByRole("heading", { name: "Read first: private feedback" })).toBeVisible();
  await expect(page.getByText(/Biryani was cold when I picked up/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Reply on WhatsApp in/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Offer a free chai" }).first()).toBeVisible();
  await expect(page.getByText("Both buttons show at every rating", { exact: false })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/dash-reviews-1440.png`, fullPage: true });

  // Reply in the guest's language, offering a free chai code, then it is handled and leaves the list.
  const card = page.getByRole("listitem").filter({ hasText: "Biryani was cold" });
  await card.getByRole("button", { name: "Offer a free chai" }).click();
  const reply = page.getByRole("dialog", { name: /Reply to/ });
  await expect(reply.getByLabel("Your reply")).toHaveValue(/free chai on us: show code [2-9A-Z]{6}/);
  await reply.getByRole("button", { name: "Email" }).click();
  await reply.getByRole("button", { name: "Cancel" }).click();
  await card.getByRole("button", { name: "Mark handled" }).click();
  await expect(page.getByText("Marked handled")).toBeVisible();
  await expect(page.getByText(/Biryani was cold when I picked up/)).toHaveCount(0);
});
