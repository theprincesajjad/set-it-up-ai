/**
 * Barbershops, threading bars and beauty supply (docs/research/barbers-beauty.md): a guest joins the walk-in line from a phone, the
 * barber calls and starts them, payouts show chair rent, a renter sees only their own chair, a parent adds a family member, and a beauty
 * supply message with a treatment claim is refused. Needs a running, seeded API and web (docs/engineering/web.md).
 * Uses the seed shops Crown & Fade Barbershop, Arch & Thread Brow Bar and Glow Beauty Supply.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/barbers).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/barbers";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function status(method: string, path: string, token: string): Promise<{ status: number; body: { code?: string; error?: { code?: string } } }> {
  const res = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
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
const week = () => {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from, to: d.toISOString().slice(0, 10) };
};

test("a guest joins the line from a phone, sees a place and an estimate, and leaves", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const who = newPhone();
  await page.goto("/shops/crown-and-fade/queue");
  await expect(page.getByRole("heading", { name: "Join the line" })).toBeVisible();
  await expect(page.getByText(/About \d+ min|No wait/).first()).toBeVisible();
  await page.getByLabel("First name").fill("Nadir");
  await fillPhone(page, who);
  await page.getByRole("button", { name: "Kids' cut" }).click();
  await page.getByRole("button", { name: "Marcus" }).click();
  await page.getByLabel(/Text me when I'm next/).check();
  await page.screenshot({ path: shot("m1-join-390"), fullPage: true });
  await page.getByRole("button", { name: "Join the line" }).click();
  await page.waitForURL(/\/line\//);
  await expect(page.getByRole("heading", { name: /You're (number \d+|next)/ })).toBeVisible();
  await expect(page.getByText(/\d+ people? ahead of you|\d+ person ahead of you/)).toBeVisible();
  await expect(page.getByText("Kids' cut", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: shot("m2-status-390"), fullPage: true });
  await page.getByRole("button", { name: "Leave the line" }).click();
  await expect(page.getByRole("heading", { name: "You left the line." })).toBeVisible();
});

test("the barber calls the next person, puts them in the chair and finishes", async ({ page }) => {
  const owner = await login("owner+crown-and-fade@example.com");
  const m = await shopOf(owner);
  const base = `/v1/merchants/${m}`;
  // A known person at the front of the line for Ayo (the seed's line is for Marcus and anyone).
  const who = `+1${newPhone()}`;
  const joined = await call<{ token: string; entries: { id: string }[] }>("POST", "/v1/public/shops/crown-and-fade/queue", { name: "Yusuf", phone: who, textConsent: true });
  await signIn(page, "owner+crown-and-fade@example.com");
  await page.goto(`/m/${m}/queue`);
  await expect(page.getByRole("heading", { name: "Walk-in line" })).toBeVisible();
  await expect(page.getByText("Tyrell")).toBeVisible();
  await expect(page.getByText("Devon, Cut").first()).toBeVisible(); // in Marcus's chair
  await page.screenshot({ path: shot("01-queue-1440") });
  const board = await call<{ chairs: { staffId: string; name: string; state: string }[] }>("GET", `${base}/queue`, undefined, owner);
  const ayo = board.chairs.find((c) => c.name.startsWith("Ayo"))!;
  expect(ayo.state).toBe("free");
  // The owner (a manager) calls Yusuf for Ayo through the API (the UI's Call uses the signed-in barber's own chair), then starts and finishes in the UI.
  await call("POST", `${base}/queue/${joined.entries[0]!.id}/call`, { staffId: ayo.staffId }, owner);
  await page.reload();
  await expect(page.getByText("Yusuf").first()).toBeVisible();
  await page.getByRole("button", { name: "In the chair" }).first().click();
  const ayoChair = page.getByRole("region", { name: "Chairs" }).locator("div.rounded-card", { hasText: "Ayo Adeyemi" });
  await expect(ayoChair.getByText(/Yusuf/)).toBeVisible();
  await expect.poll(async () => (await call<{ state: string }>("GET", `/v1/public/queue/${joined.token}`)).state).toBe("in_service");
  await ayoChair.getByRole("button", { name: "Done" }).click();
  await expect.poll(async () => (await call<{ state: string }>("GET", `/v1/public/queue/${joined.token}`)).state).toBe("done");
});

test("the door tablet is a page of its own with no dashboard menu, joins someone, and needs a staff PIN to leave", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const owner = await login("owner+crown-and-fade@example.com");
  const m = await shopOf(owner);
  // The tablet's signed-in staff member has a PIN (it asks for one first when there is none).
  const me = await call<{ user: { id: string } }>("GET", "/v1/auth/me", undefined, owner);
  await call("PUT", `/v1/merchants/${m}/team/${me.user.id}/pin`, { pin: "4242" }, owner);
  await signIn(page, "owner+crown-and-fade@example.com");
  await page.goto(`/m/${m}/queue/door`);
  await page.waitForURL(`**/door/${m}`);
  await expect(page.getByRole("heading", { name: "Walk in? Join the line" })).toBeVisible();
  // Nothing of the dashboard is on it: no sidebar, no client list, no owner name or email.
  await expect(page.getByRole("link", { name: "Customers" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveCount(0);
  await expect(page.getByText("owner+crown-and-fade@example.com")).toHaveCount(0);
  await page.getByLabel("First name").fill("Door Dan");
  await page.getByRole("button", { name: "Beard trim" }).click();
  await page.screenshot({ path: shot("02-door-1024") });
  await page.getByRole("button", { name: "Join the line" }).click();
  // No phone, so no text is promised: the tablet says to watch the screen.
  await expect(page.getByText(/Door Dan, you are number \d+/)).toBeVisible();
  await expect(page.getByText(/No text will be sent/)).toBeVisible();
  // Leaving the tablet needs the PIN.
  await page.getByRole("button", { name: "Staff" }).click();
  await page.getByLabel("Staff PIN").fill("1111");
  await page.getByRole("button", { name: "Leave the tablet" }).click();
  await expect(page.getByText(/not right/i)).toBeVisible();
  await page.getByLabel("Staff PIN").fill("4242");
  await page.getByRole("button", { name: "Leave the tablet" }).click();
  await page.waitForURL(`**/m/${m}/queue`);
});

test("Done on the line leaves a visit that can be checked out, and Skip only works on someone who was called", async ({ page }) => {
  const owner = await login("owner+crown-and-fade@example.com");
  const m = await shopOf(owner);
  const base = `/v1/merchants/${m}`;
  const who = `+1${newPhone()}`;
  const joined = await call<{ token: string; entries: { id: string }[] }>("POST", "/v1/public/shops/crown-and-fade/queue", { name: "Checkout Cam", phone: who, textConsent: true });
  const board = await call<{ chairs: { staffId: string; name: string; state: string }[] }>("GET", `${base}/queue`, undefined, owner);
  const free = board.chairs.find((c) => c.name.startsWith("Ayo"))!;
  // The API refuses to skip someone who was never called.
  await expect(call("POST", `${base}/queue/${joined.entries[0]!.id}/skip`, {}, owner)).rejects.toThrow(/409/);
  await call("POST", `${base}/queue/${joined.entries[0]!.id}/call`, { staffId: free.staffId }, owner);
  const started = await call<{ appointmentId: string }>("POST", `${base}/queue/${joined.entries[0]!.id}/start`, {}, owner);
  await signIn(page, "owner+crown-and-fade@example.com");
  await page.goto(`/m/${m}/queue`);
  const chair = page.getByRole("region", { name: "Chairs" }).locator("div.rounded-card", { hasText: free.name });
  await expect(chair.getByText(/Checkout Cam/)).toBeVisible();
  await chair.getByRole("button", { name: "Done" }).click();
  // The toast offers Check out; it opens the calendar on that visit with the checkout sheet open.
  await page.getByRole("button", { name: "Check out" }).click();
  await page.waitForURL(/\/calendar\?appt=/);
  const sheet = page.getByRole("dialog", { name: "Check out" });
  await expect(sheet.getByText("Check out Checkout Cam")).toBeVisible();
  await sheet.getByRole("button", { name: /^Take \$/ }).click();
  await expect(sheet.getByText(/Paid, invoice #\d+/)).toBeVisible();
  await page.screenshot({ path: shot("04-done-checkout-1440") });
  expect(started.appointmentId).toBeTruthy();
  await expect.poll(async () => (await call<{ state: string }>("GET", `/v1/public/queue/${joined.token}`)).state).toBe("done");
});

test("payouts show chair rent and commission, and a renter sees only their own chair", async ({ page }) => {
  await signIn(page, "owner+crown-and-fade@example.com");
  const owner = await login("owner+crown-and-fade@example.com");
  const m = await shopOf(owner);
  await page.goto(`/m/${m}/payouts`);
  await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Marcus Bailey" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Chair rental" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Commission 40%" })).toBeVisible();
  await page.screenshot({ path: shot("03-payouts-1440") });

  const marcus = await login("staff+marcus-crown-and-fade@example.com");
  const mine = await call<{ mine: boolean; rows: { name: string }[] }>("GET", `/v1/merchants/${m}/payouts/mine?from=${week().from}&to=${week().to}`, undefined, marcus);
  expect(mine.mine).toBe(true);
  expect(mine.rows.map((r) => r.name)).toEqual(["Marcus Bailey"]);
  const dir = await status("GET", `/v1/merchants/${m}/customers`, marcus);
  expect(dir.status).toBe(403);
  expect(dir.body.error?.code ?? dir.body.code).toBe("own_clients_only");
  const day = await call<{ items: { staffId: string }[] }>("GET", `/v1/merchants/${m}/appointments?from=${new Date(Date.now() - 7 * 86_400_000).toISOString()}&to=${new Date(Date.now() + 86_400_000).toISOString()}`, undefined, marcus);
  expect(new Set(day.items.map((a) => a.staffId)).size).toBeLessThanOrEqual(1);
});

test("a parent adds a family member with consent, brings them into the line, and removes them", async ({ page }) => {
  const who = newPhone();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/family");
  await fillPhone(page, who);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Family", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("Zayn");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true"); // the tick is required
  await expect(page.getByText("Zayn", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Zayn", { exact: true })).toBeVisible();
  await page.screenshot({ path: shot("m3-family-390") });
  await page.goto("/shops/crown-and-fade/queue");
  await expect(page.getByRole("button", { name: "+ Zayn" })).toBeVisible();
  await page.getByRole("button", { name: "+ Zayn" }).click();
  await page.getByRole("button", { name: "Join the line" }).click();
  await expect(page.getByText("Add your first name")).toBeVisible(); // a new account has no name yet
  await page.getByLabel("First name").fill("Sam");
  await page.getByRole("button", { name: "Join the line" }).click();
  await page.waitForURL(/\/line\//);
  await expect(page.getByText(/Joined with Zayn/)).toBeVisible();
  await page.getByRole("button", { name: "Leave the line" }).click();
  await page.goto("/me/family");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("No family members yet.")).toBeVisible();
});

test("the threading bar has a line, and a beauty supply message with a treatment claim is refused", async ({ page }) => {
  const arch = await call<{ open: boolean; waiting: number }>("GET", "/v1/public/shops/arch-and-thread/queue");
  expect(arch.open).toBe(true);
  expect(arch.waiting).toBeGreaterThan(0);
  const glow = await login("owner+glow-beauty-supply@example.com");
  const g = await shopOf(glow);
  const res = await fetch(`${API}/v1/merchants/${g}/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${glow}` }, body: JSON.stringify({ channel: "email", subject: "New serum", body: "Our serum stops hair loss in 30 days.", segment: { kind: "all" } }) });
  expect(res.status).toBe(422);
  expect(JSON.stringify(await res.json())).toContain("stops hair loss");
  await signIn(page, "owner+glow-beauty-supply@example.com");
  await page.goto(`/m/${g}/messages/new`);
  const body = page.locator("#msg-body");
  await body.fill("New growth serum: stops hair loss in 30 days. 15% off this weekend.");
  await expect(page.getByTestId("beauty-claims-blocked")).toContainText("This can't be sent");
  await expect(page.getByTestId("beauty-claims-blocked")).toContainText("stops hair loss");
  await page.screenshot({ path: shot("05-claims-1440") });
  await body.fill("Colour restock: 15% off hair colour this weekend for stylist pro card holders.");
  await expect(page.getByTestId("beauty-claims-blocked")).toHaveCount(0);
  await page.goto(`/m/${g}/program`);
  await expect(page.getByText("Hair care").first()).toBeVisible();
  await expect(page.getByText("Gift cards").first()).toBeVisible();
  await page.screenshot({ path: shot("04-beauty-rewards-1440") });
});
