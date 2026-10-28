// Main Street Warm screenshots at 390: wallet, card, rewards, shops, activity, shop detail, booking.
// Usage: E2E_API_URL=http://localhost:4550 E2E_OUT=<dir> node e2e/warm-shots.mjs [light|dark|ur ...]
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routeTiles } from "./lib.mjs";
import { serve } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_WEB_PORT ?? 8550);
const WEB = `http://localhost:${PORT}`;
const API = process.env.E2E_API_URL ?? "http://localhost:4550";
const OUT = process.env.E2E_OUT ?? join(here, "screenshots");
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ["light", "dark", "ur"];
const PHONE = process.env.E2E_CUSTOMER_PHONE ?? "+16475551009";
const SHOP = process.env.E2E_SHOP ?? "pinecone-coffee";
const BOOK = process.env.E2E_BOOK ?? "bloom-hair-studio";

await mkdir(OUT, { recursive: true });
const server = await serve(join(here, "..", "dist-web"), PORT);
const browser = await chromium.launch();

const post = async (path, body) => (await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

async function signedInState() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/`);
  await page.getByText("Get started").waitFor();
  await page.getByText("Get started", { exact: true }).first().click();
  const field = page.getByLabel("Mobile number");
  await field.waitFor();
  await field.fill(PHONE.replace(/^\+1/, ""));
  const started = page.waitForResponse((r) => r.url().endsWith("/v1/auth/otp/start"));
  await page.getByRole("button", { name: "Send code" }).click();
  const { devCode } = await (await started).json();
  const otp = page.getByLabel("6-digit code");
  await otp.waitFor();
  await otp.fill(devCode);
  await page.waitForTimeout(3500);
  const st = await ctx.storageState();
  await ctx.close();
  return st;
}

// E2E_STATE=<file> caches the signed-in browser state (the API allows 5 codes per phone per hour).
const stateFile = process.env.E2E_STATE;
let state;
if (stateFile && existsSync(stateFile)) state = JSON.parse(await readFile(stateFile, "utf8"));
else {
  state = await signedInState();
  if (stateFile) await writeFile(stateFile, JSON.stringify(state));
}
const failures = [];
for (const mode of modes) {
  const ur = mode === "ur" || mode === "hi" || mode === "pa";
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: mode === "dark" ? "dark" : "light",
    locale: "en-CA",
    timezoneId: "America/Toronto",
    geolocation: { latitude: 43.6475, longitude: -79.4487 },
    permissions: ["geolocation"],
  });
  await routeTiles(ctx);
  // The push pre-prompt sheet (first earn) would cover the wallet: mark it as already shown.
  await ctx.addInitScript(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("ll.prefs.v1") ?? "{}");
      localStorage.setItem("ll.prefs.v1", JSON.stringify({ ...prefs, pushPrompted: true }));
    } catch {
      /* ignore */
    }
  });
  if (ur) await ctx.addInitScript((l) => localStorage.setItem("ll.locale.v1", JSON.stringify(l)), mode);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  pageerror: ${e.message}`));
  const shot = async (name, path, { wait = 1800, scroll = 0 } = {}) => {
    try {
      await page.goto(`${WEB}${path}`);
      await page.waitForTimeout(wait);
      // The push pre-prompt sheet (first earn) is dismissed so it never covers the screen.
      const turnOn = page.getByRole("button", { name: "Turn on" });
      if (await turnOn.isVisible().catch(() => false)) {
        const dismiss = page.getByRole("button", { name: /^(Not now|Close|Dismiss)/i }).first();
        if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
        else await page.mouse.click(195, 100);
        await page.waitForTimeout(600);
      }
      if (scroll) { await page.mouse.move(195, 500); await page.mouse.wheel(0, scroll); await page.waitForTimeout(500); }
      await page.screenshot({ path: join(OUT, `${name}-390-${mode}.png`) });
      console.log(`  ok ${name}-390-${mode}`);
    } catch (e) {
      failures.push(name);
      console.log(`  FAIL ${name}: ${String(e).split("\n")[0]}`);
    }
  };
  console.log(`> ${mode}`);
  if (process.env.E2E_PATHS) {
    for (const pair of process.env.E2E_PATHS.split(",")) {
      const [name, path] = pair.split("=");
      await shot(name, path);
    }
    await ctx.close();
    continue;
  }
  await shot("wallet", "/wallet");
  await shot("card", "/card");
  await shot("rewards", "/rewards");
  await shot("shops", "/discover", { wait: 2500 });
  await shot("activity", "/activity");
  await shot("shop", `/shop/${SHOP}`);
  await shot("booking", `/book/${BOOK}`, { wait: 2500 });
  await ctx.close();
}
await browser.close();
server.close();
if (failures.length) console.log("failures:", failures.join(", "));
