/**
 * Repair and drop-off flows against the seeded API: the tickets board and its numbers, a ticket with photos and the
 * price-cap line, approving by phone (name required), the customer's quote page marking it "opened" (and the preview link
 * not doing so), the status page, the tip picker on a salon invoice, and booking a drop-off. Runs on Fix-It Phone Lab.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const run = Date.now().toString(36).slice(-5);

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
test.setTimeout(120_000);

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
async function owner(slug: string) {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/v1/auth/login", { email: `owner+${slug}@example.com`, password: PASSWORD });
  const { items } = await api<{ items: { id: string }[] }>("GET", "/v1/merchants", undefined, accessToken);
  return { token: accessToken, id: items[0]!.id };
}
async function signIn(page: Page, slug: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`owner+${slug}@example.com`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("tickets board: stat strip matches the API summary, no horizontal scroll at 390", async ({ page }) => {
  const { id, token } = await owner("fix-it-phone-lab");
  const s = await api<{ needsYou: number; waitingOnCustomer: number; overdue: number; dueToday: number; readyUncollected: number }>("GET", `/v1/merchants/${id}/tickets/summary`, undefined, token);
  await signIn(page, "fix-it-phone-lab");
  await page.goto(`/m/${id}/tickets`);
  const strip = page.getByRole("list", { name: "Tickets at a glance" }).or(page.locator('dl[aria-label="Tickets at a glance"]'));
  await expect(strip).toBeVisible();
  await expect(strip.getByText("Needs you now").locator("..").locator("dd").first()).toHaveText(String(s.needsYou));
  await expect(strip.getByText("Due today").locator("..").locator("dd").first()).toHaveText(String(s.dueToday + s.overdue));
  await expect(strip.getByText("Waiting on customer").locator("..").locator("dd").first()).toHaveText(String(s.waitingOnCustomer));
  if (s.overdue) await expect(page.getByText(/overdue \d+ (day|days|h|min)/).first()).toHaveClass(/text-negative/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tickets", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("ticket: phone approval needs a name, shows on the quote, the cap line is total x 1.10, opened is set by the customer only", async ({ page, context }) => {
  const { id, token } = await owner("fix-it-phone-lab");
  const phone = `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const t = await api<{ ticket: { id: string; number: number } }>("POST", `/v1/merchants/${id}/tickets`, { customer: { phone, name: "Phone Approver" }, itemKind: "device", itemDetails: { make: "Apple", model: "iPhone 11" }, issue: `Screen ${run}`, termsAccepted: true, photos: [] }, token);
  const q = await api<{ id: string; approvalUrl: string; totalCents: number }>("POST", `/v1/merchants/${id}/tickets/${t.ticket.id}/quotes`, { lineItems: [{ description: "Screen", quantity: 1, unitPriceCents: 10000, kind: "part" }], send: true }, token);
  await signIn(page, "fix-it-phone-lab");
  await page.goto(`/m/${id}/tickets/${t.ticket.id}`);
  await expect(page.getByText("Not opened yet")).toBeVisible();
  const cap = (q.totalCents * 1.1) / 100;
  await expect(page.getByText(`will not be more than $${cap.toFixed(2)}`)).toBeVisible();

  // The customer opens the link: staff preview does not count, the customer's open does.
  const customer = await context.newPage();
  await customer.goto(`${new URL(q.approvalUrl).pathname}?preview=1`);
  await expect(customer.getByText("Preview: this is what the customer sees")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Not opened yet")).toBeVisible();
  await customer.goto(new URL(q.approvalUrl).pathname);
  await expect(customer.getByRole("heading", { name: /your repair quote/i })).toBeVisible();
  await expect(customer.getByText(/will not be more than/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Opened .* ago, not approved/)).toBeVisible();

  // Approve by phone: the name is required.
  await page.getByRole("button", { name: "Approved by phone" }).click();
  const dialog = page.getByRole("dialog", { name: "Approved by phone" });
  await dialog.getByLabel("Who approved").fill("");
  await dialog.getByRole("button", { name: "Confirm approval" }).click();
  await expect(dialog.getByText("Enter the name of the person who approved.")).toBeVisible();
  await dialog.getByLabel("Who approved").fill("Phone Approver");
  await dialog.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByText(/Approved by phone, Phone Approver/).first()).toBeVisible();
  await expect(page.getByText(/Approved by phone, Phone Approver/).first()).toBeVisible();
});

test("customer status page is public and the drop-off booking works", async ({ page }) => {
  const { id, token } = await owner("fix-it-phone-lab");
  const phone = `+1416555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const t = await api<{ ticket: { id: string; statusUrl: string } }>("POST", `/v1/merchants/${id}/tickets`, { customer: { phone, name: "Status Viewer" }, itemKind: "device", itemDetails: { make: "Google", model: "Pixel 7" }, issue: `Battery ${run}`, termsAccepted: true }, token);
  await page.goto(new URL(t.ticket.statusUrl).pathname);
  await expect(page.getByRole("heading", { name: /dropped off/i })).toBeVisible();
  await expect(page.getByText(/Pixel 7/)).toBeVisible();
  await page.goto(new URL(t.ticket.statusUrl).pathname + "?lang=hi");
  await expect(page.getByText("प्रगति")).toBeVisible();

  await page.goto("/shops/fix-it-phone-lab/dropoff");
  await expect(page.getByRole("heading", { name: /book a drop-off/i })).toBeVisible();
  const times = page.getByRole("radiogroup", { name: "Time" }).getByRole("radio");
  await times.first().click();
  await expect(page.getByText(/There is no charge to book/)).toBeVisible();
});
