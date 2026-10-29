import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLANS, showsPoweredBy } from "@ll/shared";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { PlanStrip } from "@/components/marketing/PlanStrip";
import { PoweredBy, poweredByHref } from "@/components/pass/PoweredBy";
import { copy } from "@/copy/en-CA";
import { SOLO_COMPETITORS, SOLO_ROWS } from "@/lib/marketing/competitors-solo";
import { nailTrade } from "@/lib/marketing/solo";
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

describe("plan strip", () => {
  it("reads the three prices from PLANS", () => {
    const html = renderToStaticMarkup(<PlanStrip c={{ eyebrow: "e", title: "t", note: "n", free: "Free", monthly: "a month", yearly: "a year", see: "See", lists: C.plans }} />);
    expect(html).toContain(moneyShort(PLANS.plus.priceCents));
    expect(html).toContain(moneyShort(PLANS.plus.annualPriceCents));
    expect(html).not.toMatch(/Upgrade/);
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
});
