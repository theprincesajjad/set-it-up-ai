import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADD_ONS, ADD_ON_IDS, FEES, FREE_FOREVER, FEATURES, PLANS, PLAN_IDS, RESTAURANT_PLANS, RESTAURANT_TIERS, legalTokens } from "@ll/shared";
import { LEGAL_DOCS, renderLegalMarkdown } from "../src/lib/legal";

const DIR = path.resolve(__dirname, "../../../docs/legal");
const raw = (slug: keyof typeof LEGAL_DOCS) => readFileSync(path.join(DIR, LEGAL_DOCS[slug].file), "utf8");
const rendered = (slug: keyof typeof LEGAL_DOCS) => renderLegalMarkdown(raw(slug)).md;

/** Fixed amounts that are not plan prices or fees (liability caps). Everything else must come from a {{token}}. */
const ALLOWED_LITERALS = new Set(["$1,000", "$100", "18%", "60%"]); // 18% is the privacy policy's example statistic; 60% see rewards terms (not a price or fee)
const money = (c: number) => `$${Number.isInteger(c / 100) ? (c / 100).toLocaleString("en-CA") : (c / 100).toFixed(2)}`;
const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

describe("legal pages render their numbers from plans.ts", () => {
  for (const slug of Object.keys(LEGAL_DOCS) as (keyof typeof LEGAL_DOCS)[]) {
    it(`${slug}: no hard-coded prices or percentages, no unresolved tokens`, () => {
      const literals = [...raw(slug).matchAll(/\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%/g)].map((m) => m[0]);
      expect(literals.filter((l) => !ALLOWED_LITERALS.has(l)), `hard-coded numbers in ${LEGAL_DOCS[slug].file}: use a {{token}}`).toEqual([]);
      expect(rendered(slug)).not.toMatch(/\{\{|\}\}/);
    });
  }

  it("merchant agreement: every plan name, price, add-on and fee matches plans.ts", () => {
    const md = rendered("merchants");
    for (const id of PLAN_IDS) {
      const p = PLANS[id];
      expect(md).toContain(p.name);
      if (p.priceCents) expect(md).toContain(`${money(p.priceCents)}/month`);
      if (p.annualPriceCents) expect(md).toContain(`${money(p.annualPriceCents)}/year`);
    }
    for (const k of RESTAURANT_TIERS) {
      const p = RESTAURANT_PLANS[k];
      expect(md).toContain(p.name);
      expect(md).toContain(`${money(p.priceCents)}/month`);
    }
    for (const id of ADD_ON_IDS) expect(md).toContain(`${ADD_ONS[id].name} | ${money(ADD_ONS[id].priceCents)}`);
    // The fee table, line by line.
    expect(md).toContain(`Online orders, any paid plan or restaurant plan | ${pct(FEES.orderBpsPaid)}`);
    expect(md).toContain(`Online orders, ${PLANS.free.name} plan | ${pct(FEES.orderBpsFree)}`);
    expect(md).toContain(`${money(FEES.customerServiceFeeCents)} per order`);
    expect(md).toContain(`invoices | ${pct(FEES.depositInvoiceBps)}`);
    expect(md).toContain(`Tiffin subscription billing | ${pct(FEES.tiffinBps)}`);
    expect(md).toContain(`pay link) | ${pct(FEES.appointmentCheckoutBps)}`);
    expect(md).toContain("Payments you record by hand (Interac e-transfer, cash, cheque) | 0%");
  });

  it("the headline numbers are the ones the business decided", () => {
    expect([FEES.orderBpsFree, FEES.orderBpsPaid, FEES.depositInvoiceBps, FEES.tiffinBps, FEES.appointmentCheckoutBps, FEES.customerServiceFeeCents]).toEqual([150, 0, 100, 100, 0, 49]);
    expect(PLANS.plus.name).toBe("Café & Retail");
  });

  it("no retired plan names or fee numbers appear in any legal page", () => {
    for (const slug of Object.keys(LEGAL_DOCS) as (keyof typeof LEGAL_DOCS)[]) {
      const md = rendered(slug);
      expect(md, slug).not.toMatch(/0\.75%/);
      expect(md, slug).not.toMatch(/\bPlus plan\b|\bPro plan\b|\bPlus\b \$|\bPro\b \$/);
    }
  });

  it("Schedule A is exactly FREE_FOREVER", () => {
    const md = rendered("merchants");
    for (const k of FREE_FOREVER) expect(md).toContain(FEATURES[k].name);
    expect(legalTokens()["list.free"]!.split("; ")).toHaveLength(FREE_FOREVER.length);
  });

  it("the paid-plan token tables are rendered from the shared plan data", () => {
    const t = legalTokens();
    expect(t["plan.plus.price"]).toBe("$39/month");
    expect(t["plan.pro.name"]).toBe("Service");
    expect(t["fee.orderFree"]).toBe("1.5%");
  });
});

describe("privacy policy", () => {
  const md = rendered("privacy");
  it("keeps the current promises", () => {
    expect(md).toContain("birthday (day and month only)");
    expect(md).toContain("**Each shop sees only your activity at that shop.**");
    expect(md).toContain("**We do not sell your personal information.**");
    expect(md).toMatch(/aggregated/i);
  });
  it("covers every newer module and processor", () => {
    for (const w of ["Appointments", "Tiffin", "driver link", "Catering", "Review", "WhatsApp", "transcript", "photos", "Allergy", "halal", "Stripe", "Twilio", "Meta WhatsApp Cloud API", "Resend", "Expo", "Law 25", "CASL", "STOP", "Retention"]) {
      expect(md.toLowerCase(), w).toContain(w.toLowerCase());
    }
  });
});
