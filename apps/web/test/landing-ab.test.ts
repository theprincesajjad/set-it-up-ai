/**
 * Landing A/B on the web side (ab-spec §3, §4.1): the proxy's assignment (stickiness, split, ?v= override, GPC, counting off, staff,
 * no test), the variant paths, the inline beacon's size and what it sends, the signup prefill and the admin page's wording and CSV.
 */
import { describe, expect, it } from "vitest";
import { EXPERIMENTS, experimentById, type experimentsApi, type LandingLook } from "@ll/shared";
import { BEACON_SCRIPT } from "@/components/marketing/landing-ab/beacon-script";
import { liftText, lookBanner, reportCsv } from "@/lib/dashboard/experiments";
import { assignLanding, isVariantPath, platformRoleOf, randomAid, variantPath, type AssignInput } from "@/lib/marketing/landing-assign";
import { variantIds } from "@/lib/marketing/landing-variants";
import { signupPrefill } from "@/lib/marketing/signupPrefill";

const T1 = experimentById("t1-nails-lead")!;
const DURING = new Date(new Date(T1.startedAt).getTime() + 3 * 86_400_000);
const BEFORE = new Date(new Date(T1.startedAt).getTime() - 86_400_000);

/** A JWT-shaped token with a role claim (unsigned: the proxy only reads it to exclude staff). */
const token = (role: string) => `x.${btoa(JSON.stringify({ sub: "u", role })).replace(/=+$/, "")}.y`;

function assign(url: string, o: { cookies?: Record<string, string>; headers?: Record<string, string>; now?: Date; ended?: string[]; variantsOf?: AssignInput["variantsOf"] } = {}) {
  const u = new URL(url, "http://x");
  return assignLanding({
    pathname: u.pathname,
    search: u.searchParams,
    cookie: (n) => o.cookies?.[n],
    header: (n) => o.headers?.[n.toLowerCase()] ?? null,
    now: o.now ?? DURING,
    ended: o.ended ?? [],
    variantsOf: o.variantsOf ?? variantIds,
    newAid: randomAid,
  });
}

const cookieOf = (a: ReturnType<typeof assign>, name: string) => (a.kind === "rewrite" ? a.cookies.find((c) => c.name === name)?.value : undefined);

describe("assignment", () => {
  it("every arm of every pre-registered test has copy on every look of its page", () => {
    for (const e of EXPERIMENTS)
      for (const look of (e.pages.includes("nail") ? ["nails", "brows", "lashes", "makeup"] : e.pages) as LandingLook[]) for (const a of e.arms) expect(variantIds(look), `${e.id} ${look}`).toContain(a.variant);
  });

  it("a first visit draws an arm, writes ll_aid (22 chars) and ll_v, and rewrites to the prerendered variant path", () => {
    const a = assign("/for-nail-techs?src=ad-3");
    expect(a.kind).toBe("rewrite");
    if (a.kind !== "rewrite") return;
    expect(["control", "yours"]).toContain(a.variant);
    expect(a.pathname).toBe(`/for-nail-techs/nails/${a.variant}`);
    expect(cookieOf(a, "ll_aid")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(cookieOf(a, "ll_v")).toBe(`t1-nails-lead:${a.variant}`);
    expect(a.cookies.every((c) => c.maxAge === 30 * 86_400)).toBe(true);
  });

  it("is sticky: the cookie keeps the arm, and a lost ll_v redraws the same arm from ll_aid", () => {
    for (let i = 0; i < 40; i++) {
      const first = assign("/for-nail-techs");
      if (first.kind !== "rewrite") throw new Error("no rewrite");
      const aid = cookieOf(first, "ll_aid")!;
      const again = assign("/for-nail-techs", { cookies: { ll_aid: aid, ll_v: cookieOf(first, "ll_v")! } });
      expect(again).toMatchObject({ kind: "rewrite", variant: first.variant, cookies: [] });
      expect(assign("/for-nail-techs", { cookies: { ll_aid: aid } })).toMatchObject({ variant: first.variant });
      // One assignment per test, not per look: the lash look shows the same arm.
      expect(assign("/for-nail-techs?trade=lashes", { cookies: { ll_aid: aid } })).toMatchObject({ variant: first.variant, pathname: `/for-nail-techs/lashes/${first.variant}` });
    }
  });

  it("splits about 50/50", () => {
    let yours = 0;
    for (let i = 0; i < 2000; i++) if ((assign("/for-nail-techs") as { variant: string }).variant === "yours") yours++;
    expect(Math.abs(yours / 2000 - 0.5)).toBeLessThan(0.05);
  });

  it("?v= naming an arm wins over the cookie and is written; an unknown or non-arm ?v= falls back", () => {
    const aid = randomAid();
    const a = assign("/for-barbers?v=price&src=ad-7", { cookies: { ll_aid: aid, ll_v: "t1-barber-lead:control" } });
    expect(a).toMatchObject({ kind: "rewrite", variant: "price", pathname: "/for-barbers/price", experimentId: "t1-barber-lead" });
    expect(cookieOf(a, "ll_v")).toBe("t1-barber-lead:price");
    expect(cookieOf(a, "ll_aid")).toBeUndefined();
    expect(assign("/for-barbers?v=nope", { cookies: { ll_aid: aid, ll_v: "t1-barber-lead:control" } })).toMatchObject({ variant: "control", cookies: [] });
    // `yours` exists for barbers but is not an arm of the running barber test.
    expect(assign("/for-barbers?v=yours", { cookies: { ll_aid: aid, ll_v: "t1-barber-lead:price" } })).toMatchObject({ variant: "price" });
  });

  it("with no test running: control and no ll_v, unless an ad's ?v= names any variant of the look (then it sticks)", () => {
    const none = assign("/for-nail-techs", { now: BEFORE });
    expect(none).toMatchObject({ kind: "rewrite", variant: "control", experimentId: null, pathname: "/for-nail-techs/nails/control" });
    expect(cookieOf(none, "ll_v")).toBeUndefined();
    expect(cookieOf(none, "ll_aid")).toBeDefined();
    const ad = assign("/for-nail-techs?trade=brows&v=privacy", { now: BEFORE });
    expect(ad).toMatchObject({ variant: "privacy", pathname: "/for-nail-techs/brows/privacy", experimentId: null });
    expect(cookieOf(ad, "ll_v")).toBe("none:privacy");
    expect(assign("/for-nail-techs", { now: BEFORE, cookies: { ll_aid: randomAid(), ll_v: "none:privacy" } })).toMatchObject({ variant: "privacy" });
    // An ended test (admin) assigns nothing; an old ll_v from it is ignored.
    expect(assign("/for-nail-techs", { ended: ["t1-nails-lead"], cookies: { ll_aid: randomAid(), ll_v: "t1-nails-lead:yours" } })).toMatchObject({ variant: "control", experimentId: null });
  });

  it("a test whose arm has no copy on a look does not run there", () => {
    const a = assign("/for-nail-techs", { variantsOf: () => ["control"] });
    expect(a).toMatchObject({ variant: "control", experimentId: null });
    expect(cookieOf(a, "ll_v")).toBeUndefined();
  });

  it("GPC, ll_aid=off and staff sessions are excluded: control, nothing written", () => {
    expect(assign("/for-nail-techs?v=yours", { headers: { "sec-gpc": "1" } })).toEqual({ kind: "excluded" });
    expect(assign("/for-nail-techs?v=yours", { cookies: { ll_aid: "off" } })).toEqual({ kind: "excluded" });
    expect(assign("/for-barbers", { cookies: { ll_at: token("admin") } })).toEqual({ kind: "excluded" });
    expect(assign("/for-barbers", { cookies: { ll_at: token("rep") } })).toEqual({ kind: "excluded" });
    expect(assign("/for-barbers", { cookies: { ll_at: token("none") } }).kind).toBe("rewrite");
    expect(platformRoleOf("garbage")).toBeNull();
  });

  it("variant paths: built from the look, and noindexed when fetched directly; everything else passes", () => {
    expect([variantPath("nail", "lashes", "yours"), variantPath("barber", "barber", "price"), variantPath("groom", "groom", "control")]).toEqual(["/for-nail-techs/lashes/yours", "/for-barbers/price", "/for-groomers/control"]);
    expect(assign("/for-nail-techs/nails/yours")).toEqual({ kind: "noindex" });
    expect(assign("/for-barbers/price")).toEqual({ kind: "noindex" });
    expect(isVariantPath("/for-barbers/opengraph-image")).toBe(false);
    expect(assign("/for-nail-techs/brows")).toEqual({ kind: "pass" });
    expect(assign("/pricing")).toEqual({ kind: "pass" });
  });
});

describe("the beacon", () => {
  it("is inline, under 1 KB, first-party, and stops on GPC or ll_aid=off", () => {
    expect(new TextEncoder().encode(BEACON_SCRIPT).length).toBeLessThan(1024);
    expect(BEACON_SCRIPT).toContain('sendBeacon("/api/public/landing-events"');
    expect(BEACON_SCRIPT).toContain("globalPrivacyControl");
    expect(BEACON_SCRIPT).toContain('a=="off"');
    expect(BEACON_SCRIPT).not.toMatch(/https?:\/\//);
    for (const k of ["view", "scroll_50", "scroll_90", "cta_click", "start_submit"]) expect(BEACON_SCRIPT).toContain(`"${k}"`);
  });

  it("runs in a page: one beacon per kind, the v field in the start form, nothing with GPC", () => {
    const run = (cookie: string, gpc = false) => {
      const sent: unknown[] = [];
      document.cookie.split(";").forEach((c) => (document.cookie = `${c.split("=")[0]!.trim()}=; max-age=0; path=/`));
      for (const c of cookie.split("; ").filter(Boolean)) document.cookie = `${c}; path=/`;
      document.body.innerHTML = `<div class="sl" data-solo-trade="lashes" data-variant="yours"><section class="sl-hero"><a class="sl-btn" href="#start">Go</a></section><form class="sl-form"><button>Send</button></form></div>`;
      Object.defineProperty(navigator, "globalPrivacyControl", { value: gpc, configurable: true });
      Object.defineProperty(navigator, "sendBeacon", { value: (_u: string, b: string) => (sent.push(JSON.parse(b)), true), configurable: true });
      new Function(BEACON_SCRIPT)();
      (document.querySelector(".sl-btn") as HTMLAnchorElement).click();
      (document.querySelector(".sl-btn") as HTMLAnchorElement).click();
      document.querySelector("form")!.dispatchEvent(new Event("submit"));
      return sent as { aid: string; v: string; tr: string; ev: { k: string; d?: string }[] }[];
    };
    const sent = run("ll_aid=AbCdEfGhIjKlMnOpQrStUv; ll_v=t1-nails-lead%3Ayours");
    expect(sent.map((b) => b.ev[0]!.k)).toEqual(["view", "cta_click", "start_submit"]);
    expect(sent[1]!.ev[0]!.d).toBe("hero");
    expect(sent[0]).toMatchObject({ aid: "AbCdEfGhIjKlMnOpQrStUv", v: "t1-nails-lead:yours", tr: "lashes", p: "/" });
    expect((document.querySelector("form input[name=v]") as HTMLInputElement).value).toBe("t1-nails-lead:yours");
    expect(run("ll_aid=AbCdEfGhIjKlMnOpQrStUv", true)).toEqual([]);
    expect(run("ll_aid=off")).toEqual([]);
    expect(run("")).toEqual([]);
  });
});

describe("signup prefill", () => {
  it("reads ?v= in the cookie form or as a bare id, and ignores anything else", () => {
    expect(signupPrefill({ v: "t1-nails-lead:yours" }).v).toEqual({ experimentId: "t1-nails-lead", variant: "yours" });
    expect(signupPrefill({ v: "price" }).v).toEqual({ experimentId: null, variant: "price" });
    expect(signupPrefill({ v: "<script>" }).v).toBeUndefined();
  });
});

describe("admin page wording", () => {
  const arm = (variant: string, lift?: experimentsApi.ArmReport["lift"]): experimentsApi.ArmReport => ({
    variant,
    exposures: 220,
    startSubmits: 11,
    signedUp: 5,
    linkLive: 3,
    firstBooking7d: 1,
    paid30d: 0,
    unmatchedSignups: 1,
    rates: { startSubmit: { p: 0.05, lo: 0.03, hi: 0.08 }, linkLive: { p: 0.01, lo: 0, hi: 0.04 }, firstBooking: { p: 0, lo: 0, hi: 0.02 }, paid: { p: 0, lo: 0, hi: 0.02 } },
    ...(lift ? { lift } : {}),
    guardrails: { costPerSignupCents: 4500, linkLiveShareOfControl: 1, lighthouse: null, status: "ok" },
  });
  const base = { experiment: T1, exposures: 412, look: "none" as const, alpha: null, ended: null };

  it("says 'not time to decide yet' before a look, and names the alpha of an open look", () => {
    expect(lookBanner(base)).toMatchObject({ title: "Not time to decide yet" });
    expect(lookBanner(base).body).toContain("412 of 880 exposures");
    expect(lookBanner({ ...base, exposures: 440, look: "interim", alpha: 0.01 }).title).toBe("Interim look is open (α = 0.01)");
    expect(lookBanner({ ...base, exposures: 880, look: "final", alpha: 0.045 }).title).toBe("Horizon reached (α = 0.045)");
    expect(liftText({ relative: 1.727, pValue: 0.0183, verdict: "unlikely_chance" })).toBe("+173% (p = 0.018)");
  });

  it("exports the per-variant counts as CSV", () => {
    const csv = reportCsv({ ...base, status: "running", horizonPct: 46.8, interimTakenAt: null, arms: [arm("control"), arm("yours", { startSubmit: { relative: 0.5, pValue: 0.2, verdict: "chance" }, linkLive: { relative: null, pValue: 1, verdict: "chance" } })], byTrade: [], bySrc: [] });
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^experiment,variant,exposures,start_submits/);
    expect(lines[1]).toMatch(/^t1-nails-lead,control,220,11,0.0500,5,3,/);
    expect(lines[2]).toContain(",0.5000,0.2000,,1.0000,4500,ok");
  });
});
