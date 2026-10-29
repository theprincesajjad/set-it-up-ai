import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEES, PLANS, PROMOS_PER_MONTH_PLUS, showsPoweredBy } from "@ll/shared";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { SoloLanding } from "@/components/marketing/SoloLanding";
import { PoweredBy, poweredByHref } from "@/components/pass/PoweredBy";
import { copy } from "@/copy/en-CA";
import { SOLO_COMPETITORS, SOLO_ROWS } from "@/lib/marketing/competitors-solo";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { NAIL_TRADES, SOLO_PHOTOS, nailTrade } from "@/lib/marketing/solo";
import { landingVariant, variantIds } from "@/lib/marketing/landing-variants";
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
  it("reads the three prices, the promos, the texts and the deposit fee from @ll/shared", () => {
    const v = soloView("nail");
    expect(v.price.plans.map((p) => p.price)).toEqual([moneyShort(0), moneyShort(PLANS.plus.priceCents), moneyShort(PLANS.plus.annualPriceCents)]);
    expect(v.price.plans[1]!.what).toContain(`${PROMOS_PER_MONTH_PLUS} promos a month`);
    expect(v.price.plans[1]!.what).toContain(PLANS.plus.smsPerMonth.toLocaleString("en-CA"));
    expect(v.price.note).toContain("No cut of your clients");
    expect(v.week.stats.map((x) => x.n)).toEqual([31, 38, 18, 4]);
    expect(v.week.upNext.who).toBe("Priya");
    expect(v.bookings.done).toBe("Booked · Sat 11:30 am");
    expect(v.promos.allowance).toBe(`${PROMOS_PER_MONTH_PLUS} a month on ${PLANS.plus.name}`);
    expect(v.price.plans.map((p) => p.name)).toEqual(["Free", "Pro", "Pro, yearly"]);
    expect(PLANS.plus.name).toBe("Pro");
    expect(v.hero.price).toBe(`${moneyShort(0)} to start, then ${moneyShort(PLANS.plus.priceCents)} a month`);
  });
});

describe("landing v2", () => {
  const html = (id: "nail" | "barber" | "groom", trade?: (typeof NAIL_TRADES)[number]) => renderToStaticMarkup(<SoloLanding id={id} trade={trade} />);

  it("renders the seven blocks, one h1, and the start form leading to the sign-up with the page's trade", () => {
    const page = html("nail");
    expect(page.match(/<h1/g)).toHaveLength(1);
    for (const id of ['id="week"', 'id="bookings"', 'id="promos"', 'id="regulars"', 'id="jobs"', 'id="plans"', 'id="start"', 'aria-label="The deal"', "Your week, at a glance.", "Every booking, one calendar.", "A promo in one tap.", "They come back."]) expect(page).toContain(id);
    expect(page).toContain('action="/signup" method="get"');
    expect(page).toContain(`name="trade" checked="" value="nails"`);
    expect(page).toContain('href="/signup?vertical=nails&amp;src=nail-techs"');
    // The price in the hero is a link to the price block, not a second button; the comparison lives on /pricing.
    expect(page).toContain('class="sl-price-link" href="#plans"');
    expect(page).toContain('href="/pricing#booking-apps"');
    expect(page).not.toMatch(/<table/);
    expect(page).not.toMatch(/licen[cs]e|inspection|Upgrade/i);
    // Every {placeholder} in the copy is filled.
    for (const id of ["nail", "barber", "groom"] as const) expect(html(id)).not.toMatch(/\{\w+\}/);
  });

  it("swaps the hook, the samples and the photos per trade, and keeps the vertical presets", () => {
    for (const [trade, vertical, text] of [["brows", "brows_lashes", "lamination"], ["lashes", "brows_lashes", "fill open sat"], ["makeup", "makeup", "trial"]] as const) {
      const page = html("nail", trade);
      expect(page).toContain(`data-trade="${vertical}"`);
      expect(page).toContain(`data-solo-trade="${trade}"`);
      expect(page).toContain(text);
      expect(page).toContain(`/marketing/${SOLO_PHOTOS[trade].work.stem}-`);
      expect(page).toContain(`href="/signup?vertical=${vertical}&amp;src=nail-techs"`);
      expect(page).toContain(`name="trade" checked="" value="${trade}"`);
    }
    const barber = html("barber");
    expect(barber).toContain("One link for");
    expect(renderToStaticMarkup(<SoloLanding id="nail" />)).toContain("Your whole hustle.");
    expect(barber).toContain('data-trade="barber"');
    expect(barber).toContain("/marketing/barber-hero-900.avif");
    const groom = html("groom");
    expect(groom).toContain('data-trade="pet"');
    expect(groom).toContain("/marketing/groom-900.avif");
    expect(groom).toContain("Vaccines checked.");
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
    expect(noshow.title).toBe("No-shows, handled your way.");
    expect(noshow.body).toBe("Reminders on. $20 deposit only if you want.");
    const page = renderToStaticMarkup(<SoloLanding id="nail" />);
    expect(page).toContain("Deposits are optional");
    expect(page).toContain("Deposits optional, off by default.");
  });
});

describe("A/B variants", () => {
  it("renders control by default, swaps the hero and the job order for another variant, and falls back to control", () => {
    expect(variantIds("nails")[0]).toBe("control");
    for (const k of ["nails", "brows", "lashes", "makeup", "barber", "groom"] as const) expect(landingVariant(k).id).toBe("control");
    const price = renderToStaticMarkup(<SoloLanding id="barber" variant="price" />);
    expect(price).toContain('data-variant="price"');
    expect(price).toContain("No per-chair");
    expect([...price.matchAll(/data-job="(\w+)"/g)].map((m) => m[1])).toEqual(["book", "yours", "line"]);
    expect(price).toContain(`${moneyShort(PLANS.plus.priceCents)} a month however many chairs`);
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
    expect(privacy).toContain("Address: sent after you book");
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

describe("copy rules", () => {
  it("has no banned words in the solo copy", () => {
    const text = JSON.stringify(C);
    expect(text).not.toMatch(/Upgrade|licen[cs]|inspection|\bmerchant\b|\bSMS\b/i);
  });
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  it("keeps the landing v3 word budget: hooks of 2 to 6 words, ledes of 12 at most, job lines of 8 at most, no paragraphs", () => {
    for (const k of ["nails", "brows", "lashes", "makeup", "barber", "groom"] as const) {
      for (const id of variantIds(k)) {
        const v = landingVariant(k, id);
        const hook = words(v.hook.join(" "));
        expect(hook, `${k}/${id} hook`).toBeGreaterThanOrEqual(2);
        expect(hook, `${k}/${id} hook`).toBeLessThanOrEqual(6);
        expect(words(v.lede), `${k}/${id} lede`).toBeLessThanOrEqual(12);
      }
      for (const [j, card] of Object.entries(C.trades[k].jobs)) {
        expect(words(card.title), `${k} ${j} title`).toBeLessThanOrEqual(6);
        expect(words(card.body), `${k} ${j} body`).toBeLessThanOrEqual(8);
      }
    }
    for (const [name, s] of [["week", C.week.sub], ["bookings", C.bookings.sub], ["promos", C.promos.sub], ["regulars", C.regulars.sub]]) expect(words(s!), `${name} sub`).toBeLessThanOrEqual(12);
    for (const t of [C.week.title, C.bookings.title, C.promos.title, C.regulars.title, C.jobs.title, C.start.title]) expect(words(t)).toBeLessThanOrEqual(6);
    for (const p of [C.price.free.what, C.price.monthly.what, C.price.yearly.what]) expect(words(p)).toBeLessThanOrEqual(8);
    for (const x of C.facts.items) expect(words(x.line)).toBeLessThanOrEqual(8);
  });
});
