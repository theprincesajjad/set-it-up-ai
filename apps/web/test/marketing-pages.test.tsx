import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { campaignsApi, PLANS } from "@ll/shared";
import BiaPage from "@/app/(marketing)/for-bias/page";
import { FreeCard, PaidCard } from "@/app/(marketing)/pricing/PlanCards";
import { moneyShort } from "@/lib/marketing/text";

describe("pricing cards", () => {
  const firstYear = { shown: true, priceCents: 19900, listPriceCents: PLANS.plus.annualPriceCents, eligible: false, taken: false };
  it("shows Pro's real price in the normal text colour, the trial and the first-year price struck through, never named", () => {
    const html = renderToStaticMarkup(<PaidCard id="plus" firstYear={firstYear} />);
    expect(html).toContain(`>${moneyShort(PLANS.plus.priceCents)}<`);
    expect(html).toMatch(/text-primary-text[^>]*>\$29</); // the price wears terracotta text, never a subdued grey
    expect(html).not.toContain("text-fg-subtle");
    expect(html).not.toContain("early access");
    expect(html).toContain('href="/signup"'); // the trial needs no card: signup, not checkout
    expect(html).toContain(`<s class="tabular-nums">${moneyShort(PLANS.plus.annualPriceCents)}</s>`);
    expect(html).toContain("$199");
    expect(html).toContain("first year");
    expect(html).toContain("14 days of Pro free, no card.");
    expect(html.toLowerCase()).not.toContain("founding");
  });
  it("shows the plain yearly price when the first-year price is off", () => {
    const html = renderToStaticMarkup(<PaidCard id="plus" firstYear={null} />);
    expect(html).toContain(`or ${moneyShort(PLANS.plus.annualPriceCents)} a year`);
    expect(html).not.toMatch(/<s[ >]/);
  });
  it("sells Studio at its price with its own button", () => {
    const html = renderToStaticMarkup(<PaidCard id="studio" firstYear={firstYear} />);
    expect(html).toContain(`>${moneyShort(PLANS.studio.priceCents)}<`);
    expect(html).toContain('href="/signup?plan=studio"');
    expect(html).toContain("Start Studio");
    expect(html).not.toMatch(/<s[ >]/);
  });
  it("keeps the free card to five plain lines", () => {
    const html = renderToStaticMarkup(<FreeCard />);
    expect(html).toContain(">$0<");
    expect((html.match(/<li /g) ?? []).length).toBe(5);
  });
});

describe("for BIAs", () => {
  it("prints each package price from CAMPAIGN_PACKAGES", () => {
    const html = renderToStaticMarkup(<BiaPage />);
    for (const p of Object.values(campaignsApi.CAMPAIGN_PACKAGES)) {
      expect(html).toContain(moneyShort(p.priceCents));
      expect(html).toContain(`${p.days} days`);
    }
    expect(html).toContain("Sample data");
    expect(html).not.toMatch(/\b310\b|\b111\b|Trusted by/);
  });
});

describe("one component for the sample and the real report", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../src", rel), "utf8");
  it("renders both through ReportSummary", () => {
    expect(read("components/marketing/SampleReportCard.tsx")).toContain("<ReportSummary");
    expect(read("components/dashboard/campaigns/CampaignViews.tsx")).toContain("<ReportSummary");
    expect(read("components/dashboard/bia/PrintReport.tsx")).toContain("<ReportTiles");
  });
});
