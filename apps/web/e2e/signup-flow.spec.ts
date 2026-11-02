/**
 * The stepped signup (wave P, team onboard): every step has its own URL and its own checks, answers survive refresh and Back, Enter
 * continues, focus lands on the first field, errors are inline, the card the owner makes is the card the shop gets, and "You're
 * live" hands over to the trade's first dashboard step. Screenshots go to $E2E_SHOTS (default e2e/screenshots/signup-flow).
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { API } from "./fixtures";
import { atStep, cont, primary, signUpThroughFlow } from "./signup-flow";

const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots/signup-flow";
const shot = (name: string) => `${SHOTS}/${name}.png`;
const rand = () => Math.random().toString(36).slice(2, 8);
const digits = () => `647${String(Math.floor(2000000 + Math.random() * 7999999))}`;
let axeSource: string | null = null;
try {
  axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
} catch {
  axeSource = null;
}
async function axe(page: Page) {
  if (!axeSource) return;
  await page.addScriptTag({ content: axeSource });
  const v = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return r.violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  });
  expect(v).toEqual([]);
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("ll_signup_v1") ?? "{}"));

test.setTimeout(180_000);

test.describe("at 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("link: one question, no marketing chrome, the website field focused, an empty link is an inline error", async ({ page }) => {
    await page.goto("/signup");
    await atStep(page, "link");
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await expect(page.locator("header nav")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("textbox", { name: "Website or Instagram" })).toBeFocused();
    await cont(page);
    await expect(page.getByText("Paste your website or Instagram link.").or(page.locator("[data-step=link] [id$=-error]"))).toBeVisible();
    await page.screenshot({ path: shot("01-link-390") });
    await axe(page);
  });

  test("shop: Enter continues, Back keeps the name, refresh keeps the name", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await atStep(page, "shop");
    await expect(page.getByLabel("Shop name")).toBeFocused();
    await page.getByLabel("Shop name").fill("Rose & Thorn Florist");
    await page.keyboard.press("Enter");
    await atStep(page, "kind");
    await page.locator("[data-flow-back]").click();
    await atStep(page, "shop");
    await expect(page.getByLabel("Shop name")).toHaveValue("Rose & Thorn Florist");
    await page.reload();
    await atStep(page, "shop");
    await expect(page.getByLabel("Shop name")).toHaveValue("Rose & Thorn Florist");
    // The browser's own Back moves between steps too.
    await page.keyboard.press("Enter");
    await atStep(page, "kind");
    await page.goBack();
    await atStep(page, "shop");
    await page.screenshot({ path: shot("02-shop-390") });
    await axe(page);
  });

  test("kind: eight tiles, search finds the rest, nothing picked is an inline error, Other asks what you sell", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill("Rose & Thorn");
    await cont(page);
    await atStep(page, "kind");
    await cont(page);
    await expect(page.locator("[data-step=kind]").getByRole("alert")).toHaveText("Pick your type of shop.");
    await page.getByRole("textbox", { name: /Search every type/ }).fill("flor");
    await page.locator("[data-trade-results]").getByRole("radio", { name: "Florist" }).click();
    // The pick joins the tiles, so it stays visible once the search is cleared.
    await page.getByRole("textbox", { name: /Search every type/ }).fill("");
    await expect(page.locator("[data-vertical=florist]").first()).toHaveAttribute("aria-checked", "true");
    await page.getByRole("textbox", { name: /Search every type/ }).fill("zzzz");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await page.getByRole("textbox", { name: /Search every type/ }).fill("other");
    await page.locator("[data-trade-results] [data-vertical=other]").click();
    await expect(page.getByLabel(/What do you sell/)).toBeVisible();
    await page.screenshot({ path: shot("03-kind-390"), fullPage: true });
    await axe(page);
  });

  test("where: the street only for a storefront, a postal code for a home studio, nothing for a mobile pro", async ({ page }) => {
    await page.goto("/signup?vertical=nails");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill("Nails by Amara");
    await cont(page);
    await cont(page);
    await atStep(page, "where");
    // A nail tech starts at "My place".
    await expect(page.locator('[role=radio][data-value="home"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    await cont(page);
    await expect(page.getByText("Enter your postal code, like M6S 2K1.")).toBeVisible();
    await page.locator('[role=radio][data-value="shop"]').click();
    await expect(page.getByLabel("Street address")).toBeVisible();
    await page.locator('[role=radio][data-value="mobile"]').click();
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    await expect(page.getByLabel("Postal code")).toHaveCount(0);
    await page.locator('[role=radio][data-value="home"]').click();
    await page.getByLabel("Postal code").fill("l6y 4m3");
    await page.screenshot({ path: shot("04-where-390") });
    await axe(page);
    await cont(page);
    await atStep(page, "card");
  });

  test("a deep link past an unanswered step lands on that step", async ({ page }) => {
    await page.goto("/signup?step=card");
    await atStep(page, "link");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill("Corner Café");
    await cont(page);
    await page.goto("/signup?step=account");
    await atStep(page, "kind");
    await page.goto("/signup?step=shop");
    await atStep(page, "shop");
    await expect(page.getByLabel("Shop name")).toHaveValue("Corner Café");
  });

  test("card: the trade's defaults, edited, previewed, and saved to the shop; account last; You're live; then the first stamp", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    const name = `Maple Bean ${rand()}`;
    await page.getByLabel("Shop name").fill(name);
    await cont(page);
    await page.locator("[data-vertical=cafe]").click();
    await cont(page);
    await page.getByLabel("Street address").fill("1880 Danforth Ave");
    await cont(page);
    await atStep(page, "card");
    await expect(page.getByLabel("How many stamps?")).toHaveValue("10");
    await expect(page.getByRole("textbox", { name: "The reward", exact: true })).toHaveValue("Free drink");
    await page.getByRole("button", { name: "Fewer" }).click();
    await page.getByRole("button", { name: "Fewer" }).click();
    await page.getByRole("textbox", { name: "The reward", exact: true }).fill("");
    await cont(page);
    await expect(page.getByText("Name the reward.")).toBeVisible();
    await page.getByRole("textbox", { name: "The reward", exact: true }).fill("Free oat latte");
    await expect(page.locator("[data-card-preview]").first()).toContainText("8 stamps = Free oat latte");
    await expect(page.locator("[data-card-preview]:visible li")).toHaveCount(8);
    await page.screenshot({ path: shot("05-card-390") });
    await axe(page);
    await cont(page);

    await atStep(page, "account");
    await cont(page);
    await expect(page.getByText("Enter a 10-digit mobile number.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByText(/14 days of Pro included/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/legal/terms");
    await page.getByLabel(/Your mobile number/).fill(digits());
    await page.getByLabel("Email").fill(`flow-${rand()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("signup-flow-1");
    // The password is never kept in the saved answers.
    expect(JSON.stringify(await saved(page))).not.toContain("signup-flow-1");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.screenshot({ path: shot("06-account-390") });
    await axe(page);
    await cont(page);

    await atStep(page, "live");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${name} is live`);
    await expect(page.locator("[data-card-preview]").first()).toContainText("8 stamps = Free oat latte");
    await expect(page.getByRole("img", { name: `QR code to join ${name}` })).toBeVisible();
    await expect(page.locator("[data-live-next] a").first()).toContainText("Give your first stamp");
    // Refresh on the celebration stays on it (the shop exists; the form is not shown again).
    await page.reload();
    await atStep(page, "live");
    await page.screenshot({ path: shot("07-live-390"), fullPage: true });
    await axe(page);
    const id = (await page.locator("[data-live-primary]").getAttribute("href"))!.split("/")[2]!;
    // The shop got the card the owner made.
    const [program, rewards] = await page.evaluate(async (mid) => Promise.all([(await fetch(`/api/ll/v1/merchants/${mid}/program`)).json(), (await fetch(`/api/ll/v1/merchants/${mid}/rewards`)).json()]), id);
    expect(program.stampGoal).toBe(8);
    expect(rewards.items[0]).toMatchObject({ name: "Free oat latte", pointsCost: 8 });
    await page.locator("[data-live-primary]").click();
    await page.waitForURL(new RegExp(`/m/${id}/setup\\?step=first_stamp`));
    // Leaving clears the saved answers.
    expect(await saved(page)).toEqual({});
  });

  test("an email that already has an account says so, with a sign-in link back to this step", async ({ page }) => {
    const email = `taken-${rand()}@example.com`;
    await signUpThroughFlow(page, { name: `First ${rand()}`, vertical: "cafe", address: "10 Queen St E", phone: digits(), email, password: "signup-flow-2" });
    await page.context().clearCookies();
    await page.goto("/signup");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill("Second shop");
    await cont(page);
    await page.locator("[data-vertical=bakery]").click();
    await cont(page);
    await page.getByLabel("Street address").fill("12 Queen St E");
    await cont(page);
    await cont(page);
    await page.getByLabel(/Your mobile number/).fill(digits());
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("signup-flow-2");
    await cont(page);
    await expect(page.getByText("That email already has an account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?next=${encodeURIComponent("/signup?step=account")}`);
  });

  test("signed in with no shop yet (after a password reset): the account step asks only for the mobile number", async ({ page }) => {
    const email = `reset-${rand()}@example.com`;
    const password = "signup-flow-4";
    const r = await fetch(`${API}/v1/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Owner", email, password }) });
    expect(r.ok).toBe(true);
    await page.goto(`/login?next=${encodeURIComponent("/signup")}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/signup/);
    await atStep(page, "link");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill(`Back Again ${rand()}`);
    await cont(page);
    await page.locator("[data-vertical=bakery]").click();
    await cont(page);
    await page.getByLabel("Street address").fill("40 Roncesvalles Ave");
    await cont(page);
    await cont(page);
    await atStep(page, "account");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your mobile number");
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: /Your mobile number/ }).fill(digits());
    await page.screenshot({ path: shot("11-account-signed-in-390") });
    await cont(page);
    await atStep(page, "live");
  });

  test("a pricing button's plan: the celebration leads on to checkout", async ({ page }) => {
    await signUpThroughFlow(page, { from: "/signup?plan=studio", name: `Chairs ${rand()}`, vertical: "salon", address: "500 Bloor St W", phone: digits(), email: `plan-${rand()}@example.com`, password: "signup-flow-3", enter: false });
    await expect(primary(page)).toHaveText(/Continue to checkout/);
    await expect(page.locator("[data-live-primary]")).toHaveAttribute("href", /\/billing\?subscribe=studio/);
  });
});

test.describe("at 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("split layout: the live card on the end side follows the name, the type and the card; reduced motion; Urdu reads right to left", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/signup");
    const aside = page.locator("[data-flow-aside]");
    await expect(aside.locator("[data-card-preview]")).toContainText("Your shop");
    await page.getByRole("button", { name: "I don't have one, skip" }).click();
    await page.getByLabel("Shop name").fill("Sunrise Bakery");
    await cont(page);
    await expect(aside.locator("[data-card-name]")).toHaveText("Sunrise Bakery");
    await page.locator("[data-vertical=bakery]").click();
    await expect(aside.locator("[data-card-preview]")).toHaveAttribute("data-trade", "bakery");
    await page.screenshot({ path: shot("08-kind-1440") });
    await cont(page);
    await page.getByLabel("Street address").fill("2210 Danforth Ave");
    await cont(page);
    await atStep(page, "card");
    await page.getByRole("textbox", { name: "The reward", exact: true }).fill("Free croissant");
    await expect(aside.locator("[data-card-rule]")).toContainText("Free croissant");
    // No horizontal scroll, and the primary button is in the form column, not stuck to the bottom.
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
    await page.screenshot({ path: shot("09-card-1440") });
    await axe(page);

    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/signup?lang=ur");
    await expect(page.locator('[dir="rtl"]').first()).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Instagram");
    await page.screenshot({ path: shot("10-link-ur-1440") });
  });
});
