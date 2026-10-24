/**
 * Café counter acceptance checks (docs/research/cafes-retail.md section 7): cold scan stamps in under 3 s,
 * one match gives exactly one award, undo reverses it, two matches show a list, a second scan inside the
 * cooldown says so. Runs against the seeded API (Pinecone Coffee, stamps, Stamp on scan on).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const OWNER = {
  email: "owner+pinecone-coffee@example.com",
  password: "localloyalty-demo",
};
test.describe.configure({ retries: 1 }); // dev-server compile can add a second to a cold first scan
test.use({
  viewport: { width: 1280, height: 900 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
});

async function call<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function setup() {
  const login = await fetch(`${API}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(OWNER),
  });
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const { items } = await call<{ items: { id: string }[] }>(
    "GET",
    "/v1/merchants",
    token,
  );
  return { token, id: items[0]!.id };
}

const randPhone = () =>
  `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;

/** A member who exists but has not been stamped today: created by an award, then that award is undone. */
async function member(
  token: string,
  id: string,
  name: string,
  phone = randPhone(),
) {
  const res = await call<{
    transactionId: string;
    member: { memberId: string; memberCode: string };
  }>("POST", `/v1/merchants/${id}/counter/award`, token, {
    phone,
    customerName: name,
    idempotencyKey: `e2e-${phone}-${Date.now()}`,
  });
  await call(
    "POST",
    `/v1/merchants/${id}/counter/transactions/${res.transactionId}/undo`,
    token,
    {},
  );
  return { phone, code: res.member.memberCode, memberId: res.member.memberId };
}

async function balance(
  token: string,
  id: string,
  m: { code: string; memberId: string },
) {
  const r = await call<{ items: { memberId: string; balance: number }[] }>(
    "GET",
    `/v1/merchants/${id}/counter/lookup?q=${encodeURIComponent(m.code)}`,
    token,
  );
  return r.items.find((x) => x.memberId === m.memberId)?.balance ?? NaN;
}

async function signIn(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.getByRole("region", { name: "Scan a card" })).toBeVisible();
}

test("cold scan stamps in under 3 seconds and undo reverses it", async ({
  page,
}) => {
  const { token, id } = await setup();
  const m = await member(token, id, "Scan Tester");
  const before = await balance(token, id, m);
  await signIn(page, `/m/${id}/counter`);
  // A hardware scanner types the payload fast and ends with Enter.
  await page.keyboard.type(`LL:${m.code}`, { delay: 5 });
  const started = Date.now();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Scan Tester" })).toBeVisible({
    timeout: 3000,
  });
  expect(Date.now() - started).toBeLessThan(3000);
  expect(await balance(token, id, m)).toBe(before + 1);
  // Exactly one award; undo reverses it.
  await page.getByRole("button", { name: /^Undo \d+s$/ }).click();
  await expect.poll(() => balance(token, id, m)).toBe(before);
});

test("one match by last four digits stamps exactly once", async ({ page }) => {
  const { token, id } = await setup();
  // Unique last four digits for this run so exactly one member matches.
  const phone = randPhone();
  const m = await member(token, id, "Single Match", phone);
  const before = await balance(token, id, m);
  await signIn(page, `/m/${id}/counter`);
  const last4 = phone.slice(-4);
  for (const d of last4)
    await page
      .getByRole("group", { name: "Keypad" })
      .getByRole("button", { name: d, exact: true })
      .click();
  const pick = page.getByRole("list", { name: "Matching members" });
  if (await pick.isVisible().catch(() => false)) {
    // Another seeded member shares the digits: choose ours by name; still exactly one award.
    await pick.getByRole("button", { name: "Stamp Single Match" }).click();
  }
  await expect(page.getByRole("heading", { name: "Single Match" })).toBeVisible(
    { timeout: 3000 },
  );
  await page.waitForTimeout(800);
  expect(await balance(token, id, m)).toBe(before + 1);
});

test("two matches show a list and nothing is stamped until one is tapped", async ({
  page,
}) => {
  const { token, id } = await setup();
  const tail = String(Math.floor(1000 + Math.random() * 8999));
  const a = await member(token, id, "Twin One", `647555${tail}`);
  const b = await member(token, id, "Twin Two", `416777${tail}`);
  const beforeA = await balance(token, id, a);
  const beforeB = await balance(token, id, b);
  await signIn(page, `/m/${id}/counter`);
  for (const d of tail)
    await page
      .getByRole("group", { name: "Keypad" })
      .getByRole("button", { name: d, exact: true })
      .click();
  const list = page.getByRole("list", { name: "Matching members" });
  await expect(list).toBeVisible();
  await expect(
    list.getByRole("button", { name: "Stamp Twin One" }),
  ).toBeVisible();
  await expect(
    list.getByRole("button", { name: "Stamp Twin Two" }),
  ).toBeVisible();
  expect(await balance(token, id, a)).toBe(beforeA);
  await list.getByRole("button", { name: "Stamp Twin Two" }).click();
  await expect(page.getByRole("heading", { name: "Twin Two" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await balance(token, id, b)).toBe(beforeB + 1);
  expect(await balance(token, id, a)).toBe(beforeA);
});

test("a second scan inside the cooldown says so and adds nothing", async ({
  page,
}) => {
  const { token, id } = await setup();
  const m = await member(token, id, "Twice Tester");
  await signIn(page, `/m/${id}/counter`);
  await page.keyboard.type(`LL:${m.code}`, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Twice Tester" }),
  ).toBeVisible();
  const after = await balance(token, id, m);
  await page.getByRole("button", { name: "Next customer" }).click();
  await page.keyboard.type(`LL:${m.code}`, { delay: 5 });
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/already got stamps for this visit/).first(),
  ).toBeVisible();
  expect(await balance(token, id, m)).toBe(after);
});
