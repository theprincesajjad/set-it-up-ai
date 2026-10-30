/**
 * Apple Wallet / Google Wallet shop cards (docs/engineering/wallet.md), against an API started with WALLET_DEV_FAKE=1 (throwaway
 * Apple signer and Google key; nothing reaches Apple or Google). Screenshots → E2E_WALLET_SHOTS (default e2e/screenshots/wallet).
 *
 *   iPhone   join → "Add to Apple Wallet" only → tapping downloads the shop's signed .pkpass
 *   Android  join → Google's official "Add to Google Wallet" button only → tapping opens the save link (dev-fake: a local page)
 *   computer the shop page shows both buttons and a QR that opens it on the phone
 *   owner    Settings → Wallet card: live Apple and Google previews follow the draft; saving keeps them
 */
import { inflateRawSync } from "node:zlib";
import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { API, cafeQr, fillPhone, newPhone } from "./fixtures";

const DIR = process.env.E2E_WALLET_SHOTS ?? "e2e/screenshots/wallet";
const shot = (name: string) => `${DIR}/${name}.png`;
const OWNER = { email: "owner+pinecone-coffee@example.com", password: "localloyalty-demo" };

/** Minimal .zip reader (local file headers; stored or deflated), enough for a .pkpass. */
function unzip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const size = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const extraLen = buf.readUInt16LE(o + 28);
    const name = buf.subarray(o + 30, o + 30 + nameLen).toString("utf8");
    const data = buf.subarray(o + 30 + nameLen + extraLen, o + 30 + nameLen + extraLen + size);
    out[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    o += 30 + nameLen + extraLen + size;
  }
  return out;
}

async function join(page: Page) {
  const { qrCode } = await cafeQr();
  await page.goto(`/j/${qrCode}`);
  await fillPhone(page, newPhone());
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByLabel("6-digit code")).toHaveValue(/^\d{6}$/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("Priya");
  await page.getByRole("button", { name: "Join Pinecone Coffee Co." }).click();
  await expect(page.getByText("You're in, Priya.")).toBeVisible();
}

async function phone(browser: Browser, device: string) {
  const ctx = await browser.newContext({ ...devices[device], acceptDownloads: true });
  return { ctx, page: await ctx.newPage() };
}

test("iPhone: after joining, one tap 'Add to Apple Wallet' downloads the shop's signed card", async ({ browser }) => {
  const { ctx, page } = await phone(browser, "iPhone 15");
  try {
    await join(page);
    const wallet = page.getByTestId("shop-wallet");
    await expect(wallet).toHaveAttribute("data-os", "ios");
    const apple = wallet.getByRole("button", { name: "Add to Apple Wallet" });
    await expect(apple).toBeVisible();
    await expect(wallet.getByRole("button", { name: "Add to Google Wallet" })).toHaveCount(0);
    await expect(page.getByTestId("wallet-desktop-qr")).toHaveCount(0);
    await wallet.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: shot("customer-iphone-add-to-apple-wallet") });
    const [download] = await Promise.all([page.waitForEvent("download"), apple.click()]);
    expect(download.suggestedFilename()).toBe("card.pkpass");
    const { readFile } = await import("node:fs/promises");
    const files = unzip(await readFile((await download.path())!));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["pass.json", "manifest.json", "signature", "strip@3x.png"]));
    const pass = JSON.parse(Buffer.from(files["pass.json"]!).toString());
    expect(pass).toMatchObject({ organizationName: "Pinecone Coffee Co.", storeCard: { secondaryFields: expect.arrayContaining([expect.objectContaining({ key: "member", value: "Priya" })]) } });
    expect(pass.barcodes[0].message).toMatch(/^LL:/);
  } finally {
    await ctx.close();
  }
});

test("Android: after joining, Google's official 'Add to Google Wallet' button opens the save link", async ({ browser }) => {
  const { ctx, page } = await phone(browser, "Pixel 7");
  try {
    await join(page);
    const wallet = page.getByTestId("shop-wallet");
    await expect(wallet).toHaveAttribute("data-os", "android");
    const google = wallet.getByRole("button", { name: "Add to Google Wallet" });
    await expect(google).toBeVisible();
    await expect(google.locator("img")).toHaveAttribute("src", "/wallet-badges/add-to-google-wallet-en-CA.svg");
    const box = (await google.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    await expect(wallet.getByRole("button", { name: "Add to Apple Wallet" })).toHaveCount(0);
    await wallet.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: shot("customer-android-add-to-google-wallet") });
    await google.click();
    await page.waitForURL((u) => u.pathname === "/v1/wallet/dev/google-save");
    await expect(page.getByTestId("google-dev-save")).toBeVisible();
    await expect(page.getByText(/"loyaltyObjects"/)).toBeVisible();
    await expect(page.getByText(/Pinecone Coffee Co\./).first()).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("computer: the shop page offers both wallets and a QR to open it on the phone", async ({ browser }) => {
  // Join on a phone-sized context, then carry the session to a desktop-sized one.
  const { ctx, page } = await phone(browser, "Pixel 7");
  await join(page);
  const state = await ctx.storageState();
  await ctx.close();
  const desk = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" });
  try {
    const p = await desk.newPage();
    const { slug } = await cafeQr();
    await p.goto(`/shops/${slug}#wallet`);
    const wallet = p.getByTestId("shop-wallet");
    await expect(wallet).toHaveAttribute("data-os", "other");
    await expect(wallet.getByRole("button", { name: "Add to Apple Wallet" })).toBeVisible();
    await expect(wallet.getByRole("button", { name: "Add to Google Wallet" })).toBeVisible();
    await expect(p.getByTestId("wallet-desktop-qr")).toBeVisible();
    await expect(p.getByRole("img", { name: "QR code that opens this page on your phone" })).toBeVisible();
    await wallet.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await p.screenshot({ path: shot("customer-desktop-both-wallets") });
  } finally {
    await desk.close();
  }
});

test("owner: Settings → Wallet card shows live Apple and Google previews that follow the draft", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });
  try {
    const page = await ctx.newPage();
    const t = ((await (await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(OWNER) })).json()) as { accessToken: string }).accessToken;
    const id = ((await (await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${t}` } })).json()) as { items: { id: string }[] }).items[0]!.id;
    // Start from the default card.
    await fetch(`${API}/v1/merchants/${id}/wallet-card`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: "{}" });
    await page.goto(`/login?next=${encodeURIComponent(`/m/${id}/settings?tab=wallet`)}`);
    await page.getByLabel("Email").fill(OWNER.email);
    await page.getByLabel("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/settings"));
    await expect(page.getByTestId("wallet-card-settings")).toBeVisible();
    const apple = page.getByTestId("apple-card");
    const google = page.getByTestId("google-card");
    await expect(apple).toBeVisible();
    await expect(google).toBeVisible();
    await expect(apple.getByText("Priya")).toBeVisible();
    // The strip is the API's real image.
    await expect(apple.locator("img").last()).toHaveAttribute("src", /\/v1\/wallet\/strip\.png\?k=/);
    await page.screenshot({ path: shot("business-settings-wallet-card"), fullPage: true });
    await apple.screenshot({ path: shot("preview-apple-card") });
    await google.screenshot({ path: shot("preview-google-card") });

    // Change the colour and the reward line: both previews follow.
    await page.getByLabel("Card colour", { exact: true }).first().fill("#7C3AED");
    await page.getByLabel(/Reward line/).fill("Free latte");
    await expect(apple).toHaveCSS("background-color", "rgb(124, 58, 237)");
    await expect(google).toHaveCSS("background-color", "rgb(124, 58, 237)");
    await expect(apple.getByText(/Free latte/)).toBeVisible();
    // Back of the card.
    await page.getByRole("radio", { name: "Back" }).click();
    await expect(page.getByTestId("apple-card-back")).toContainText("Member code");
    await page.getByTestId("apple-card-back").screenshot({ path: shot("preview-apple-card-back") });
    await page.getByRole("radio", { name: "Front" }).click();
    await page.getByRole("button", { name: "Save wallet card" }).click();
    await expect(page.getByText("Saved. Cards already in wallets update in a few minutes.")).toBeVisible();
    const saved = await (await fetch(`${API}/v1/merchants/${id}/wallet-card`, { headers: { authorization: `Bearer ${t}` } })).json();
    expect(saved.settings).toMatchObject({ color: "#7C3AED", rewardText: "Free latte" });
    await apple.screenshot({ path: shot("preview-apple-card-custom") });
    // Leave the shop as the other suites expect it.
    await fetch(`${API}/v1/merchants/${id}/wallet-card`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: "{}" });
  } finally {
    await ctx.close();
  }
});
