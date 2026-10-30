import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLANS, PROMOS_PER_MONTH_PLUS, showsPoweredBy } from "@ll/shared";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { PoweredBy, poweredByHref } from "@/components/pass/PoweredBy";
import { copy } from "@/copy/en-CA";
import { SOLO_COMPETITORS, SOLO_ROWS } from "@/lib/marketing/competitors-solo";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { NAIL_TRADES, SOLO_PHOTOS, nailTrade } from "@/lib/marketing/solo";
import { landingVariant, variantIds } from "@/lib/marketing/landing-variants";
import { PLAN_COPY, marketingPlans, planVars } from "@/lib/marketing/plan-copy";
import { soloView } from "@/lib/marketing/solo-view";
import { formatAsOf } from "@/lib/marketing/sources";
import { moneyShort } from "@/lib/marketing/text";

const C = copy.solo;
const compare = { eyebrow: "e", title: "t", sub: "s", brand: "Local Loyalty", rows: C.compare.rows, us: C.compare.us, usSource: C.compare.usSource, foot: C.compare.foot };

describe("solo competitor data", () => {
  it("gives every cell a day, a tag and a note, and dates are not older than 90 days", () => {
    const now = Date.parse("2026-10-29");
    for (const x of SOLO_COMPETITORS) {
      expect(now - Date.parse(x.asOf)).toBeLessThan(90 * 86_400_000);
      for (const r of SOLO_ROWS) {
        expect(["W", "W?", "H"]).toContain(x.cells[r].tag);
        expect(x.cells[r].note.length).toBeGreaterThan(3);
      }
    }
  });
  it("prints the date beside every figure and our prices from PLANS", () => {
    const html = renderToStaticMarkup(<CompetitorTableSolo c={compare} chairs />);
    expect((html.match(new RegExp(formatAsOf("2026-10-28"), "g")) ?? []).length).toBeGreaterThanOrEqual(SOLO_COMPETITORS.length * SOLO_ROWS.length);
    expect(html).toContain(moneyShort(PLANS.plus.priceCents));
    expect(html).toContain("currency not stated");
  });
});

describe("price block", () => {
  it("reads every plan name, price and paid feature from plan-copy.ts and PLANS", () => {
    const v = soloView("nail");
    const P = planVars();
    expect(v.price.plans).toEqual(marketingPlans("solo", { chairs: false }));
    // Per-chair talk only on the barber page (founder, Oct 29).
    expect(JSON.stringify(v.price.plans)).not.toMatch(/chair/i);
    expect(JSON.stringify(soloView("barber").price.plans)).toMatch(/per-chair/);
    expect(v.price.plans.map((p) => p.price)).toEqual([moneyShort(0), moneyShort(PLANS.plus.priceCents), String(P.studioMonthly)]);
    expect(v.price.plans.map((p) => p.name)).toEqual(["Free", PLANS.plus.name, String(P.studio)]);
    expect(v.price.plans[1]!.features).toContain(`${PROMOS_PER_MONTH_PLUS} promos a month`);
    expect(v.price.plans[1]!.yearly?.was).toBe(moneyShort(PLANS.plus.annualPriceCents));
    expect(v.price.note).toContain("No commission on your clients");
    expect(v.pro.items.map((x) => x.id)).toEqual(["waitlist", "rebook", "reviews", "report"]);
    expect(v.pro.caption).toMatch(/Illustrative/);
    expect(v.week.stats.map((x) => x.n)).toEqual([31, 38, 18, 4]);
    expect(v.week.upNext.who).toBe("Priya");
    expect(v.bookings.done).toBe("Booked · Sat 11:30 am");
    expect(v.promos.allowance).toBe(`${PROMOS_PER_MONTH_PLUS} promos a month with ${PLANS.plus.name}`);
    expect(PLANS.plus.name).toBe("Pro");
    expect(v.hero.price).toBe(`Free to start, with ${P.trial} days of ${PLANS.plus.name} included. No credit card.`);
  });
});

describe("landing v2", () => {
  const html = (id: "nail" | "barber" | "groom", trade?: (typeof NAIL_TRADES)[number]) => renderToStaticMarkup(<SoloLanding id={id} trade={trade} />);

  it("renders the seven blocks, one h1, and the start form leading to the sign-up with the page's trade", () => {
    const page = html("nail");
    expect(page.match(/<h1/g)).toHaveLength(1);
    for (const id of ['id="week"', 'id="bookings"', 'id="promos"', 'id="regulars"', 'id="jobs"', 'id="pro"', 'id="plans"', 'id="start"', 'aria-label="Key facts"', "Know how your week went.", "Every booking in one calendar.", "Fill quiet days with promos.", "Turn first visits into regulars."]) expect(page).toContain(id);
    // No pill eyebrows above the headings (founder, Oct 29): hierarchy is type alone.
    expect(page).not.toContain("sl-eyebrow");
    // Calls to action between the blocks, each one counted by the beacon (lower-case letters, 10 at most).
    const ctas = [...page.matchAll(/data-cta="([^"]+)"/g)].map((m) => m[1]!);
    for (const c of ["nav", "hero", "how", "afterhero", "week", "promos", "pro", "prepricing", "plans", "start", "sticky", "seepricing"]) expect(ctas).toContain(c);
    for (const c of ctas) expect(c).toMatch(/^[a-z]{1,10}$/);
    expect(page).toContain('action="/signup" method="get"');
    expect(page).toContain(`name="trade" checked="" value="nails"`);
    expect(page).toContain('href="/signup?vertical=nails&amp;src=nail-techs"');
    // The price in the hero is a link to the price block, not a second button; the comparison lives on /pricing.
    expect(page).toMatch(/class="sl-price-link[^"]*" href="#plans"/);
    expect(page).toContain('href="/pricing#booking-apps"');
    expect(page).not.toMatch(/<table/);
    expect(page).not.toMatch(/licen[cs]e|inspection|Upgrade/i);
    // Every {placeholder} in the copy is filled.
    for (const id of ["nail", "barber", "groom"] as const) expect(html(id)).not.toMatch(/\{\w+\}/);
  });

  it("swaps the hook, the samples and the photos per trade, and keeps the vertical presets", () => {
    for (const [trade, vertical, text] of [["brows", "brows_lashes", "lamination"], ["lashes", "brows_lashes", "fill open on Saturday"], ["makeup", "makeup", "trial"]] as const) {
      const page = html("nail", trade);
      expect(page).toContain(`data-trade="${vertical}"`);
      expect(page).toContain(`data-solo-trade="${trade}"`);
      expect(page).toContain(text);
      expect(page).toContain(`/marketing/${SOLO_PHOTOS[trade].work.stem}-`);
      expect(page).toContain(`href="/signup?vertical=${vertical}&amp;src=nail-techs"`);
      expect(page).toContain(`name="trade" checked="" value="${trade}"`);
    }
    const barber = html("barber");
    expect(barber).toContain("Bookings and walk-ins,");
    expect(renderToStaticMarkup(<SoloLanding id="nail" />)).toContain("Fill your calendar.");
    expect(barber).toContain('data-trade="barber"');
    expect(barber).toContain("/marketing/barber-hero-900.avif");
    const groom = html("groom");
    expect(groom).toContain('data-trade="pet"');
    expect(groom).toContain("/marketing/groom-900.avif");
    expect(groom).toContain("Grooming bookings,");
    expect(groom).toContain(`name="trade" checked="" value="groom"`);
  });

  it("serves every photo as AVIF with a WebP fallback, sized, and only the hero's eagerly", () => {
    const page = html("nail");
    const imgs = page.match(/<img [^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(5);
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
      expect(img).toMatch(/alt=""/);
    }
    expect(imgs.filter((i) => /fetchPriority="high"/i.test(i))).toHaveLength(1);
    expect(imgs.filter((i) => /loading="eager"/.test(i))).toHaveLength(2);
    expect((page.match(/<source type="image\/avif"/g) ?? []).length).toBe((page.match(/<source type="image\/webp"/g) ?? []).length);
    expect(page).toMatch(/<link rel="preload" as="image"[^>]*imageSrcSet="\/marketing\/nails-red-800.avif 800w"/);
  });
});

describe("deposits are optional, not the lead", () => {
  it("keeps deposits out of the hero copy, the trust row and the facts, and shows them only as an option", () => {
    for (const [id, trade] of [["nail", "nails"], ["nail", "brows"], ["nail", "lashes"], ["nail", "makeup"], ["barber", undefined], ["groom", undefined]] as const) {
      const v = soloView(id, trade);
      expect(JSON.stringify([v.hero.eyebrow, v.hero.hook, v.hero.lede, v.hero.cta, v.hero.trust, v.facts])).not.toMatch(/deposit/i);
      expect(v.jobs[0]!.id).toBe("book");
    }
    // Deposits live in one optional sentence of the "No-shows, handled your way" card, off by default.
    const noshow = soloView("nail").jobs.find((j) => j.id === "noshow")!;
    expect(noshow.title).toBe("Fewer no-shows.");
    expect(noshow.body).toBe("Reminders on. Optional $20 deposit per service.");
    const page = renderToStaticMarkup(<SoloLanding id="nail" />);
    expect(page).toContain("Deposits are optional");
    expect(page).toContain("Deposits are optional and off by default.");
  });
});

describe("A/B variants", () => {
  it("renders control by default, swaps the hero and the job order for another variant, and falls back to control", () => {
    expect(variantIds("nails")[0]).toBe("control");
    for (const k of ["nails", "brows", "lashes", "makeup", "barber", "groom"] as const) expect(landingVariant(k).id).toBe("control");
    const price = renderToStaticMarkup(<SoloLanding id="barber" variant="price" />);
    expect(price).toContain('data-variant="price"');
    expect(price).toContain("One flat price");
    expect([...price.matchAll(/data-job="(\w+)"/g)].map((m) => m[1])).toEqual(["book", "yours", "line"]);
    expect(price).toContain(`${planVars().studioMonthly} a month for every chair`);
    expect(landingVariant("nails", "nope").id).toBe("control");
    expect(renderToStaticMarkup(<SoloLanding id="nail" />)).toContain('data-variant="control"');
  });

  it("renders every variant of every look with its own job cards and no unfilled placeholder", () => {
    const looks = [["nail", "nails"], ["nail", "brows"], ["nail", "lashes"], ["nail", "makeup"], ["barber", undefined], ["groom", undefined]] as const;
    for (const [id, trade] of looks) {
      const key = trade ?? id;
      for (const variant of variantIds(key)) {
        const html = renderToStaticMarkup(<SoloLanding id={id} trade={trade} variant={variant} />);
        expect(html, `${key}/${variant}`).toContain(`data-variant="${variant}"`);
        expect(html, `${key}/${variant}`).not.toMatch(/\{\w+\}/);
        expect(html.match(/data-job=/g), `${key}/${variant}`).toHaveLength(3);
      }
    }
    expect(variantIds("nails")).toEqual(["control", "yours", "privacy"]);
    expect(variantIds("barber")).toEqual(["control", "price", "yours"]);
    expect(variantIds("groom")).toEqual(["control", "yours"]);
    const privacy = renderToStaticMarkup(<SoloLanding id="nail" variant="privacy" />);
    expect(privacy).toContain("Address shared after booking");
    expect(privacy).toContain("Your area,");
  });
});

describe("short sign-up", () => {
  it("turns the landing form's name, trade and email or mobile into the wizard's starting values", () => {
    expect(signupPrefill({ shop: "Mira", trade: "brows", contact: "mira@example.com", src: "client" })).toEqual({ shop: "Mira", vertical: "brows_lashes", email: "mira@example.com", src: "client" });
    expect(signupPrefill({ shop: "Dre", trade: "barber", contact: "(416) 555-0123", src: "barbers" })).toEqual({ shop: "Dre", vertical: "barber", phone: "4165550123", src: "barbers" });
    expect(signupPrefill({ trade: "groom" })).toEqual({ vertical: "pet" });
    expect(signupPrefill({ trade: "constructor" })).toEqual({});
    // An explicit ?vertical= (the full sign-up link) wins over ?trade=.
    expect(signupPrefill({ vertical: "nails", trade: "barber" })).toEqual({ vertical: "nails" });
  });
});

describe("trade param", () => {
  it("accepts brows, lashes and makeup, and falls back to nails", () => {
    expect(nailTrade("brows")).toBe("brows");
    expect(nailTrade(["lashes"])).toBe("lashes");
    expect(nailTrade("makeup")).toBe("makeup");
    expect(nailTrade("x")).toBe("nails");
    expect(nailTrade(undefined)).toBe("nails");
  });
});

describe("PoweredBy", () => {
  it("links to the matching page with ?src=client", () => {
    expect(poweredByHref("barber")).toBe("/for-barbers?src=client");
    expect(poweredByHref("pet")).toBe("/for-groomers?src=client");
    expect(poweredByHref("salon")).toBe("/for-nail-techs?src=client");
    expect(renderToStaticMarkup(<PoweredBy locale="en" vertical="barber" />)).toContain('href="/for-barbers?src=client"');
  });
  it("is hidden on paid plans (the API computes showsPoweredBy and pages pass the public shop's poweredBy as `show`)", () => {
    expect(showsPoweredBy("free")).toBe(true);
    expect(showsPoweredBy("plus")).toBe(false);
    expect(showsPoweredBy("pro")).toBe(false);
    expect(renderToStaticMarkup(<PoweredBy locale="en" vertical="salon" show={showsPoweredBy("pro")} />)).toBe("");
    expect(renderToStaticMarkup(<PoweredBy locale="en" vertical="nails" show={showsPoweredBy("free")} />)).toContain('href="/for-nail-techs?src=client"');
  });
});

const LANDING_VARIANTS_ALL = () => (["nails", "brows", "lashes", "makeup", "barber", "groom"] as const).flatMap((k) => variantIds(k).map((id) => landingVariant(k, id)));

describe("copy rules", () => {
  it("has no banned words in the solo copy", () => {
    const text = JSON.stringify(C);
    expect(text).not.toMatch(/Upgrade|licen[cs]|inspection|\bmerchant\b|\bSMS\b/i);
  });
  it("reads as a business tool: no slang, no jokes, no 'founding' (founder, Oct 29)", () => {
    const text = JSON.stringify([C, LANDING_VARIANTS_ALL(), PLAN_COPY]);
    expect(text).not.toMatch(/hustle|boring|\bu\b|!!|founding/i);
  });
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  it("keeps the landing v3 word budget: hooks of 2 to 6 words, ledes of 12 at most, job lines of 8 at most, no paragraphs", () => {
    for (const k of ["nails", "brows", "lashes", "makeup", "barber", "groom"] as const) {
      for (const id of variantIds(k)) {
        const v = landingVariant(k, id);
        const hook = words(v.hook.join(" "));
        expect(hook, `${k}/${id} hook`).toBeGreaterThanOrEqual(2);
        expect(hook, `${k}/${id} hook`).toBeLessThanOrEqual(7);
        expect(words(v.lede), `${k}/${id} lede`).toBeLessThanOrEqual(12);
      }
      for (const [j, card] of Object.entries(C.trades[k].jobs)) {
        expect(words(card.title), `${k} ${j} title`).toBeLessThanOrEqual(6);
        expect(words(card.body), `${k} ${j} body`).toBeLessThanOrEqual(8);
      }
    }
    for (const [name, s] of [["week", C.week.sub], ["bookings", C.bookings.sub], ["promos", C.promos.sub], ["regulars", C.regulars.sub]]) expect(words(s!), `${name} sub`).toBeLessThanOrEqual(12);
    for (const t of [C.week.title, C.bookings.title, C.promos.title, C.regulars.title, C.jobs.title, C.start.title]) expect(words(t)).toBeLessThanOrEqual(6);
    for (const p of marketingPlans("solo")) for (const x of p.features) expect(words(x), x).toBeLessThanOrEqual(8);
    for (const x of C.facts.items) expect(words(x.line)).toBeLessThanOrEqual(8);
  });
});
