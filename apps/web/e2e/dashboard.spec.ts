/**
 * Merchant dashboard, web counter, rep console, admin rollout and BIA tools against a seeded API.
 * Screenshots → e2e/screenshots/dashboard/. Run with E2E_WEB_URL / E2E_API_URL (see docs/engineering/web.md).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";
import { useFreePlan } from "./freePlan";

const shot = (name: string) => `e2e/screenshots/dashboard/${name}.png`;
const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };
const REP = { email: "rep@localloyalty.example", password: "localloyalty-rep" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

// The seed makes this shop a pilot (paid features on); these checks are for the free plan.
let restorePilot: (() => Promise<void>) | undefined;
test.beforeAll(async () => {
  restorePilot = await useFreePlan(OWNER);
});
test.afterAll(async () => {
  await restorePilot?.();
});

async function signIn(page: Page, who: { email: string; password: string }, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function apiToken(who: { email: string; password: string }) {
  const r = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who) });
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function pineconeId(): Promise<string> {
  const t = await apiToken(OWNER);
  const r = await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${t}` } });
  return ((await r.json()) as { items: { id: string }[] }).items[0]!.id;
}

const randPhone = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

/** Pricing v2: paid features are hidden; a pilot override turns them on for one shop (and is removed after). */
async function pilot(merchantId: string, keys: string[], on: boolean) {
  const admin = await apiToken(ADMIN);
  for (const key of keys) {
    if (on)
      await fetch(`${API}/v1/admin/features/${key}/overrides`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${admin}` }, body: JSON.stringify({ merchantId, enabled: true, reason: "e2e pilot" }) });
    else await fetch(`${API}/v1/admin/features/${key}/overrides/${merchantId}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } });
  }
}



test("owner: home, onboarding checklist and setup guide", async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/m\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today at the counter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByLabel("Key numbers").getByText("Active members")).toBeVisible();
  // Free plan: paid tools are not in the sidebar; Home carries the one quiet upsell line.
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  for (const paid of ["Promos", "Discount cards", "Messages", "Orders"]) await expect(nav.getByRole("link", { name: paid })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Integrations" })).toBeVisible();
  await expect(page.getByText(/More with Café & Retail: promos, texts and POS sync · coming soon/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: shot("01-home"), fullPage: true });

  const base = new URL(page.url()).pathname;
  await page.goto(`${base}/setup?step=profile`);
  await expect(page.getByRole("heading", { name: "Your shop", exact: true })).toBeVisible();
  await page.getByLabel("About your shop").fill("Small-batch coffee and fresh croissants on Roncesvalles since 2014.");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("heading", { name: "Your program" })).toBeVisible();
  await expect(page.getByText(/Customers get 1 stamp per visit/)).toBeVisible();
  await page.screenshot({ path: shot("02-setup-program"), fullPage: true });
  await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.getByRole("heading", { name: "Your rewards" })).toBeVisible();
  await page.goto(`${base}/setup?step=qr_kit`);
  await expect(page.getByRole("heading", { name: "Print your QR stand" })).toBeVisible();
  await page.getByRole("button", { name: "I printed it" }).click();
  await expect(page.getByRole("heading", { name: "Your first 25 members" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Active members" })).toBeVisible();
  await page.screenshot({ path: shot("03-setup-first-members"), fullPage: true });
});

test("owner: web counter award, undo and repeat customer", async ({ page }) => {
  const id = await pineconeId();
  await signIn(page, OWNER, `/m/${id}/counter`);
  await expect(page.getByRole("heading", { level: 1, name: "Counter" })).toBeVisible();
  const phone = randPhone();
  await page.getByLabel("Phone, last 4 digits or member code").fill(phone);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/New customer/)).toBeVisible();
  await page.screenshot({ path: shot("04-counter-new-customer"), fullPage: true });
  await page.getByLabel("First name (optional)").fill("Robin");
  await page.getByRole("button", { name: "Add and award" }).click();
  await expect(page.getByText(/^Added \d+ stamps?$/)).toBeVisible();
  await expect(page.getByText(/Robin has/)).toBeVisible();
  await page.screenshot({ path: shot("05-counter-awarded"), fullPage: true });
  await page.getByRole("button", { name: /^Undo · \d+s$/ }).click();
  await expect(page.getByRole("heading", { name: "Robin" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "How many" })).toBeVisible();
  await page.getByRole("radio", { name: "+2" }).click();
  await expect(page.getByRole("button", { name: "Add 2 stamps" })).toBeVisible();
  await page.screenshot({ path: shot("06-counter-member"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Phone, last 4 digits or member code")).toBeFocused();
});

test("owner: customers, detail and manual adjust", async ({ page }) => {
  const id = await pineconeId();
  await signIn(page, OWNER, `/m/${id}/customers`);
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Customers" }).getByRole("row").nth(1)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Filters" }).getByRole("radio", { name: "Reward ready" })).toBeVisible();
  // Messages consent filters only appear once marketing is on (Pricing v2).
  await expect(page.getByText(/Opted in to messages/)).toHaveCount(0);
  await page.screenshot({ path: shot("07-customers"), fullPage: true });
  await page.getByRole("table", { name: "Customers" }).getByRole("row").nth(1).click();
  const panel = page.getByRole("dialog", { name: "Customer" });
  await expect(panel.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]member=/);
  const before = Number.parseInt((await panel.getByText(/^\d+$/).first().textContent()) ?? "0", 10);
  await panel.getByRole("button", { name: /Adjust stamps/ }).click();
  const sheet = page.getByRole("dialog", { name: "Adjust stamps" });
  await sheet.getByLabel("Amount").fill("2");
  await sheet.getByLabel("Reason").selectOption("Missed at the counter");
  await expect(sheet.getByText(`New balance: ${before + 2}`)).toBeVisible();
  await page.screenshot({ path: shot("08-customer-adjust"), fullPage: true });
  await sheet.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText(new RegExp(`Added 2 stamps\\. New balance ${before + 2}`))).toBeVisible();
  await expect(panel.getByText(/Missed at the counter/).first()).toBeVisible();
  await page.screenshot({ path: shot("09-customer-detail"), fullPage: true });
  // The full page stays for deep links.
  await panel.getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
});

test("owner: program editor with live preview saves", async ({ page }) => {
  const id = await pineconeId();
  await signIn(page, OWNER, `/m/${id}/program`);
  await expect(page.getByRole("heading", { level: 1, name: "Program & rewards" })).toBeVisible();
  const preview = page.getByRole("group", { name: /Customer preview/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("img", { name: /of 10 stamps/ })).toBeVisible();
  await page.getByRole("button", { name: "More stamp goal" }).click();
  await expect(preview.getByRole("img", { name: /of 11 stamps/ })).toBeVisible();
  await expect(page.getByText("You have unsaved changes")).toBeVisible();
  await page.screenshot({ path: shot("10-program-editor"), fullPage: true });
  await page.getByRole("button", { name: "Save program" }).click();
  const confirm = page.getByRole("dialog", { name: "Customers will need more to reach a reward" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Save program" }).click();
  await expect(page.getByText("Program saved")).toBeVisible();
  await expect(page.getByText("You have unsaved changes")).toBeHidden();
  // Put it back so other runs see the template.
  await page.getByRole("button", { name: "Fewer stamp goal" }).click();
  await page.getByRole("button", { name: "Save program" }).click();
  await expect(page.getByText("Program saved")).toBeVisible();
});

test("owner: create and publish a promo (pilot override)", async ({ page }) => {
  const id = await pineconeId();
  // Locked: the deep link shows a quiet coming-soon page, not the editor.
  await signIn(page, OWNER, `/m/${id}/promos/new`);
  await expect(page.getByText("Coming with Café & Retail")).toBeVisible();
  await pilot(id, ["promos.basic", "promos.double_points"], true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Create a promo" })).toBeVisible();
  await page.getByRole("button", { name: "Double points" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Double stamps on slow afternoons");
  await page.getByLabel("Description (optional)").fill("Every weekday from 2 to 4 pm.");
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByLabel("From (time) (optional)").fill("14:00");
  await page.getByLabel("Until (time) (optional)").fill("16:00");
  await expect(page.getByRole("article", { name: "Double stamps on slow afternoons" })).toBeVisible();
  await page.screenshot({ path: shot("11-promo-editor"), fullPage: true });
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(page).toHaveURL(/\/promos\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Double stamps on slow afternoons" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: shot("12-promo-live"), fullPage: true });
  await pilot(id, ["promos.basic", "promos.double_points"], false);
});

test("owner: QR kit print page", async ({ page }) => {
  const id = await pineconeId();
  await signIn(page, OWNER, `/m/${id}/locations`);
  await expect(page.getByRole("heading", { level: 1, name: "Locations & QR kit" })).toBeVisible();
  await page.screenshot({ path: shot("13-locations"), fullPage: true });
  await page.getByRole("link", { name: "Print QR kit" }).first().click();
  await expect(page.getByRole("img", { name: /QR stand for Pinecone Coffee Co\./ })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code to join Pinecone Coffee Co\./ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await page.screenshot({ path: shot("14-qr-kit"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: shot("15-qr-kit-print-media"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
});

test("rep: pipeline and done-for-you merchant setup", async ({ page }) => {
  await signIn(page, REP);
  await expect(page).toHaveURL(/\/rep$/);
  await expect(page.getByRole("heading", { level: 1, name: /Today/ })).toBeVisible();
  await page.screenshot({ path: shot("16-rep-today"), fullPage: true });
  await page.goto("/rep/leads");
  await expect(page.getByRole("region", { name: "New" }).or(page.getByLabel("New", { exact: true })).first()).toBeVisible();
  await page.screenshot({ path: shot("17-rep-leads"), fullPage: true });

  await page.goto("/rep/new");
  const name = `Maple Leaf Books ${Date.now() % 100000}`;
  await page.getByLabel("Shop name").fill(name);
  await page.getByLabel("Street address").fill("123 Roncesvalles Ave");
  await page.getByLabel("Shop phone").fill(randPhone());
  await page.getByLabel("Neighbourhood").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Owner's name").fill("Jordan Lee");
  await page.getByLabel("Owner's mobile").fill(randPhone());
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Bookstore" }).click();
  await expect(page.getByRole("group", { name: /Customer preview/ })).toBeVisible();
  await page.screenshot({ path: shot("18-rep-template"), fullPage: true });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready to create" })).toBeVisible();
  await page.getByRole("button", { name: "Create merchant" }).click();
  await expect(page.getByRole("heading", { name: "QR kit" })).toBeVisible();
  await page.getByRole("button", { name: "Mark as delivered" }).click();
  // Next through the remaining steps (QR kit, train the staff) to the done screen.
  const live = page.getByRole("heading", { name: `${name} is live.` });
  for (let i = 0; i < 3 && !(await live.isVisible()); i++) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByRole("heading", { name: `${name} is live.` })).toBeVisible();
  await page.screenshot({ path: shot("19-rep-done"), fullPage: true });
  await page.getByRole("link", { name: "Open merchant" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await page.getByRole("link", { name: "QR kit" }).click();
  await expect(page.getByRole("img", { name: new RegExp(`QR stand for ${name}`) })).toBeVisible();
  await page.goto("/rep/merchants");
  await expect(page.getByRole("cell", { name })).toBeVisible();
  await page.screenshot({ path: shot("20-rep-merchants"), fullPage: true });
});

test("admin: flip a paid feature to beta, override a pilot shop, merchant nav changes", async ({ page, browser }) => {
  const id = await pineconeId();
  // Before: no Orders in Pinecone's nav.
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const owner = await ownerCtx.newPage();
  await signIn(owner, OWNER, `/m/${id}`);
  const nav = owner.getByRole("navigation", { name: "Main" }).first();
  await expect(nav.getByRole("link", { name: "Customers" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Orders" })).toHaveCount(0);

  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Network" })).toBeVisible();
  await page.screenshot({ path: shot("21-admin-network"), fullPage: true });
  await page.goto("/admin/rollout");
  const row = page.locator('tr[data-feature="orders.order_ahead"]');
  await expect(row).toBeVisible();
  await expect(page.locator('tr[data-feature="loyalty.points"]').getByText("Free forever")).toBeVisible();
  await page.screenshot({ path: shot("22-admin-rollout"), fullPage: true });
  await row.getByRole("radio", { name: "Beta" }).click();
  const dialog = page.getByRole("dialog", { name: "Turn Order-ahead to Beta?" });
  await expect(dialog.getByText(/opted into betas/)).toBeVisible();
  await dialog.getByLabel("Note (optional)").fill("e2e beta");
  await page.screenshot({ path: shot("23-admin-stage-confirm") });
  await dialog.getByRole("button", { name: "Set to Beta" }).click();
  await expect(row.getByRole("radio", { name: "Beta" })).toHaveAttribute("aria-checked", "true");

  await row.getByRole("button", { name: /Add|on/ }).click();
  const sheet = page.getByRole("dialog", { name: "Overrides: Order-ahead" });
  await sheet.getByLabel("Find a merchant").fill("Pinecone");
  await sheet.getByRole("button", { name: /Pinecone Coffee Co\./ }).click();
  await sheet.getByLabel("Reason (optional)").fill("Pilot shop");
  await sheet.getByRole("button", { name: "Save override" }).click();
  await expect(sheet.getByRole("listitem").filter({ hasText: "Pinecone Coffee Co." }).getByText("Forced on")).toBeVisible();
  await page.screenshot({ path: shot("24-admin-override") });
  await sheet.getByRole("button", { name: "Close" }).click();

  // After: the pilot shop sees Orders and Menu in its nav.
  await owner.reload();
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Menu & catalog" })).toBeVisible();
  await owner.screenshot({ path: shot("25-merchant-nav-pilot"), fullPage: true });
  await owner.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Orders" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();

  // Clean up so the seed's defaults hold for later runs.
  await fetch(`${API}/v1/admin/features/orders.order_ahead/overrides/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${await apiToken(ADMIN)}` } });
  await fetch(`${API}/v1/admin/features/orders.order_ahead/stage`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${await apiToken(ADMIN)}` }, body: JSON.stringify({ stage: "hidden", note: "e2e reset" }) });
  await ownerCtx.close();
});

test("owner: billing and plans, integrations, messages, reports", async ({ page }) => {
  const id = await pineconeId();
  await signIn(page, OWNER, `/m/${id}/billing`);
  await expect(page.getByRole("heading", { name: /You're on/ })).toBeVisible();
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await page.screenshot({ path: shot("26-billing"), fullPage: true });
  await page.goto(`/m/${id}/integrations`);
  // Google Business Profile is free; paid connectors collapse into one quiet line.
  await expect(page.getByRole("heading", { name: "Google Business Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Square" })).toHaveCount(0);
  await expect(page.getByText("coming with Café & Retail")).toBeVisible();
  await page.screenshot({ path: shot("27-integrations"), fullPage: true });
  await pilot(id, ["marketing.email"], true);
  await page.goto(`/m/${id}/messages/new`);
  await expect(page.getByText(/Will go to \d+/)).toBeVisible();
  await page.getByLabel("Subject").fill("New pastries this week");
  await page.getByLabel("Message").fill("Hi {{first_name}}, try our new almond croissant.");
  await expect(page.getByText("Added automatically")).toBeVisible();
  await page.screenshot({ path: shot("28-message-composer"), fullPage: true });
  await page.goto(`/m/${id}/reports`);
  await expect(page.getByRole("heading", { name: "Visits per day" })).toBeVisible();
  await page.screenshot({ path: shot("29-reports"), fullPage: true });
  // Network overlap is an advanced (paid) report: no tab while locked.
  await expect(page.getByRole("tab", { name: "Network" })).toHaveCount(0);
  await pilot(id, ["marketing.email"], false);
});

test("BIA tools and admin campaign report", async ({ page }) => {
  await signIn(page, ADMIN, "/admin/campaigns");
  await expect(page.getByRole("heading", { level: 1, name: "Neighbourhood campaigns" })).toBeVisible();
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dlg = page.getByRole("dialog", { name: "New campaign" });
  await dlg.getByLabel("Name").fill(`Roncy Passport Week ${Date.now() % 1000}`);
  await dlg.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Visit lift", { exact: true })).toBeVisible();
  await page.getByLabel("Add a shop").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add shop" }).click();
  await expect(page.getByRole("heading", { name: /Participating shops \(1\)/ })).toBeVisible();
  await page.screenshot({ path: shot("30-campaign-detail"), fullPage: true });
  await page.goto("/bia");
  await expect(page.getByRole("heading", { level: 1, name: "Neighbourhood campaigns" })).toBeVisible();
  await page.screenshot({ path: shot("31-bia"), fullPage: true });
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test("owner home and counter at 390px", async ({ page }) => {
    const id = await pineconeId();
    await signIn(page, OWNER, `/m/${id}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: shot("32-mobile-home"), fullPage: true });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Counter" })).toBeVisible();
    await page.goto(`/m/${id}/counter`);
    await expect(page.getByLabel("Phone, last 4 digits or member code")).toBeVisible();
    await page.screenshot({ path: shot("33-mobile-counter"), fullPage: true });
  });
});
