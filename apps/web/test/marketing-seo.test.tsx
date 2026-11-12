import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLANS } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { assertSiteUrlInProduction, env } from "@/lib/env";
import { demoQrUrl } from "@/lib/marketing/demo-qr";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { languageAlternates } from "@/lib/marketing/language-alternates";
import { JsonLd, faqLd, organizationLd, softwareLd } from "@/lib/marketing/structured-data";
import { listingUrl, storeLinks } from "@/lib/marketing/store-links";

describe("the site URL in production", () => {
  const real = { NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.shop.test" };
  it("refuses a production server on a real API with no site URL, a localhost one or a plain http one", () => {
    expect(() => assertSiteUrlInProduction(real)).toThrow(/NEXT_PUBLIC_SITE_URL is not set/);
    expect(() => assertSiteUrlInProduction({ ...real, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toThrow(/public https address/);
    expect(() => assertSiteUrlInProduction({ ...real, NEXT_PUBLIC_SITE_URL: "http://shop.test" })).toThrow(/public https address/);
    expect(() => assertSiteUrlInProduction({ ...real, NEXT_PUBLIC_SITE_URL: "not a url" })).toThrow(/public https address/);
  });
  it("accepts a public https address, and leaves development and local end-to-end builds alone", () => {
    expect(() => assertSiteUrlInProduction({ ...real, NEXT_PUBLIC_SITE_URL: "https://shop.test" })).not.toThrow();
    expect(() => assertSiteUrlInProduction({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSiteUrlInProduction({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "http://localhost:4200", NEXT_PUBLIC_SITE_URL: "http://localhost:3200" })).not.toThrow();
    expect(() => assertSiteUrlInProduction({ NODE_ENV: "production" })).not.toThrow(); // the default API is this machine
  });
});

describe("structured data", () => {
  it("prices the three plans from PLANS, in CAD", () => {
    const ld = softwareLd("A *free* card.") as { description: string; offers: { name: string; price: string; priceCurrency: string }[] };
    expect(ld.description).toBe("A free card.");
    expect(ld.offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual([
      [PLANS.free.name, "0.00", "CAD"],
      [PLANS.plus.name, (PLANS.plus.priceCents / 100).toFixed(2), "CAD"],
      [PLANS.studio.name, (PLANS.studio.priceCents / 100).toFixed(2), "CAD"],
    ]);
  });
  it("states no business fact the pages do not: no address, phone, email or rating", () => {
    const text = JSON.stringify([organizationLd(), softwareLd("x")]);
    expect(text).not.toMatch(/streetAddress|telephone|email|aggregateRating|review/i);
  });
  it("carries every question of the home page, and cannot close its own script tag", () => {
    const ld = faqLd(copy.landing.faq) as { mainEntity: { name: string }[] };
    expect(ld.mainEntity.map((q) => q.name)).toEqual(copy.landing.faq.map((q) => q.q));
    const html = renderToStaticMarkup(<JsonLd data={faqLd([{ q: "</script><b>x", a: "**bold** answer" }])} />);
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("bold answer");
    expect(html.match(/<script type="application\/ld\+json">/g)).toHaveLength(1);
  });
});

describe("language alternates", () => {
  it("lists all four languages and x-default, and makes each version its own canonical", () => {
    const ur = languageAlternates("/for-restaurants", "ur");
    expect(ur.canonical).toBe("/for-restaurants?lang=ur");
    expect(ur.languages).toEqual({ "x-default": "/for-restaurants", "en-CA": "/for-restaurants", "hi-IN": "/for-restaurants?lang=hi", "ur-PK": "/for-restaurants?lang=ur", "pa-IN": "/for-restaurants?lang=pa" });
    expect(languageAlternates("/for-shoppers", "en").canonical).toBe("/for-shoppers");
  });
});

describe("app store links", () => {
  it("shows a store only when its listing URL is configured", () => {
    expect(storeLinks({})).toEqual({ appStore: null, playStore: null });
    expect(storeLinks({ appStore: "https://apps.apple.com/", playStore: "https://play.google.com/store" })).toEqual({ appStore: null, playStore: null });
    expect(storeLinks({ appStore: "https://apps.apple.com/ca/app/local-loyalty/id123456789", playStore: "https://play.google.com/store/apps/details?id=ca.example.app" })).toEqual({
      appStore: "https://apps.apple.com/ca/app/local-loyalty/id123456789",
      playStore: "https://play.google.com/store/apps/details?id=ca.example.app",
    });
  });
  it("rejects anything that is not an https link on the store's own host", () => {
    expect(listingUrl("http://apps.apple.com/ca/app/x/id1", "apps.apple.com", /^\/?$/)).toBeNull();
    expect(listingUrl("https://evil.example/ca/app/x/id1", "apps.apple.com", /^\/?$/)).toBeNull();
    expect(listingUrl("not a url", "apps.apple.com", /^\/?$/)).toBeNull();
  });
});

describe("the QR codes on the sample cards", () => {
  it("lead to a page of our own site that works: the sign-up for an owner, the map for a shopper", () => {
    expect(demoQrUrl()).toBe(`${env.siteUrl}/signup?src=demo-qr`);
    expect(demoQrUrl("shopper")).toBe(`${env.siteUrl}/map?src=demo-qr`);
    // The sign-up keeps the source, so scans can be counted.
    expect(signupPrefill({ src: "demo-qr" })).toEqual({ src: "demo-qr" });
  });
});
