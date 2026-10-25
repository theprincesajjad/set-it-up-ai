// Urdu RTL tour of the Expo web export at 390x844. Usage: node urtour.mjs [lang] [filter]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "/home/user/set-it-up-ai/apps/mobile/e2e/serve.mjs";
import { routeTiles } from "/home/user/set-it-up-ai/apps/mobile/e2e/lib.mjs";

const S = "/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad";
const LANG = process.argv[2] ?? "ur";
const FILTER = process.argv[3] ?? "";
const OUT = join(S, "shots/l10n", process.env.OUT_SUB ?? "");
const PFX = process.env.NASTALIQ ? `${LANG}nq` : LANG;
const API = "http://localhost:4673";
const PORT = 8673;
const WEB = `http://localhost:${PORT}`;
await mkdir(OUT, { recursive: true });
const server = await serve(join(S, "l10n/mob", process.env.DIST ?? "dist"), PORT);
const browser = await chromium.launch();
const CUSTOMER = "+16475551009";

async function phone(storageState, { geo = true } = {}) {
  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-CA", timezoneId: "America/Toronto",
    ...(geo ? { geolocation: { latitude: 43.6475, longitude: -79.4487 }, permissions: ["geolocation"] } : {}),
  });
  await context.addInitScript((l) => { try { localStorage.setItem("ll.locale.v1", JSON.stringify(l)); } catch {} }, LANG);
  if (process.env.NASTALIQ) {
    // Preview of iOS, where the system Urdu face is Noto Nastaliq Urdu: it takes every Arabic-script glyph, Latin falls through.
    const { readFileSync } = await import("node:fs");
    const f = (n) => readFileSync(S + "/l10n/font/" + n).toString("base64");
    const css = `@font-face{font-family:NQ;font-weight:400;src:url(data:font/ttf;base64,${f("nq400.ttf")});unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}@font-face{font-family:NQ;font-weight:700;src:url(data:font/ttf;base64,${f("nq700.ttf")});unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}*{font-family:NQ,sans-serif !important}`;
    await context.addInitScript((c) => { const add = () => { const st = document.createElement("style"); st.textContent = c; document.documentElement.appendChild(st); }; if (document.documentElement) add(); else document.addEventListener("DOMContentLoaded", add); }, css);
  }
  await routeTiles(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  return { context, page };
}
async function shot(page, name, { settle = 1200, scroll = false } = {}) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: join(OUT, `${PFX}-${name}.png`) });
  console.log("  shot", name);
  if (scroll) {
    await page.mouse.move(195, 500);
    for (let i = 1; i <= scroll; i++) {
      await page.mouse.wheel(0, 650);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${PFX}-${name}-s${i}.png`) });
      console.log("  shot", `${name}-s${i}`);
    }
  }
}
async function step(name, fn) {
  if (FILTER && !FILTER.split(",").some((p) => name.startsWith(p))) return;
  console.log("> " + name);
  try { await fn(); } catch (e) { console.log("  FAIL", name, String(e.message).split("\n")[0]); }
}

// --- signed out
await step("auth", async () => {
  const { context, page } = await phone(undefined, { geo: false });
  await page.goto(`${WEB}/welcome`);
  await shot(page, "01-welcome", { scroll: 1 });
  await page.goto(`${WEB}/phone`);
  await shot(page, "02-phone");
  await page.goto(`${WEB}/staff-sign-in`);
  await shot(page, "02b-staff-sign-in");
  await context.close();
});

// --- sign in
const first = await phone();
let state;
{
  const { page } = first;
  await page.goto(`${WEB}/phone`);
  const field = page.getByLabel(/.+/).first();
  await page.waitForTimeout(2500);
  const inp = page.locator("input").first();
  await inp.fill(CUSTOMER.replace(/^\+1/, ""));
  const started = page.waitForResponse((r) => r.url().endsWith("/v1/auth/otp/start"));
  await page.locator("[role=button]").last().click();
  const { devCode } = await (await started).json();
  await page.waitForTimeout(1500);
  await shot(page, "03-code");
  await page.locator('input[autocomplete="one-time-code"]').fill(devCode, { force: true });
  await page.waitForTimeout(4000);
  state = await first.context.storageState();
}
await first.context.close();
const { context, page } = await phone(state);
await page.goto(`${WEB}/wallet`); await page.waitForTimeout(1500);
const go = async (path, name, opts) => { await page.goto(`${WEB}${path}`); await page.waitForTimeout(800); const nn = page.getByText(/^(Not now|ابھی نہیں)$/); if (await nn.isVisible().catch(() => false)) await nn.click().catch(() => {}); await shot(page, name, opts); };

const tok = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("ll.tokens.v1") ?? "{}").accessToken; } catch { return null; } });
const api = async (path) => { try { const r = await fetch(API + path, { headers: { authorization: `Bearer ${tok}` } }); return r.ok ? await r.json() : null; } catch { return null; } };
const camp = (await api("/v1/me/campaigns"))?.items?.[0];
const ord = (await api("/v1/me/orders"))?.items?.[0];
const appt = (await api("/v1/me/appointments"))?.items?.[0];
const tix = (await api("/v1/me/tickets"))?.items?.[0];
console.log("ids", camp?.id, ord?.id, appt?.id, tix?.id);
const R = process.env.ROUTES ? JSON.parse(process.env.ROUTES) : null;
const routes = R ?? [
  ["wallet", "/wallet", "10-wallet", { scroll: 2 }],
  ["map", "/map", "11-map", { settle: 4000 }],
  ["discover", "/discover", "12-discover", { scroll: 2 }],
  ["activity", "/activity", "13-activity", { scroll: 1 }],
  ["you", "/you", "14-you", { scroll: 1 }],
  ["rewards", "/rewards", "15-rewards", { scroll: 1 }],
  ["history", "/history", "16-history", { scroll: 1 }],
  ["card", "/card", "17-card"],
  ["qr", "/qr", "18-qr"],
  ["referrals", "/referrals", "19-referrals", { scroll: 1 }],
  ["discount", "/discount", "19b-discount"],
  ["notifications", "/notifications", "20-notifications", { scroll: 1 }],
  ["settings", "/settings/profile", "21-settings-profile", { scroll: 1 }],
  ["settings", "/settings/notifications", "22-settings-notifications", { scroll: 3 }],
  ["settings", "/settings/shops", "23-settings-shops"],
  ["settings", "/settings/privacy", "24-settings-privacy", { scroll: 1 }],
  ["settings", "/settings/suggest", "25-settings-suggest"],
  ["settings", "/settings/language", "26-settings-language"],
  ["shop", "/shop/pinecone-coffee", "30-shop-member", { scroll: 3 }],
  ["shop", "/shop/bloom-hair-studio", "31-shop-nonmember", { scroll: 2 }],
  ["shop", "/shop/nawab-biryani-house", "32-shop-restaurant", { scroll: 3 }],
  ["shop", "/shop/zeenat-catering", "33-shop-catering", { scroll: 2 }],
  ["order", "/order-ahead/nawab-biryani-house", "40-order-ahead", { scroll: 2 }],
  ["order", "/orders", "41-orders"],
  ["book", "/book/sarson-dhaba", "42-book", { scroll: 1 }],
  ["book", "/book/bloom-hair-studio", "42b-book-salon", { scroll: 1 }],
  ["dropoff", "/dropoff/stitch-perfect", "43-dropoff", { scroll: 1 }],
  ["tiffin", "/tiffin", "44-tiffin"],
  ["tiffin", "/tiffin/plans/shree-thali-and-tiffin", "44b-tiffin-plans", { scroll: 1 }],
  ["catering", "/catering/zeenat-catering", "45-catering", { scroll: 2 }],
  ["banquet", "/banquet/nawab-biryani-house", "46-banquet", { scroll: 2 }],
  ...(camp ? [["campaign", `/campaigns/${camp.id}`, "49-campaign", { scroll: 2 }]] : []),
  ...(ord ? [["orderdetail", `/orders/${ord.id}`, "41b-order-detail", { scroll: 1 }]] : []),
  ...(tix ? [["ticket", `/tickets/${tix.id}`, "41c-ticket", { scroll: 1 }]] : []),
  ["events", "/events", "47-events"],
  ...(appt ? [["appointments", `/appointments/${appt.id}`, "48-appointment", { scroll: 1 }]] : []),
];
for (const [grp, path, name, opts] of routes) await step(grp, () => go(path, name, opts));

await step("sheets", async () => {
  await page.goto(`${WEB}/shop/bloom-hair-studio`);
  await page.waitForTimeout(2500);
  const btns = page.locator("[role=button]");
  // the join button is the primary one near the top
  const join = page.getByRole("button").filter({ hasText: /.+/ });
  await shot(page, "50-pre-join", { settle: 300 });
});
await context.close();
await browser.close();
server.close();
