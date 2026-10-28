/**
 * Class studios (docs/research/fitness-studios.md): the studio's schedule, roster, offers and members, door check-in, and
 * a customer who books a drop-in, buys an intro pack, joins a membership with the agreement and cancels inside the
 * 10-day window. Needs a running, seeded API and web (docs/engineering/web.md). Uses the seed studio Sakina Studio.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/classes, untracked output).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const OWNER = { email: "owner+sakina-studio@example.com", password: "localloyalty-demo" };
const SHOP = "sakina-studio";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/classes";
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function owner() {
  const { accessToken: token } = await call<{ accessToken: string }>("POST", "/v1/auth/login", OWNER);
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items.find((x) => x.slug === SHOP) ?? items[0]!;
  return { token, id: m.id, base: `/v1/merchants/${m.id}`, page: `/m/${m.id}` };
}

async function signInOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const newPhone = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

test.describe("the studio's side", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("schedule, add a weekly class, roster with a waitlist, offers and members", async ({ page }) => {
    const o = await owner();
    await signInOwner(page);
    await page.goto(`${o.page}/classes`);
    await expect(page.getByRole("heading", { level: 1, name: "Class schedule" })).toBeVisible();
    await expect(page.getByText("Booked this week")).toBeVisible();
    await expect(page.getByText("Women only").first()).toBeVisible();
    await page.screenshot({ path: shot("01-schedule-1440") });

    // Add a class that repeats for two weeks.
    await page.getByRole("button", { name: "Add class" }).first().click();
    const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Day", { exact: true }).fill(day);
    await page.getByLabel("Instructor").fill("E2E Instructor");
    await page.getByLabel("Repeat for this many weeks").fill("2");
    await page.getByRole("button", { name: "Add class" }).last().click();
    await expect(page.getByText("2 classes added")).toBeVisible({ timeout: 20_000 });

    // Open a class with a waitlist: Roster shows how each person paid and who is waiting.
    const sessions = await call<{ items: { id: string; name: string; waitlisted: number }[] }>("GET", `${o.base}/classes/sessions?from=${new Date().toISOString()}&to=${new Date(Date.now() + 14 * 86_400_000).toISOString()}`, undefined, o.token);
    const full = sessions.items.find((s) => s.waitlisted > 0)!;
    expect(full, "the seed has a full class with a waitlist").toBeTruthy();
    await page.goto(`${o.page}/classes/${full.id}`);
    await expect(page.getByRole("heading", { level: 1, name: full.name })).toBeVisible();
    await expect(page.getByText(/^Booked \d+ of \d+$/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Waitlist, \d+ people?$/ })).toBeVisible();
    await expect(page.getByText(/Free to cancel until/)).toBeVisible();
    await page.screenshot({ path: shot("02-roster-1440") });

    await page.goto(`${o.page}/classes/offers`);
    await expect(page.getByRole("heading", { level: 1, name: "Memberships & passes" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Unlimited monthly" })).toBeVisible();
    await expect(page.getByText("Intro: 3 classes")).toBeVisible();
    await page.screenshot({ path: shot("03-offers-1440") });
    await page.getByRole("radio", { name: /^Billing issues/ }).click();
    await expect(page.getByText("Payment failed").first()).toBeVisible();
    await page.screenshot({ path: shot("03b-billing-issues-1440") });
  });

  test("door check-in by phone: a member who is not booked is added and checked in once", async ({ page }) => {
    const o = await owner();
    const types = await call<{ items: { id: string }[] }>("GET", `${o.base}/classes/types`, undefined, o.token);
    const start = new Date(Date.now() + 20 * 60_000).toISOString();
    const made = await call<{ items: { id: string }[] }>("POST", `${o.base}/classes/sessions`, { classTypeId: types.items[0]!.id, startsAt: start, instructorName: "Door Test" }, o.token);
    const sessionId = made.items[0]!.id;
    await signInOwner(page);
    await page.goto(`${o.page}/classes/door?session=${sessionId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Door check-in" })).toBeVisible();
    await page.getByLabel("Member card, QR code or phone number").fill("+19055550602");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByText(/Added and checked in to/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Jasleen Gill" })).toBeVisible();
    await expect(page.getByText("+10 points")).toBeVisible();
    await page.screenshot({ path: shot("04-door-1440") });
    // Again: already in, no second award.
    await page.getByLabel("Member card, QR code or phone number").fill("+19055550602");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByText(/already checked in/)).toBeVisible({ timeout: 20_000 });
    // A bad entry is told plainly.
    await page.getByLabel("Member card, QR code or phone number").fill("123");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByText(/Scan a member card or type a 10-digit phone number/)).toBeVisible();
  });
});

test.describe("the member's side", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  test("book a drop-in, buy the intro offer, join a membership with the agreement, cancel inside the 10 days", async ({ page }) => {
    const noScroll = async () => {
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(sw).toBeLessThanOrEqual(iw + 1);
    };
    await page.goto(`/shops/${SHOP}/classes`);
    await expect(page.getByRole("heading", { level: 1, name: "classes" })).toBeVisible();
    await expect(page.getByText(/Some classes are women only/)).toBeVisible();
    await noScroll();
    await page.screenshot({ path: shot("05-schedule-390") });

    // A day with a class that has room. Start from the third day so a class that is about to start never decides the run.
    const days = page.getByRole("group", { name: "Classes" }).getByRole("button");
    const book = page.getByRole("button", { name: "Book", exact: true });
    let found = false;
    for (let i = 2; i < 14 && !found; i++) {
      await days.nth(i).click();
      found = (await book.count()) > 0;
    }
    expect(found, "a class with room in the next two weeks").toBe(true);
    await book.last().click();
    await expect(page.getByText("You will sign in with your phone first.")).toBeVisible();
    await expect(page.getByText(/Free to cancel until/)).toBeVisible();
    await expect(page.getByText(/women instructor and women members only|Women instructor and women members only/i).first()).toBeVisible();
    await page.screenshot({ path: shot("06-book-390") });

    // Sign in (new phone, the dev code is filled in), then book. Nothing to use yet, so the drop-in is offered.
    await page.getByRole("button", { name: "Book class" }).click();
    await page.locator("input[type=tel]").first().fill(newPhone());
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Book class" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Book class" }).click();
    await expect(page.getByText(/You need a pass or a membership for this class/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Pay \$\d+(\.\d\d)? and book$/ }).click();
    await expect(page.getByText(/We hold your spot for 10 minutes/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Pay \$\d+(\.\d\d)? and book$/ }).last().click();
    await expect(page.getByText("You are booked. See you there.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();

    // The intro offer, once.
    await page.getByRole("listitem").filter({ hasText: "Intro: 3 classes" }).getByRole("button", { name: "Buy" }).click();
    await page.getByRole("button", { name: /^Pay \$\d+(\.\d\d)?$/ }).click();
    await expect(page.getByText("Your pass is ready. Book a class.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Join the unlimited membership: the agreement first, the card after the box is ticked.
    await page.getByRole("button", { name: "Join" }).first().click();
    await expect(page.getByRole("heading", { name: "Read your agreement" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("MEMBERSHIP AGREEMENT")).toBeVisible();
    await expect(page.getByText(/full refund within 10 days/)).toBeVisible();
    await page.screenshot({ path: shot("08-agreement-390") });
    const pay = page.getByRole("button", { name: /^Pay \$[\d.]+ and start$/ });
    await expect(pay).toBeDisabled();
    await page.getByRole("checkbox").check();
    await pay.click();
    await expect(page.getByText("Test payment (development)")).toBeVisible({ timeout: 20_000 });
    await pay.last().click();
    await expect(page.getByText(/Your membership is active/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await page.goto("/me/classes");
    await expect(page.getByRole("heading", { level: 1, name: "passes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unlimited monthly" })).toBeVisible();
    await expect(page.getByText(/You can cancel for a full refund until/)).toBeVisible();
    await expect(page.getByText(/3 of 3 left|2 of 3 left/)).toBeVisible();
    await noScroll();
    await page.screenshot({ path: shot("07-passes-390") });

    // Cancel inside the window: everything goes back.
    await page.getByRole("button", { name: "Cancel membership" }).click();
    await expect(page.getByText(/everything you paid goes back to your card/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel membership" }).click();
    await expect(page.getByText(/Cancelled\. \$[\d.]+ goes back to your card/)).toBeVisible({ timeout: 20_000 });
  });
});
