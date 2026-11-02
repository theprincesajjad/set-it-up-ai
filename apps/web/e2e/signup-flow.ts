/**
 * Helpers for the stepped signup (wave P): link → shop → kind → where → card → account → live. Specs that only need "a new shop
 * through the real signup" call `signUpThroughFlow`; specs about one step drive that step themselves with `cont` and `atStep`.
 */
import { expect, type Page } from "@playwright/test";

/** The step's primary button (sticky on phones). */
export const primary = (page: Page) => page.locator("[data-flow-footer] button[type=submit], [data-flow-footer] [data-live-primary]").first();
export const cont = (page: Page) => primary(page).click();
/** Wait until the flow shows `step` (the form carries data-step and the URL carries ?step=). */
export async function atStep(page: Page, step: string) {
  await expect(page.locator(`[data-step=${step}]`)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`[?&]step=${step}`));
}

export interface SignupInput {
  name: string;
  /** A `data-vertical` value; picked from the tiles, or through the search when it is not one of the eight. */
  vertical: string;
  /** Search text that finds a non-tile vertical (default: its English label is typed by the caller via `search`). */
  search?: string;
  work?: "shop" | "home" | "mobile";
  address?: string;
  postal?: string;
  /** Change the reward on "Your loyalty card". */
  reward?: string;
  phone: string;
  email: string;
  password: string;
  /** Start somewhere other than /signup (a landing link with ?plan=, ?lang= ...). */
  from?: string;
  /** Go on from "You're live" into the dashboard (default true). */
  enter?: boolean;
}

/** The whole flow, skipping the website. Returns the new shop's id. */
export async function signUpThroughFlow(page: Page, o: SignupInput): Promise<string> {
  await page.goto(o.from ?? "/signup");
  await atStep(page, "link");
  await page.getByRole("button", { name: "I don't have one, skip" }).click();
  await atStep(page, "shop");
  await page.getByLabel("Shop name").fill(o.name);
  await cont(page);
  await atStep(page, "kind");
  await pickVertical(page, o.vertical, o.search);
  await cont(page);
  await atStep(page, "where");
  if (o.work) await page.locator(`[role=radio][data-value="${o.work}"]`).click();
  if ((o.work ?? "shop") === "shop" && o.address) await page.getByLabel("Street address").fill(o.address);
  if (o.work === "home") await page.getByLabel("Postal code").fill(o.postal ?? "M6S 2K1");
  await cont(page);
  await atStep(page, "card");
  if (o.reward) await page.getByRole("textbox", { name: "The reward", exact: true }).fill(o.reward);
  await cont(page);
  await atStep(page, "account");
  await page.getByLabel(/Your mobile number/).fill(o.phone);
  await page.getByLabel("Email").fill(o.email);
  await page.getByLabel("Password", { exact: true }).fill(o.password);
  await cont(page);
  await atStep(page, "live");
  const href = (await page.locator("[data-live-primary]").getAttribute("href"))!;
  const id = href.split("/")[2]!;
  if (o.enter !== false) {
    await page.locator("[data-live-primary]").click();
    await page.waitForURL(/\/m\/[^/]+\//, { timeout: 60_000 });
  }
  return id;
}

export async function pickVertical(page: Page, vertical: string, search?: string) {
  const tile = page.locator(`[data-vertical="${vertical}"]`).first();
  if (!(await tile.count()) && search) await page.getByRole("textbox", { name: /Search every type/ }).fill(search);
  await page.locator(`[data-vertical="${vertical}"]`).first().click();
  await expect(page.locator(`[data-vertical="${vertical}"]`).first()).toHaveAttribute("aria-checked", "true");
}
