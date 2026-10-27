/**
 * Pet care (docs/research/pet-care.md): a groomer's pet profile and vaccine dates, the groom rebooking list, a report card, daycare
 * check-in that stops an expired shot, the food card that cannot be redeemed early, and the owner's own pages (my pets with a
 * certificate upload, my food cards, a report card link). Needs a running, seeded API and web (docs/engineering/web.md).
 * Uses the seed shops Pawsh Grooming, Wag Wing Dog Daycare and Tail & Kibble, and the seeded demo customer (+16475551000, Nikos Novak).
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/pets).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/pets";
const shot = (name: string) => `${SHOTS}/${name}.png`;
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
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
async function petId(token: string, shop: string, name: string) {
  const { items } = await call<{ items: { id: string; name: string }[] }>("GET", `/v1/merchants/${shop}/pets`, undefined, token);
  return items.find((p) => p.name === name)!.id;
}
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

test("a groomer sees a pet's cadence and shots, with the expired one flagged", async ({ page }) => {
  const owner = await login("owner+pawsh-grooming@example.com");
  const m = await shopOf(owner);
  await signIn(page, "owner+pawsh-grooming@example.com");
  await page.goto(`/m/${m}/pets`);
  await expect(page.getByRole("heading", { name: "Pets", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Biscuit" })).toBeVisible();
  await page.getByRole("link", { name: "Biscuit" }).click();
  await expect(page.getByRole("heading", { name: /Biscuit, with Nikos Novak/ })).toBeVisible();
  await expect(page.getByText("Every", { exact: true })).toBeVisible();
  await expect(page.getByText("6 weeks").first()).toBeVisible();
  const bordetella = page.getByRole("listitem").filter({ hasText: "Bordetella" });
  await expect(bordetella.getByText("Expired", { exact: true })).toBeVisible();
  await expect(page.getByText("What we do not keep")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Handling note/ })).toHaveValue(/Nervous at the dryer/);
  await page.screenshot({ path: shot("01-pet-profile-1440") });
  // The shop fixes a date by hand (the certificate was checked at the counter).
  const rabies = page.getByRole("listitem").filter({ hasText: "Rabies" });
  await rabies.getByRole("button", { name: "Update" }).click();
  await page.getByLabel("Expiry date").fill("2027-12-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rabies.getByText("Dec 1, 2027")).toBeVisible();
  await expect(bordetella.getByText("Expired", { exact: true })).toBeVisible(); // still expired: only the owner's new certificate fixes it
});

test("the rebooking list shows late and due pets on their own cadence; skipping hides one for the cycle", async ({ page }) => {
  const owner = await login("owner+pawsh-grooming@example.com");
  const m = await shopOf(owner);
  await signIn(page, "owner+pawsh-grooming@example.com");
  await page.goto(`/m/${m}/groom-rebooking`);
  await expect(page.getByRole("heading", { name: "Due to come back" })).toBeVisible();
  const table = page.getByRole("table", { name: "Pets due for a groom" });
  await expect(table.getByText("Pepper")).toBeVisible();
  await expect(table.getByText("Biscuit")).toBeVisible(); // due today (6 week cadence)
  await expect(table.getByText("Late").first()).toBeVisible();
  await expect(page.getByText(/is due for a groom around/)).toBeVisible();
  await page.screenshot({ path: shot("02-rebooking-1440") });
  await table.getByRole("row", { name: /Pepper/ }).getByRole("button", { name: "Skip" }).click();
  await expect(table.getByText("Pepper")).toHaveCount(0);
  const api = await call<{ items: { petName: string }[] }>("GET", `/v1/merchants/${m}/pets/rebooking`, undefined, owner);
  expect(api.items.map((i) => i.petName)).not.toContain("Pepper");
});

test("a report card logs the visit; when the text cannot go the shop gets the private link, and the page opens without signing in", async ({ page }) => {
  const owner = await login("owner+pawsh-grooming@example.com");
  const m = await shopOf(owner);
  await signIn(page, "owner+pawsh-grooming@example.com");
  const rocky = await petId(owner, m, "Rocky");
  await page.goto(`/m/${m}/pets/${rocky}`);
  await page.getByRole("button", { name: "Send report card" }).click();
  await expect(page.getByRole("dialog", { name: "Report card for Rocky" })).toBeVisible();
  await page.getByRole("button", { name: "A bit nervous" }).click();
  await page.getByLabel(/A line from the groomer/).fill("Great boy. Loves the tub.");
  await expect(page.getByText(/Text Dan will get/)).toBeVisible();
  await page.screenshot({ path: shot("05-report-card-1440") });
  // The text goes out in the daytime; at night (shop time) it is held, and the shop is handed the link.
  const r = await call<{ url: string | null; sent: boolean; skipped: string | null }>("POST", `/v1/merchants/${m}/pets/${rocky}/report-card`, { kind: "groom", mood: "happy", did: ["bath", "haircut"], note: "Great boy.", send: true }, owner);
  expect(r.url).toContain("/visit/");
  const phone = await page.context().newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(r.url!);
  await expect(phone.getByRole("heading", { name: "Rocky's visit" })).toBeVisible();
  await expect(phone.getByText("Haircut")).toBeVisible();
  await expect(phone.getByRole("link", { name: "Book the next visit" })).toBeVisible();
  await phone.screenshot({ path: shot("m3-report-card-390"), fullPage: true });
  await phone.close();
  await page.getByRole("button", { name: /Send to Dan|Log without a text/ }).first().click();
  await expect(page.getByText(/Sent to Dan|Not texted|Visit logged/).first()).toBeVisible();
});

test("daycare: an expired shot and a missing temperament check block check-in, a clear dog checks in and out", async ({ page }) => {
  const owner = await login("owner+wag-wing-daycare@example.com");
  const m = await shopOf(owner);
  await signIn(page, "owner+wag-wing-daycare@example.com");
  await page.goto(`/m/${m}/daycare`);
  await expect(page.getByRole("heading", { name: /Daycare,/ })).toBeVisible();
  await expect(page.getByText("In the room")).toBeVisible();
  const ziggy = page.getByRole("listitem").filter({ hasText: "Ziggy" });
  await expect(ziggy.getByText(/Bordetella expired on/)).toBeVisible();
  // One state, not two: the blocked dog has no Check in button, only a way to fix the shots.
  await expect(ziggy.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await expect(ziggy.getByRole("link", { name: "Update shots" })).toBeVisible();
  const luna = page.getByRole("listitem").filter({ hasText: "Luna" });
  await expect(luna.getByText(/No temperament check on file yet/)).toBeVisible();
  await page.screenshot({ path: shot("03-daycare-1440") });
  const rocky = page.getByRole("listitem").filter({ hasText: "Rocky" });
  await rocky.getByRole("button", { name: "Check in" }).click();
  await expect(rocky.getByText("In the room")).toBeVisible();
  const board = await call<{ inRoom: number }>("GET", `/v1/merchants/${m}/daycare/day`, undefined, owner);
  expect(board.inRoom).toBe(3);
  // The API refuses the blocked dog too, with the reason.
  const day = await call<{ items: { id: string; petName: string }[] }>("GET", `/v1/merchants/${m}/daycare/day`, undefined, owner);
  const z = day.items.find((i) => i.petName === "Ziggy")!;
  const res = await fetch(`${API}/v1/merchants/${m}/daycare/stays/${z.id}/check-in`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${owner}` }, body: "{}" });
  expect(res.status).toBe(409);
  expect(JSON.stringify(await res.json())).toContain("Bordetella expired");
  await rocky.getByRole("button", { name: "Check out" }).click();
  await expect(rocky.getByText("Went home")).toBeVisible();
});

test("food cards: nine bags is not enough for the free bag, twelve is", async ({ page }) => {
  const owner = await login("owner+tail-and-kibble@example.com");
  const m = await shopOf(owner);
  await signIn(page, "owner+tail-and-kibble@example.com");
  await page.goto(`/m/${m}/food-cards`);
  await expect(page.getByRole("heading", { name: "Food cards" })).toBeVisible();
  await expect(page.getByText("Brands on a card")).toBeVisible();
  await expect(page.getByText("Our raw freezer")).toBeVisible();
  await expect(page.getByText(/Hazel, Fromm Gold Adult 26 lb/)).toBeVisible();
  await page.getByLabel("Customer").fill("Nikos");
  await page.getByRole("button", { name: /Nikos Novak/ }).click();
  await page.getByLabel("Bag", { exact: true }).selectOption({ label: "Fromm Gold Adult 26 lb (26 lb)" });
  await expect(page.getByText(/9 of 12 bags. 3 more/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Give the free bag" })).toBeDisabled();
  await page.screenshot({ path: shot("04-food-cards-1440") });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Add 1 bag" }).click();
    await expect(page.getByText(i === 2 ? "A free bag is ready." : new RegExp(`${10 + i} of 12 bags`))).toBeVisible();
  }
  await page.getByRole("button", { name: "Give the free bag" }).click();
  await expect(page.getByText(/0 of 12 bags/)).toBeVisible();
  // The API refuses an early redeem however the till is used.
  const cards = await call<{ cards: { id: string; canRedeem: boolean }[] }>("GET", `/v1/merchants/${m}/food/cards?memberId=${await memberId(owner, m, "Nikos")}`, undefined, owner);
  const c = cards.cards.find((x) => !x.canRedeem)!;
  const res = await fetch(`${API}/v1/merchants/${m}/food/cards/${c.id}/redeem`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${owner}` }, body: "{}" });
  expect(res.status).toBe(409);
});
async function memberId(token: string, shop: string, q: string) {
  const r = await call<{ items: { memberId: string }[] }>("GET", `/v1/merchants/${shop}/customers?q=${encodeURIComponent(q)}`, undefined, token);
  return r.items[0]!.memberId;
}

test("the owner keeps vaccine proof current from their card and sees their food card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/pets");
  await fillPhone(page, "6475551000");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My pets" })).toBeVisible();
  const biscuit = page.getByRole("listitem").filter({ hasText: "Biscuit" }).first();
  await expect(biscuit.getByText("Expired", { exact: true }).first()).toBeVisible();
  await expect(biscuit.getByText(/Next groom at Pawsh Grooming/)).toBeVisible();
  await page.screenshot({ path: shot("m1-my-pets-390"), fullPage: true });
  const row = biscuit.getByRole("listitem").filter({ hasText: "Bordetella" });
  await row.getByRole("button", { name: /Bordetella: Add a certificate/ }).click();
  await page.getByLabel("Expiry date").fill("2027-08-15");
  await page.getByLabel("Certificate photo").setInputFiles({ name: "cert.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("Current", { exact: true })).toBeVisible();
  await page.goto("/me/food");
  await expect(page.getByRole("heading", { name: "My food cards" })).toBeVisible();
  await expect(page.getByText("Fromm Gold Adult 26 lb").first()).toBeVisible();
  await expect(page.getByText(/Tail & Kibble/).first()).toBeVisible();
  await page.screenshot({ path: shot("m2-food-card-390"), fullPage: true });
});

test("a dog owner books a groom for their dog: only the dog's size is priced, no bridal row, and the shop's card shows the dog and its handling note", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Sign in first (the dog list needs the account), with the seeded demo customer, then come back to the booking page.
  await page.goto("/me/pets");
  await fillPhone(page, "6475551000");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My pets" })).toBeVisible();
  await page.goto("/shops/pawsh-grooming/book");
  await expect(page.getByText("Which dog is this for?")).toBeVisible();
  await page.getByRole("radio", { name: "Biscuit" }).click();
  await expect(page.getByText(/Prices shown are for Biscuit's size/)).toBeVisible();
  // A groomer's page has no wedding row, and Biscuit (medium) is priced as a medium dog only.
  await expect(page.getByText("Bridal and events")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Full groom \(medium dog\)/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /\(giant dog\)/ })).toHaveCount(0);
  await page.screenshot({ path: shot("m3-book-dog-390"), fullPage: true });
  await page.getByRole("checkbox", { name: /Full groom \(medium dog\)/ }).click();
  await page.getByRole("button", { name: "Choose a time" }).click();
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).last().click();
  const times = page.getByRole("button", { name: /^\d{1,2}:\d{2}\s?[ap]\.?m\.?$/i });
  await expect(times.first()).toBeVisible();
  await times.first().click();
  await page.getByRole("button", { name: /^Book/ }).last().click();
  await expect(page.getByRole("heading", { name: "you are booked" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("next-visit").getByText(/for Biscuit/)).toBeVisible();
  // The shop's list of the day (API) carries the dog, and the calendar card shows it with the handling note.
  const owner = await login("owner+pawsh-grooming@example.com");
  const m = await shopOf(owner);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const list = await call<{ items: { pet: { name: string; handlingNote: string | null } | null; source: string }[] }>("GET", `/v1/merchants/${m}/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, undefined, owner);
  const mine = list.items.find((a) => a.pet?.name === "Biscuit" && a.source === "online");
  expect(mine?.pet?.handlingNote).toMatch(/Nervous at the dryer/);
});

test("the pet page's Book groom opens a new appointment for that dog", async ({ page }) => {
  const owner = await login("owner+pawsh-grooming@example.com");
  const m = await shopOf(owner);
  const id = await petId(owner, m, "Biscuit");
  await signIn(page, "owner+pawsh-grooming@example.com");
  await page.goto(`/m/${m}/pets/${id}`);
  await page.getByRole("link", { name: "Book groom" }).click();
  await page.waitForURL(/\/calendar\?newFor=/);
  await expect(page.getByRole("heading", { name: "New appointment" })).toBeVisible();
  await expect(page.getByLabel("Dog")).toHaveValue(id);
  await expect(page.getByText(/Biscuit is a medium dog: prices for that size are shown/)).toBeVisible();
  await page.screenshot({ path: shot("05-new-appointment-dog-1440") });
});

test("the run-out text is the customer's own switch, with their yes spelled out beside it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/food");
  await fillPhone(page, "6475551000");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My food cards" })).toBeVisible();
  await expect(page.getByText(/Switching this on is your yes to one text from Tail & Kibble/).first()).toBeVisible();
  await page.screenshot({ path: shot("m4-food-consent-390"), fullPage: true });
});
