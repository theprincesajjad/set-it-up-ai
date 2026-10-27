/**
 * Beauty supply claims check (docs/research/barbers-beauty.md 2.6). Health Canada treats a product with a therapeutic (treatment)
 * claim as a drug or natural health product, not a cosmetic, and counts claims in a name, on a label, in advertising or on a website.
 * A shop that sells hair and skin products must not put those claims in its own texts, promos, rewards or card names. This is a
 * conservative word guard, not legal advice: it refuses the clearest treatment claims and says why.
 */
export const BEAUTY_SUPPLY_VERTICAL = "beauty_supply";
export const isBeautySupplyVertical = (v: string | null | undefined): boolean => v === BEAUTY_SUPPLY_VERTICAL;

const CLAIMS =
  /\b(stops? (?:your )?(?:hair )?(?:loss|fall|shedding|thinning|balding)|prevents? (?:hair )?(?:loss|balding|thinning|breakage disease)|re-?grows? (?:your )?hair|hair ?re-?growth|grows? (?:new |back )?hair|cures?|cured|heals?|healing|treatments? for (?:dandruff|eczema|psoriasis|acne|alopecia|hair loss)|(?:dandruff|eczema|psoriasis|acne|alopecia|rosacea|dermatitis|fungal|lice) (?:cure|treatment|remedy)|anti-?(?:fungal|bacterial|inflammatory|dandruff)|(?:treat|treats|treating) (?:your )?(?:dandruff|eczema|psoriasis|acne|alopecia|rosacea|dermatitis|hair loss|scalp conditions?)|(?:promotes?|boosts?|stimulates?|encourages?) (?:healthy )?hair growth|hair growth (?:serum|oil|shampoo|formula|treatment|vitamins?)|clinically (?:proven|tested to|shown to)|medical(?:ly)? (?:grade|proven)|health canada approved|doctor[- ]prescribed|removes? (?:wrinkles|scars|stretch marks) permanently|permanent(?:ly)? (?:removes?|reverses?)|reverses? (?:ageing|aging|greying|graying))\b/i;

export interface BeautyClaimCheck {
  ok: boolean;
  term?: string;
}

export function checkBeautyClaims(text: string | null | undefined): BeautyClaimCheck {
  if (!text) return { ok: true };
  const m = CLAIMS.exec(text);
  return m ? { ok: false, term: m[0] } : { ok: true };
}

export function beautyClaimMessage(c: BeautyClaimCheck, what = "This text"): string {
  return c.ok
    ? ""
    : `${what} says "${c.term}". That is a treatment claim. Health Canada treats a product with a treatment claim as a drug, not a cosmetic. Say what the product is (a hair serum, a shampoo) and the price, not what it treats.`;
}
