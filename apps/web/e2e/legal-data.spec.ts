/**
 * Legal pages in French (Law 25) and with no internal notes, the owner's "Your data" downloads, and signed photo links.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";

const PASSWORD = "localloyalty-demo";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
test.setTimeout(120_000);

const INTERNAL = ["Counsel", "VERIFY", "checklist", "Bracketed", "Finance note", "To draft", "Traduction", "à faire réviser", "{{"];

test("every published legal page shows no internal notes and keeps its draft banner", async ({ page }) => {
  for (const [url, banner] of [
    ["/legal/terms", "DRAFT: not reviewed by a lawyer and not in effect."],
    ["/legal/privacy", "DRAFT: not reviewed by a lawyer and not in effect."],
    ["/legal/rewards", "DRAFT: not reviewed by a lawyer and not in effect."],
    ["/legal/merchants", "DRAFT: not reviewed by a lawyer and not in effect."],
    ["/legal/privacy?lang=fr", "BROUILLON : non révisé par un juriste et non en vigueur."],
    ["/legal/rewards?lang=fr", "BROUILLON : non révisé par un juriste et non en vigueur."],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("note")).toContainText(banner);
    const body = page.locator("body");
    for (const bad of INTERNAL) await expect(body, `${url}: ${bad}`).not.toContainText(bad);
  }
});

test("the privacy policy and rewards terms are published in French at ?lang=fr, with a switch each way", async ({ page }) => {
  await page.goto("/legal/privacy");
  await expect(page.getByRole("link", { name: "Français" })).toHaveAttribute("href", "/legal/privacy?lang=fr");
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/legal\/privacy\?lang=fr$/);
  const article = page.locator("article");
  await expect(article.getByRole("heading", { level: 1 })).toContainText("Politique de confidentialité");
  await expect(article).toHaveAttribute("lang", "fr-CA");
  await expect(article).toContainText("Nous ne vendons pas vos renseignements personnels.");
  // the same tokens as the English page: retention periods from the one config, in French
  for (const text of ["90 jours", "24 mois", "12 mois", "30 jours", "7 jours", "Loi 25", "Commission d'accès à l'information", "STOP"]) await expect(article).toContainText(text);
  await expect(article).not.toContainText("{{");
  await expect(article).not.toContainText(/\b\d+ (days|months)\b/);
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.locator("article").getByRole("heading", { level: 1 })).toContainText("Privacy Policy");

  await page.goto("/legal/rewards?lang=fr");
  await expect(page.locator("article")).toContainText("Vos points n'expirent jamais");
  await expect(page.locator("article")).toContainText("90 jours");
  // no French for the rest
  await page.goto("/legal/terms");
  await expect(page.getByRole("link", { name: "Français" })).toHaveCount(0);
  const unfrench = await page.goto("/legal/terms?lang=fr");
  expect(unfrench?.status()).toBe(200);
  await expect(page.locator("article")).toContainText("Customer Terms of Service");
  // the French page fits a phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/legal/privacy?lang=fr");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

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

test("Settings > Privacy > Your data: one CSV for each kind of record and a ZIP of everything", async ({ page }) => {
  const { id } = await owner("pinecone-coffee");
  await signIn(page, "pinecone-coffee");
  await page.goto(`/m/${id}/settings`);
  await page.getByRole("tab", { name: "Privacy" }).click();
  const list = page.getByRole("list", { name: "Data you can download" });
  await expect(list).toBeVisible();
  for (const label of ["Members", "Visits", "Orders", "Order items", "Appointments", "Tiffin subscriptions", "Tiffin deliveries", "Catering events", "Hall bookings", "Repair tickets", "Quotes", "Invoices", "Reviews", "Messages sent"]) await expect(list.getByText(label, { exact: true })).toBeVisible();

  const members = page.waitForEvent("download");
  await list.getByRole("link", { name: /Members/ }).getByText("CSV").click();
  const dl = await members;
  expect(dl.suggestedFilename()).toMatch(/pinecone-coffee-members-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await dl.path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(path, "utf8")).toMatch(/^member_id,name,phone,email,member_code/);

  const zip = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download everything \(ZIP\)/ }).click();
  const z = await zip;
  expect(z.suggestedFilename()).toMatch(/customer-data-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(readFileSync((await z.path())!).subarray(0, 2).toString()).toBe("PK");
});

test("repair photos are served only through signed links that stop working when changed", async () => {
  const { id, token } = await owner("fix-it-phone-lab");
  const res = await fetch(`${API}/v1/merchants/${id}/uploads`, { method: "POST", headers: { "content-type": "image/png", authorization: `Bearer ${token}` }, body: PNG });
  expect(res.status).toBe(201);
  const up = (await res.json()) as { url: string };
  expect(up.url).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
  expect((await fetch(up.url)).status).toBe(200);
  const u = new URL(up.url);
  expect((await fetch(`${u.origin}${u.pathname}`)).status).toBe(403); // the bare path is not a link
  const sig = u.searchParams.get("sig")!;
  u.searchParams.set("sig", (sig[0] === "0" ? "1" : "0") + sig.slice(1));
  expect((await fetch(u)).status).toBe(403);
});
