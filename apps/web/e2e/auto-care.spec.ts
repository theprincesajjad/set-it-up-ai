/**
 * Auto care (docs/research/auto-care.md): a garage's vehicle page with reminders by km or months, the reminder list with consent on
 * each row, the tire season capacity plan (a full day takes no booking) and the tire hotel, the owner's own vehicles page with an
 * odometer reading and a swap booking, the vehicle estimate that must be approved before work and shows on the invoice (10% cap),
 * and the wash desk. Needs a running, seeded API and web (docs/engineering/web.md).
 * Uses the seed shops Wheelhouse Tire & Auto and Splash Auto Wash, and the seeded demo customer (+16475551000, Nikos Novak).
 * Nothing here depends on the time of day: reminders are skipped, not sent, and swap days are relative to today.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/auto-care).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/auto-care";
const shot = (name: string) => `${SHOTS}/${name}.png`;
// QA review (not tracked): EXTRA_SHOTS_DIR also gets the page in dark at 1440 and in light at 390.
const EXTRA = process.env.EXTRA_SHOTS_DIR;
async function dark(page: Page, name: string) {
  if (!EXTRA) return;
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${EXTRA}/${name}-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
}
async function variants(page: Page, name: string, fullPage = false) {
  if (!EXTRA) return;
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${EXTRA}/${name}-1440-dark.png`, fullPage });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${EXTRA}/${name}-390.png`, fullPage: true });
  await page.setViewportSize(size);
}
const GARAGE = "owner+wheelhouse-tire-and-auto@example.com";
const WASH = "owner+splash-auto-wash@example.com";
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function raw(method: string, path: string, body: unknown, token: string) {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as { error?: { code?: string } } | null };
}
const login = async (email: string) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password: PASSWORD })).accessToken;
async function shopOf(token: string) {
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  return items[0]!.id;
}
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function vehicleId(token: string, shop: string, label: string) {
  const { items } = await call<{ items: { id: string; label: string }[] }>("GET", `/v1/merchants/${shop}/auto/vehicles`, undefined, token);
  return items.find((v) => v.label === label)!.id;
}
async function customerSignIn(page: Page, next: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(next);
  await fillPhone(page, "6475551000");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a garage sees a ride-hail car overdue by km, marks the service done and the reminder resets", async ({ page }) => {
  const owner = await login(GARAGE);
  const m = await shopOf(owner);
  await signIn(page, GARAGE);
  await page.goto(`/m/${m}/vehicles`);
  await expect(page.getByRole("heading", { name: "Vehicles", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "2019 Honda Civic" })).toBeVisible();
  const camry = page.getByRole("row", { name: /2016 Toyota Camry/ });
  await expect(camry.getByText("ride-hail")).toBeVisible();
  await expect(camry.getByText("Overdue")).toBeVisible();
  await camry.getByRole("link", { name: "2016 Toyota Camry" }).click();
  await expect(page.getByRole("heading", { name: "2016 Toyota Camry" })).toBeVisible();
  await expect(page.getByText(/about 17\d km a day \(from the last readings\)/)).toBeVisible();
  const reminders = page.getByRole("table", { name: "Service reminders" });
  const oil = reminders.getByRole("row", { name: /Oil and filter/ });
  await expect(oil.getByText("5,000 km or 4 months")).toBeVisible(); // the ride-hail (severe) interval
  await expect(oil.getByText("Overdue")).toBeVisible();
  await page.screenshot({ path: shot("01-vehicle-1440") });
  await variants(page, "01-vehicle");
  await oil.getByRole("button", { name: "Mark Oil and filter done today" }).click();
  await expect(reminders.getByRole("row", { name: /Oil and filter/ }).getByText("OK", { exact: true })).toBeVisible();
  // The plate is staff-only: it is on this page, and the API never puts it in a reminder text.
  await expect(page.getByText(/plate CGTP 927/)).toBeVisible();
});

test("the reminder list shows consent on every row; a skip drops the row", async ({ page }) => {
  const owner = await login(GARAGE);
  const m = await shopOf(owner);
  await signIn(page, GARAGE);
  await page.goto(`/m/${m}/service-reminders`);
  await expect(page.getByRole("heading", { name: "Service reminders" })).toBeVisible();
  const table = page.getByRole("table", { name: "Cars due for service" });
  const tom = table.getByRole("row", { name: /2012 Ford Escape/ }).first();
  await expect(tom.getByRole("button", { name: "No text consent" })).toBeDisabled();
  await expect(page.getByText(/is due for/).first()).toBeVisible(); // the preview of the text
  await expect(page.getByText("Reply STOP").first()).toBeVisible();
  await page.screenshot({ path: shot("02-reminders-1440") });
  await variants(page, "02-reminders");
  const aisha = table.getByRole("row", { name: /Kia Sportage.*Brake inspection/ });
  await expect(aisha.getByText("Overdue")).toBeVisible();
  await aisha.getByRole("button", { name: "Skip" }).click();
  await expect(table.getByRole("row", { name: /Kia Sportage.*Brake inspection/ })).toHaveCount(0);
  const api = await call<{ items: { vehicleLabel: string; serviceKey: string }[] }>("GET", `/v1/merchants/${m}/auto/reminders`, undefined, owner);
  expect(api.items.some((i) => i.vehicleLabel.includes("Sportage") && i.serviceKey === "brakes")).toBe(false);
});

test("tire season: a full day is shown and refused, a swap and a stored set can be added", async ({ page }) => {
  const owner = await login(GARAGE);
  const m = await shopOf(owner);
  await signIn(page, GARAGE);
  await page.goto(`/m/${m}/tire-season`);
  await expect(page.getByRole("heading", { name: "Tire season" })).toBeVisible();
  const plan = page.getByRole("table", { name: "Capacity plan, next 14 days" });
  await expect(plan.getByText("4 of 4").first()).toBeVisible();
  await expect(plan.getByText("Full", { exact: true }).first()).toBeVisible();
  const tireHotel = page.getByRole("table", { name: "Stored tires" });
  await expect(tireHotel.getByRole("row", { name: /B-07/ }).getByText("Replace soon")).toBeVisible();
  await page.screenshot({ path: shot("03-tire-season-1440") });
  await variants(page, "03-tire-season");
  // The API refuses the full day however the booking is made.
  const days = await call<{ days: { day: string; full: boolean }[] }>("GET", `/v1/merchants/${m}/auto/tires/plan?days=14`, undefined, owner);
  const full = days.days.find((d) => d.full)!;
  const member = (await call<{ items: { memberId: string }[] }>("GET", `/v1/merchants/${m}/customers?q=Nikos`, undefined, owner)).items[0]!.memberId;
  const refused = await raw("POST", `/v1/merchants/${m}/auto/tires/swaps`, { memberId: member, day: full.day }, owner);
  expect(refused.status).toBe(409);
  expect(refused.body?.error?.code).toBe("day_full");
  // Book a swap for a day with room.
  await page.getByRole("button", { name: "Add a swap booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a swap booking" });
  await dialog.getByLabel("Customer").fill("Nikos");
  await dialog.getByRole("button", { name: /Nikos Novak/ }).click();
  const options = await dialog.getByLabel("Day").locator("option").allTextContents();
  await dialog.getByLabel("Day").selectOption({ label: options[options.length - 1]! });
  await dialog.getByRole("button", { name: "Book swap" }).click();
  await expect(page.getByText(/Swap booked for/)).toBeVisible();
  // Store a set in the tire hotel.
  await page.getByRole("button", { name: "Store a set" }).click();
  const panel = page.getByRole("dialog", { name: "Store a set" });
  await panel.getByLabel("Customer").fill("Nikos");
  await panel.getByRole("button", { name: /Nikos Novak/ }).click();
  await panel.getByLabel("Rack").fill("z-99");
  await panel.getByLabel("Tread (mm)").fill("5.5");
  await panel.getByRole("button", { name: "Store set" }).click();
  await expect(tireHotel.getByRole("row", { name: /Z-99/ })).toBeVisible();
  await tireHotel.getByRole("row", { name: /Z-99/ }).getByRole("button", { name: "Picked up" }).click();
  await expect(tireHotel.getByRole("row", { name: /Z-99/ })).toHaveCount(0);
});

test("the owner sees their car and what is due, saves an odometer reading and books a swap day", async ({ page }) => {
  const owner = await login(GARAGE);
  const m = await shopOf(owner);
  // Open the fall window for today so the booking works on any day of the year.
  await call("PUT", `/v1/merchants/${m}/auto/settings`, { fallStart: "01-01", fallEnd: "12-31" }, owner);
  await customerSignIn(page, "/me/vehicles");
  await expect(page.getByRole("heading", { name: "My vehicles" })).toBeVisible();
  const civic = page.getByRole("listitem").filter({ hasText: "2019 Honda Civic" }).first();
  await expect(civic.getByText("Service reminders from Wheelhouse Tire & Auto")).toBeVisible();
  await expect(civic.getByText("Oil and filter")).toBeVisible();
  await expect(civic.getByText(/Dates are estimates/)).toBeVisible();
  await civic.getByLabel("Odometer today (km)").fill("82100");
  await civic.getByRole("button", { name: "Save reading" }).click();
  await expect(civic.getByText(/82,100 km on/)).toBeVisible();
  const tire = page.getByRole("region", { name: "Tire swap at Wheelhouse Tire & Auto" });
  await expect(tire.getByText(/Rack B-14/)).toBeVisible();
  await page.screenshot({ path: shot("m1-my-vehicles-390"), fullPage: true });
  await dark(page, "m1-my-vehicles-390");
  const firstDay = tire.getByRole("button", { name: /^Book swap: .*left$/ }).first();
  const dayName = ((await firstDay.textContent()) ?? "").split(" · ")[0]!.trim();
  await firstDay.click();
  const booked = tire.getByRole("listitem").filter({ hasText: `Booked for ${dayName}` });
  await expect(booked).toBeVisible();
  await page.screenshot({ path: shot("m1-tire-swap-390"), fullPage: true });
  await booked.getByRole("button", { name: "Cancel" }).click();
  await expect(booked).toHaveCount(0);
});

test("a vehicle estimate: no work before the customer approves, then the invoice shows the estimate and stays inside 10%", async ({ page, browser }) => {
  const owner = await login(GARAGE);
  const m = await shopOf(owner);
  const list = await call<{ items: { id: string; issue: string }[] }>("GET", `/v1/merchants/${m}/tickets?status=quote_sent`, undefined, owner);
  const ticket = list.items.find((t) => t.issue === "Oil change and cabin filter")!;
  const detail = await call<{ quotes: { approvalUrl: string; totalCents: number; maxAuthorizedCents: number }[] }>("GET", `/v1/merchants/${m}/tickets/${ticket.id}`, undefined, owner);
  const quote = detail.quotes[0]!;
  expect(quote.maxAuthorizedCents).toBe(Math.floor(quote.totalCents * 1.1));
  await signIn(page, GARAGE);
  await page.goto(`/m/${m}/tickets/${ticket.id}`);
  await expect(page.getByText("Vehicle and estimate")).toBeVisible();
  await expect(page.getByText("The estimate has everything the guide asks for.")).toBeVisible();
  // Work cannot start, and the car cannot be marked ready, until the customer approves.
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText(/have them approve it before work starts/)).toBeVisible();
  await page.screenshot({ path: shot("04-estimate-ticket-1440"), fullPage: true });
  await variants(page, "04-estimate-ticket", true);
  // The customer, on their phone.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(quote.approvalUrl);
  await expect(phone.getByText("This is an estimate", { exact: true })).toBeVisible();
  await expect(phone.getByText(/Honda Civic · odometer 81,640 km/)).toBeVisible();
  await expect(phone.getByText(/work finished by/)).toBeVisible();
  await expect(phone.getByText(/Parts we replace are yours/)).toBeVisible();
  await expect(phone.getByText(/The final price will not be more than/)).toBeVisible();
  await expect(phone.getByText(/Part · new/).first()).toBeVisible();
  await phone.screenshot({ path: shot("m2-approve-estimate-390"), fullPage: true });
  await dark(phone, "m2-approve-estimate-390");
  await phone.getByLabel("Type your full name to sign").fill("Nikos Novak");
  await phone.getByRole("button", { name: "Approve quote" }).click();
  await expect(phone.getByText(/Approved/).first()).toBeVisible();
  // Now work can start; the shop records the odometer out and what happened to the replaced parts.
  await page.reload();
  await page.getByLabel("Odometer out (km)").fill("81,646");
  await page.getByLabel("Replaced parts").selectOption({ label: "Replaced parts offered back" });
  await page.getByRole("button", { name: "Save for the invoice" }).click();
  await expect(page.getByText("Saved for the invoice")).toBeVisible();
  const started = await raw("POST", `/v1/merchants/${m}/tickets/${ticket.id}/status`, { status: "in_progress", notify: false }, owner);
  expect(started.status).toBe(200);
  // $50 of extra parts is over the 10% cap: refused with the number. $10 is inside it.
  const over = await raw("POST", `/v1/merchants/${m}/tickets/${ticket.id}/invoices`, { extraLineItems: [{ description: "Wiper blades and washer fluid", quantity: 1, unitPriceCents: 5000, kind: "part", condition: "new" }], send: false }, owner);
  expect(over.status).toBe(409);
  expect(over.body?.error?.code).toBe("over_estimate");
  const inv = await call<{ payUrl: string }>("POST", `/v1/merchants/${m}/tickets/${ticket.id}/invoices`, { extraLineItems: [{ description: "Wiper blades", quantity: 1, unitPriceCents: 1000, kind: "part", condition: "new" }], send: true }, owner);
  await phone.goto(inv.payUrl);
  await expect(phone.getByText("Compared with your estimate")).toBeVisible();
  await expect(phone.getByText(/% over the estimate \(the limit is 10%\)/)).toBeVisible();
  await expect(phone.getByText(/Approved by Nikos Novak on .*, by link/)).toBeVisible();
  await expect(phone.getByText("Odometer in 81,640 km, out 81,646 km")).toBeVisible();
  await expect(phone.getByText("Replaced parts: offered back to you.")).toBeVisible();
  await expect(phone.getByText(/Warranty: new or reconditioned parts and the work to fit them, 90 days or 5,000 km/)).toBeVisible();
  await phone.screenshot({ path: shot("m2-invoice-390"), fullPage: true });
  await dark(phone, "m2-invoice-390");
  await phone.close();
  // The vehicle page lists the visit with the estimate beside the invoice.
  const car = await vehicleId(owner, m, "2019 Honda Civic");
  await page.goto(`/m/${m}/vehicles/${car}`);
  await expect(page.getByRole("table", { name: "Visits" }).getByText(/% over the estimate \(limit 10%\)/)).toBeVisible();
});

test("the wash desk finds a member by plate, counts one wash a day and lists who stopped coming", async ({ page }) => {
  const owner = await login(WASH);
  const m = await shopOf(owner);
  await signIn(page, WASH);
  await page.goto(`/m/${m}/wash`);
  await expect(page.getByRole("heading", { name: "Wash desk" })).toBeVisible();
  await page.getByLabel("Plate, phone, name or member code").fill("bxtr 481");
  await page.getByRole("button", { name: "Find" }).click();
  const found = page.getByRole("list", { name: "Members found" });
  await expect(found.getByText("Nikos Novak")).toBeVisible();
  await expect(found.getByText(/Shine, active/)).toBeVisible();
  await found.getByRole("button", { name: /Count a wash for Nikos/ }).click();
  await expect(page.getByText(/is in\. Shine, wash \d+ this month/).first()).toBeVisible();
  await expect(found.getByText("washed today")).toBeVisible();
  await page.screenshot({ path: shot("05-wash-desk-1440") });
  await variants(page, "05-wash-desk");
  // A second tap the same day is refused, in words.
  await found.getByRole("button", { name: /Count a wash for Nikos/ }).click();
  await expect(page.getByText("Already washed today.")).toBeVisible();
  const atRisk = page.getByRole("table", { name: "Members who stopped coming" });
  await expect(atRisk.getByText("Maya Chen")).toBeVisible();
  // A plan that is frozen or whose card failed is refused with the reason.
  const failed = await call<{ items: { memberId: string; plan: { state: string } | null }[] }>("GET", `/v1/merchants/${m}/auto/wash/lookup?q=Tom`, undefined, owner);
  const tom = failed.items.find((i) => i.plan?.state === "past_due")!;
  const refused = await call<{ ok: boolean; reason: string; message: string }>("POST", `/v1/merchants/${m}/auto/wash/check-in`, { memberId: tom.memberId }, owner);
  expect(refused).toMatchObject({ ok: false, reason: "past_due" });
  expect(refused.message).toContain("payment failed");
});
