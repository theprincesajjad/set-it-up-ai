// Screenshot tour of the Expo app rendered with react-native-web (see e2e/README.md).
// Usage: node e2e/tour.mjs [only-step-prefix]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { call, customerToken, login, routeTiles } from "./lib.mjs";
import { serve } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = process.env.E2E_DIST ?? join(here, "..", "dist-web");
const PORT = Number(process.env.E2E_WEB_PORT ?? 8300);
const WEB = `http://localhost:${PORT}`;
const OUT = process.env.E2E_OUT ?? join(here, "screenshots");
const ONLY = process.argv[2] ?? "";
/** Seeded customer with four shops and rewards ready (seed prints +16475551000 …). */
const CUSTOMER = process.env.E2E_CUSTOMER_PHONE ?? "+16475551009";
const STAFF = "staff+pinecone-coffee@example.com";
const RONCESVALLES = { latitude: 43.6475, longitude: -79.4487 };

await mkdir(OUT, { recursive: true });
const server = await serve(DIST, PORT);
const browser = await chromium.launch();
const failures = [];

async function newPhone({ scheme = "light", geo = true, storageState } = {}) {
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    locale: "en-CA",
    timezoneId: "America/Toronto",
    ...(geo ? { geolocation: RONCESVALLES, permissions: ["geolocation"] } : {}),
  });
  await routeTiles(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`  console.error: ${m.text().slice(0, 240)}`);
  });
  return { context, page };
}

async function shot(page, name, { settle = 600, fullPage = false } = {}) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  ✓ ${name}.png`);
}

async function step(name, fn) {
  if (ONLY && !ONLY.split(",").some((p) => name.startsWith(p))) return;
  console.log(`▸ ${name}`);
  try {
    await fn();
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`);
  }
}

const tap = (page, text, opts = {}) => page.getByText(text, { exact: true, ...opts }).first().click();

/** Phone OTP sign-in through the real screens. Returns after the code step submits. */
async function signInByPhone(page, phone, { shots = false } = {}) {
  await page.goto(`${WEB}/`);
  await page.getByText("Get started").waitFor();
  if (shots) await shot(page, "01-welcome");
  await tap(page, "Get started");
  const field = page.getByLabel("Mobile number");
  await field.waitFor();
  await field.fill(phone.replace(/^\+1/, ""));
  if (shots) await shot(page, "02-phone");
  const started = page.waitForResponse((r) => r.url().endsWith("/v1/auth/otp/start"));
  await page.getByRole("button", { name: "Send code" }).click();
  const { devCode } = await (await started).json();
  const otp = page.getByLabel("6-digit code");
  await otp.waitFor();
  if (shots) {
    await otp.fill(devCode.slice(0, 3));
    await shot(page, "03-code");
  }
  await otp.fill(devCode);
}

// ---------------------------------------------------------------- setup through the API
let pinecone;
let campaignId;
await step("setup", async () => {
  const owner = await login("owner+pinecone-coffee@example.com");
  const { items } = await call("GET", "/v1/merchants", undefined, owner);
  pinecone = items[0];
  // The customer redeems a free drink in the app ("redeem") and another at the counter ("counter-redeem").
  // The seed is relative to today, so top the stamp card up to two free drinks when it is short.
  // The 30-minute stamp cooldown would block the top-up and the later counter award, so the e2e copy turns it off.
  await call("PATCH", `/v1/merchants/${pinecone.id}/program`, { visitCooldownMinutes: 0 }, owner);
  const look = await call("GET", `/v1/merchants/${pinecone.id}/counter/lookup?q=${encodeURIComponent(CUSTOMER)}`, undefined, owner);
  const card = look.items[0];
  const cost = card?.nextReward?.pointsCost ?? card?.rewardsAffordable?.[0]?.pointsCost ?? 10;
  for (let short = 2 * cost - (card?.balance ?? 0), i = 0; short > 0; i++) {
    const quantity = Math.min(10, short);
    await call("POST", `/v1/merchants/${pinecone.id}/counter/award`, { phone: CUSTOMER, quantity, idempotencyKey: `e2e-topup-${i}-${Date.now()}` }, owner);
    short -= quantity;
  }
  // Turn on order-ahead for the café so the shop page shows the entry point (features flag).
  const admin = await login("admin@localloyalty.example", "localloyalty-admin");
  await call("PUT", "/v1/admin/features/orders.order_ahead/overrides", { merchantId: pinecone.id, enabled: true, reason: "mobile e2e" }, admin).catch((e) => console.log(`  (override) ${e.message}`));
  // A live Roncesvalles Passport with two visits already made, so the campaign page has progress.
  const hood = (await call("GET", "/v1/network/neighbourhoods")).items.find((h) => h.slug === "roncesvalles");
  const day = 86_400_000;
  const camp = await call("POST", "/v1/campaigns", { neighbourhoodId: hood.id, name: "Roncesvalles Passport", kind: "passport", startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + 9 * day).toISOString(), description: "Visit five shops on the strip this fall.", goalVisits: 5, bonusPoints: 50, prize: "Win the street’s prize basket" }, admin);
  const slugs = ["nonnas-table", "village-green-grocer", "rise-yoga-studio", "hearth-and-crumb", "dog-eared-books"];
  const owners = {};
  for (const slug of slugs) {
    const t = await login(`owner+${slug}@example.com`);
    const m = (await call("GET", "/v1/merchants", undefined, t)).items[0];
    owners[slug] = { token: t, id: m.id };
    await call("POST", `/v1/campaigns/${camp.id}/merchants`, { merchantId: m.id }, admin);
  }
  await call("POST", `/v1/campaigns/${camp.id}/schedule`, {}, admin);
  campaignId = camp.id;
  for (const [slug, body] of [["nonnas-table", { amountCents: 3450 }], ["village-green-grocer", { amountCents: 2210 }]]) {
    await call("POST", `/v1/merchants/${owners[slug].id}/counter/award`, { phone: CUSTOMER, idempotencyKey: `e2e-${slug}-${Date.now()}`, ...body }, owners[slug].token).catch((e) => console.log(`  (award) ${e.message}`));
  }
});

// ---------------------------------------------------------------- onboarding (new customer)
await step("onboarding", async () => {
  const { context, page } = await newPhone({ geo: false });
  const phone = `+1647555${String(Math.floor(7000 + Math.random() * 2999))}`;
  await signInByPhone(page, phone, { shots: true });
  await page.getByText("What's your name?").waitFor();
  await page.getByLabel("First name").fill("Alex");
  await shot(page, "04-name-consent");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByText("open now", { exact: true }).first().waitFor();
  await page.waitForTimeout(2500);
  await shot(page, "05-explore-new-member");
  await page.goto(`${WEB}/wallet`);
  await page.getByText(/first points land here/).first().waitFor();
  await shot(page, "05b-wallet-empty");
  await context.close();
});

// ---------------------------------------------------------------- customer with history
const customer = await newPhone();
const cp = customer.page;
/** Signed-in browser state (tokens + prefs in localStorage), reused so each run sends few OTPs (5 per phone per hour). */
let custState;
await step("customer-sign-in", async () => {
  await signInByPhone(cp, CUSTOMER);
  await cp.getByText("open now", { exact: true }).first().waitFor();
  custState = await customer.context.storageState();
});

const walletReady = (page) => page.getByText(/^(reward ready|ready now|earning|your shops)$/i).first().waitFor();

await step("wallet", async () => {
  await cp.goto(`${WEB}/wallet`);
  await walletReady(cp);
  // Dismiss the push pre-prompt if it shows (first earn).
  const notNow = cp.getByText("Not now", { exact: true });
  if (await notNow.isVisible().catch(() => false)) {
    await shot(cp, "06b-push-prompt");
    await notNow.click();
  }
  await shot(cp, "06-wallet", { settle: 1200 });
  await cp.mouse.move(195, 600);
  await cp.mouse.wheel(0, 260);
  await shot(cp, "06a-wallet-scrolled", { settle: 600 });
});

// Hero when nothing is ready yet: the closest reward in that shop's unit. Finds a seeded customer with
// shops but no reward ready (one OTP per phone tried; the seed's customers start at +16475551000).
await step("wallet-progress", async () => {
  let phone = null;
  for (let n = 1000; n < 1040 && !phone; n++) {
    const p = `+1647555${n}`;
    if (p === CUSTOMER) continue;
    const token = await customerToken(p).catch(() => null);
    if (!token) continue;
    const { items } = await call("GET", "/v1/me/memberships", undefined, token);
    if (items.length >= 2 && items.every((m) => m.rewardsAvailableCount === 0) && items.some((m) => m.nextReward)) phone = p;
  }
  if (!phone) throw new Error("no seeded customer without a reward ready");
  const { context, page } = await newPhone();
  await signInByPhone(page, phone);
  await page.getByText("open now", { exact: true }).first().waitFor();
  await page.goto(`${WEB}/wallet`);
  await walletReady(page);
  const notNow = page.getByText("Not now", { exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await shot(page, "06c-wallet-progress", { settle: 1200 });
  await context.close();
});

await step("explore-map", async () => {
  await cp.goto(`${WEB}/map`);
  const allow = cp.getByText("Allow while using", { exact: true });
  await allow.waitFor({ timeout: 8000 }).catch(() => undefined);
  if (await allow.isVisible().catch(() => false)) {
    await shot(cp, "07a-explore-location-prompt");
    await allow.click();
  }
  await cp.locator(".maplibregl-canvas").waitFor({ timeout: 15000 });
  await cp.waitForTimeout(2500);
  await shot(cp, "07-explore-map");
  await cp.getByRole("tab", { name: "bakery" }).click();
  await shot(cp, "07d-explore-category", { settle: 1200 });
  await cp.getByRole("tab", { name: "all", exact: true }).click();
  await cp.getByRole("button", { name: /^Hearth & Crumb Bakery/ }).first().click();
  await shot(cp, "07f-explore-shop-sheet-join", { settle: 1400 });
  // The grabber is the affordance (a button that cycles the sheet's detents).
  await cp.getByRole("slider", { name: "Hearth & Crumb Bakery" }).first().click();
  await shot(cp, "07c-explore-shop-sheet-full", { settle: 1200 });
  await cp.getByRole("button", { name: "Close shop" }).click();
  await cp.getByRole("button", { name: "rewards ready", exact: true }).click();
  await shot(cp, "07e-explore-rewards-ready", { settle: 1400 });
  // A member's shop with a reward ready (the canvas ShopSheet artboard).
  await cp.getByRole("button", { name: /^Pinecone Coffee Co\./ }).first().click();
  await shot(cp, "07b-explore-shop-sheet", { settle: 1400 });
  await cp.getByRole("button", { name: "Close shop" }).click();
  await cp.getByRole("button", { name: "rewards ready", exact: true }).click();
  // The list view lives in the neighbourhood sheet now (the capsule is name ▾ · bell, as on the canvas).
  await cp.getByRole("button", { name: /^Neighbourhood:/ }).click();
  await cp.getByRole("button", { name: "Show list" }).click();
  await shot(cp, "08b-explore-list-toggle", { settle: 1000 });
  await cp.getByRole("button", { name: "Show map" }).click();
});

await step("explore-list", async () => {
  // Tiles blocked → the map reports a failure and Explore falls back to the list (same as a phone without maps).
  const { context, page } = await newPhone({ storageState: custState });
  await context.unroute(/^https:\/\/tiles\.openfreemap\.org\//);
  await context.route(/^https:\/\/tiles\.openfreemap\.org\//, (r) => r.abort());
  await page.goto(`${WEB}/map`);
  const notNow = page.getByText("Not now", { exact: true });
  await notNow.waitFor({ timeout: 8000 }).catch(() => undefined);
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await page.getByText("nearby", { exact: true }).first().waitFor({ timeout: 15000 });
  await shot(page, "08-explore-list", { settle: 1200 });
  await context.close();
});

await step("shop-detail", async () => {
  await cp.goto(`${WEB}/shop/pinecone-coffee`);
  await cp.getByText("rewards", { exact: true }).first().waitFor();
  await shot(cp, "09-shop", { settle: 1200 });
  await cp.mouse.move(195, 600);
  await cp.mouse.wheel(0, 700);
  await shot(cp, "09b-shop-scrolled", { settle: 800 });
  await cp.mouse.wheel(0, 3000);
  await shot(cp, "11-shop-about", { settle: 800 });
  await cp.goto(`${WEB}/shop/nonnas-table`);
  await cp.getByText("rewards", { exact: true }).first().waitFor();
  await shot(cp, "10-shop-points", { settle: 1200 });
});

await step("shop-join", async () => {
  await cp.goto(`${WEB}/shop/bloom-hair-studio`);
  await cp.getByRole("button", { name: "Join free" }).first().waitFor();
  await shot(cp, "12-shop-not-member", { settle: 1000 });
  await cp.getByRole("button", { name: "Join free" }).click();
  await shot(cp, "12b-join-sheet", { settle: 800 });
  await cp.getByRole("button", { name: "Join Bloom Hair Studio" }).last().click();
  await cp.getByText(/^You're in at /).first().waitFor({ timeout: 10000 });
  await shot(cp, "12c-join-success", { settle: 900 });
  await cp.getByRole("button", { name: "Done", exact: true }).click();
});

await step("card", async () => {
  await cp.goto(`${WEB}/wallet`);
  await walletReady(cp);
  const notNow = cp.getByText("Not now", { exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await cp.getByRole("button", { name: "My card" }).last().click();
  await cp.getByText("show this at the counter").first().waitFor({ timeout: 10000 }).catch(() => undefined);
  await shot(cp, "13-my-card", { settle: 1200 });
});

await step("rewards", async () => {
  await cp.goto(`${WEB}/rewards`);
  await cp.getByText("rewards", { exact: true }).first().waitFor();
  await shot(cp, "14-rewards-ready", { settle: 1200 });
  await tap(cp, "All shops");
  await shot(cp, "14b-rewards-all", { settle: 900 });
  await tap(cp, "Passport");
  await shot(cp, "14c-rewards-passport", { settle: 900 });
});

let redeemCode = null;
await step("redeem", async () => {
  await cp.goto(`${WEB}/shop/pinecone-coffee`);
  await cp.getByText("rewards", { exact: true }).first().waitFor();
  await cp.getByRole("button", { name: /^Redeem/ }).first().click();
  await shot(cp, "15-redeem-confirm", { settle: 800 });
  const issued = cp.waitForResponse((r) => /\/redeem$/.test(r.url()) && r.request().method() === "POST");
  await cp.getByRole("button", { name: "Show code to staff" }).click();
  redeemCode = (await (await issued).json()).redemption?.code ?? null;
  await cp.getByText(/Waiting for staff/).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  await shot(cp, "16-redeem-code", { settle: 1500 });
});

await step("activity", async () => {
  await cp.goto(`${WEB}/activity`);
  await cp.getByText("activity", { exact: true }).first().waitFor();
  await shot(cp, "17-activity", { settle: 1200 });
  await cp.goto(`${WEB}/history`);
  await cp.getByText("points history", { exact: true }).first().waitFor();
  await shot(cp, "17b-points-history", { settle: 1200 });
});

await step("discover", async () => {
  await cp.goto(`${WEB}/discover`);
  await cp.getByText("near you", { exact: true }).first().waitFor({ timeout: 15000 });
  await shot(cp, "06d-discover", { settle: 1500 });
  await cp.mouse.move(195, 600);
  await cp.mouse.wheel(0, 500);
  await shot(cp, "06e-discover-scrolled", { settle: 800 });
});

await step("campaign", async () => {
  await cp.goto(`${WEB}/campaigns/${campaignId}`);
  await cp.getByText("Roncesvalles Passport").first().waitFor();
  await shot(cp, "18-campaign", { settle: 1200 });
  await cp.mouse.move(195, 600);
  await cp.mouse.wheel(0, 700);
  await shot(cp, "18b-campaign-scrolled");
});

await step("profile-settings", async () => {
  await cp.goto(`${WEB}/you`);
  await cp.getByText("Sign out").first().waitFor();
  await shot(cp, "19-profile", { settle: 900 });
  for (const [path, name] of [["/settings/profile", "20-settings-profile"], ["/settings/notifications", "20b-settings-notifications"], ["/settings/shops", "20c-settings-shops"], ["/settings/privacy", "20d-settings-privacy"]]) {
    await cp.goto(`${WEB}${path}`);
    await shot(cp, name, { settle: 1500 });
  }
});

await step("notifications", async () => {
  await cp.goto(`${WEB}/map`);
  await cp.getByRole("button", { name: /^Notifications/ }).first().waitFor({ timeout: 15000 });
  await cp.waitForTimeout(1500);
  await shot(cp, "22a-explore-bell", { settle: 300 });
  await cp.getByRole("button", { name: /^Notifications/ }).first().click();
  await cp.getByText("activity", { exact: true }).first().waitFor();
  await shot(cp, "22-notifications", { settle: 1500 });
  await cp.goto(`${WEB}/settings/notifications`);
  await cp.getByText("points and rewards", { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  await shot(cp, "22b-notification-settings", { settle: 1200 });
});

await step("dark-mode", async () => {
  const { context, page } = await newPhone({ scheme: "dark", storageState: custState });
  await page.goto(`${WEB}/map`);
  await page.locator(".maplibregl-canvas").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await shot(page, "21-dark-explore");
  await page.goto(`${WEB}/wallet`);
  await walletReady(page);
  const notNow = page.getByText("Not now", { exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await shot(page, "21a-dark-wallet", { settle: 1500 });
  await page.goto(`${WEB}/shop/pinecone-coffee`);
  await page.getByText("rewards", { exact: true }).first().waitFor();
  await shot(page, "21b-dark-shop", { settle: 1000 });
  await page.goto(`${WEB}/wallet`);
  await walletReady(page);
  await page.getByRole("button", { name: "My card" }).last().click();
  await shot(page, "21c-dark-card", { settle: 1500 });
  await context.close();
});

// ---------------------------------------------------------------- counter mode (staff)
const staffPhone = await newPhone({ geo: false });
const sp = staffPhone.page;
const keypad = async (page, digits) => {
  for (const d of digits) await page.locator(`[aria-label="${d}"]`).first().click();
};

await step("counter-sign-in", async () => {
  await sp.goto(`${WEB}/welcome`);
  await tap(sp, "I'm a shop owner or staff");
  await sp.getByLabel("Email").fill(STAFF);
  await sp.getByLabel("Password").fill("localloyalty-demo");
  await shot(sp, "30-counter-sign-in");
  await sp.getByRole("button", { name: "Sign in", exact: true }).click();
  await sp.getByText("counter mode", { exact: true }).first().waitFor();
  await shot(sp, "31-counter-location-picker", { settle: 1200 });
  await sp.getByText("412 Roncesvalles Ave").first().click();
  await sp.getByText("Customer's phone number").waitFor();
  await shot(sp, "32-counter-keypad", { settle: 800 });
});

await step("counter-lookup-award", async () => {
  await keypad(sp, CUSTOMER.slice(2, 9));
  await shot(sp, "32b-counter-keypad-typing");
  await keypad(sp, CUSTOMER.slice(9));
  await sp.getByRole("button", { name: /^Add/ }).first().waitFor();
  await shot(sp, "33-counter-member-found", { settle: 900 });
  await sp.getByRole("radio", { name: "+2" }).first().click();
  await shot(sp, "33b-counter-plus-two", { settle: 300 });
  await sp.getByRole("button", { name: /^Add 2 stamps/ }).first().click();
  await sp.getByText(/^Added 2 stamps/).first().waitFor();
  await shot(sp, "34-counter-award-success-undo", { settle: 700 });
  await sp.getByRole("button", { name: /^Undo/ }).first().click();
  await sp.getByText(/^Undone/).first().waitFor();
  await shot(sp, "34b-counter-undone", { settle: 500 });
  await tap(sp, "Next customer");
});

await step("counter-redeem", async () => {
  await keypad(sp, CUSTOMER.slice(2));
  await sp.getByRole("button", { name: /^Add/ }).first().waitFor();
  await sp.getByRole("button", { name: "Redeem", exact: true }).first().click();
  await shot(sp, "35-counter-redeem-picker", { settle: 900 });
  await sp.getByText("Free drink", { exact: true }).first().click();
  await shot(sp, "35b-counter-redeem-confirm", { settle: 600 });
  await sp.getByRole("button", { name: "Confirm redeem" }).click();
  await sp.getByText(/redeemed/i).first().waitFor();
  await shot(sp, "36-counter-redeem-success", { settle: 700 });
  await tap(sp, "Next customer");
  await sp.getByText("Customer's phone number").waitFor();
});

await step("counter-redeem-code", async () => {
  if (!redeemCode) {
    // Running the counter steps on their own: issue a code through the API like the app does.
    const token = await customerToken(CUSTOMER);
    const wallet = await call("GET", "/v1/me/memberships", undefined, token);
    const m = wallet.items.find((x) => x.merchant.slug === "pinecone-coffee");
    const detail = await call("GET", `/v1/me/memberships/${m.id}`, undefined, token);
    const r = detail.rewards.find((x) => x.affordable);
    redeemCode = (await call("POST", `/v1/me/memberships/${m.id}/redeem`, { rewardId: r.id, idempotencyKey: `e2e-${Date.now()}` }, token)).redemption.code;
  }
  await sp.getByRole("button", { name: "Code", exact: true }).first().click();
  await sp.getByLabel("Reward code").fill(redeemCode);
  await shot(sp, "37-counter-redeem-code", { settle: 600 });
  await sp.getByRole("button", { name: "Confirm", exact: true }).click();
  await sp.getByText(/redeemed/i).first().waitFor();
  await shot(sp, "37b-counter-redeem-code-success", { settle: 600 });
  await tap(sp, "Next customer");
  await sp.getByText("Customer's phone number").waitFor();
});

await step("counter-today", async () => {
  await sp.getByRole("button", { name: /^More/ }).click();
  await shot(sp, "38a-counter-menu", { settle: 600 });
  await tap(sp, "Today");
  await sp.getByText("Visits", { exact: true }).first().waitFor();
  await shot(sp, "38-counter-today", { settle: 1200 });
  await sp.goBack();
  await sp.getByText("Customer's phone number").waitFor();
});

await step("counter-offline", async () => {
  await staffPhone.context.setOffline(true);
  await sp.waitForTimeout(1500);
  await keypad(sp, "6475551004");
  await sp.getByRole("button", { name: /^Add/ }).first().waitFor({ timeout: 10000 });
  await shot(sp, "39a-counter-offline-member", { settle: 600 });
  await sp.getByRole("button", { name: /^Add/ }).first().click();
  await shot(sp, "39-counter-offline-award", { settle: 700 });
  await sp.waitForTimeout(4500);
  await shot(sp, "39b-counter-offline-banner", { settle: 300 });
  await staffPhone.context.setOffline(false);
  await sp.getByText(/Back online/).first().waitFor({ timeout: 20000 }).catch(() => undefined);
  await shot(sp, "39c-counter-back-online", { settle: 200 });
  const next = sp.getByText("Next customer", { exact: true });
  if (await next.isVisible().catch(() => false)) await next.click();
});

await step("counter-kiosk", async () => {
  await sp.getByRole("button", { name: /^More/ }).click();
  await tap(sp, "Counter settings");
  await sp.getByText("Start kiosk mode").waitFor();
  await shot(sp, "40a-counter-settings", { settle: 600 });
  await tap(sp, "Start kiosk mode");
  await sp.getByText(/check in and earn/i).first().waitFor();
  await shot(sp, "40-kiosk-phone", { settle: 900 });
  // The kiosk is a landscape tablet on the counter (staff-counter.md § 7).
  await sp.setViewportSize({ width: 1180, height: 820 });
  await shot(sp, "40b-kiosk-tablet", { settle: 900 });
  await keypad(sp, "6475551009");
  await shot(sp, "40c-kiosk-tablet-typed", { settle: 500 });
  await sp.getByRole("button", { name: "Check in", exact: true }).click();
  await shot(sp, "40d-kiosk-tablet-result", { settle: 1500 });
  await sp.setViewportSize({ width: 390, height: 844 });
});

console.log(failures.length ? `\nFailed steps: ${failures.join(", ")}` : "\nAll steps passed.");
await browser.close();
server.close();
process.exit(failures.length ? 1 : 0);

