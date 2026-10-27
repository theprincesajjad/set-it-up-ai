/**
 * Appointments: the calendar (drag to another stylist, a busy time snaps back, resize, keys), check in to checkout with a tip,
 * a walk-in, and a customer booking with a deposit including the "just taken" message.
 * Needs a running, seeded API and web (docs/engineering/web.md). Uses the seed salon Bloom Hair Studio.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/appointments, untracked output).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const OWNER = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/appointments";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

type Appt = { id: string; staffId: string | null; startsAt: string; endsAt: string; status: string };

async function setup() {
  const { accessToken: token } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items[0]!.id;
  const base = `/v1/merchants/${m}`;
  const staff = (await call<{ items: { userId: string; name: string }[] }>("GET", `${base}/appointments/staff`, undefined, token)).items;
  const services = (await call<{ items: { id: string; name: string; durationMin: number }[] }>("GET", `${base}/services`, undefined, token)).items;
  return { token, m, base, staff, services };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** A Wednesday three weeks out: the seed has nothing on it. */
function farWednesday(weeks = 3): string {
  const d = new Date(Date.now() + weeks * 7 * 86_400_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const phone = () => `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
const toronto = (day: string, hhmm: string) => {
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "longOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")!.value.replace("GMT", "") || "-05:00";
  return new Date(`${day}T${hhmm}:00${off}`).toISOString();
};

async function book(c: Ctx, staffId: string, day: string, hhmm: string, svc: string) {
  return call<Appt>("POST", `${c.base}/appointments`, { staffId, serviceIds: [svc], startsAt: toronto(day, hhmm), customer: { phone: phone(), name: "E2E Client" } }, c.token);
}
const get = (c: Ctx, id: string) => call<{ appointment: Appt }>("GET", `${c.base}/appointments/${id}`, undefined, c.token).then((r) => r.appointment);

const TIMES_RE = /^\d{1,2}:\d\d [ap]\.m\.$/;
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("calendar: drag across stylists, busy time snaps back, resize, keyboard", async ({ page }) => {
  const c = await setup();
  const day = farWednesday(4 + Math.floor(Math.random() * 400));
  const cut = c.services.find((s) => s.name.startsWith("Cut"))!;
  const [simran, aisha] = [c.staff.find((s) => s.name.startsWith("Simran"))!, c.staff.find((s) => s.name.startsWith("Aisha"))!];
  const a = await book(c, simran.userId, day, "11:00", cut.id);
  const b = await book(c, simran.userId, day, "14:00", cut.id);

  await signIn(page);
  await page.goto(`/m/${c.m}/calendar?date=${day}`);
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
  // Screen reader labels: client, service, time, stylist, state.
  const blockA = page.locator(`[data-appt="${a.id}"]`);
  await expect(blockA).toHaveAttribute("aria-label", /E2E Client, cut and blow-dry, 11:00 to 11:45, Simran, booked/);
  await expect(page.getByRole("group", { name: /^Aisha/ })).toBeVisible();
  await page.screenshot({ path: shot("calendar-1440") });

  // Drag A one hour down into Aisha's column.
  const cols = page.locator("[data-column]");
  const box = (await blockA.boundingBox())!;
  const aishaCol = (await cols.nth(1).boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + 14 };
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 40, mid.y + 20, { steps: 4 });
  await page.mouse.move(aishaCol.x + aishaCol.width / 2, mid.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await get(c, a.id)).staffId).toBe(aisha.userId);
  expect((await get(c, a.id)).startsAt).toBe(toronto(day, "12:00"));

  // Drop B on a busy time in the same column: the server refuses, the block goes back and a message says why.
  const blockB = page.locator(`[data-appt="${b.id}"]`);
  const bb = (await blockB.boundingBox())!;
  const col2 = (await cols.nth(1).boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 14);
  await page.mouse.down();
  await page.mouse.move(col2.x + col2.width / 2, bb.y - 60, { steps: 8 });
  await page.mouse.move(col2.x + col2.width / 2, bb.y - 120, { steps: 8 }); // 12:00, where A now sits
  await page.mouse.up();
  await expect(page.getByText("That time was just taken. Pick another.")).toBeVisible();
  await expect.poll(async () => (await get(c, b.id)).staffId).toBe(simran.userId);
  expect((await get(c, b.id)).startsAt).toBe(toronto(day, "14:00"));

  // Resize B from its bottom edge by 30 minutes.
  const handle = page.locator(`[data-appt="${b.id}"] [data-resize]`);
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 15, { steps: 4 });
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await get(c, b.id)).endsAt).toBe(toronto(day, "15:15"));

  // Keys: n opens the new appointment sheet, Escape closes it, the arrows change the day.
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "New appointment" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New appointment" })).toHaveCount(0);
  const before = await page.getByText(/booked\.$/).first().innerText();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(before)).toHaveCount(0);
});

test("check in, start, check out with a tip for the stylist", async ({ page }) => {
  const c = await setup();
  const day = farWednesday(4 + Math.floor(Math.random() * 400)); // a fresh day per run, so reruns do not collide
  const svc = c.services.find((s) => s.name.startsWith("Cut"))!;
  const priya = c.staff.find((s) => s.name.startsWith("Priya"))!;
  const a = await book(c, priya.userId, day, "16:00", svc.id);
  await signIn(page);
  await page.goto(`/m/${c.m}/calendar?date=${day}`);
  await page.locator(`[data-appt="${a.id}"]`).click();
  const side = page.getByRole("complementary", { name: "Appointment" });
  await expect(side.getByRole("heading", { name: "E2E Client" })).toBeVisible();
  await side.getByRole("button", { name: "Check in" }).click();
  await side.getByRole("button", { name: "Start service" }).click();
  await expect(side.getByText("In the chair")).toBeVisible();
  await side.getByRole("button", { name: /^Check out, \$65 \+ tip/ }).click();
  const sheet = page.getByRole("dialog", { name: "Check out" });
  await sheet.getByRole("button", { name: /^20% / }).click();
  const done = page.waitForResponse((r) => r.url().includes("/checkout") && r.request().method() === "POST");
  await sheet.getByRole("button", { name: /^Take \$/ }).click();
  const body = (await (await done).json()) as { invoice: { status: string; tipCents: number; tipStaffId: string; pointsEarned: number; subtotalCents: number } };
  expect(body.invoice).toMatchObject({ status: "paid", tipCents: 1300, tipStaffId: priya.userId, subtotalCents: 6500 });
  expect(body.invoice.pointsEarned).toBeGreaterThan(0);
  await expect(sheet.getByText(/Paid, invoice #/)).toBeVisible();
  await page.screenshot({ path: shot("checkout-1440") });
});

test("walk-in starts now with the client arrived", async ({ page }) => {
  const c = await setup();
  const svc = c.services.find((s) => s.name.startsWith("Threading"))!;
  const priya = c.staff.find((s) => s.name.startsWith("Priya"))!;
  // Clear Priya's chair for the next half hour (the demo day is busy).
  const now = new Date();
  const list = await call<{ items: Appt[] }>("GET", `${c.base}/appointments?from=${encodeURIComponent(new Date(now.getTime() - 3 * 3600_000).toISOString())}&to=${encodeURIComponent(new Date(now.getTime() + 2 * 3600_000).toISOString())}`, undefined, c.token);
  for (const x of list.items.filter((i) => i.staffId === priya.userId && ["booked", "arrived", "in_service"].includes(i.status) && new Date(i.endsAt) > now && new Date(i.startsAt) < new Date(now.getTime() + 30 * 60_000)))
    await call("POST", `${c.base}/appointments/${x.id}/status`, { status: "cancelled" }, c.token);
  await signIn(page);
  await page.goto(`/m/${c.m}/calendar`);
  await expect(page.locator("[data-calendar]")).toBeVisible();
  await page.keyboard.press("w");
  const sheet = page.getByRole("dialog", { name: "Walk-in" });
  const who = `Walkin ${Date.now() % 1_000_000}`; // unique, so earlier runs on the same database do not match
  await sheet.getByLabel("Name").fill(who);
  await sheet.getByLabel("Stylist").selectOption(priya.userId);
  await sheet.getByRole("checkbox", { name: new RegExp(svc.name) }).click();
  await sheet.getByRole("button", { name: "Start now" }).click();
  await expect(page.locator('[data-status="arrived"]').filter({ hasText: who })).toBeVisible();
});

test("customer books with a deposit; a taken time says so", async ({ page }) => {
  const TIMES = page.getByRole("button", { name: TIMES_RE });
  const c = await setup();
  const aisha = c.staff.find((s) => s.name.startsWith("Aisha"))!;
  const high = c.services.find((s) => s.name.startsWith("Highlights"))!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/shops/bloom-hair-studio/book");
  await page.getByRole("radio", { name: /Aisha/ }).click();
  await page.getByRole("checkbox", { name: /Highlights/ }).click();
  await expect(page.getByText("Deposit $40 to hold").first()).toBeVisible();
  await page.screenshot({ path: shot("m1-390") });
  await page.getByRole("button", { name: "Choose a time" }).click();
  // The policy is on screen before any card field.
  await expect(page.getByText(/Change or cancel free until 24 hours before/)).toBeVisible();
  await expect(page.getByText("Card to hold the booking")).toBeVisible();
  // A day with room for a two hour service: the last bookable day in the strip.
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).last().click();
  await expect(TIMES.first()).toBeVisible();
  const takenLabel = (await TIMES.first().textContent())!.trim();
  await TIMES.first().click();
  await page.screenshot({ path: shot("m2-390") });

  // Someone else takes that chair first: just before the booking request goes out, the shop books the same time.
  let taken = false;
  await page.route("**/v1/me/appointments", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || taken) return route.continue();
    taken = true;
    const sent = req.postDataJSON() as { startsAt: string };
    await call("POST", `${c.base}/appointments`, { staffId: aisha.userId, serviceIds: [high.id], startsAt: sent.startsAt, customer: { phone: phone(), name: "Taken First" } }, c.token);
    return route.continue();
  });

  // The shop asks who is coming (first name), so its calendar never says "Walk-in".
  await page.getByLabel("Your first name").fill("Tess");
  // Sign in with a new phone (the dev code is filled in), then book: the chair was taken meanwhile.
  await page.getByRole("button", { name: "Sign in to book" }).click();
  await page.locator("input[type=tel]").first().fill(phone().slice(2));
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  // Signing in carries on with the booking by itself.
  await expect(page.getByText("That time was just taken. Pick another.")).toBeVisible({ timeout: 20_000 });

  // Pick a different time and pay the deposit with the dev test card. Wait for the refreshed list first: until it lands, the list on
  // screen is the stale one, whose second time overlaps the two hour block the shop just took (a second "taken", no hold).
  await expect(page.getByRole("button", { name: takenLabel, exact: true })).toHaveCount(0);
  await expect(TIMES.first()).toBeEnabled();
  await TIMES.first().click();
  await page.getByRole("button", { name: "Book and pay $40 deposit" }).click();
  await expect(page.getByText(/We are holding this time until/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Book and pay $40 deposit" }).click();
  await expect(page.getByRole("heading", { name: "you are booked" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Add to calendar" })).toBeVisible();
  // The confirmation is a next-visit card: when, where (with directions) and the cancel policy in words.
  const next = page.getByTestId("next-visit");
  await expect(next.getByText("Your next visit")).toBeVisible();
  await expect(next.getByRole("link", { name: "Directions" })).toBeVisible();
  await expect(next.getByText(/Change or cancel free until 24 hours before/)).toBeVisible();
  await page.screenshot({ path: shot("booked-390") });
  // The wallet shows the same card, and the shop's calendar names the client "Tess", not "Walk-in".
  await page.goto("/me");
  await expect(page.getByTestId("next-visit")).toBeVisible();
  await page.screenshot({ path: shot("wallet-next-visit-390") });
  const online = await call<{ items: { source: string; customer: { name: string }; startsAt: string }[] }>("GET", `${c.base}/appointments?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 30 * 86_400_000).toISOString())}`, undefined, c.token);
  expect(online.items.some((a) => a.source === "online" && a.customer.name === "Tess")).toBe(true);
});
