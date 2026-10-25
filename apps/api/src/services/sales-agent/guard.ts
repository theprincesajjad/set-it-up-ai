/**
 * Checks on what the assistant is about to say, run in code after the model and before the owner sees it.
 * A reply that fails is sent back to the model once with the reason; if it fails again it is replaced with the
 * fixed hand-off text and the chat goes to a person (agent.ts). Two checks:
 *
 *  1. Figures. Every dollar amount and percentage must be one of the product's own figures (plans.ts: plans, annual
 *     prices, add-ons, fees, the founding offer and the discounted prices it gives), or a figure that appeared in a tool
 *     result this turn, or one the person wrote themselves ("I do $5,000 a month"). So "Growth is $199" passes and
 *     "Growth is $149" does not, whatever the model "remembers".
 *  2. Promises. Guaranteed results, risk-free or money-back claims, a trial or refund we have not defined, delivery
 *     dates. Competition Act (representations to the public must not be false or misleading) and CASL; the rule of
 *     thumb is that anything not in plans.ts or the knowledge base is "I'll check with the team".
 */
import { ADD_ONS, ADD_ON_IDS, FEES, FOUNDING_OFFER, PLANS, PLAN_IDS, RESTAURANT_PLANS, RESTAURANT_TIERS } from "@ll/shared";

const DIGITS: Record<string, string> = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "੦": "0", "੧": "1", "੨": "2", "੩": "3", "੪": "4", "੫": "5", "੬": "6", "੭": "7", "੮": "8", "੯": "9" };
export const asciiDigits = (s: string): string => s.replace(/[०-९٠-٩۰-۹੦-੯]/g, (d) => DIGITS[d] ?? d);

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (raw: string) => round2(Number(raw.replace(/,/g, "")));

/** `$199`, `$1,990`, `$99.50`, `199 dollars`, `CAD 199`, `199 CAD`, `199 डॉलर`. */
const MONEY = /(?:(?:US|CA|C|CAD)?\$\s?(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s?(?:dollars?|CAD|डॉलर|ڈالر|ਡਾਲਰ))|(?:CAD\s?(\d[\d,]*(?:\.\d{1,2})?))/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s?%|(\d+(?:\.\d+)?)\s?(?:percent|प्रतिशत|فیصد|ਪ੍ਰਤੀਸ਼ਤ)/gi;

export function amountsIn(text: string): number[] {
  const t = asciiDigits(text);
  const out: number[] = [];
  for (const m of t.matchAll(MONEY)) out.push(num((m[1] ?? m[2] ?? m[3])!));
  return out;
}
export function percentsIn(text: string): number[] {
  const t = asciiDigits(text);
  const out: number[] = [];
  for (const m of t.matchAll(PERCENT)) out.push(round2(Number(m[1] ?? m[2])));
  return out;
}

/** Every dollar figure the product itself states or derives (founding-offer prices included), in dollars. */
export function productAmounts(): Set<number> {
  const s = new Set<number>();
  const add = (cents: number) => s.add(round2(cents / 100));
  for (const id of PLAN_IDS) {
    add(PLANS[id].priceCents);
    add(PLANS[id].annualPriceCents);
  }
  for (const t of RESTAURANT_TIERS) {
    const p = RESTAURANT_PLANS[t];
    for (const c of [p.priceCents, p.annualPriceCents]) {
      add(c);
      add(Math.round((c * (100 - FOUNDING_OFFER.firstYearPct)) / 100));
      add(Math.round((c * (100 - FOUNDING_OFFER.lifetimePct)) / 100));
    }
  }
  for (const id of ADD_ON_IDS) add(ADD_ONS[id].priceCents);
  add(FEES.customerServiceFeeCents);
  s.add(0);
  return s;
}

export function productPercents(): Set<number> {
  const bps = [FEES.orderBpsFree, FEES.orderBpsPaid, FEES.depositInvoiceBps, FEES.tiffinBps, FEES.appointmentCheckoutBps];
  return new Set([...bps.map((b) => round2(b / 100)), FOUNDING_OFFER.firstYearPct, FOUNDING_OFFER.lifetimePct, 0]);
}

const PROMISES: { code: string; re: RegExp }[] = [
  { code: "guarantee", re: /\bguarantee[sd]?\b|\bwarrant(y|ies)\b|गारंटी|ضمانت|ਗਾਰੰਟੀ/i },
  { code: "risk_free", re: /\brisk[- ]free\b|\bno[- ]risk\b|\bmoney[- ]back\b|\bfull refund\b/i },
  { code: "results", re: /\b(will|can|going to)\s+(definitely\s+|certainly\s+)?(increase|boost|grow|double|triple|raise|bring)\b.{0,50}\b(sales|revenue|customers|traffic|profit|visits|footfall|repeat)/i },
  { code: "results", re: /\b\d+(\.\d+)?\s?(x|times)\s+(more|the|your)\b|\b(increase|boost|lift)\w*\s+(by\s+)?\d+\s?%/i },
  { code: "trial", re: /\bfree trial\b|\b\d+[- ]day (free )?trial\b|\btry (it )?free for\b/i },
  { code: "date_promise", re: /\b(will be|goes?|going to be|are|is)\s+(live|ready|set up|activated)\s+(by|on|within|in)\s+\w+/i },
  { code: "legal_advice", re: /\b(this is|that is|it is)\s+(legal advice|legally compliant|fully compliant)\b|\bwe are (fully )?(casl|pipeda|gdpr)[- ]compliant\b/i },
];

export type GuardIssue = { code: string; detail: string };

export function checkReply(reply: string, o: { userText: string; toolText: string }): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const allowedMoney = productAmounts();
  const allowedPct = productPercents();
  for (const a of [...amountsIn(o.toolText), ...amountsIn(o.userText)]) allowedMoney.add(a);
  for (const p of [...percentsIn(o.toolText), ...percentsIn(o.userText)]) allowedPct.add(p);
  const bad = [...new Set(amountsIn(reply))].filter((a) => !allowedMoney.has(a));
  if (bad.length) issues.push({ code: "price_mismatch", detail: `Dollar figure(s) not in plans.ts or a tool result this turn: ${bad.map((b) => `$${b}`).join(", ")}` });
  const badPct = [...new Set(percentsIn(reply))].filter((p) => !allowedPct.has(p));
  if (badPct.length) issues.push({ code: "percent_mismatch", detail: `Percentage(s) not in plans.ts or a tool result this turn: ${badPct.map((b) => `${b}%`).join(", ")}` });
  const seen = new Set<string>();
  for (const { code, re } of PROMISES) {
    const m = re.exec(reply);
    if (m && !seen.has(code)) {
      seen.add(code);
      issues.push({ code: `promise_${code}`, detail: `Says "${m[0].slice(0, 60)}", which we cannot promise` });
    }
  }
  return issues;
}

/** The text sent back to the model for its one retry. */
export const retryInstruction = (issues: GuardIssue[]): string =>
  `[system check] Your draft was not sent. ${issues.map((i) => i.detail).join(" ")}. Rewrite it using only figures returned by tools in this conversation and without promises about results, trials, refunds or dates. If you cannot, say you will check with the team and call escalate_to_human.`;
