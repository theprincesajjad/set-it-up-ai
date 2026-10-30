/**
 * Pro value P7 · the in-product upgrade moments (docs/business/pro-value.md §5.1 to §5.3), audited end to end.
 *
 * Free shop (Rangrez Beauty Studio, seeded): each §5.1 line renders on its screen with its own count (a waitlist ask made here, a full
 * day looked at here), every "See Pro" goes to billing with Pro preselected, and the price comes from PLANS.
 * Trial shop (a new nail tech whose trial is started through the API, no card): the same screens carry none of the locked lines, and
 * Today shows the trial start card; with the shop's trial at day 11 (the usage answer moved three days from the end, because the clock
 * lives on the server) the card says "Pro ends {weekday}." with Keep Pro.
 * At 390 and 1440. Needs a running, seeded API and web (e2e/run-all.sh). Screenshots go to $E2E_SHOTS (default e2e/screenshots/pro-p7).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/pro-p7";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const DEMO_PASSWORD = "localloyalty-demo";
const TRIAL_PASSWORD = "localloyalty-e2e-moments";
const FREE = { email: "owner+rangrez-beauty-studio@example.com", slug: "rangrez-beauty-studio" };
const SIZES = [
  { w: 390, h: 844 },
  { w: 1440, h: 900 },
];

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function freeShop(): Promise<{ token: string; id: string }> {
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/login", { email: FREE.email, password: DEMO_PASSWORD });
  const { items } = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  return { token: accessToken, id: items[0]!.id };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A client asks for a spot through the public waitlist (what "Full. Tell me if a spot opens" sends). */
async function askForASpot(): Promise<void> {
  const pub = await call<{ services: { id: string }[] }>("GET", `/v1/public/shops/${FREE.slug}/services`);
  await call("POST", `/v1/public/shops/${FREE.slug}/waitlist`, { serviceId: pub.services[0]!.id, windowStart: day(1), windowEnd: day(7), timePref: "any", name: "Ayesha K", email: `ayesha+${Date.now()}@example.com` });
}

/** Block every stylist on the next open day and look at it, so the week has a full day people looked at and left. */
async function makeFullDay(f: { token: string; id: string }): Promise<void> {
  const pub = await call<{ services: { id: string }[]; staff: { id: string }[] }>("GET", `/v1/public/shops/${FREE.slug}/services`);
  const q = (d: string) => `serviceIds=${pub.services[0]!.id}&staffId=any&from=${d}&to=${d}`;
  let open: string | null = null;
  for (let n = 1; n <= 14 && !open; n++) {
    const av = await call<{ days: { date: string; times: unknown[] }[] }>("GET", `/v1/public/shops/${FREE.slug}/availability?${q(day(n))}`);
    if (av.days[0]!.times.length) open = day(n);
  }
  if (!open) return;
  for (const s of pub.staff) {
    await call("POST", `/v1/merchants/${f.id}/staff/${s.id}/time-off`, { startsAt: `${open}T00:00:00Z`, endsAt: `${open}T23:59:59Z`, reason: "e2e full day" }, f.token).catch(() => undefined);
    await call("POST", `/v1/merchants/${f.id}/staff/${s.id}/time-off`, { startsAt: `${open}T05:00:00Z`, endsAt: `${open}T23:00:00Z`, reason: "e2e full day" }, f.token).catch(() => undefined);
  }
  await call("GET", `/v1/public/shops/${FREE.slug}/availability?${q(open)}`);
}

/** A new nail tech on her 14-day Pro trial, with one service so the booking screens have something to show. */
async function trialShop(): Promise<{ email: string; id: string; token: string }> {
  const email = `moments+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const { accessToken } = await call<{ accessToken: string }>("POST", "/v1/auth/register", { email, password: TRIAL_PASSWORD, name: "Priya Shah" });
  const made = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: "Priya Nails", vertical: "nails", address: "22 Gerrard St E", phone: "(416) 555-0177" }, accessToken);
  await call("POST", `/v1/merchants/${made.merchant.id}/billing/trial`, {}, accessToken);
  return { email, id: made.merchant.id, token: accessToken };
}

/** The PlanLine's "See Pro" link inside `scope` opens billing with Pro preselected. */
async function seeProOpensBilling(page: Page, scope: ReturnType<Page["getByTestId"]>, base: string) {
  const link = scope.getByRole("link", { name: "See Pro" }).first();
  await expect(link).toHaveAttribute("href", `${base}/billing?plan=plus`);
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

test.describe("Free shop: every §5.1 moment with its count and See Pro", () => {
  test.beforeAll(async () => {
    const f = await freeShop();
    await askForASpot();
    await makeFullDay(f);
  });

  for (const { w, h } of SIZES) {
    test(`Today, Waitlist, Services, Settings > Reviews and Promos at ${w}`, async ({ page }) => {
      const f = await freeShop();
      const base = `/m/${f.id}`;
      await page.setViewportSize({ width: w, height: h });
      await signIn(page, FREE.email, DEMO_PASSWORD);

      // Today, This week: "{day} was full. {n} people looked and left. Pro keeps them on a waitlist." with one See Pro.
      await page.goto(`${base}?theme=clear`);
      const locked = page.getByTestId("week-locked");
      await expect(locked).toContainText(/was full\. \d+ (people|person) looked and left\. Pro keeps them on a waitlist\./);
      await expect(locked).toContainText(/in your inbox every .+, on Pro\./);
      await seeProOpensBilling(page, locked, base);
      await expect(page.getByTestId("trial-card")).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: shot(`free-today-${w}`), fullPage: true });

      // Waitlist page: "{n} waiting. Pro offers open slots to them automatically, with a two-hour hold."
      await page.goto(`${base}/waitlist?theme=clear`);
      const main = page.locator("main");
      await expect(main).toContainText(/\d+ waiting\. Pro offers open slots to them automatically, with a two-hour hold\./);
      await expect(main.getByRole("link", { name: "See Pro" }).first()).toHaveAttribute("href", `${base}/billing?plan=plus`);
      await noOverflow(page);
      await page.screenshot({ path: shot(`free-waitlist-${w}`), fullPage: true });

      // Services, Add-ons: the trade's examples and "On Pro, clients add them when they book, and the time is blocked for you."
      await page.goto(`${base}/services?theme=clear`);
      const addOns = page.getByTestId("add-ons-plan-line");
      await expect(addOns).toContainText("On Pro, clients add them when they book, and the time is blocked for you.");
      await seeProOpensBilling(page, addOns, base);
      await page.screenshot({ path: shot(`free-services-${w}`), fullPage: true });

      // Settings > Reviews: the switch is locked behind the plan line with the price from PLANS.
      await page.goto(`${base}/settings/reviews?theme=clear`);
      const reviews = page.getByTestId("review-locked");
      await expect(reviews).toContainText("$29 a month.");
      await seeProOpensBilling(page, reviews, base);
      await page.screenshot({ path: shot(`free-reviews-${w}`), fullPage: true });

      // Settings > Messages: the rows that reach review requests and the weekly goal.
      await page.goto(`${base}/settings?tab=messages&theme=clear`);
      await expect(page.getByRole("link", { name: /Review requests/ })).toHaveAttribute("href", `${base}/settings/reviews`);
      await expect(page.getByRole("link", { name: /Weekly goal/ })).toHaveAttribute("href", `${base}/settings/goal`);

      // Promos: "4 a month on Pro" with See Pro.
      await page.goto(`${base}/messages/promos?theme=clear`);
      const picker = page.getByTestId("promo-picker");
      await expect(picker).toContainText("$29 a month.");
      await seeProOpensBilling(page, picker, base);

      // The link lands on billing with Pro picked for you.
      await picker.getByRole("link", { name: "See Pro" }).first().click();
      await expect(page).toHaveURL(new RegExp(`${base}/billing\\?plan=plus$`));
      await expect(page.getByTestId("billing-plans").locator("[data-plan=plus]")).toContainText("Picked for you");
      await expect(page.getByTestId("billing-plans").locator("[data-plan=plus]")).toContainText("$29");
      await expect(page.getByTestId("billing-plans").locator("[data-plan=studio]")).toContainText("$59");
      await page.screenshot({ path: shot(`free-billing-${w}`), fullPage: true });
    });
  }
});

test.describe("Trial shop: no locked lines, and the Today card", () => {
  for (const { w, h } of SIZES) {
    test(`start card, the Pro screens unlocked, and day 11 at ${w}`, async ({ page }) => {
      const shop = await trialShop();
      const base = `/m/${shop.id}`;
      await page.setViewportSize({ width: w, height: h });
      await signIn(page, shop.email, TRIAL_PASSWORD);

      await page.goto(`${base}?theme=clear`);
      const card = page.getByTestId("trial-card");
      await expect(card).toHaveAttribute("data-moment", "start");
      await expect(card).toContainText("Your link is live. Pro is on for 14 days, free.");
      await expect(card).toContainText("No card, nothing to cancel.");
      await expect(card.getByRole("link", { name: "Set a weekly goal" })).toHaveAttribute("href", `${base}/settings/goal`);
      await expect(page.getByTestId("week-locked")).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: shot(`trial-today-${w}`), fullPage: true });

      // The money features are on: no plan line on Services (add-ons) or Settings > Reviews.
      await page.goto(`${base}/services?theme=clear`);
      await expect(page.getByTestId("add-ons")).toBeVisible();
      await expect(page.getByTestId("add-ons-plan-line")).toHaveCount(0);
      await page.goto(`${base}/settings/reviews?theme=clear`);
      await expect(page.getByTestId("review-settings")).toBeVisible();
      await expect(page.getByTestId("review-locked")).toHaveCount(0);

      // Day 11: the trial's end is three days away. The days left are counted on the server, so the usage answer is moved to it.
      const endsAt = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
      await page.route("**/billing/usage", async (route) => {
        const res = await route.fetch();
        const body = (await res.json()) as { trial: { endsAt: string; daysLeft: number } | null };
        if (body.trial) body.trial = { ...body.trial, endsAt, daysLeft: 3 };
        await route.fulfill({ response: res, json: body });
      });
      await page.goto(`${base}?theme=clear`);
      const ending = page.getByTestId("trial-card");
      await expect(ending).toHaveAttribute("data-moment", "ending");
      const weekday = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "America/Toronto" }).format(new Date(endsAt));
      await expect(ending).toContainText(`Pro ends ${weekday}.`);
      // A brand-new shop has done nothing yet: the quiet line, with the price from PLANS.
      await expect(ending).toContainText("So far it's been quiet, which is normal in the first two weeks. Pro is $29 a month whenever you want it");
      await expect(ending.getByRole("link", { name: "Keep Pro" })).toHaveAttribute("href", `${base}/billing?plan=plus`);
      await page.screenshot({ path: shot(`trial-day11-${w}`), fullPage: true });
      await ending.getByRole("button", { name: "Let it end" }).click();
      await expect(page.getByTestId("trial-card")).toHaveCount(0);
    });
  }
});
