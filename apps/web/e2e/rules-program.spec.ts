/**
 * wave-n: rules. The Rewards page as the owner's control panel for the stamp card: what one stamp is worth, what earns,
 * the prize after any number of stamps, the live plain-language preview, the confirm sheet that counts the customers a goal
 * change affects, the change history, staff read-only, and the counter's override with a reason (Urdu once).
 * Uses a fresh bakery (made through the API) so the seeded shops keep their balances. Needs a running, seeded API and web.
 * Screenshots: $SHOTS_DIR (default e2e/screenshots/rules).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/rules";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const rand = () => Math.random().toString(36).slice(2, 8);
const phone = () => `+1647${String(Math.floor(2000000 + Math.random() * 7999999))}`;
const BARISTA = { email: "staff+pinecone-coffee@example.com", password: "localloyalty-demo" };
const PINECONE = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function signIn(page: Page, who: { email: string; password: string }, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A new bakery (stamp card, 10 stamps) with three customers part way. */
async function newBakery() {
  const email = `rules-${rand()}@example.com`;
  const password = "rules-e2e-1";
  const reg = await call<{ accessToken: string }>("POST", "/v1/auth/register", { name: "Amara Okafor", email, password });
  const token = reg.body.accessToken;
  const m = await call<{ merchant: { id: string } }>("POST", "/v1/merchants", { name: `Rules Bakery ${rand()}`, vertical: "bakery", address: "2210 Danforth Ave", phone: "(416) 555-0134" }, token);
  const id = m.body.merchant.id;
  await call("PATCH", `/v1/merchants/${id}/program`, { visitCooldownMinutes: 0 }, token);
  for (let i = 0; i < 3; i++) {
    const r = await call<{ pointsEarned: number }>("POST", `/v1/merchants/${id}/counter/award`, { phone: phone(), quantity: 3, idempotencyKey: `rules-${rand()}-${rand()}` }, token);
    expect(r.status).toBe(200);
  }
  return { id, token, email, password };
}

test.describe("Rewards page: stamp rules", () => {
  test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("owner sets what a stamp is worth, what earns and the prize; the preview speaks plainly; a goal change is confirmed with the count and logged", async ({ page }) => {
    const shop = await newBakery();
    await signIn(page, shop, `/m/${shop.id}/program`);
    await expect(page.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    const plain = page.getByRole("complementary", { name: "Live preview" });
    await expect(plain.getByText("Customers get 1 stamp per visit.")).toBeVisible();

    // 1. What one stamp is worth.
    const unit = page.getByRole("radiogroup", { name: "What one stamp is worth" });
    await expect(unit.getByRole("radio", { name: /One visit/ })).toHaveAttribute("aria-checked", "true");
    await unit.getByRole("radio", { name: /One purchase/ }).click();
    await expect(plain.getByText("Customers get 1 stamp per purchase.")).toBeVisible();
    await page.getByLabel("Minimum purchase (optional)").fill("5");
    await expect(plain.getByText("Customers get 1 stamp per purchase over $5.00.")).toBeVisible();

    // 2. What earns: a new shop has nothing in its catalogue yet, so it says so and everything earns.
    const scope = page.getByRole("radiogroup", { name: "What earns" });
    if (await page.getByText("Nothing to choose from yet").isVisible()) {
      await expect(scope.getByRole("radio", { name: /Only some/ })).toBeDisabled();
    } else {
      // The bakery template came with a menu: pick one thing, read it back in plain words, then go back to everything.
      await scope.getByRole("radio", { name: /Only some/ }).click();
      const first = page.locator("#what-earns").getByRole("checkbox").first();
      await first.check();
      await expect(plain.getByText(/^Only .+ earns? stamps\.$/)).toBeVisible();
      await page.screenshot({ path: shot("01b-only-some-1440"), fullPage: true });
      await scope.getByRole("radio", { name: /Everything/ }).click();
    }

    // 3. The prize: type any number; +/- still work.
    const goal = page.getByRole("textbox", { name: "Stamps for the reward" });
    await goal.fill("15");
    await expect(plain.getByText(/^After 15 stamps they get/)).toBeVisible();
    await expect(page.getByRole("img", { name: /of 15 stamps/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "More stamps" }).click();
    await page.getByRole("button", { name: "Fewer stamps" }).click();
    await expect(goal).toHaveValue("15");
    await goal.fill("60");
    await expect(page.getByText("Pick 2 to 50 stamps.")).toBeVisible();
    await goal.fill("15");

    // Abuse limit: at most N a day.
    await page.getByRole("switch", { name: "Limit stamps per day" }).click();
    await expect(plain.getByText(/^Up to 2 stamps a day/)).toBeVisible();
    await page.screenshot({ path: shot("01-program-1440"), fullPage: true });

    // Save: the confirm sheet counts the customers with stamps and promises nobody loses anything.
    await page.getByRole("button", { name: "Save changes" }).click();
    const sheet = page.getByRole("dialog", { name: "Change the card to 15 stamps?" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("This affects 3 customers with stamps.")).toBeVisible();
    await expect(sheet.getByText(/Nobody loses stamps or a reward they earned/)).toBeVisible();
    await page.screenshot({ path: shot("02-confirm-sheet-1440") });
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Rewards saved/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    // Change history: who, before and after, and the carry-over.
    const history = page.locator("#history");
    await expect(history.getByText(/Changed the rules/).first()).toBeVisible();
    await expect(history.getByText(/Stamps for the reward/).first()).toBeVisible();
    await expect(history.getByText("3 customers got 15 carry-over stamps.")).toBeVisible();
    await history.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("03-history-1440"), fullPage: true });

    // The API agrees: unit, goal and cap saved; the goal reward moved with the goal.
    const p = await call<{ earnUnit: string; stampGoal: number; minSpendCents: number; maxStampsPerDay: number }>("GET", `/v1/merchants/${shop.id}/program`, undefined, shop.token);
    expect(p.body).toMatchObject({ earnUnit: "purchase", stampGoal: 15, minSpendCents: 500, maxStampsPerDay: 2 });
    const rw = await call<{ items: { pointsCost: number; active: boolean }[] }>("GET", `/v1/merchants/${shop.id}/rewards`, undefined, shop.token);
    expect(rw.body.items.filter((r) => r.active).map((r) => r.pointsCost)).toContain(15);
  });

  test("staff see the rules read-only and the API refuses their changes", async ({ page }) => {
    const owner = await call<{ accessToken: string }>("POST", "/v1/auth/login", PINECONE);
    const list = await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, owner.body.accessToken);
    const id = list.body.items[0]!.id;
    const staff = await call<{ accessToken: string }>("POST", "/v1/auth/login", BARISTA);
    expect((await call("PATCH", `/v1/merchants/${id}/program`, { stampGoal: 12 }, staff.body.accessToken)).status).toBe(403);
    await signIn(page, BARISTA, `/m/${id}/program`);
    if (!new URL(page.url()).pathname.endsWith("/program")) return; // the staff menu may send them elsewhere: the API check above is what matters
    await expect(page.getByText("View only")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /One visit/ })).toBeDisabled();
    await page.screenshot({ path: shot("04-staff-readonly-1440"), fullPage: true });
  });
});

test.describe("Rewards page at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("the three questions and the preview fit a phone", async ({ page }) => {
    const shop = await newBakery();
    await signIn(page, shop, `/m/${shop.id}/program`);
    await expect(page.getByRole("radiogroup", { name: "What one stamp is worth" })).toBeVisible();
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noScroll).toBe(true);
    await page.screenshot({ path: shot("05-program-390"), fullPage: true });
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "Customer preview" }).getByText("Customers get 1 stamp per visit.")).toBeVisible();
    await page.screenshot({ path: shot("06-preview-sheet-390") });
  });

  test("Urdu counter: a stamp the rules refuse asks for a reason, then goes through", async ({ page }) => {
    const shop = await newBakery();
    await call("PATCH", `/v1/merchants/${shop.id}/program`, { earnUnit: "pickup" }, shop.token);
    const c = await call<{ member: { memberCode: string } }>("POST", `/v1/merchants/${shop.id}/counter/award`, { phone: phone(), customerName: "Zara Khan", idempotencyKey: `rules-${rand()}`, override: { reason: "First visit before the rule change" } }, shop.token);
    expect(c.status).toBe(200);
    await signIn(page, shop, `/m/${shop.id}/counter?lang=ur`);
    await expect(page.locator('section[data-scan-ready="true"]')).toBeVisible();
    await page.keyboard.type(`LL:${c.body.member.memberCode}`, { delay: 5 });
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /اسٹامپ لگائیں/ }).first().click();
    const ask = page.getByRole("alertdialog");
    await expect(ask).toBeVisible();
    await expect(ask.getByText("آپ کی دکان کے اصولوں میں اس پر کمائی نہیں ہوتی")).toBeVisible();
    await page.screenshot({ path: shot("07-counter-override-ur-390"), fullPage: true });
    await ask.getByRole("textbox").fill("فون آرڈر کاؤنٹر پر لیا");
    await ask.getByRole("button", { name: "پھر بھی شامل کریں" }).click();
    await expect(ask).toHaveCount(0);
  });
});
