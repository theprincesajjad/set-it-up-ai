import { BRAND, PLANS } from "@ll/shared";
import { env } from "@/lib/env";
import { plainText } from "./emphasis";

/**
 * Structured data (schema.org JSON-LD) for the public pages, so a search engine can show who we are, what the product costs and the
 * questions a page answers. Every value comes from what the page already shows: the name and site address, the prices in PLANS, and
 * the page's own questions. Nothing here is a business fact the page does not state (no street address, phone number or rating).
 */
type Json = Record<string, unknown>;

const site = () => env.siteUrl;

export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site()}/#organization`,
    name: BRAND.name,
    url: `${site()}/`,
    logo: `${site()}/icons/icon-512.png`,
    areaServed: { "@type": "City", name: "Toronto" },
  };
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** The product and its three plans, priced from PLANS in CAD: Free at 0, then Pro and Studio by the month. */
export function softwareLd(description: string): Json {
  const offer = (id: "free" | "plus" | "studio") => ({
    "@type": "Offer",
    name: PLANS[id].name,
    price: dollars(PLANS[id].priceCents),
    priceCurrency: "CAD",
    url: `${site()}/pricing`,
    ...(PLANS[id].priceCents > 0 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: dollars(PLANS[id].priceCents), priceCurrency: "CAD", billingDuration: "P1M" } } : {}),
  });
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    url: `${site()}/`,
    description: plainText(description),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    publisher: { "@id": `${site()}/#organization` },
    offers: [offer("free"), offer("plus"), offer("studio")],
  };
}

/** The questions and answers a page shows, as it shows them (emphasis marks removed). */
export function faqLd(items: readonly { q: string; a: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: plainText(i.q), acceptedAnswer: { "@type": "Answer", text: plainText(i.a) } })),
  };
}

/** One <script type="application/ld+json"> per item. "<" is escaped so no text can close the script. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <>
      {(Array.isArray(data) ? data : [data]).map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />
      ))}
    </>
  );
}
