import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADD_ONS, ADD_ON_IDS, FEES, FREE_FOREVER, FEATURES, PLANS, PLAN_IDS, RESTAURANT_PLANS, RESTAURANT_TIERS, RETENTION, UPLOAD_LINK_MINUTES, legalTokens } from "@ll/shared";
import { LEGAL_DOCS, LEGAL_DOCS_FR, loadLegalDoc, renderLegalMarkdown } from "../src/lib/legal";

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

describe("privacy policy retention and deletion text match the code", () => {
  const md = rendered("privacy");
  it("prints every retention period from the shared RETENTION config", () => {
    const t = legalTokens();
    for (const k of ["phoneTranscriptDays", "whatsappMessageDays", "repairPhotoMonths", "reviewFeedbackMonths", "tiffinAddressMonths", "appointmentMonths", "allergyNoteDays", "driverLinkDays", "abandonedHoldDays"] as const) {
      expect(raw("privacy"), k).toContain(`{{retention.${k}}}`);
      expect(md, k).toContain(t[`retention.${k}`]!);
    }
    expect(t["retention.phoneTranscriptDays"]).toBe(`${RETENTION.phoneTranscriptDays} days`);
  });
  it("covers the AI sales assistant: says it is an AI, names Anthropic as the processor and prints its retention period in both languages", () => {
    const t = legalTokens();
    expect(raw("privacy")).toContain("{{retention.salesAgentDays}}");
    expect(md).toContain(t["retention.salesAgentDays"]!);
    for (const w of ["AI assistant", "Anthropic", "typing HUMAN", "may not use these chats to train"]) expect(md, w).toContain(w);
    const fr = renderLegalMarkdown(readFileSync(path.join(DIR, "fr/privacy-policy.md"), "utf8"), "fr").md;
    for (const w of ["assistant IA", "Anthropic", "HUMAN"]) expect(fr, w).toContain(w);
    expect(fr).toContain(legalTokens("fr")["retention.salesAgentDays"]!);
  });
  it("has no bracketed target periods and no engineering notes left", () => {
    for (const bad of ["[90 days]", "[24 months]", "[12 months]", "these periods are targets", "not yet built", "Counsel and engineering", "confirm that deletion also reaches"]) expect(md, bad).not.toContain(bad);
  });
  it("says deletion reaches the newer records and that a STOP entry is kept", () => {
    for (const w of ["appointment notes", "tiffin addresses", "WhatsApp chats", "phone transcripts", "review comments", "quote signatures", "wait-list entries", "referral links", "wallet passes", "push tokens", "replied STOP"]) expect(md.toLowerCase(), w).toContain(w.toLowerCase());
  });
});

/** Every page that is published: the four English ones and the French ones. Internal notes belong in counsel-notes.md, never here. */
const PUBLISHED = [
  ...(Object.keys(LEGAL_DOCS) as (keyof typeof LEGAL_DOCS)[]).map((slug) => ({ id: slug, lang: "en" as const, file: LEGAL_DOCS[slug].file })),
  ...(Object.keys(LEGAL_DOCS_FR) as (keyof typeof LEGAL_DOCS_FR)[]).map((slug) => ({ id: `${slug} (fr)`, lang: "fr" as const, file: LEGAL_DOCS_FR[slug].file })),
];
/** Placeholders for facts we do not have yet. Anything else in square brackets is a drafting note and is not allowed. */
const PLACEHOLDERS = new Set([
  "date", "0.1-draft", "Local Loyalty Inc.", "Canadian/Ontario", "address", "link", "support email", "email", "phone", "name", "name, email", "provider, Canadian region", "provider, region", "map tile provider", "analytics and crash reporting",
  "0.1-brouillon", "nom", "courriel", "adresse", "courriel d'assistance", "fournisseur, région canadienne", "fournisseur, région", "fournisseur de tuiles cartographiques", "analytique et rapports de plantage",
]);
const INTERNAL = [/counsel/i, /\bVERIFY\b/, /finance note/i, /checklist/i, /bracketed/i, /drafting note/i, /\bTODO\b|\bTBD\b|\bFIXME\b/, /to draft/i, /model cost/i, /expected redemption/i, /balance sheet/i, /traduction/i, /à faire réviser/i, /a lawyer should/i, /engineering/i, /Drop rewards/i, /class action/i, /\[[^\]]*\b(?:confirm|check|decide|recommended)\b/i];
const brackets = (md: string) => [...md.replace(/\[[^\]]*\]\([^)]*\)/g, "").matchAll(/\[([^\]\n]*)\]/g)].map((m) => m[1]!);

describe("every published legal page is clean of internal notes", () => {
  for (const p of PUBLISHED) {
    const source = readFileSync(path.join(DIR, p.file), "utf8");
    // The heading and blockquote at the top are the draft banner ("have a lawyer review" / "à faire réviser par un juriste"); the page replaces them with its own banner.
    const body = source.replace(/^# [^\n]*\n+(> [^\n]*\n)*/, "");
    const published = renderLegalMarkdown(source, p.lang).md;
    it(`${p.id}: no Counsel, VERIFY, checklist, finance or drafting notes in the published text or in the source`, () => {
      // The source is checked too, banner aside: a note the renderer happened to strip would still sit in the repo's published source.
      for (const re of INTERNAL) {
        expect(published, `${p.file}: ${re}`).not.toMatch(re);
        expect(body, `${p.file} (source): ${re}`).not.toMatch(re);
      }
    });
    it(`${p.id}: square brackets are only placeholders for facts, never notes`, () => {
      for (const b of brackets(source)) expect(PLACEHOLDERS.has(b), `[${b}] in ${p.file}`).toBe(true);
    });
    it(`${p.id}: keeps its draft banner (the page adds it) and no unresolved tokens`, () => {
      const r = renderLegalMarkdown(source, p.lang);
      expect(r.isDraft).toBe(true);
      expect(r.md).not.toMatch(/\{\{|\}\}|^# (?:DRAFT|BROUILLON)/m);
      expect(r.md).not.toMatch(/^> /m);
    });
  }

  it("the detector catches the kinds of note that used to be there", () => {
    for (const note of ["- Counsel: check these caps.", "Items marked **VERIFY** must be confirmed", "*Counsel checklist:*", "[To draft with counsel.]", "Bracketed items are placeholders.", "**Finance note.** The model books", "[A French version of this policy is required before we serve Quebec shoppers.]", "Traduction — à faire réviser"]) {
      expect(INTERNAL.some((re) => re.test(note)) || brackets(note).some((b) => !PLACEHOLDERS.has(b)), note).toBe(true);
    }
  });

  it("the notes are kept for counsel in docs/legal/counsel-notes.md", () => {
    const notes = readFileSync(path.join(DIR, "counsel-notes.md"), "utf8");
    for (const kept of ["Finance note", "goodwill conversion", "Schedule B", "reimbursement", "age floor", "Counsel checklist", "Drop rewards app", "Traduction — à faire réviser: Politique de confidentialité", "Traduction — à faire réviser: Conditions des récompenses", "Traduction — à faire réviser: avis de transcription téléphonique"]) expect(notes, kept).toContain(kept);
  });
});

describe("French pages (Law 25)", () => {
  const en = { privacy: raw("privacy"), rewards: raw("rewards") };
  const fr = (slug: keyof typeof LEGAL_DOCS_FR) => readFileSync(path.join(DIR, LEGAL_DOCS_FR[slug].file), "utf8");
  const tokensIn = (md: string) => [...md.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!).sort();

  it("use exactly the same {{tokens}} as the English pages, so the numbers cannot differ", () => {
    for (const slug of ["privacy", "rewards"] as const) expect(tokensIn(fr(slug)), slug).toEqual(tokensIn(en[slug]));
  });
  it("print the retention periods from RETENTION in French", () => {
    const md = renderLegalMarkdown(fr("privacy"), "fr").md;
    const t = legalTokens("fr");
    for (const k of ["phoneTranscriptDays", "whatsappMessageDays", "repairPhotoMonths", "reviewFeedbackMonths", "tiffinAddressMonths", "appointmentMonths", "allergyNoteDays", "driverLinkDays", "abandonedHoldDays"] as const) {
      expect(fr("privacy"), k).toContain(`{{retention.${k}}}`);
      expect(md, k).toContain(t[`retention.${k}`]!);
    }
    expect(t["retention.phoneTranscriptDays"]).toBe(`${RETENTION.phoneTranscriptDays} jours`);
    expect(t["retention.repairPhotoMonths"]).toBe(`${RETENTION.repairPhotoMonths} mois`);
    expect(t["retention.driverLinkDays"]).toBe(`${RETENTION.driverLinkDays} jours`);
    expect(t["upload.linkMinutes"]).toBe(`${UPLOAD_LINK_MINUTES} minutes`);
    expect(md).not.toMatch(/\b\d+ (?:days|months)\b/);
  });
  it("keep every number the rewards terms promise (90, 30, 60, 10 days)", () => {
    for (const [slug, nums] of [["rewards", ["90 jours", "30 jours", "60 jours", "10 jours ouvrables"]]] as const) {
      const md = renderLegalMarkdown(fr(slug), "fr").md;
      for (const n of nums) expect(md, n).toContain(n);
    }
    expect(Array.from(en.rewards.matchAll(/\*\*(\d+) (?:days|business days)/g), (m) => m[1]).sort()).toEqual(Array.from(fr("rewards").matchAll(/\*\*(\d+) (?:jours|jours ouvrables)/g), (m) => m[1]).sort());
  });
  it("carry the privacy promises and the Quebec section", () => {
    const md = renderLegalMarkdown(fr("privacy"), "fr").md;
    for (const w of ["Loi 25", "Commission d'accès à l'information", "Nous ne vendons pas vos renseignements personnels", "LCAP", "STOP", "Stripe", "Twilio", "Meta WhatsApp Cloud API", "Resend", "transcription", "Responsable de la protection des renseignements personnels", "tiffin", "halal"]) expect(md.toLowerCase(), w).toContain(w.toLowerCase());
    expect(md).toContain("jour et mois seulement");
    expect(md).toContain("**Chaque boutique voit uniquement votre activité dans cette boutique.**");
  });
  it("section by section, the French has as many sections as the English", () => {
    for (const slug of ["privacy", "rewards"] as const) {
      const heads = (md: string) => [...md.matchAll(/^## (\d+)\./gm)].map((m) => m[1]);
      expect(heads(fr(slug)), slug).toEqual(heads(en[slug]));
    }
  });
  it("the English privacy policy tells the shopper about the French version and the signed photo links", () => {
    const md = rendered("privacy");
    expect(md).toContain("/legal/privacy?lang=fr");
    expect(md).toContain(`signed link that stops working after ${UPLOAD_LINK_MINUTES} minutes`);
    expect(md).toContain("never served from a permanent link");
  });
  it("renders to HTML at /legal/<doc>?lang=fr with the French title and the same draft handling", async () => {
    const privacy = await loadLegalDoc("privacy", "fr");
    expect(privacy.title).toBe("Politique de confidentialité");
    expect(privacy.isDraft).toBe(true);
    expect(privacy.html).toContain("<h1>Local Loyalty — Politique de confidentialité</h1>".replace("Local Loyalty", "Local Loyalty"));
    expect(privacy.html).not.toMatch(/\{\{|à faire réviser|Traduction/);
    const rewards = await loadLegalDoc("rewards", "fr");
    expect(rewards.title).toBe("Conditions des récompenses");
    expect(rewards.html).toContain("Vos points n&#39;expirent jamais");
  });
});

describe("rewards terms: nothing internal on the public page", () => {
  const md = rendered("rewards");
  it("has no finance, counsel or model notes", () => {
    for (const bad of ["Finance note", "Counsel:", "Counsel checklist", "counsel", "Model cost", "expected redemption", "balance sheet", "assumption"]) expect(md.toLowerCase(), bad).not.toContain(bad.toLowerCase());
  });
  it("the removed notes are kept for counsel in docs/legal/counsel-notes.md", () => {
    const notes = readFileSync(path.join(DIR, "counsel-notes.md"), "utf8");
    expect(notes).toContain("Finance note");
    expect(notes).toContain("goodwill conversion");
  });
});

describe("merchant agreement: the export promise is the one the product keeps", () => {
  it("prints the window from RETENTION.leaverExportDays", () => {
    expect(raw("merchants")).toContain("{{retention.leaverExportDays}}");
    expect(rendered("merchants")).toContain(`${RETENTION.leaverExportDays} days`);
    expect(rendered("merchants")).not.toContain("[90] days");
  });
});
