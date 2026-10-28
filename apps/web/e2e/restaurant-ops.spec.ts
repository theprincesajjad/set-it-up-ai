/**
 * Restaurant ops: a tiffin plan is created, and a catering inquiry goes through menu and quote.
 * Needs the seeded API (the demo seed has Shree Gujarati Thali & Tiffin and Zeenat Catering Co. on Restaurant Growth).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PW = "localloyalty-demo";
async function merchantId(email: string) {
  const login = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PW }) });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const r = await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${accessToken}` } });
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test("tiffin: owner creates a plan", async ({ page }) => {
  const email = "owner+shree-thali-and-tiffin@example.com";
  const id = await merchantId(email);
  await signIn(page, email);
  await page.goto(`/m/${id}/restaurant/tiffin?tab=plans`);
  const name = `Veg tiffin e2e ${Date.now().toString().slice(-6)}`;
  await page.getByRole("button", { name: "New plan" }).click();
  const sheet = page.getByRole("dialog", { name: "New plan" });
  await sheet.getByLabel("Plan name").fill(name);
  await sheet.getByLabel(/Price per month, one serving/).fill("189");
  await sheet.getByRole("button", { name: "Sat" }).click();
  await sheet.getByLabel("Name in Hindi").fill("शाकाहारी टिफिन");
  await sheet.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByText("Plan created")).toBeVisible();
  await expect(page.getByRole("list", { name: "Tiffin plans" }).getByText(name)).toBeVisible();
});

test("catering: inquiry, menu, quote and approval link", async ({ page }) => {
  const email = "owner+zeenat-catering@example.com";
  const id = await merchantId(email);
  await signIn(page, email);
  await page.goto(`/m/${id}/restaurant/catering`);
  await page.getByRole("button", { name: "New inquiry" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New catering inquiry" });
  await sheet.getByLabel("Customer name").fill("Sana Mirza");
  await sheet.getByLabel("Phone").fill("+16475550142");
  await sheet.getByLabel("Guests").fill("120");
  await sheet.getByRole("button", { name: "Add inquiry" }).click();
  await page.waitForURL(/\/restaurant\/catering\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sana Mirza");

  // Menu: one biryani tray line and one per-guest line.
  await page.getByRole("button", { name: "Custom line" }).click();
  await page.getByLabel("Dish").fill("Chicken biryani");
  await page.getByLabel("Priced").selectOption("tray"); // a custom line is per guest until priced by the tray
  await page.getByLabel("Trays").fill("6");
  await page.getByLabel("Per tray").fill("120");
  await expect(page.getByText("$720.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.getByText("Menu saved")).toBeVisible();

  await page.getByRole("button", { name: "Send quote" }).click();
  await expect(page.getByText("Quote sent")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Approval link" })).toHaveValue(/\/e\/[A-Za-z0-9_-]+$/);
});

test("festivals: add my own date, plan it, and send myself a test", async ({ page }) => {
  const email = "owner+nawab-biryani-house@example.com";
  const id = await merchantId(email);
  await signIn(page, email);
  await page.goto(`/m/${id}/restaurant/festivals`);
  await expect(page.getByRole("heading", { name: "Festivals", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Add my own date" }).click();
  const dialog = page.getByRole("dialog", { name: "Add my own date" });
  const name = `Family night ${Date.now().toString().slice(-5)}`;
  const day = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Date").fill(day);
  await dialog.getByLabel("Email subject").fill("Family night is coming");
  await dialog.getByLabel("Message", { exact: true }).fill("Join us for family night at {{merchant}}.");
  await dialog.getByRole("button", { name: "Add date" }).click();
  const strip = page.getByRole("list", { name: "Next dates" });
  await expect(strip.getByText(name)).toBeVisible();
  await strip.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`^${name}`) })).toBeVisible();
  await page.getByLabel("Send as").selectOption("email");
  await page.getByRole("button", { name: "Send me a test" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Test sent to/ })).toBeVisible();
  await page.getByRole("button", { name: "Remove this date" }).click();
  await expect(strip.getByText(name)).toHaveCount(0);
});
