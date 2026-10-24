import { expect, test } from "@playwright/test";

const SHOP = "shree-thali-and-tiffin";

/** A fresh Canadian mobile number per run, so the OTP rate limits never carry over. */
const phone = () => "416555" + String(Math.floor(1000 + Math.random() * 8999));

test("Urdu login → OTP → back on the restaurant page with the language kept", async ({ page }) => {
  const next = `/shops/${SHOP}/tiffin`;
  await page.goto(`/login?lang=ur&next=${encodeURIComponent(next)}`);

  // Customer tab is preselected for a shop return path; the page is Urdu and right-to-left.
  await expect(page.locator("html")).toHaveAttribute("lang", "en-CA");
  const scope = page.locator('div[lang="ur-PK"][dir="rtl"]').first();
  await expect(scope).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("سائن اِن کریں");
  await expect(page.getByRole("tab", { name: "گاہک" })).toHaveAttribute("aria-selected", "true");

  // Phone step, in Urdu. A bad number gets an Urdu error.
  const field = page.getByLabel("موبائل نمبر");
  await field.fill("123");
  await page.getByRole("button", { name: "کوڈ بھیجیں" }).click();
  await expect(page.getByText("10 ہندسوں کا موبائل نمبر درج کریں۔")).toBeVisible();
  await field.fill(phone());
  await page.getByRole("button", { name: "کوڈ بھیجیں" }).click();

  // Code step: six boxes read left to right inside the RTL page; dev autofill puts the code in.
  const code = page.getByLabel("6 ہندسوں کا کوڈ");
  await expect(code).toHaveValue(/^\d{6}$/);
  const box = await page.locator('input[autocomplete="one-time-code"]').evaluate((el) => getComputedStyle(el.parentElement!).direction);
  expect(box).toBe("ltr");
  await page.getByRole("button", { name: "سائن اِن کریں" }).last().click();

  // Back on the restaurant page, still Urdu (?lang= carried through the redirect, cookie remembered).
  await page.waitForURL(new RegExp(`${next}\\?lang=ur`));
  await expect(page.locator('div[lang="ur-PK"][dir="rtl"]').first()).toBeVisible();
  await expect(page.getByRole("link", { name: "شرائط", exact: true })).toBeVisible(); // pass footer, Urdu
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "ll_lang")?.value).toBe("ur");
});

test("signed-out tiffin page signs in inline, in Hindi, without leaving", async ({ page }) => {
  await page.goto(`/shops/${SHOP}/tiffin?lang=hi`);
  await page.getByRole("button", { name: "यह प्लान चुनें" }).first().click();
  await expect(page.getByText("नीचे अपने फ़ोन से साइन इन करें, फिर सब्सक्राइब करें।")).toBeVisible();
  await page.getByLabel("मोबाइल नंबर").fill(phone());
  await page.getByRole("button", { name: "कोड भेजें" }).click();
  await expect(page.getByLabel("6 अंकों का कोड")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "साइन इन करें" }).last().click();
  // Same page, now signed in (the inline sign-in is gone), language kept.
  await expect(page.getByLabel("मोबाइल नंबर")).toHaveCount(0);
  expect(page.url()).toContain("/tiffin");
  await expect(page.locator('div[lang="hi-IN"]').first()).toBeVisible();
});

test("join page: Punjabi, with the CASL consent unticked and complete", async ({ page }) => {
  const res = await fetch(`${process.env.E2E_API_URL ?? "http://localhost:4100"}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" }) });
  const { accessToken } = (await res.json()) as { accessToken: string };
  const api = process.env.E2E_API_URL ?? "http://localhost:4100";
  const { items } = (await (await fetch(`${api}/v1/merchants`, { headers: { authorization: `Bearer ${accessToken}` } })).json()) as { items: { id: string }[] };
  const detail = (await (await fetch(`${api}/v1/merchants/${items[0]!.id}`, { headers: { authorization: `Bearer ${accessToken}` } })).json()) as { locations: { qrCode: string }[] };
  await page.goto(`/j/${detail.locations[0]!.qrCode}?lang=pa`);
  await expect(page.locator('div[lang="pa-IN"]').first()).toBeVisible();
  const consent = page.getByRole("checkbox").first();
  await expect(consent).not.toBeChecked();
  await expect(page.getByText(/ਵਿਕਲਪਿਕ.*ਟਿੱਕ ਨਹੀਂ.*STOP/)).toBeVisible();
});
