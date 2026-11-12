/**
 * Marketing site and BIA console acceptance checks (docs/research/landing-and-network.md 7.4), against a seeded API.
 * Run with E2E_WEB_URL / E2E_API_URL (see docs/engineering/web.md). No screenshots are written to e2e/screenshots.
 */
import { expect, test, type Page } from "@playwright/test";
import { API, newPhone } from "./fixtures";

const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const TWO_STREETS = { email: "owner+hearth-and-crumb@example.com", password: "localloyalty-demo" };
const ONE_STREET = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type Creds = { email: string; password: string };
async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: T }> {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, json: (text ? JSON.parse(text) : undefined) as T };
}
const token = async (who: Creds) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", who)).json.accessToken;

async function signIn(page: Page, who: Creds, next = "/bia") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Visible text of the page, without scripts, for the "no invented data" checks. */
const visibleText = (page: Page) => page.locator("body").innerText();

let hoods: { id: string; slug: string; name: string }[] = [];
let adminToken = "";

test.beforeAll(async () => {
  adminToken = await token(ADMIN);
  hoods = (await call<{ items: typeof hoods }>("GET", "/v1/admin/neighbourhoods", undefined, adminToken)).json.items;
  const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
  const leslie = hoods.find((h) => h.slug === "leslieville")!;
  // Campaigns are open, the BIA has told us its member count, and two managers exist: one with two streets, one with one.
  await call("PUT", "/v1/admin/features/campaigns.neighbourhood/stage", { stage: "ga" }, adminToken);
  await call("PATCH", `/v1/admin/neighbourhoods/${ronc.id}`, { biaMemberCount: 74 }, adminToken);
  for (const [who, ids] of [[TWO_STREETS, [ronc.id, leslie.id]], [ONE_STREET, [ronc.id]]] as const)
    for (const id of ids) await call("POST", "/v1/admin/campaign-managers", { neighbourhoodId: id, email: who.email }, adminToken);
  // One live campaign on Roncesvalles, so the chart has a campaign week and the report has a campaign.
  const existing = (await call<{ items: { name: string }[] }>("GET", `/v1/campaigns?neighbourhoodId=${ronc.id}&limit=50`, undefined, adminToken)).json.items;
  if (!existing.some((c) => c.name === "E2E passport week")) {
    const now = Date.now();
    const c = (await call<{ id: string }>("POST", "/v1/campaigns", { neighbourhoodId: ronc.id, name: "E2E passport week", kind: "passport", startsAt: new Date(now - 2 * 86_400_000).toISOString(), endsAt: new Date(now + 5 * 86_400_000).toISOString(), goalVisits: 3, bonusPoints: 10 }, adminToken)).json;
    const shops = (await call<{ items: { id: string }[] }>("GET", `/v1/admin/neighbourhoods/${ronc.id}/merchants`, undefined, adminToken)).json.items;
    for (const s of shops.slice(0, 4)) await call("POST", `/v1/campaigns/${c.id}/merchants`, { merchantId: s.id }, adminToken);
    await call("POST", `/v1/campaigns/${c.id}/schedule`, undefined, adminToken);
  }
});

test.describe("landing", () => {
  test("sections in order, shop tiles into the card maker, one form, no POS logos or counter speed, no invented numbers", async ({ page }) => {
    await page.goto("/");
    const y = async (loc: ReturnType<Page["locator"]>) => (await loc.first().boundingBox())!.y;
    // Wave V (direction B): the card maker right under the hero, then how it works, what you get, the shop types, the plans.
    const order = [
      page.getByRole("heading", { level: 1 }),
      page.getByRole("region", { name: "Live counts" }),
      page.getByRole("heading", { name: "Make your card right here." }),
      page.getByRole("heading", { name: "Ready before the morning rush." }),
      page.getByRole("heading", { name: "What you get from the first stamp." }),
      page.getByRole("heading", { name: "Made for the main street." }),
      page.getByRole("heading", { name: "Free for loyalty, forever." }),
      page.getByRole("heading", { name: "How we compare." }),
      page.getByRole("heading", { name: "Questions, answered." }),
      page.getByRole("heading", { name: "Rather we set it up for you?" }),
      page.getByRole("heading", { name: "Your regulars are already here." }),
    ];
    const ys: number[] = [];
    for (const l of order) ys.push(await y(l));
    expect(ys, "sections appear in the specified order").toEqual([...ys].sort((a, b) => a - b));

    // The shop tiles: each one link into the card maker, preset to its trade; the other audiences one tap away.
    const shops = page.locator("#shops");
    await expect(shops.locator(".lp-tile")).toHaveCount(6);
    await expect(shops.getByRole("link", { name: /Make a repair shop card/ })).toHaveAttribute("href", "#try");
    await expect(shops.getByRole("link", { name: /Make a repair shop card/ })).toHaveAttribute("data-try-trade", "repair");
    await expect(shops.getByRole("navigation", { name: "Booking for" }).getByRole("link", { name: /Nail techs/ })).toHaveAttribute("href", "/for-nail-techs");
    await expect(shops.getByRole("link", { name: /Restaurants/ })).toHaveAttribute("href", "/for-restaurants");
    await expect(shops.getByRole("link", { name: /BIAs/ })).toHaveAttribute("href", "/for-bias");
    // Calls to action down the page (landing v4): every one carries data-cta.
    // Wave W: a next step after the shop tiles ("shops") and the closing band's second ask ("finaltry"), both up to the card maker.
    for (const c of ["hero", "how", "tryit", "outcomes", "pricing", "final", "sticky", "seepricing", "shops", "finaltry"]) await expect(page.locator(`[data-cta=${c}]`).first()).toBeAttached();
    for (const c of ["how", "shops", "finaltry"]) await expect(page.locator(`[data-cta=${c}]`)).toHaveAttribute("href", "#try");
    // Wave P: the page was cut down (facts strip, pass row and the separate Pro block are gone), so it has fewer asks.
    for (const gone of ["afterhero", "promos", "pro"]) await expect(page.locator(`[data-cta=${gone}]`)).toHaveCount(0);
    expect(await page.locator('main a[href^="/signup"]').count()).toBeLessThanOrEqual(8);
    // What it costs: "Free forever" in the hero (wave X: the first words of the line under its button); Pro's price and the struck
    // first-year price in the plans; never "founding".
    await expect(page.getByTestId("hero-price")).toHaveText("Free forever");
    const pro = page.locator("#pricing [data-plan=monthly]");
    await expect(pro).toContainText("Pro");
    await expect(pro).toContainText("$29");
    await expect(pro.locator("[data-plan=yearly] s")).toHaveText("$290");
    await expect(pro.locator("[data-plan=yearly]")).toContainText("$199 first year");
    await expect(page.locator("main")).not.toContainText(/founding/i);

    await expect(page.locator("form")).toHaveCount(1);
    // Wave V: sections below the first screen skip rendering (content-visibility: auto), and innerText leaves them out; render them all
    // so the checks below read the whole page.
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".lp-sec, .lp-try, .lp-final").forEach((e) => (e.style.contentVisibility = "visible")));
    const text = await visibleText(page);
    for (const gone of ["Works with your counter", "no POS? no problem", "At the counter", "phone number, tap, done", "get your shop on the street’s card"]) expect(text).not.toContain(gone);
    expect(text).not.toMatch(/Trusted by/i);
    expect(text).not.toMatch(/\b310\b|\b111\b/);
    expect(text).toContain("Sample data");
    // Facts strip is gone: its three numbers repeated the hero.
    await expect(page.getByText("a month, forever, for your loyalty program and its reports")).toHaveCount(0);
  });

  test("live proof shows the network's real counts", async ({ page }) => {
    // The home page is statically rendered and regenerated every 5 minutes, so it can trail the API. Compare what it
    // prints with the values it was rendered from (data-*), and check those against the API as of now: the suite
    // only ever adds shops and streets, so a render can be behind but never ahead.
    const plans = (await call<{ network: { activeMerchants: number; liveStreets: number; multiShopMemberPct: number } }>("GET", "/v1/public/plans")).json.network;
    await page.goto("/");
    const strip = page.getByRole("region", { name: "Live counts" });
    if (plans.activeMerchants < 10) {
      await expect(strip).toHaveCount(0);
      return;
    }
    await expect(strip, "rendered before the network reached 10 shops: rebuild the web app after seeding").toHaveCount(1);
    const n = await strip.evaluate((e) => ({ shops: Number(e.getAttribute("data-shops")), streets: Number(e.getAttribute("data-streets")), multi: Number(e.getAttribute("data-multi-pct")) }));
    expect(n.shops).toBeGreaterThanOrEqual(10);
    expect(n.shops).toBeLessThanOrEqual(plans.activeMerchants);
    expect(n.streets).toBeLessThanOrEqual(plans.liveStreets);
    await expect(strip).toContainText(n.shops.toLocaleString("en-CA"));
    await expect(strip).toContainText(n.streets.toLocaleString("en-CA"));
    await expect(strip).toContainText(`${Number.isInteger(n.multi) ? n.multi : n.multi.toFixed(1)}%`);
  });

  for (const [name, width] of [["390", 390], ["1440", 1440]] as const) {
    test(`no horizontal scroll at ${name}px on every marketing page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/pricing", "/for-restaurants", "/for-bias", "/for-bias/sample-report"]) {
        await page.goto(path);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("competitor table: named, dated and sourced", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("table", { name: /compared with SoPoints Free and Square Loyalty, as of/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "SoPoints Free" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "5%" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "from CA$60 per location" })).toBeVisible();
    await expect(page.getByRole("link", { name: "sopoints.com" })).toHaveAttribute("href", "https://sopoints.com/");
    await expect(page.getByRole("link", { name: "squareup.com/ca" })).toHaveAttribute("href", "https://squareup.com/ca/en/software/loyalty");
    await expect(page.getByText(/As of Oct 23, 2026/)).toBeVisible();
  });
});

test.describe("pricing", () => {
  test("paid cards show real prices in the text colour; compare is closed until ?compare=1", async ({ page }) => {
    await page.goto("/pricing");
    // Free, Pro and Studio as cards, Service as a line under them (pro-value.md §2.2); prices from PLANS through plan-copy.ts.
    const free = page.locator("#shops").getByText("$0", { exact: true }).first();
    const plus = page.locator("#shops [data-plan=plus]").getByText("$29", { exact: true });
    const studio = page.locator("#shops [data-plan=studio]").getByText("$59", { exact: true });
    const pro = page.locator("#shops [data-plan=pro]").getByText("$99", { exact: true });
    await expect(plus).toBeVisible();
    await expect(studio).toBeVisible();
    await expect(pro).toBeVisible();
    // Annual Pro's first-year price: the list price struck through, never called "founding".
    await expect(page.locator("#shops [data-plan=plus] s")).toHaveText("$290");
    await expect(page.locator("#shops [data-plan=plus]")).toContainText("$199");
    await expect(page.locator("#shops")).not.toContainText(/founding/i);
    const color = (l: typeof plus) => l.evaluate((e) => getComputedStyle(e).color);
    // Every price is the page's text colour, like the home page's plan cards: no accent colour and no subdued grey.
    expect(await color(pro)).toBe(await color(plus));
    expect(await color(studio)).toBe(await color(plus));
    expect(await color(plus)).toBe(await color(free));
    expect(await color(plus)).toBe(await page.locator("h1").evaluate((e) => getComputedStyle(e).color));
    // Trade tools self-serve: both paid plans can be bought today, so no pilot badge and a working Start button on each.
    const plans = (await call<{ items: { id: string; available: boolean }[] }>("GET", "/v1/public/plans")).json.items;
    expect(plans.filter((p) => p.id !== "free").every((p) => p.available)).toBe(true);
    await expect(page.locator("#shops").getByText("Early access")).toHaveCount(0);
    // Pro starts as the 14-day trial with no card (plain signup); Studio and Service open their checkout after signup.
    // The button labels are the home page's (lib/marketing/plan-copy.ts), and a shop reads the home page's plan words, not the booking ones.
    await expect(page.locator("#shops [data-plan=plus]").getByRole("link", { name: "Start your 14-day trial" })).toHaveAttribute("href", "/signup");
    await expect(page.locator("#shops [data-plan=studio]").getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup?plan=studio");
    await expect(page.locator("#shops [data-plan=free]")).toContainText("A complete loyalty program, free forever.");
    // (The three cards only: the closed "See everything in each plan" table below them lists every feature, calendars included.)
    for (const plan of ["free", "plus", "studio"]) await expect(page.locator(`#shops [data-plan=${plan}]`).first()).not.toContainText(/bookable calendar|per-chair/);
    await expect(page.locator("#booking-apps")).toHaveCount(0);
    await expect(page.getByTestId("booking-plans-link")).toHaveAttribute("href", "/pricing?for=booking#shops");
    await expect(page.locator("#shops").getByRole("link", { name: "Start Service" })).toHaveAttribute("href", "/signup?plan=pro");
    await expect(page.locator("#trades")).toContainText("Pharmacies");
    await expect(page.getByTestId("compare")).not.toHaveAttribute("open", "");
    await page.goto("/pricing?compare=1");
    await expect(page.getByTestId("compare")).toHaveAttribute("open", "");
    await expect(page.getByRole("table", { name: "Compare plans" })).toBeVisible();
  });

  test("audience chips reach the restaurant and BIA sections", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByRole("link", { name: "I run a restaurant" }).click();
    await expect(page).toHaveURL(/for=restaurant#restaurants/);
    await expect(page.locator("#restaurants")).toBeInViewport();
    await expect(page.getByRole("link", { name: "I run a restaurant" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "I run a BIA" }).click();
    await expect(page.locator("#bias")).toBeInViewport();
    await expect(page.locator("#bias")).toContainText("$1,500");
  });

  test("savings calculator: $5,000 reads $400 to $500 pickup and up to $1,450 delivery, sourced, no drivers", async ({ page }) => {
    // Wave P: /pricing shows one audience at a time; the calculator is in the restaurant view.
    await page.goto("/pricing?for=restaurant");
    await expect(page.getByTestId("calc-pickup")).toHaveText("$400 to $500");
    await expect(page.getByTestId("calc-delivery")).toContainText("up to $1,450");
    await expect(page.getByTestId("calc-flat")).toContainText("$199");
    const note = page.locator("#math").getByText(/Sources: DoorDash Canada merchant pages/);
    await expect(note).toContainText("We do not run delivery drivers");
    await expect(note.getByRole("link", { name: "merchants.doordash.com/en-ca" })).toHaveAttribute("href", "https://merchants.doordash.com/en-ca");
    // The slider is in cents of monthly orders: $10,000.
    await page.getByLabel("Monthly orders you could move to your own page").evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "1000000");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.getByTestId("calc-pickup")).toHaveText("$800 to $1,000");
    await expect(page.getByTestId("calc-delivery")).toContainText("up to $2,900");
    const text = await visibleText(page);
    expect(text).not.toMatch(/15 to 30%|\$750 to \$1,500/);
    for (const q of ["Are the prices before HST?", "Pro or Studio?", "Is the restaurant plan a different plan?"]) await expect(page.getByText(q)).toBeVisible();
    await expect(page.getByText("they're coming soon")).toHaveCount(0);
  });
});

test.describe("for restaurants", () => {
  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("the content is in the page", async ({ page }) => {
      await page.goto("/for-restaurants");
      await expect(page.getByRole("heading", { level: 1, name: "Keep the whole order." })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Built for how a Desi kitchen runs." })).toBeVisible();
      await expect(page.locator("#festivals li").first()).toContainText(" · ");
      await expect(page.getByRole("heading", { name: "Flat prices, no commission." })).toBeVisible();
      await expect(page.getByText("Do you deliver?")).toBeVisible();
    });
  });

  for (const width of [390, 1440]) {
    test(`in Urdu the headline is legible and every section is translated at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/for-restaurants?lang=ur");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveText("پورا آرڈر اپنے پاس رکھیں۔");
      await page.evaluate(() => document.fonts.ready);
      // The Nastaliq lines must not print over each other, the chip above or the paragraph below.
      const boxes = await h1.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines: [number, number][] = [];
        for (const r of range.getClientRects()) if (!lines.some((l) => Math.abs(l[0] - r.top) < 4)) lines.push([r.top, r.bottom]);
        return { lines, above: el.previousElementSibling!.getBoundingClientRect().bottom, below: el.nextElementSibling!.getBoundingClientRect().top };
      });
      for (let i = 1; i < boxes.lines.length; i++) expect(boxes.lines[i]![0]).toBeGreaterThanOrEqual(boxes.lines[i - 1]![1] - 1);
      expect(boxes.lines[0]![0]).toBeGreaterThanOrEqual(boxes.above);
      expect(boxes.lines[boxes.lines.length - 1]![1]).toBeLessThanOrEqual(boxes.below);
      // The tab title, description and hreflang links follow the language.
      await expect(page).toHaveTitle(/ریستورانوں کے لیے/);
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(5);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/for-restaurants\?lang=ur$/);
      // Every section is in Urdu, not only the hero and the visit form: no English heading or paragraph is left between them.
      await expect(page.getByTestId("english-below")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "کوئی رش ہاتھ سے نہ جائے۔" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "وہ سوالات جو ریستوران پوچھتے ہیں۔" })).toBeVisible();
      await expect(page.getByRole("button", { name: "کیا آپ ڈیلیوری کرتے ہیں؟" })).toBeVisible();
      const english = await page.locator("main :is(h2, h3, p, li, summary, button)").evaluateAll((els) =>
        els.filter((el) => !el.closest('[lang^="en"]') && /^[A-Za-z][A-Za-z ,.'’-]{14,}$/.test((el.textContent ?? "").trim())).map((el) => (el.textContent ?? "").trim().slice(0, 60)),
      );
      expect(english).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }

  test("founding strip shows the API's spots; Urdu sample reads right to left; no WhatsApp button without a number", async ({ page }) => {
    const founding = (await call<{ corridors: { name: string; taken: number; total: number }[] }>("GET", "/v1/public/restaurants/corridors")).json.corridors;
    await page.goto("/for-restaurants");
    const open = founding.filter((c) => c.total - c.taken > 0).sort((a, b) => b.total - b.taken - (a.total - a.taken) || a.name.localeCompare(b.name));
    if (open.length) await expect(page.getByTestId("founding-headline")).toHaveText(`${open[0]!.total - open[0]!.taken} of ${open[0]!.total} first-year offer spots left on ${open[0]!.name}`);
    else await expect(page.getByTestId("founding-headline")).toHaveCount(0);
    const ticket = page.getByTestId("kitchen-ticket");
    await expect(ticket).toContainText("چکن بریانی");
    expect(await ticket.evaluate((e) => e.closest("[dir]")?.getAttribute("dir"))).toBe("rtl");
    expect(await ticket.evaluate((e) => e.closest("[lang]")?.getAttribute("lang"))).toMatch(/^ur/);
    // No NEXT_PUBLIC_WHATSAPP_NUMBER in this build: the WhatsApp button is hidden, never a placeholder link.
    await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("the hero line, nav labels and form switch to Urdu with right-to-left layout", async ({ page }) => {
    await page.goto("/for-restaurants?lang=ur");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("پورا آرڈر اپنے پاس رکھیں۔");
    expect(await page.getByRole("heading", { level: 1 }).evaluate((e) => e.closest("[dir]")?.getAttribute("dir"))).toBe("rtl");
    await expect(page.getByRole("banner").getByRole("link", { name: "ریستورانوں کے لیے" })).toBeVisible();
    await expect(page.getByRole("button", { name: "میرا وزٹ بک کریں" })).toBeVisible();
    await page.goto("/for-restaurants?lang=hi");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("पूरा ऑर्डर अपने पास रखिए।");
  });

  test("submitting the form creates a restaurant lead in the chosen language", async ({ page }) => {
    const name = `Karahi House ${Date.now() % 100000}`;
    const phone = newPhone();
    await page.goto("/for-restaurants");
    const form = page.locator("#book form");
    await form.getByLabel("Your name").fill("Imran");
    await form.getByLabel("Restaurant").fill(name);
    await form.getByLabel("Phone").fill(phone);
    await form.getByLabel("Language").selectOption("ur");
    await form.getByRole("button", { name: "Book my visit" }).click();
    await expect(page.getByText("Thanks. We will call or message you within 1 business day.")).toBeVisible();
    const leads = (await call<{ items: { businessName: string; language: string | null; vertical: string | null; stage: string }[] }>("GET", `/v1/rep/leads?q=${encodeURIComponent(name)}`, undefined, adminToken)).json.items;
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ businessName: name, language: "ur", vertical: "restaurant", stage: "new" });
  });

  test("a phone number is required", async ({ page }) => {
    await page.goto("/for-restaurants");
    const form = page.locator("#book form");
    await form.getByLabel("Your name").fill("Imran");
    await form.getByLabel("Restaurant").fill("No Phone Kitchen");
    await form.getByRole("button", { name: "Book my visit" }).click();
    await expect(form.getByText("Enter a 10-digit mobile number.")).toBeVisible();
  });
});

test.describe("marketing language scope", () => {
  // docs/research/landing-and-network.md 7.3: the marketing site is English; only /for-restaurants has translated content.
  for (const path of ["/", "/pricing", "/for-bias"]) {
    test(`${path} stays English with ?lang= and a saved language, and shows no language switcher or lang link`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "ll_lang", value: "ur", url: baseURL! }]);
      const english = await (async () => {
        await page.goto(path);
        return page.getByRole("heading", { level: 1 }).innerText();
      })();
      await page.goto(`${path}?lang=hi`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(english);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("en-CA");
      await expect(page.getByRole("banner").getByText("Language", { exact: false })).toHaveCount(0);
      await expect(page.locator('a[href*="lang="]')).toHaveCount(0);
      await expect(page.locator('[dir="rtl"]')).toHaveCount(0);
      await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    });
  }

  test("/for-restaurants works in all four languages with a switcher that links to each", async ({ page }) => {
    const h1 = { en: "Keep the whole order.", hi: "पूरा ऑर्डर अपने पास रखिए।", ur: "پورا آرڈر اپنے پاس رکھیں۔", pa: "ਪੂਰਾ ਆਰਡਰ ਆਪਣੇ ਕੋਲ ਰੱਖੋ।" } as const;
    for (const [code, title] of Object.entries(h1)) {
      await page.goto(`/for-restaurants?lang=${code}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      const rtl = code === "ur";
      expect(await page.getByRole("heading", { level: 1 }).evaluate((e) => e.closest("[dir]")?.getAttribute("dir") ?? "ltr")).toBe(rtl ? "rtl" : "ltr");
      const links = page.locator('header a[href^="/for-restaurants?lang="]');
      expect(await links.evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")))].sort())).toEqual(["/for-restaurants?lang=en", "/for-restaurants?lang=hi", "/for-restaurants?lang=pa", "/for-restaurants?lang=ur"]);
    }
  });
});

test.describe("for BIAs", () => {
  test("the sample board report is labelled, prices match the packages, and the form takes a board meeting date", async ({ page }) => {
    await page.goto("/for-bias");
    await expect(page.getByRole("heading", { level: 1, name: "Show your board what the street event did." })).toBeVisible();
    const card = page.locator("figure", { hasText: "Sample data" }).first();
    await expect(card).toContainText("Sample data");
    await expect(card).toContainText("+38%");
    for (const price of ["$1,500", "$2,250", "$3,000"]) await expect(page.locator("#packages")).toContainText(price);
    await expect(page.getByRole("link", { name: "Get the grant-ready one-pager" })).toHaveAttribute("href", "/for-bias/one-pager");

    const bia = `Test Street BIA ${Date.now() % 100000}`;
    const soon = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const form = page.locator("#talk form");
    await form.getByLabel("BIA name").fill(bia);
    await form.getByLabel("Your name", { exact: true }).fill("Maya Chen");
    await form.getByLabel("Your role").fill("Executive director");
    await form.getByLabel("Email").fill("maya@example.com");
    await form.getByLabel("Next board meeting").fill(soon);
    await form.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thanks. We’ll get back to you within 1 business day.")).toBeVisible();
    const leads = (await call<{ items: { businessName: string; boardMeetingAt: string | null; contactRole: string | null }[] }>("GET", `/v1/rep/leads?q=${encodeURIComponent(bia)}`, undefined, adminToken)).json.items;
    expect(leads[0]).toMatchObject({ businessName: bia, boardMeetingAt: soon, contactRole: "Executive director" });
    // The rep inbox shows the board date and flags it as inside 30 days.
    await signIn(page, ADMIN, "/rep/leads");
    await page.getByRole("radio", { name: "List" }).or(page.getByRole("button", { name: "List" })).first().click();
    await expect(page.getByRole("row", { name: new RegExp(bia) })).toContainText("(soon)");
  });

  test("the sample report page prints and the one-pager reads from the package constants", async ({ page }) => {
    await page.goto("/for-bias/sample-report");
    await expect(page.getByText("Sample data").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
    await page.goto("/for-bias/one-pager");
    await expect(page.getByText("$2,250")).toBeVisible();
  });
});

test.describe("BIA console", () => {
  test("a manager of two streets sees the switcher with only their streets; an admin sees every street", async ({ page }) => {
    await signIn(page, TWO_STREETS);
    const sw = page.getByRole("complementary").getByLabel("Neighbourhood");
    await expect(sw).toBeVisible();
    await expect(sw.locator("option")).toHaveCount(2);
    const mine = await sw.locator("option").allTextContents();
    expect(new Set(mine).size).toBe(2);
    const all = (await call<{ items: { biaName: string | null; name: string }[] }>("GET", "/v1/me/neighbourhoods-managed", undefined, adminToken)).json.items;
    expect(all.length).toBeGreaterThan(2);
    await page.context().clearCookies();
    await signIn(page, ADMIN);
    await page.goto("/bia");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByRole("complementary").getByLabel("Neighbourhood").locator("option")).toHaveCount(all.length);
    // A manager of one street gets plain text, no switcher.
    await page.context().clearCookies();
    await signIn(page, ONE_STREET);
    await expect(page.getByRole("complementary").getByLabel("Neighbourhood")).toHaveCount(0);
    await expect(page.getByRole("complementary")).toContainText("Roncesvalles");
  });

  test("overview numbers add up, campaign weeks are the only accent, the four gates are listed", async ({ page }) => {
    const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
    await page.addInitScript((id) => localStorage.setItem("ll.bia.neighbourhood", id), ronc.id);
    await signIn(page, ONE_STREET);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByText(/of 74 members/)).toBeVisible();
    // Main Street Warm: the key numbers are pastel tiles (label paragraph, then the big number), not a description list.
    const visits = Number((await page.getByRole("group", { name: "Street key numbers" }).locator("p").filter({ hasText: /^Visits$/ }).locator("xpath=following-sibling::div[1]/p[1]").innerText()).replace(/\D/g, ""));
    // The stat is the sum of the shops table (View all shows every row).
    await page.goto("/bia/shops");
    await expect(page.getByRole("heading", { name: /shops on / })).toBeVisible();
    const rows = page.getByTestId("shops-table").locator("tbody tr");
    const n = await rows.count();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number((await rows.nth(i).locator("td").nth(-2).innerText()).replace(/\D/g, ""));
    expect(sum).toBe(visits);
    // Not-activated shops come first.
    await expect(rows.first().locator("td").first()).not.toContainText("Activated");
    await page.getByRole("button", { name: /^Activated/ }).or(page.getByRole("radio", { name: /^Activated/ })).first().click();
    await expect(page.getByTestId("shops-table").getByText("Onboarding")).toHaveCount(0);

    await page.goto("/bia");
    const bars = page.getByTestId("visits-chart").locator("[data-campaign-week]");
    await expect(bars).toHaveCount(12);
    const weeks = await bars.evaluateAll((els) => els.map((e) => ({ campaign: e.getAttribute("data-campaign-week") === "true", bg: getComputedStyle(e).backgroundColor })));
    expect(weeks.some((w) => w.campaign)).toBe(true);
    const accent = weeks.find((w) => w.campaign)!.bg;
    const black = weeks.find((w) => !w.campaign)!.bg;
    expect(accent).not.toBe(black);
    for (const w of weeks) expect(w.bg).toBe(w.campaign ? accent : black);

    const gates = page.getByRole("region", { name: "Campaigns unlock" });
    await expect(gates.getByRole("listitem")).toHaveCount(4);
    for (const t of ["Live for 6 months", "20 active shops", "1,500 active shoppers", "25% shop at 2 or more"]) await expect(gates).toContainText(t);
    const status = await page.getByTestId("unlock-status").innerText();
    expect(status).toMatch(/^(Ready|\d to go)$/);
    if (status === "Ready") expect(await gates.innerText()).not.toMatch(/to go/);
    await expect(page.getByRole("region", { name: "Campaigns", exact: true }).getByText("E2E passport week")).toBeVisible();
  });

  test("the old /bia/<campaign> link redirects and 'came back within 30 days' shows its date", async ({ page }) => {
    const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
    const list = (await call<{ items: { id: string; name: string }[] }>("GET", `/v1/campaigns?neighbourhoodId=${ronc.id}&limit=50`, undefined, adminToken)).json.items;
    const c = list.find((x) => x.name === "E2E passport week")!;
    await signIn(page, ONE_STREET, `/bia/${c.id}`);
    await expect(page).toHaveURL(new RegExp(`/bia/campaigns/${c.id}$`));
    await expect(page.getByText("came back within 30 days", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Available [A-Z][a-z]{2} \d{1,2}$/)).toBeVisible();
  });

  test("overview and report responses are aggregates only", async () => {
    const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
    const t = await token(ONE_STREET);
    for (const url of [`/v1/neighbourhoods/${ronc.id}/overview`, `/v1/neighbourhoods/${ronc.id}/report`]) {
      const body = JSON.stringify((await call("GET", url, undefined, t)).json);
      expect(body).not.toMatch(/"(userId|memberId|memberCode|phone|email|customerId|firstName|maskedPhone)"/);
      expect(body).not.toMatch(/\+1\d{10}|\b\d{3}[ -]?555[ -]?\d{4}\b/);
    }
    const csv = await fetch(`${API}/v1/neighbourhoods/${ronc.id}/report?format=csv`, { headers: { authorization: `Bearer ${t}` } });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const other = hoods.find((h) => h.slug !== "roncesvalles" && h.slug !== "leslieville")!;
    expect((await call("GET", `/v1/neighbourhoods/${other.id}/overview`, undefined, t)).status).toBe(403);
  });

  test("the print view fits one Letter page", async ({ page }) => {
    const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
    await signIn(page, ONE_STREET);
    const q = new URLSearchParams({ n: ronc.id, from: "2026-10-01T04:00:00.000Z", to: "2027-01-01T05:00:00.000Z", label: "Q4 2026" });
    await page.goto(`/bia/reports/print?${q}`);
    await expect(page.getByTestId("print-report")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(1);
  });

  test("a street whose campaigns are not open yet still shows the coming-soon state", async ({ page }) => {
    await call("PUT", "/v1/admin/features/campaigns.neighbourhood/stage", { stage: "hidden" }, adminToken);
    try {
      await signIn(page, ONE_STREET);
      await expect(page.getByText("Neighbourhood campaigns are coming soon")).toBeVisible();
      await page.goto("/bia/shops");
      await expect(page.getByText("Neighbourhood campaigns are coming soon")).toBeVisible();
    } finally {
      await call("PUT", "/v1/admin/features/campaigns.neighbourhood/stage", { stage: "ga" }, adminToken);
    }
  });

  test("on a phone the shops Status column hides and the tab bar mirrors the sidebar", async ({ page }) => {
    const ronc = hoods.find((h) => h.slug === "roncesvalles")!;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((id) => localStorage.setItem("ll.bia.neighbourhood", id), ronc.id);
    await signIn(page, ONE_STREET);
    const tabs = page.getByRole("navigation", { name: "Sections" });
    await expect(tabs.getByRole("link")).toHaveText(["Overview", "Campaigns", "Shops", "Reports"]);
    await tabs.getByRole("link", { name: "Shops" }).click();
    await expect(page.getByTestId("shops-table")).toBeVisible();
    await expect(page.getByTestId("shops-table").getByRole("columnheader", { name: "Status" })).toBeHidden();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
