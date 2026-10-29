/**
 * phase-pro P5 · Add-ons at booking (docs/business/pro-value.md §3.2 P5): a client books a gel manicure with nail art at 390 and the
 * time and price include it; the owner's Services page shows the Add-ons section at 1440, and with the plan off it carries the Pro
 * line instead of offering them on the booking page.
 * Uses the seed salon Bloom Hair Studio; the add-ons are made for the run (offered with the gel manicure only) and deleted after.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/add-ons, untracked output).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, newPhone } from "./fixtures";

const OWNER = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const SLUG = "bloom-hair-studio";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/add-ons";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const TIMES_RE = /^\d{1,2}:\d\d [ap]\.m\.$/;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = (who: { email: string; password: string }) => call<{ accessToken: string }>("POST", "/v1/auth/login", who).then((r) => r.accessToken);

type AddOn = { id: string; name: string };
let ctx: { token: string; m: string; base: string; mani: { id: string }; made: AddOn[] };

test.beforeAll(async () => {
  const token = await login(OWNER);
  const m = (await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token)).items[0]!.id;
  const base = `/v1/merchants/${m}`;
  const services = (await call<{ items: { id: string; name: string }[] }>("GET", `${base}/services`, undefined, token)).items;
  const mani = services.find((s) => s.name === "Gel manicure")!;
  // Left over from an interrupted run: start clean.
  for (const a of (await call<{ items: AddOn[] }>("GET", `${base}/add-ons`, undefined, token)).items) await call("DELETE", `${base}/add-ons/${a.id}`, undefined, token);
  const made = [
    await call<AddOn>("POST", `${base}/add-ons`, { name: "Nail art", priceCents: 1000, durationMin: 15, offeredWith: [mani.id] }, token),
    await call<AddOn>("POST", `${base}/add-ons`, { name: "Gel removal", priceCents: 1500, durationMin: 20, offeredWith: [mani.id], sort: 1 }, token),
  ];
  ctx = { token, m, base, mani, made };
});

test.afterAll(async () => {
  if (!ctx) return;
  const token = await login(OWNER);
  for (const a of (await call<{ items: AddOn[] }>("GET", `${ctx.base}/add-ons`, undefined, token)).items) await call("DELETE", `${ctx.base}/add-ons/${a.id}`, undefined, token);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("a client books a gel manicure with nail art at 390: the step, the total and the blocked time", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/shops/${SLUG}/book`);
  await page.getByRole("checkbox", { name: /Gel manicure/ }).click();
  // A service with add-ons goes to the add-on step first.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Add anything?" })).toBeVisible();
  const list = page.getByTestId("book-add-ons");
  await expect(list.getByRole("switch")).toHaveCount(2);
  await expect(list.getByText("+$10 · +15 min")).toBeVisible();
  await list.getByRole("switch", { name: /Nail art/ }).click();
  await expect(list.getByRole("switch", { name: /Nail art/ })).toHaveAttribute("aria-checked", "true");
  // $55 + $10, 60 + 10 min clean-up + 15.
  await expect(page.getByText(/1 add-on/)).toBeVisible();
  await expect(page.getByText(/\$65/).first()).toBeVisible();
  await page.screenshot({ path: shot("step-390") });

  await page.getByRole("button", { name: "Choose a time" }).click();
  await expect(page.getByText(/Gel manicure, Nail art/)).toBeVisible();
  const TIMES = page.getByRole("button", { name: TIMES_RE });
  await page.getByRole("group", { name: "Pick a time" }).getByRole("button").and(page.locator(":not([disabled])")).last().click();
  await expect(TIMES.first()).toBeVisible();
  await TIMES.first().click();
  await page.screenshot({ path: shot("time-390") });

  const posted = page.waitForRequest((r) => r.url().endsWith("/v1/me/appointments") && r.method() === "POST");
  const name = page.getByLabel("Your first name");
  if (await name.isVisible()) await name.fill("Mina");
  await page.getByRole("button", { name: "Sign in to book" }).click();
  await page.locator("input[type=tel]").first().fill(newPhone());
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Dev mode: code/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  const body = (await posted).postDataJSON() as { addOnIds: string[]; startsAt: string };
  expect(body.addOnIds).toEqual([ctx.made[0]!.id]);

  // The shop's calendar holds 85 minutes with the add-on line under the service.
  await expect
    .poll(async () => {
      const day = await call<{ items: { startsAt: string; endsAt: string; items: { name: string; kind?: string }[] }[] }>("GET", `${ctx.base}/appointments?from=${encodeURIComponent(body.startsAt)}&to=${encodeURIComponent(new Date(new Date(body.startsAt).getTime() + 3_600_000).toISOString())}`, undefined, ctx.token);
      const a = day.items.find((x) => x.startsAt === body.startsAt && x.items.some((i) => i.kind === "add_on"));
      return a ? [(new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000, a.items.map((i) => i.name).join(", ")] : null;
    }, { timeout: 20_000 })
    .toEqual([85, "Gel manicure, Nail art"]);
});

test("the Services page shows the Add-ons section at 1440; off the plan it carries the Pro line and the booking page drops them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(`/m/${ctx.m}/services`);
  const section = page.getByTestId("add-ons");
  await expect(page.getByRole("heading", { name: "Add-ons" })).toBeVisible();
  await expect(section.getByRole("row", { name: /Nail art/ })).toBeVisible();
  await expect(section.getByText("+15 min").first()).toBeVisible();
  await expect(section.getByText("Gel manicure").first()).toBeVisible();
  await expect(page.getByTestId("add-ons-plan-line")).toHaveCount(0);

  // Add one from the panel, offered with every service.
  await page.getByRole("button", { name: "Add an add-on" }).click();
  await page.getByLabel("Name").fill("French tip");
  await page.getByLabel("Price").fill("8");
  await page.getByLabel("Extra time").fill("10");
  await page.getByRole("button", { name: "Save add-on" }).click();
  const tip = section.getByRole("row", { name: /French tip/ });
  await expect(tip).toBeVisible();
  await expect(tip.getByText("All services")).toBeVisible();
  await page.getByTestId("add-ons").scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot("services-1440"), fullPage: true });
  // Keep the run's footprint to the gel manicure: delete it again.
  await tip.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(section.getByRole("row", { name: /French tip/ })).toHaveCount(0);

  // With booking.add_ons switched off for the shop (as on Free), the section stays and the plan line says what Pro does.
  const admin = await login(ADMIN);
  await call("PUT", `/v1/admin/features/booking.add_ons/overrides`, { merchantId: ctx.m, enabled: false, reason: "e2e add-ons" }, admin);
  try {
    await page.reload();
    const line = page.getByTestId("add-ons-plan-line");
    await expect(line).toContainText("On Pro, clients add them when they book, and the time is blocked for you.");
    await expect(line.getByRole("link", { name: "See Pro" })).toHaveAttribute("href", `/m/${ctx.m}/billing?plan=plus`);
    await page.screenshot({ path: shot("services-locked-1440"), fullPage: true });
    const pub = await call<{ services: { name: string; addOns?: unknown[] }[] }>("GET", `/v1/public/shops/${SLUG}/services`);
    expect(pub.services.every((s) => s.addOns === undefined)).toBe(true);
  } finally {
    await call("DELETE", `/v1/admin/features/booking.add_ons/overrides/${ctx.m}`, undefined, admin);
  }
});
