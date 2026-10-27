/**
 * Fixes from the customer QA pass (docs/design/qa-matrix-customer.md): a dead shop link shows one message and one footer,
 * a held booking opened from its page shows the deposit to pay (not "Booked"), a salon pay page names the stylist the tip
 * goes to, and the split-bill page says Paid once.
 */
import { expect, test } from "@playwright/test";
import { API, fillPhone, newPhone } from "./fixtures";
import { ownerOf } from "./restaurant-fixtures";

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const phone = () => `+1${newPhone()}`;

test("a dead shop link shows one message and one footer", async ({ page }) => {
  await page.goto("/shops/no-such-shop-xyz");
  await expect(page.getByRole("heading", { name: "We couldn't find that page." })).toBeVisible();
  await expect(page.getByText("Part of Local Loyalty")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
});

test("a held booking opened from its page shows the deposit to pay, not 'Booked'", async ({ page }) => {
  const slug = "bloom-hair-studio";
  const { services } = await call<{ services: { id: string; name: string }[] }>("GET", `/v1/public/shops/${slug}/services`);
  const highlights = services.find((s) => s.name.startsWith("Highlights"))!;
  const from = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  const av = await call<{ days: { times: { startsAt: string }[] }[] }>("GET", `/v1/public/shops/${slug}/availability?serviceIds=${highlights.id}&staffId=any&from=${from}&to=${to}`);
  const times = av.days.flatMap((d) => d.times);
  const who = phone();
  const start = await call<{ devCode: string }>("POST", "/v1/auth/otp/start", { phone: who });
  const login = await call<{ accessToken: string }>("POST", "/v1/auth/otp/verify", { phone: who, code: start.devCode, firstName: "Meera" });
  const booked = await call<{ appointment: { id: string; pending: boolean } }>("POST", "/v1/me/appointments", { serviceIds: [highlights.id], staffId: null, startsAt: times[Math.floor(times.length / 2)]!.startsAt }, login.accessToken);
  expect(booked.appointment.pending).toBe(true);

  await page.goto(`/shops/${slug}/book/${booked.appointment.id}`);
  await fillPhone(page, who.replace("+1", ""));
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText(/Deposit \$\d+ to hold/).first()).toBeVisible();
  await expect(page.getByText(/We are holding this time until \d{1,2}:\d{2} [ap]\.m\.$/)).toBeVisible(); // one full stop at the end, not "a.m.."
  await expect(page.getByRole("button", { name: /Book and pay \$\d+ deposit/ })).toBeVisible();
  await expect(page.getByText("Booked", { exact: true })).toHaveCount(0);
});

test("the salon pay page names the stylist the tip goes to", async ({ page }) => {
  const bloom = await ownerOf("bloom-hair-studio");
  const base = `/v1/merchants/${bloom.id}`;
  const staff = (await call<{ items: { userId: string; name: string }[] }>("GET", `${base}/appointments/staff`, undefined, bloom.token)).items;
  const services = (await call<{ items: { id: string; name: string }[] }>("GET", `${base}/services`, undefined, bloom.token)).items;
  const cut = services.find((s) => s.name.startsWith("Cut"))!;
  // The demo day is busy: take the first stylist whose chair is free right now.
  let appt: { id: string } | null = null;
  let stylist: { userId: string; name: string } | null = null;
  for (const s of staff) {
    try {
      appt = await call<{ id: string }>("POST", `${base}/appointments`, { source: "walk_in", staffId: s.userId, serviceIds: [cut.id], customer: { phone: phone(), name: "Tipper Test" } }, bloom.token);
      stylist = s;
      break;
    } catch (e) {
      if (!String(e).includes("slot_taken")) throw e;
    }
  }
  if (!appt || !stylist) throw new Error("No Bloom stylist is free for a walk-in");
  const co = await call<{ invoice: { payUrl: string } }>("POST", `${base}/appointments/${appt.id}/checkout`, { mode: "link", tipCents: 0 }, bloom.token);
  await page.goto(new URL(co.invoice.payUrl).pathname);
  await expect(page.getByRole("heading", { name: `Add a tip for ${stylist.name}` })).toBeVisible();
});

test("a split-bill share says Paid once and the way back from the payment box is Back", async ({ page }) => {
  const nawab = await ownerOf("nawab-biryani-house");
  const menu = await call<{ categories: { items: { id: string }[] }[] }>("GET", "/v1/public/shops/nawab-biryani-house/menu");
  const item = menu.categories.flatMap((c) => c.items)[0]!;
  const order = await call<{ id?: string; order?: { id: string } }>("POST", `/v1/merchants/${nawab.id}/orders/counter`, { items: [{ catalogItemId: item.id, quantity: 2, modifiers: [] }], paymentMethod: "at_pickup", tipCents: 0 }, nawab.token);
  const split = await call<{ items: { payToken?: string; payUrl?: string }[] }>("POST", `/v1/merchants/${nawab.id}/orders/${order.order?.id ?? order.id}/splits`, { mode: "even", ways: 2 }, nawab.token);
  const link = split.items[0]!.payUrl ?? `/pay/split/${split.items[0]!.payToken}`;
  await page.goto(link.startsWith("http") ? new URL(link).pathname : link);
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await page.getByRole("button", { name: /^Pay \$/ }).last().click();
  await expect(page.getByText("Paid", { exact: true })).toHaveCount(2); // the caption over the amount and the banner title; not a third
});
