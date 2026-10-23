import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { campaignsApi, PLANS } from "@ll/shared";
import BiaPage from "@/app/(marketing)/for-bias/page";
import { FreeCard, PaidCard } from "@/app/(marketing)/pricing/PlanCards";
import { moneyShort } from "@/lib/marketing/text";

describe("pricing cards", () => {
  it("shows the real price in the normal text colour, with a status badge while the plan is pilot-only", () => {
    const html = renderToStaticMarkup(<PaidCard id="plus" available={false} />);
    expect(html).toContain(">$39<");
    expect(html).toMatch(/text-fg[^-][^>]*>\$39</);
    expect(html).not.toContain("text-fg-subtle");
    expect(html).toContain("Pilot shops now");
    expect(html).toContain("Start free, ask for early access");
    expect(html).toContain(`or ${moneyShort(PLANS.plus.annualPriceCents)} a year`);
  });
  it("drops the badge once the API says the plan is available", () => {
    const html = renderToStaticMarkup(<PaidCard id="pro" available />);
    expect(html).toContain(">$99<");
    expect(html).not.toContain("Pilot shops now");
    expect(html).toContain("Start Service");
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
