import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { campaignsApi, PLANS } from "@ll/shared";
import BiaPage from "@/app/(marketing)/for-bias/page";
import { FreeCard, PaidCard } from "@/app/(marketing)/pricing/PlanCards";
import { marketingPlans } from "@/lib/marketing/plan-copy";
import { moneyShort, sentenceCase } from "@/lib/marketing/text";

describe("pricing cards", () => {
  const firstYear = { shown: true, priceCents: 19900, listPriceCents: PLANS.plus.annualPriceCents, eligible: false, taken: false };
  it("shows Pro's real price in the page's text colour, the trial and the first-year price struck through, never named", () => {
    const html = renderToStaticMarkup(<PaidCard id="plus" firstYear={firstYear} />);
    expect(html).toContain(`>${moneyShort(PLANS.plus.priceCents)}<`);
    expect(html).toMatch(/text-foreground[^>]*>\$29</); // the price is black like the home page's, never an accent colour or a subdued grey
    expect(html).not.toContain("text-primary-text");
    expect(html).not.toContain("text-fg-subtle");
    expect(html).not.toContain("early access");
    expect(html).toContain('href="/signup"'); // the trial needs no card: signup, not checkout
    expect(html).toContain(`<s class="tabular-nums">${moneyShort(PLANS.plus.annualPriceCents)}</s>`);
    expect(html).toContain("$199");
    expect(html).toContain("first year");
    expect(html).toContain("14 days of Pro free, no card.");
    expect(html.toLowerCase()).not.toContain("founding");
    // Nothing backs "Most popular", so no plan carries it.
    expect(html).not.toContain("Most popular");
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
    expect(html).not.toMatch(/<s[ >]/);
  });
  it("describes the plans to a shop in the home page's own words, with the home page's button labels", () => {
    const [free, pro, studio] = marketingPlans("shop");
    const freeHtml = renderToStaticMarkup(<FreeCard />);
    expect(freeHtml).toContain(">$0<");
    expect(freeHtml).toContain(free!.tagline);
    for (const line of free!.features) expect(freeHtml).toContain(line);
    expect(freeHtml).toContain(`>${free!.cta}</`);
    expect(freeHtml).not.toMatch(/bookable calendar|[Dd]eposits/);
    const proHtml = renderToStaticMarkup(<PaidCard id="plus" firstYear={firstYear} />);
    expect(proHtml).toContain(pro!.tagline);
    expect(proHtml).toContain(`>${pro!.cta}</`);
    expect(proHtml).not.toContain("bookable calendars");
    const studioHtml = renderToStaticMarkup(<PaidCard id="studio" firstYear={firstYear} />);
    expect(studioHtml).toContain(studio!.tagline);
    expect(studioHtml).toContain(`>${studio!.cta}</`);
    expect(studioHtml).not.toMatch(/chair/);
  });
  it("keeps the booking wording for people who take bookings: five plain lines on Free, calendars and chairs on the paid cards", () => {
    const html = renderToStaticMarkup(<FreeCard audience="solo" />);
    expect((html.match(/<li /g) ?? []).length).toBe(5);
    expect(html).toContain("1 bookable calendar with online booking");
    expect(renderToStaticMarkup(<PaidCard id="plus" firstYear={firstYear} audience="solo" />)).toContain("2 bookable calendars");
    expect(renderToStaticMarkup(<PaidCard id="studio" firstYear={firstYear} audience="solo" />)).toContain("no per-chair charge");
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

describe("sentence-case headlines", () => {
  it("capitalises the first letter of each sentence and leaves the rest alone", () => {
    expect(sentenceCase("free loyalty. flat prices for the rest.")).toBe("Free loyalty. Flat prices for the rest.");
    expect(sentenceCase("built for how a Desi kitchen runs.")).toBe("Built for how a Desi kitchen runs.");
    expect(sentenceCase("Your regulars, on repeat.")).toBe("Your regulars, on repeat.");
    expect(sentenceCase("what do I pay? nothing for loyalty.")).toBe("What do I pay? Nothing for loyalty.");
    expect(sentenceCase("$0 to start.")).toBe("$0 to start.");
    expect(sentenceCase("پورا آرڈر اپنے پاس رکھیں۔")).toBe("پورا آرڈر اپنے پاس رکھیں۔");
  });
});
