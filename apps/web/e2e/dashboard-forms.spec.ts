/**
 * Click-through of the dashboard's forms against the seeded API: settings (profile with save bar, inline
 * validation and discard, hours), promo create, discount card create, slot booking, ticket status change and
 * catalog item create. Runs on Hearth & Crumb (promos, cards, pickup slots, catalog) and Fix-It Phone Lab
 * (tickets, drop-off slots), which the demo seed gives paid tools and data. Each run adds a little data
 * (unique names), so it can be repeated against the same database.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const run = Date.now().toString(36).slice(-5);

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
test.setTimeout(120_000);

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function owner(slug: string) {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/login", { email: `owner+${slug}@example.com`, password: PASSWORD });
  const { items } = await api<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  return { token: accessToken, id: items[0]!.id };
}
async function signIn(page: Page, slug: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner+${slug}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
const saveBar = (page: Page) => page.getByRole("region", { name: "Unsaved changes" });

test.describe("settings", () => {
  test("profile: save bar, inline validation, discard, save, persists after reload", async ({ page }) => {
    const { id } = await owner("hearth-and-crumb");
    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/settings`);
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    const about = page.getByLabel("About your shop");
    const original = await about.inputValue();
    await expect(saveBar(page)).toHaveCount(0);

    // Editing shows the save bar; bad values fail inline on save and nothing is sent.
    await about.fill(`${original} Edited ${run}.`);
    await expect(saveBar(page)).toBeVisible();
    await expect(saveBar(page).getByText("You have unsaved changes")).toBeVisible();
    // An unsaved draft survives a trip to another tab (and that tab has no save bar of its own).
    await page.getByRole("tab", { name: "Hours" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await page.getByRole("tab", { name: "Shop profile" }).click();
    await expect(about).toHaveValue(`${original} Edited ${run}.`);
    await expect(saveBar(page)).toBeVisible();
    await page.getByLabel(/^Email/).fill("not-an-email");
    await page.getByRole("textbox", { name: "Brand colour", exact: true }).fill("orange");
    await page.getByLabel(/^Website/).fill("hearth.example");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("That email doesn't look right.")).toBeVisible();
    await expect(page.getByText("Use a hex colour like #0B0B0C.")).toBeVisible();
    await expect(page.getByText("Start with https://")).toBeVisible();
    await expect(saveBar(page).getByText("Fix the highlighted fields first.")).toBeVisible();

    // Discard puts everything back and hides the bar.
    const email = "hello+hearth-and-crumb@example.com";
    await saveBar(page).getByRole("button", { name: "Discard" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(about).toHaveValue(original);
    await expect(page.getByLabel(/^Email/)).toHaveValue(email);
    await expect(page.getByRole("textbox", { name: "Brand colour", exact: true })).toHaveValue(/^#[0-9A-Fa-f]{6}$/);
    await expect(page.getByText("That email doesn't look right.")).toHaveCount(0);

    // A valid edit saves, the bar goes away and the value survives a reload.
    const edited = `${original} Edited ${run}.`;
    await about.fill(edited);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("About your shop")).toHaveValue(edited);

    // Put the shop back as it was.
    await page.getByLabel("About your shop").fill(original);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(saveBar(page)).toHaveCount(0);
  });

  test("hours: edit, discard, save and persist", async ({ page }) => {
    const { id, token } = await owner("hearth-and-crumb");
    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/settings`);
    await page.getByRole("tab", { name: "Hours" }).click();
    const tueOpen = page.getByLabel("Tuesday opens");
    const before = await tueOpen.inputValue();
    await tueOpen.fill("06:15");
    await expect(saveBar(page)).toBeVisible();
    await saveBar(page).getByRole("button", { name: "Discard" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(tueOpen).toHaveValue(before);

    await tueOpen.fill("06:15");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByText("Hours saved")).toBeVisible();
    await expect(saveBar(page)).toHaveCount(0);
    await page.reload();
    await page.getByRole("tab", { name: "Hours" }).click();
    await expect(page.getByLabel("Tuesday opens")).toHaveValue("06:15");
    // Restore through the API so reruns start from the seed's hours.
    const detail = await api<{ merchant: { hours: Record<string, [string, string][]> } }>("GET", `/v1/merchants/${id}`, undefined, token);
    const hours = { ...detail.merchant.hours, tue: detail.merchant.hours.tue!.map(([, c]) => [before, c] as [string, string]) };
    await api("PATCH", `/v1/merchants/${id}`, { hours }, token);
  });
});

test.describe("promos and discount cards", () => {
  test("create a promo: validation, then it is live in the list", async ({ page }) => {
    const { id } = await owner("hearth-and-crumb");
    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/promos`);
    await expect(page.getByRole("heading", { name: "Promos", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Create a promo" }).click();
    await expect(page.getByRole("heading", { name: "Create a promo" })).toBeVisible();
    // No title: refused inline.
    await page.getByRole("button", { name: /Publish now|Schedule/ }).click();
    await expect(page.getByText(/title/i).filter({ hasText: /add|enter|give|need/i }).first()).toBeVisible();
    const title = `Rye bread Friday ${run}`;
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByRole("textbox", { name: /^Description/ }).fill("Fresh rye with caraway, warm from 8.");
    await page.getByRole("button", { name: "1 week" }).click();
    await page.getByRole("button", { name: "Publish now" }).click();
    // Publishing opens the promo's own page (results, with the live status).
    await page.waitForURL(new RegExp(`/m/${id}/promos/[0-9a-f-]+$`));
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.goto(`/m/${id}/promos`);
    await page.getByRole("tab", { name: /Live/ }).click();
    await expect(page.getByText(title)).toBeVisible();
  });

  test("create a discount card: validation, then it appears", async ({ page }) => {
    const { id } = await owner("hearth-and-crumb");
    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/discount-cards`);
    await page.getByRole("button", { name: "Create a discount card" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Create a discount card" });
    await dialog.getByLabel("Percent off").fill("");
    await dialog.getByLabel("Name").fill("");
    await dialog.getByRole("button", { name: "Save card" }).click();
    await expect(dialog.getByText("Add a name and a percent or dollar amount off.")).toBeVisible();
    const name = `Seniors Tuesday ${run}`;
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Percent off").fill("12");
    await dialog.getByRole("button", { name: "Save card" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText("12% off").first()).toBeVisible();
  });
});

test.describe("slots and tickets", () => {
  test("a customer books a pickup slot and the shop sees and completes it", async ({ page }) => {
    const { id, token } = await owner("hearth-and-crumb");
    // Customer side, by phone code: book the first free slot tomorrow or later.
    const phone = "+16475551044";
    const { devCode } = await api<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
    const { accessToken: customer } = await api<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: devCode });
    const from = new Date(Date.now() + 26 * 3600_000).toISOString();
    const { items } = await api<{ items: { id: string; remaining: number }[] }>("GET", `/v1/merchants/${id}/slots?kind=pickup&from=${encodeURIComponent(from)}`, undefined, token);
    const slot = items.find((s) => s.remaining > 0)!;
    await api("POST", "/v1/me/bookings", { slotId: slot.id, notes: `Two sourdough loaves ${run}` }, customer);

    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/slots`);
    await expect(page.getByRole("heading", { name: "Upcoming bookings" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: `Two sourdough loaves ${run}` });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: `Two sourdough loaves ${run}` }).getByText(/completed/)).toBeVisible();
    // Making slots validates its numbers instead of silently using defaults.
    await page.getByLabel("Days ahead").fill("0");
    await page.getByRole("button", { name: "Make slots" }).click();
    await expect(page.getByText("Use 1 to 31 days.")).toBeVisible();
  });

  test("change a ticket's status and see it on the board and in the timeline", async ({ page }) => {
    const { id, token } = await owner("fix-it-phone-lab");
    const fresh = await api<{ ticket: { id: string; number: number } }>("POST", `/v1/merchants/${id}/tickets`, { customer: { phone: "+16475551050", name: "Dana Whitfield" }, itemKind: "device", itemDetails: { make: "Apple", model: "iPhone 11" }, issue: `Speaker muffled ${run}` }, token);
    await signIn(page, "fix-it-phone-lab");
    await page.goto(`/m/${id}/tickets`);
    await expect(page.getByRole("heading", { name: "Tickets", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(`#${fresh.ticket.number}.*Speaker muffled ${run}`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`#${fresh.ticket.number}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeDisabled();
    await page.getByLabel("Update status").selectOption({ label: "Work started" });
    await page.getByLabel("Note for the customer").fill("Replacing the speaker mesh");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByText("Updated. The customer was notified.")).toBeVisible();
    await expect(page.getByText("Replacing the speaker mesh").first()).toBeVisible();
    await page.goto(`/m/${id}/tickets`);
    const inShop = page.getByRole("region", { name: "In the shop" });
    await expect(inShop.getByRole("link", { name: new RegExp(`#${fresh.ticket.number}`) })).toBeVisible();
    // Finished tickets live under Past.
    await page.getByRole("tab", { name: "Past" }).or(page.getByRole("radio", { name: "Past" })).or(page.getByRole("button", { name: "Past" })).first().click();
    await expect(page.getByRole("link", { name: /Picked up/ }).first()).toBeVisible();
  });
});

test.describe("catalog", () => {
  test("add an item: validation, then it lands in its section", async ({ page }) => {
    const { id } = await owner("hearth-and-crumb");
    await signIn(page, "hearth-and-crumb");
    await page.goto(`/m/${id}/catalog`);
    await expect(page.getByRole("heading", { name: "Menu & catalog", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Add item" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add item" });
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog.getByText(/name/i).filter({ hasText: /add|enter|give|need/i }).first()).toBeVisible();
    await expect(dialog).toBeVisible();
    const name = `Seeded rye ${run}`;
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Price").fill("-3");
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Price").fill("abc");
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Price").fill("11.50");
    await dialog.getByLabel("Section").selectOption({ label: "Baked goods" });
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog).toHaveCount(0);
    const item = page.getByRole("listitem").filter({ hasText: name });
    await expect(item).toBeVisible();
    await expect(item.getByText("$11.50")).toBeVisible();
  });
});
