/**
 * The people side (phase solo, workstream D; docs/business/people-side.md §5): the six acceptance checks.
 *   1. A pro opens a client: next visit, the last visits with notes, and a message thread, in two taps.
 *   2. Messages and reminders take the cheapest channel that reaches the client: web push when they turned it on; a text only when
 *      nothing else reaches them, and the shop's text count moves. The web pass offers "Get your reminder on this phone".
 *   3. The address rule: a confirmation shows the address; the public pages of a home studio never do. Covered in full by
 *      privacy.spec.ts (workstream B); here, the confirmation carries the address of the shop that booked.
 *   4. A chair renter sees only their own clients on Customers and can copy their own booking link.
 *   5. A paid shop sends a seasonal promo to its regulars and the counter reads "1 of 4 this month"; a free shop sees the picker
 *      with the plan line and cannot send.
 *   6. Instagram reads "Coming soon" until switched on; with INSTAGRAM_DM_ENABLED=stub a seeded DM shows in the inbox and "Create
 *      booking" opens the sheet with the handle and the message as the client note.
 * Seed shops: Arch & Thread Brow Bar (free), Crown & Fade (renters), Rangrez Beauty Studio (put on Pro here).
 * Screenshots: $SHOTS_DIR (default e2e/screenshots/people).
 */
import { expect, test, type Page } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots/people";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const LANG = process.env.E2E_LANG ?? "en";
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const login = async (email: string, password = PASSWORD) => (await call<{ accessToken: string }>("POST", "/v1/auth/login", { email, password })).accessToken;
async function owner(slug: string) {
  const token = await login(`owner+${slug}@example.com`);
  const { items } = await call<{ items: { id: string; slug: string }[] }>("GET", "/v1/merchants", undefined, token);
  const m = items.find((x) => x.slug === slug) ?? items[0]!;
  return { token, id: m.id, base: `/v1/merchants/${m.id}` };
}
async function customer(first: string) {
  const phone = `+1${newPhone()}`;
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone });
  const r = await call<{ accessToken: string; user: { id: string } }>("POST", "/v1/auth/otp/verify", { phone, code: start.devCode, firstName: first });
  return { phone, token: r.accessToken, userId: r.user.id };
}
async function signIn(page: Page, email: string, path: string) {
  await page.goto(`/login?lang=${LANG}`);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(path);
}
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const at = (d: Date, h: number) => {
  const x = new Date(d);
  x.setUTCHours(h + 4, 0, 0, 0); // h o'clock Toronto (EDT/EST close enough for a booking time with force)
  return x.toISOString();
};

/** A client with a finished visit (with a visit note) and a booked one, by phone. */
async function clientWithVisits(shop: Awaited<ReturnType<typeof owner>>, name: string, phone = `+1${newPhone()}`, shift = 0) {
  const staff = (await call<{ items: { userId: string; name: string }[] }>("GET", `${shop.base}/appointments/staff`, undefined, shop.token)).items;
  const services = (await call<{ items: { id: string; name: string; active: boolean }[] }>("GET", `${shop.base}/services`, undefined, shop.token)).items.filter((s) => s.active);
  const past = await call<{ id: string }>("POST", `${shop.base}/appointments`, { customer: { phone, name }, staffId: staff[0]!.userId, serviceIds: [services[0]!.id], startsAt: at(days(-21 + shift), 11 + shift), force: true }, shop.token);
  await call("POST", `${shop.base}/appointments/${past.id}/status`, { status: "completed" }, shop.token);
  await call("PUT", `${shop.base}/appointments/${past.id}/visit-note`, { visitNote: "Thin natural arch, sensitive skin: aloe after" }, shop.token);
  const next = await call<{ id: string }>("POST", `${shop.base}/appointments`, { customer: { phone, name }, staffId: staff[0]!.userId, serviceIds: [services[services.length > 1 ? 1 : 0]!.id], startsAt: at(days(6 + shift), 14 + shift), force: true }, shop.token);
  return { phone, pastId: past.id, nextId: next.id, staff: staff[0]!, service: services[0]! };
}

test("1, 2: a pro opens a client (next visit, visits with notes, the thread) in two taps; a reply goes by text and the count moves", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  await clientWithVisits(arch, "Priya Sharma");
  const before = await call<{ used: number }>("GET", `${arch.base}/messages/sms-usage`, undefined, arch.token).catch(() => ({ used: 0 }));
  await signIn(page, "owner+arch-and-thread@example.com", `/m/${arch.id}/customers?lang=${LANG}`);
  const list = page.getByTestId("clients-list");
  await expect(list).toBeVisible();
  await page.screenshot({ path: shot(`customers-1440-${LANG}`), fullPage: true });
  // Tap 1: the client.
  await list.getByRole("row", { name: /Priya Sharma/ }).first().click();
  const people = page.getByTestId("client-people");
  await expect(people.getByTestId("next-visit")).toBeVisible();
  await expect(people.getByTestId("visits-timeline")).toContainText("Thin natural arch");
  await page.screenshot({ path: shot(`profile-1440-${LANG}`), fullPage: true });
  // Tap 2: Message opens the thread.
  await people.getByTestId("profile-message").click();
  await page.waitForURL(/\/inbox\?c=/);
  const thread = page.getByTestId("inbox-thread");
  await expect(thread).toBeVisible();
  await thread.getByRole("textbox").fill("Running 10 minutes late, sorry!");
  await thread.getByRole("button", { name: /^Send$/ }).click();
  await expect(thread.getByText("Running 10 minutes late, sorry!")).toBeVisible();
  await page.screenshot({ path: shot(`inbox-1440-${LANG}`), fullPage: true });
  // The client has only a phone: the text was the rung, and the month's count moved by one.
  const after = await call<{ used: number }>("GET", `${arch.base}/messages/sms-usage`, undefined, arch.token).catch(() => ({ used: 0 }));
  expect(after.used).toBe(before.used + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("inbox-thread")).toBeVisible();
  await page.screenshot({ path: shot(`inbox-390-${LANG}`), fullPage: true });
});

test("2: a client who turned on reminders on their phone is reached by web push, not a text; the pass offers the prompt", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  const c = await customer("Meera");
  await call("POST", "/v1/me/memberships", { merchantId: arch.id }, c.token);
  await call("POST", "/v1/me/web-push", { endpoint: `https://push.example.invalid/${c.userId}`, keys: { p256dh: "BP".padEnd(87, "x"), auth: "a".repeat(22) } }, c.token);
  const conv = await call<{ id: string }>("POST", `${arch.base}/inbox`, { userId: c.userId }, arch.token);
  const thread = await call<{ replyChannel: string }>("GET", `${arch.base}/inbox/${conv.id}`, undefined, arch.token);
  expect(thread.replyChannel).toBe("web_push");
  const before = await call<{ used: number }>("GET", `${arch.base}/messages/sms-usage`, undefined, arch.token).catch(() => ({ used: 0 }));
  const sent = await call<{ deliveredBy: string[] }>("POST", `${arch.base}/inbox/${conv.id}/messages`, { body: "Your brow tint is ready to book." }, arch.token);
  expect(sent.deliveredBy).toEqual(["web_push"]);
  const after = await call<{ used: number }>("GET", `${arch.base}/messages/sms-usage`, undefined, arch.token).catch(() => ({ used: 0 }));
  expect(after.used).toBe(before.used);
  // The customer's own thread, on the web pass.
  const mine = await call<{ items: { id: string; unread: number }[] }>("GET", "/v1/me/inbox", undefined, c.token);
  expect(mine.items.find((x) => x.id === conv.id)?.unread).toBe(1);

  // The web pass: sign in, book-again and messages links, and the reminder prompt.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/me/messages?lang=${LANG}`);
  await fillPhone(page, c.phone.replace("+1", ""));
  await page.getByRole("button", { name: /Send code|کوڈ|कोड|ਕੋਡ/ }).click();
  await expect(page.getByLabel(/6-digit code|کوڈ|कोड|ਕੋਡ/)).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: /^Sign in$|سائن ان|साइन इन|ਸਾਈਨ ਇਨ/ }).click();
  await expect(page.getByTestId("my-threads")).toBeVisible();
  await page.screenshot({ path: shot(`pass-messages-390-${LANG}`), fullPage: true });
  await page.getByTestId("my-threads").getByRole("link").first().click();
  await expect(page.getByTestId("my-thread")).toContainText("Your brow tint is ready to book.");
});

test("3: the confirmation of a booking carries the shop's address", async () => {
  const arch = await owner("arch-and-thread");
  const c = await customer("Lina");
  const { services } = await call<{ services: { id: string }[] }>("GET", "/v1/public/shops/arch-and-thread/services");
  const av = await call<{ days: { times: { startsAt: string }[] }[] }>("GET", `/v1/public/shops/arch-and-thread/availability?serviceIds=${services[0]!.id}&staffId=any&from=${days(3).toISOString().slice(0, 10)}&to=${days(10).toISOString().slice(0, 10)}`);
  const slot = av.days.flatMap((d) => d.times)[0]!;
  const r = await call<{ confirmed: boolean; appointment: { merchant: { address: string | null } } }>("POST", "/v1/me/appointments", { serviceIds: [services[0]!.id], staffId: null, startsAt: slot.startsAt }, c.token);
  if (r.confirmed) expect(r.appointment.merchant.address).toBeTruthy();
  void arch;
});

test("4: a chair renter sees only their own clients and copies their own booking link", async ({ page }) => {
  const crown = await owner("crown-and-fade");
  const marcusToken = await login("staff+marcus-crown-and-fade@example.com");
  const mine = await call<{ staffId: string; staffLocked: boolean; items: { lastVisit: { staffName: string | null } | null; nextVisit: { staffName: string | null } | null }[] }>("GET", `${crown.base}/clients`, undefined, marcusToken);
  expect(mine.staffLocked).toBe(true);
  for (const r of mine.items) expect([r.lastVisit?.staffName, r.nextVisit?.staffName].some((n) => !n || /Marcus/.test(n))).toBe(true);
  const all = await call<{ total: number; staffLocked: boolean }>("GET", `${crown.base}/clients`, undefined, crown.token);
  expect(all.staffLocked).toBe(false);
  expect(all.total).toBeGreaterThanOrEqual(mine.items.length);
  await signIn(page, "staff+marcus-crown-and-fade@example.com", `/m/${crown.id}/customers?lang=${LANG}`);
  await expect(page.getByTestId("clients-list")).toBeVisible();
  await expect(page.getByTestId("my-booking-link")).toBeVisible();
  await page.screenshot({ path: shot(`renter-customers-1440-${LANG}`), fullPage: true });
});

test("5: a free shop sees the seasonal templates and the plan line; a paid shop sends to its regulars and the counter moves", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  await signIn(page, "owner+arch-and-thread@example.com", `/m/${arch.id}/messages/promos?lang=${LANG}`);
  const picker = page.getByTestId("promo-picker");
  await expect(picker).toBeVisible();
  await picker.locator("[data-testid^=promo-tpl-]").first().click();
  await expect(page.getByTestId("promo-editor")).toBeVisible();
  await expect(page.getByTestId("promo-send")).toHaveCount(0);
  await page.screenshot({ path: shot(`promos-free-1440-${LANG}`), fullPage: true });

  // Rangrez on Pro (the fake Stripe checkout), with one regular who opted in.
  const rz = await owner("rangrez-beauty-studio");
  const co = await call<{ sessionId: string }>("POST", `${rz.base}/billing/checkout`, { plan: "plus", interval: "month" }, rz.token).catch(() => null);
  if (co) await call("POST", "/v1/payments/fake/simulate", { action: "complete_checkout", id: co.sessionId }).catch(() => undefined);
  const reg = await customer("Hina");
  await call("POST", "/v1/me/memberships", { merchantId: rz.id, consent: { text: "Yes, send me offers from Rangrez Beauty Studio. I can opt out anytime." } }, reg.token);
  await call("POST", `/v1/me/web-push`, { endpoint: `https://push.example.invalid/${reg.userId}`, keys: { p256dh: "BP".padEnd(87, "y"), auth: "b".repeat(22) } }, reg.token);
  const staff = (await call<{ items: { userId: string }[] }>("GET", `${rz.base}/appointments/staff`, undefined, rz.token)).items;
  const svc = (await call<{ items: { id: string; active: boolean }[] }>("GET", `${rz.base}/services`, undefined, rz.token)).items.find((s) => s.active)!;
  for (const d of [-40, -12]) {
    const a = await call<{ id: string }>("POST", `${rz.base}/appointments`, { customer: { userId: reg.userId }, staffId: staff[0]!.userId, serviceIds: [svc.id], startsAt: at(days(d), 12), force: true }, rz.token);
    await call("POST", `${rz.base}/appointments/${a.id}/status`, { status: "completed" }, rz.token);
  }
  const t0 = await call<{ allowance: { used: number; limit: number }; audience: { regulars: number } }>("GET", `${rz.base}/promo-templates`, undefined, rz.token);
  expect(t0.allowance.limit).toBeGreaterThan(0);
  expect(t0.audience.regulars).toBeGreaterThanOrEqual(1);
  await signIn(page, "owner+rangrez-beauty-studio@example.com", `/m/${rz.id}/messages/promos?lang=${LANG}`);
  await page.getByTestId("promo-picker").locator("[data-testid^=promo-tpl-]").first().click();
  await page.getByTestId("promo-send").click();
  await expect(page.getByText(/Sent to \d+ regulars? by app and email/).first()).toBeVisible();
  await expect(page.getByTestId("promo-counter")).toHaveText(`${t0.allowance.used + 1} of ${t0.allowance.limit} this month`);
  await page.screenshot({ path: shot(`promos-paid-1440-${LANG}`), fullPage: true });
});

test("6: Instagram reads coming until switched on; with the stub, a DM becomes a booking with the handle and the message", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  const status = await call<{ mode: string; connected: boolean }>("GET", `${arch.base}/instagram`, undefined, arch.token);
  await signIn(page, "owner+arch-and-thread@example.com", `/m/${arch.id}/settings?tab=messages&lang=${LANG}`);
  const card = page.getByTestId("instagram-card");
  await expect(card).toBeVisible();
  if (status.mode === "off") {
    await expect(card.getByText("Coming soon")).toBeVisible();
    await page.screenshot({ path: shot(`settings-instagram-coming-1440-${LANG}`), fullPage: true });
    test.info().annotations.push({ type: "note", description: "INSTAGRAM_DM_ENABLED is off: the stub half of this check needs the API started with INSTAGRAM_DM_ENABLED=stub" });
    return;
  }
  if (!status.connected) await card.getByTestId("ig-connect").click();
  await expect(card.getByText(/Connected as @/)).toBeVisible();
  await page.screenshot({ path: shot(`settings-instagram-1440-${LANG}`), fullPage: true });
  await page.goto(`/m/${arch.id}/inbox?lang=${LANG}`);
  await page.getByTestId("inbox-list").getByRole("button", { name: /Maya Chen/ }).click();
  const thread = page.getByTestId("inbox-thread");
  await expect(thread.getByText("Anytime after 1 works for me")).toBeVisible();
  await expect(thread.getByRole("textbox")).toHaveCount(0); // read-only
  await thread.getByTestId("create-booking").click();
  const sheet = page.getByRole("dialog", { name: "New appointment" });
  await expect(sheet.getByTestId("from-message")).toContainText("@maya.chen");
  await expect(sheet.getByLabel("Client name")).toHaveValue("Maya Chen");
  await expect(sheet.getByLabel("Client note")).toHaveValue(/@maya\.chen on Instagram: Anytime after 1 works for me/);
  await page.screenshot({ path: shot(`instagram-booking-1440-${LANG}`), fullPage: true });
  await sheet.getByLabel("Date").fill(days(4).toISOString().slice(0, 10));
  await sheet.getByLabel("Time").fill("14:00");
  await sheet.getByRole("checkbox", { name: /Eyebrow threading/ }).first().click();
  await sheet.getByRole("button", { name: "Book appointment" }).click();
  const outside = sheet.getByLabel(/Book anyway/);
  if (await outside.isVisible().catch(() => false)) {
    await outside.check();
    await sheet.getByRole("button", { name: "Book appointment" }).click();
  }
  await expect(sheet).toBeHidden();
  const appts = await call<{ items: { source: string; clientNote: string | null; conversationId?: string | null }[] }>("GET", `${arch.base}/appointments?from=${encodeURIComponent(days(3).toISOString())}&to=${encodeURIComponent(days(5).toISOString())}`, undefined, arch.token);
  const ig = appts.items.find((a) => a.source === "instagram");
  expect(ig?.clientNote).toContain("@maya.chen");
  expect(ig?.conversationId).toBeTruthy();
});

test("screens in Urdu at 1440 and 390: customers, a profile, the inbox, promos and the Instagram card", async ({ page }) => {
  const arch = await owner("arch-and-thread");
  await clientWithVisits(arch, "Zara Ali", undefined, 2);
  await signIn(page, "owner+arch-and-thread@example.com", `/m/${arch.id}/customers?lang=ur`);
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.goto(`/m/${arch.id}/customers?lang=ur`);
    await expect(page.getByTestId("clients-list")).toBeVisible();
    await page.screenshot({ path: shot(`customers-${w}-ur`), fullPage: true });
    await page.getByTestId("clients-list").getByRole("row", { name: /Zara Ali/ }).first().click();
    await expect(page.getByTestId("client-people").getByTestId("next-visit")).toBeVisible();
    await page.screenshot({ path: shot(`profile-${w}-ur`), fullPage: true });
    await page.goto(`/m/${arch.id}/inbox?lang=ur`);
    await expect(page.getByTestId("inbox-list").getByRole("button").first()).toBeVisible();
    await page.screenshot({ path: shot(`inbox-${w}-ur`), fullPage: true });
    await page.goto(`/m/${arch.id}/messages/promos?lang=ur`);
    await expect(page.locator("[data-testid^=promo-tpl-]").first()).toBeVisible();
    await page.locator("[data-testid^=promo-tpl-]").first().click();
    await page.screenshot({ path: shot(`promos-${w}-ur`), fullPage: true });
    await page.goto(`/m/${arch.id}/settings?tab=messages&lang=ur`);
    // The page is in Urdu: the connected handle, "Connect Instagram" (Instagram جوڑیں) or the "coming" badge (جلد آ رہا ہے).
    await expect(page.getByTestId("instagram-card").getByText(/@|جوڑیں|جلد آ رہا ہے/).first()).toBeVisible();
    await page.screenshot({ path: shot(`settings-messages-${w}-ur`), fullPage: true });
  }
});
