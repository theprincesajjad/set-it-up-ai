/**
 * Pharmacy rules (docs/research/pharmacies-wellness.md). One file, used by the API (which enforces them) and the web
 * app (which explains them), so the words on screen and the checks on the server cannot drift.
 *
 * Why these rules exist, in one paragraph: in Ontario a pharmacy owner may not offer a "benefit" (any incentive of more than
 * nominal value, including a rebate, credit or gift) to a patient in relation to the sale of a drug or the provision of pharmacy
 * services, except a fee adjustment for that patient on that drug or service, or a free item of nominal value for well-being
 * (O. Reg. 264/16 s. 34 para 3 under the Drug and Pharmacies Regulation Act; the same rule binds pharmacists in
 * O. Reg. 130/17 s. 6(c) under the Pharmacy Act, 1991). The Ontario College of Pharmacists' loyalty points policy says the
 * same in plain words: no points on prescriptions, prescription services or other professional services, and points may not be
 * redeemed on prescriptions. Prescriptions, vaccines and medication reviews are also personal health information under PHIPA.
 * We therefore keep the dispensary out of the product completely: nothing earns, nothing is discounted, nothing is messaged and
 * nothing about it is stored beyond the fact that a booking existed.
 */

export const PHARMACY_VERTICAL = "pharmacy";
export const isPharmacyVertical = (v: string | null | undefined): boolean => v === PHARMACY_VERTICAL;

/** Rule ids, in the order the "Pharmacy rules" page lists them. Each one has a test (apps/api/test/pharmacy.test.ts). */
export const PHARMACY_RULES = [
  { id: "no_earn_rx", text: "No points, discounts or gifts on prescriptions or pharmacy services" },
  { id: "front_store_total", text: "A front-store subtotal is confirmed at every sale" },
  { id: "no_visit_earn", text: "No points for a visit or a stamp" },
  { id: "no_dispensary_text", text: "No messages, rewards or offers that mention prescriptions, refills or medications" },
  { id: "no_member_notes", text: "No notes or tags on customers" },
  { id: "appointments_minimal", text: "Appointments keep no price, notes or reason for the visit" },
  { id: "no_network_perk", text: "Network perks never count a pharmacy visit that was not front store" },
  { id: "no_referrals", text: "No referral rewards (O. Reg. 264/16 s. 34 para 2: a benefit for referring a patient)" },
  { id: "no_reviews", text: "No review requests after a pharmacy appointment" },
] as const;
export type PharmacyRuleId = (typeof PHARMACY_RULES)[number]["id"];

/** The categories every pharmacy gets, locked. `dispensary` ones can never earn or be discounted, renamed or deleted. */
export const PHARMACY_LOCKED_CATEGORIES = [
  "Prescriptions",
  "Pharmacy services",
  "Dispensing fees and compounding",
] as const;

/** Appointment types a pharmacy can offer. Free text is allowed too, but it is checked for health words. */
export const PHARMACY_SERVICE_PRESETS = ["Flu shot", "Vaccine appointment", "Medication review", "Pharmacist consultation"] as const;

/**
 * Schedule II and III items (NAPRA national drug schedules, referenced by O. Reg. 264/16 s. 3) are non-prescription drugs kept
 * behind the counter (II) or in the professional area (III), sold with a pharmacist's involvement. The Ontario rule on benefits
 * covers "a drug", not only prescriptions, and no source we found says points on these are allowed, so we treat them like the
 * dispensary: the category names above lock, the cashier's front-store tick excludes them, and the question is on the counsel
 * list in docs/research/pharmacies-wellness.md.
 */
export const PHARMACY_FRONT_STORE_TICK_EN = "This total has no prescriptions, pharmacy services or behind-the-counter (Schedule II or III) items";

/** Ontario College of Pharmacists accreditation number, as typed by the owner: digits, 4 to 10 of them. */
export const OCP_ACCREDITATION_RE = /^\d{4,10}$/;
export const normalizeOcpNumber = (v: string | null | undefined): string => (v ?? "").replace(/[\s#-]/g, "");

/** The only text an order-ready notice may carry (see messages `rx.pickup.ready` in all four languages). */
export const PHARMACY_PICKUP_KEY = "rx.pickup.ready";

/**
 * Category names that mark the dispensary. Used for pharmacies only (a pet shop's "Medication" aisle is not regulated this
 * way). Matches Rx, prescriptions, dispensing, pharmacy services, medication, vaccines, compounding, blister packs and the
 * like, in English. A stored `dispensary` flag on the category (set from this) outlives a rename.
 */
const DISPENSARY_CATEGORY =
  /(prescription|\brx\b|dispens|pharmacy services?|pharmacist|medication|medicine|\bdrugs?\b|vaccin|immuni[sz]|injection|compound|blister|pill ?pack|compliance pack|medscheck|narcotic|controlled substance|methadone|clinic|consult|co-?pay|insurance|\bodb\b|\btrillium\b|test[- ]?strips?|lancets?|glucose|schedule (?:2|3|ii|iii)\b|sched\.? ?(?:2|3|ii|iii)\b|behind[- ]the[- ]counter|\bbtc\b|pseudoephedrine|codeine|\bnrt\b|nicotine replacement)/i;
export const isDispensaryCategoryName = (name: string): boolean => DISPENSARY_CATEGORY.test(name);

/**
 * Words that tie an offer or a message to the dispensary. Blocked in reward, promo, discount-card, message and automation
 * text, and in manual point-adjustment reasons, at pharmacies. A sentence that only *excludes* these ("Not valid on
 * prescriptions") is allowed, because the exclusion is the compliant wording.
 */
const DISPENSARY_TERMS =
  /\b(prescriptions?|rx|refills?|re-?fills?|dispens\w*|medications?|medicines?|meds|drugs?|medscheck|blister ?packs?|pill ?packs?|compliance ?packs?|vaccin\w*|immuni[sz]\w*|flu ?shots?|flu ?jabs?|jabs?|shots?|injections?|compound\w*|transfers? (?:your |a )?(?:prescriptions?|rx)|pharmacist (?:services?|consult\w*|appointments?)|pharmacy services?|narcotics?|opioids?|insulin|methadone|suboxone)\b/i;

/** Words that name a health condition or a drug class. Blocked wherever free text could attach to a person. */
const HEALTH_TERMS =
  /\b(diabet\w*|hypertension|blood pressure|cholesterol|asthma|copd|cancer|chemo\w*|hiv|aids|depress\w*|anxiety|adhd|epilep\w*|thyroid|arthritis|migraines?|birth control|contracepti\w*|fertility|pregnan\w*|menopaus\w*|stds?|stis?|erectile|antibiotics?|antidepress\w*|statins?|inhalers?|glucose|dementia|alzheimer\w*|mental health|addiction|schizo\w*|bipolar|hepatitis|tuberculosis|covid\w*|paxlovid|ozempic|metformin|warfarin)\b/i;

/**
 * Wording in Hindi, Urdu and Punjabi (script and the usual romanised spellings) that names medicine, a prescription, a vaccine,
 * a doctor's slip or a discount on them. The seniors this product serves read these languages. Not a full check; the composer says so.
 */
const DISPENSARY_TERMS_INTL =
  /(दवा(?:ई|इ|ओं|यों)?|दवाइयाँ|नुस्खा|पर्ची|टीका(?:करण)?|इंजेक्शन|फ्लू शॉट|ڈاکٹر کا نسخہ|نسخہ|دوا(?:ئی|ئیں|یں)?|ادویات|ویکسین|ٹیکہ|ਦਵਾਈ(?:ਆਂ|ਈ)?|ਨੁਸਖ਼?ਾ|ਪਰਚੀ|ਟੀਕਾ(?:ਕਰਨ)?|ਟੀਕੇ|\b(?:dawai|dawa|davai|dawaai|nuskha|nuskhe|teeka|tika|dawaiyan)\b)/iu;

/** Health claims (O. Reg. 264/16 s. 29: nothing that cannot be verified, no safety or effectiveness claims). */
const CLAIM_TERMS =
  /\b(boosts?|boosting|strengthens?|supports?) (?:your |the )?(?:immun\w*|defen[cs]es?)|\b(?:immunity|immune system)\b|\bcures?\b|\bheals?\b|\bprevents?\b|\bdetox\w*|\bclinically proven\b|\bfights? (?:colds?|flu|infections?)\b/i;

/** A referral reward (para 2: a benefit for referring a patient). */
const REFERRAL_TERMS = /\b(refer(?:s|ral|rals|red|ring)?|refer-a-friend|bring a friend|bring your friends?|invite (?:a |your )?(?:friends?|family)|share with (?:a )?friends?|tell a friend|friend gets?)\b/i;

/** A sentence that only says what is NOT covered is the compliant way to mention the dispensary. */
const EXCLUSION_CLAUSE = /\b(not valid|not eligible|not applicable|excludes?|excluding|exclusions?|except|does ?n[o']t apply|do not apply|no points|no discounts?)\b.*$/is;

export interface PharmacyTextCheck {
  ok: boolean;
  /** "dispensary" (Rx, refill, vaccine...) or "health" (a condition or drug name). */
  kind?: "dispensary" | "health" | "claim" | "referral";
  term?: string;
}

/**
 * Check text a pharmacy wants to send or show. `mode: "offer"` (rewards, promos, cards, messages) blocks dispensary words and
 * health words; `mode: "label"` (customer tags, adjustment reasons, appointment-type names and descriptions) blocks health words
 * and, unless `allowServiceWords`, dispensary words too. Exclusion sentences are ignored in offer mode.
 */
export function checkPharmacyText(text: string | null | undefined, opts: { mode?: "offer" | "label"; allowServiceWords?: boolean } = {}): PharmacyTextCheck {
  if (!text) return { ok: true };
  const mode = opts.mode ?? "offer";
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const h = HEALTH_TERMS.exec(s);
    if (h) return { ok: false, kind: "health", term: h[0] };
    const cl = CLAIM_TERMS.exec(s);
    if (cl) return { ok: false, kind: "claim", term: cl[0] };
    const rf = REFERRAL_TERMS.exec(s);
    if (rf) return { ok: false, kind: "referral", term: rf[0] };
    const intl = DISPENSARY_TERMS_INTL.exec(opts.allowServiceWords ? "" : s);
    if (intl) return { ok: false, kind: "dispensary", term: intl[0] };
    if (opts.allowServiceWords) continue;
    // "Not valid on prescriptions" is the compliant wording: drop the exclusion clause (from its keyword to the end of the
    // sentence) and look at what is left. "Refills ready, not valid on vitamins" still fails on "Refills".
    const rest = mode === "offer" ? s.replace(EXCLUSION_CLAUSE, "") : s;
    const d = DISPENSARY_TERMS.exec(rest);
    if (d) return { ok: false, kind: "dispensary", term: d[0] };
  }
  return { ok: true };
}

/** Plain-language reason shown with a 422 `pharmacy_text` error. */
export function pharmacyTextMessage(c: PharmacyTextCheck, what = "This text"): string {
  if (c.ok) return "";
  if (c.kind === "claim") return `${what} makes a health claim ("${c.term}"). A pharmacy can't say a product boosts, cures or prevents anything (O. Reg. 264/16 s. 29). Describe the product or the price instead.`;
  if (c.kind === "referral") return `${what} offers something for referring or bringing in a friend ("${c.term}"). A pharmacy can't reward referrals (O. Reg. 264/16 s. 34 para 2).`;
  return c.kind === "health"
    ? `${what} names a health condition or medicine ("${c.term}"). A pharmacy can't use that in rewards, offers, messages or customer labels. Talk about the front store instead.`
    : `${what} mentions "${c.term}". Offers and messages from a pharmacy can only be about the front store, never prescriptions, refills, vaccines or other pharmacy services.`;
}

/** Shown under the message box at a pharmacy: the check is a safety net, not a sign-off. */
export const PHARMACY_CHECK_NOTE_EN = "This check catches common words in English, Hindi, Urdu and Punjabi. It is not complete. You are still responsible for what you send.";

/** Order-ready notice length caps and the text the customer sees (English; the other languages live in the message catalog). */
export const PHARMACY_PICKUP_TEXT_EN = "{shop}: your order is ready for pickup.";
