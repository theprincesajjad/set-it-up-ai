/**
 * phase-pro P2 · Waitlist that fills cancelled slots (docs/business/pro-value.md §3.2 P2), on the seed salon Bloom Hair Studio:
 * a day is filled for the run (time off for everyone but one 11:00 gel manicure), a signed-out client asks for a spot from the full
 * day at 390, the owner sees them on the Waitlist page and cancels the 11:00 at 1440 with "Offer this slot to the waitlist" on, the
 * calendar chip says who it was offered to, and the client takes it in one tap. Everything made for the run is removed after.
 * Screenshots go to $SHOTS_DIR (default e2e/screenshots/waitlist), English and Urdu.
 */
import { expect, test, type Page } from "@playwright/test";
import { API, newPhone } from "./fixtures";

const OWNER = { email: "owner+bloom-hair-studio@example.com", password: "localloyalty-demo" };
const ADMIN = { email: "admin@localloyalty.example", password: "localloyalty-admin" };
const SLUG = "bloom-hair-studio";
const TZ = "America/Toronto";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/waitlist";
const shot = (name: string) => `${SHOTS}/${name}.png`;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = (who: { email: string; password: string }) => call<{ accessToken: string }>("POST", "/v1/auth/login", who).then((r) => r.accessToken);

/** Toronto wall clock -> ISO instant (good to the minute; the offsets are whole hours). */
function at(date: string, minutes: number): string {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 0, minutes);
  const local = new Date(new Date(guess).toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess + (utc.getTime() - local.getTime())).toISOString();
}
const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (d: string, n: number) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n)).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

type Staff = { userId: string; name: string; hours: { weekday: number; startsLocal: string; endsLocal: string }[] };
let ctx: { token: string; m: string; base: string; day: string; mani: { id: string }; appt: string; timeOff: string[]; override: boolean; client: { name: string; phone: string } };

test.beforeAll(async () => {
  const token = await login(OWNER);
  const m = (await call<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, token)).items[0]!.id;
  const base = `/v1/merchants/${m}`;
  const mani = (await call<{ items: { id: string; name: string }[] }>("GET", `${base}/services`, undefined, token)).items.find((s) => s.name === "Gel manicure")!;
  const staff = (await call<{ items: Staff[] }>("GET", `${base}/appointments/staff`, undefined, token)).items.filter((s) => s.hours.length);
  // A working day 9 to 13 days out (inside the booking page's 14-day strip, clear of the seed's busy days).
  const today = torontoToday();
  let day = "";
  for (let i = 9; i <= 13 && !day; i++) if (staff.some((s) => s.hours.some((h) => h.weekday === weekday(plusDays(today, i))))) day = plusDays(today, i);
  const keep = staff.find((s) => s.hours.some((h) => h.weekday === weekday(day)))!;
  // Paid feature: on for the run unless the shop's plan already has it.
  const feats = await call<{ features: { key: string; enabled: boolean }[] }>("GET", `${base}/features`, undefined, token);
  const override = !feats.features.find((f) => f.key === "booking.waitlist")?.enabled;
  if (override) await call("PUT", `/v1/admin/features/booking.waitlist/overrides`, { merchantId: m, enabled: true, reason: "e2e waitlist" }, await login(ADMIN));
  // Everyone off that day, except the one stylist from 11:00 for one gel manicure (60 min + 10 clean-up).
  const timeOff: string[] = [];
  const off = async (userId: string, from: number, to: number) => timeOff.push((await call<{ id: string }>("POST", `${base}/staff/${userId}/time-off`, { startsAt: at(day, from), endsAt: at(day, to), reason: "e2e waitlist" }, token)).id);
  for (const s of staff) {
    if (s.userId === keep.userId) {
      await off(s.userId, 0, 11 * 60);
      await off(s.userId, 12 * 60 + 10, 24 * 60 - 1);
    } else await off(s.userId, 0, 24 * 60 - 1);
  }
  const appt = await call<{ id: string }>("POST", `${base}/appointments`, { serviceIds: [mani.id], staffId: keep.userId, startsAt: at(day, 11 * 60), customer: { phone: `+1${newPhone()}`, name: "Tara Booked" } }, token);
  const client = { name: "Wafa", phone: newPhone() };
  ctx = { token, m, base, day, mani, appt: appt.id, timeOff, override, client };
});

test.afterAll(async () => {
  if (!ctx) return;
  const token = await login(OWNER);
  for (const id of ctx.timeOff) await call("DELETE", `${ctx.base}/staff/time-off/${id}`, undefined, token).catch(() => undefined);
  const list = await call<{ items: { id: string; status: string; bookedAppointmentId: string | null }[] }>("GET", `${ctx.base}/waitlist?status=all`, undefined, token);
  for (const e of list.items) {
    if (e.bookedAppointmentId) await call("POST", `${ctx.base}/appointments/${e.bookedAppointmentId}/status`, { status: "cancelled", chargeFee: false }, token).catch(() => undefined);
    if (e.status === "waiting" || e.status === "offered") await call("DELETE", `${ctx.base}/waitlist/${e.id}`, undefined, token).catch(() => undefined);
  }
  await call("POST", `${ctx.base}/appointments/${ctx.appt}/status`, { status: "cancelled", chargeFee: false }, token).catch(() => undefined);
  if (ctx.override) await call("DELETE", `/v1/admin/features/booking.waitlist/overrides/${ctx.m}`, undefined, await login(ADMIN)).catch(() => undefined);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** The booking page on the full day, at the time step. */
async function openFullDay(page: Page, lang = "") {
  await page.goto(`/shops/${SLUG}/book${lang}`);
  await page.getByRole("checkbox", { name: /Gel manicure|جیل/ }).first().click();
  await page.locator("div.sticky button").last().click();
  const dayNum = String(Number(ctx.day.slice(8, 10)));
  const full = page.locator("button[aria-pressed]").filter({ hasText: new RegExp(`^\\D*${dayNum}\\D*$`) }).filter({ has: page.locator("span.text-caption.leading-none") });
  await expect(full).toHaveCount(1);
  await full.click();
  await expect(page.getByTestId("wl-full")).toBeVisible();
}

test("a client asks for a spot from a full day at 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFullDay(page);
  await expect(page.getByTestId("wl-full")).toContainText("is full.");
  await page.screenshot({ path: shot("full-day-390") });
  await page.getByRole("button", { name: "Tell me if a spot opens" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("radio", { name: /^Just / })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("radio", { name: "Morning" }).click();
  await sheet.getByLabel("Your first name").fill(ctx.client.name);
  await sheet.getByLabel("Phone or email").fill(ctx.client.phone);
  await page.screenshot({ path: shot("sheet-390") });
  await sheet.getByRole("button", { name: "Put me on the list" }).click();
  await expect(sheet.getByTestId("wl-joined")).toContainText("You're on the list. We'll message you if a spot opens.");
  await page.screenshot({ path: shot("joined-390") });
  // Urdu: the same full day and sheet.
  await openFullDay(page, "?lang=ur");
  await page.screenshot({ path: shot("full-day-390-ur") });
});

test("the owner sees the ask, cancels with the waitlist switch on, and the chip says who has the slot (1440 and 390)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.goto(`/m/${ctx.m}/waitlist`);
  const row = page.getByTestId("wl-row").filter({ hasText: ctx.client.name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Gel manicure");
  await expect(row).toContainText("Waiting");
  await page.screenshot({ path: shot("waitlist-1440") });
  await page.goto(`/m/${ctx.m}/waitlist?lang=ur`);
  await expect(page.getByTestId("wl-row").first()).toBeVisible();
  await page.screenshot({ path: shot("waitlist-1440-ur") });

  await page.goto(`/m/${ctx.m}/calendar?date=${ctx.day}&appt=${ctx.appt}`);
  const panel = page.getByRole("complementary", { name: "Appointment" });
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this appointment?" });
  const sw = dialog.getByTestId("wl-cancel-switch").getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByTestId("wl-cancel-switch")).toContainText(/Offer this slot to the waitlist \(\d+ waiting\)/);
  await page.screenshot({ path: shot("cancel-confirm-1440") });
  await dialog.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const strip = page.getByTestId("wl-day-strip");
  await expect(strip).toContainText(`Offered to ${ctx.client.name}`);
  await expect(strip).toContainText(/left/);
  await page.screenshot({ path: shot("calendar-chip-1440") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/m/${ctx.m}/waitlist`);
  const card = page.getByTestId("wl-card").filter({ hasText: ctx.client.name });
  await expect(card).toContainText(/Offered · /);
  await page.screenshot({ path: shot("waitlist-390") });
  await page.goto(`/m/${ctx.m}/waitlist?lang=ur`);
  await expect(page.getByTestId("wl-card").first()).toBeVisible();
  await page.screenshot({ path: shot("waitlist-390-ur") });
  await page.goto(`/m/${ctx.m}/calendar?date=${ctx.day}`);
  await expect(page.getByTestId("wl-day-strip")).toBeVisible();
  await page.screenshot({ path: shot("calendar-chip-390") });
});

test("the client takes the offered slot in one tap", async ({ page }) => {
  const phone = `+1${ctx.client.phone}`;
  const { devCode } = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const me = (await call<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone, code: devCode })).accessToken;
  const mine = await call<{ items: { offer: { token: string } | null }[] }>("GET", "/v1/me/waitlist", undefined, me);
  const token = mine.items.find((e) => e.offer)?.offer?.token;
  expect(token).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/w/${token}?lang=ur`);
  await expect(page.getByTestId("wl-offer")).toBeVisible();
  await page.screenshot({ path: shot("take-1440-ur") });
  await page.goto(`/w/${token}`);
  await page.screenshot({ path: shot("take-1440") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/w/${token}`);
  await expect(page.getByRole("heading", { name: "A spot opened for you" })).toBeVisible();
  await expect(page.getByTestId("wl-offer")).toContainText("Gel manicure");
  await page.screenshot({ path: shot("take-390") });
  await page.getByRole("button", { name: "Take it" }).click();
  await expect(page.getByTestId("wl-taken")).toContainText("It's yours");
  await page.screenshot({ path: shot("taken-390") });

  // The calendar shows the booking; a second tap on the link still says it's theirs.
  const list = await call<{ items: { status: string; bookedAppointmentId: string | null }[] }>("GET", `${ctx.base}/waitlist?status=all`, undefined, ctx.token);
  expect(list.items.some((e) => e.status === "booked" && e.bookedAppointmentId)).toBe(true);
  await page.goto(`/w/${token}`);
  await expect(page.getByTestId("wl-taken")).toBeVisible();
});
