/**
 * Numbers and names in the legal pages (docs/legal/*.md) are written as {{tokens}} and filled from
 * plans.ts (PLANS, RESTAURANT_PLANS, ADD_ONS, FEES, FEATURES) when the page renders, so a price, a plan
 * name or a fee in a legal page cannot drift from the product. Tests (apps/web/test/legal-pages.test.ts)
 * fail on an unknown token and on any hard-coded fee or price that disagrees with plans.ts.
 *
 * Inline tokens: {{plan.free.name}} {{plan.plus.price}} {{plan.pro.annual}} {{restaurant.growth.price}}
 *   {{retention.phoneTranscriptDays}} (see retention.ts) {{upload.linkMinutes}} {{addon.phone_ai.price}} {{fee.orderFree}} {{fee.orderPaid}} {{fee.depositInvoice}} {{fee.tiffin}}
 *   {{fee.appointmentCheckout}} {{fee.classes}} {{fee.customerService}} {{founding.firstYearPct}} ...
 * Blocks: {{table.plans}} {{table.restaurant}} {{table.addons}} {{table.fees}} {{list.free}} {{list.plus}} {{list.studio}} {{list.pro}}
 */
import { RETENTION, UPLOAD_LINK_MINUTES, retentionLabel, type RetentionKey } from "./retention.js";

export type LegalLang = "en" | "fr";
import { ADD_ONS, ADD_ON_IDS, FEATURES, FEES, FOUNDING_OFFER, FREE_FOREVER, PAID_FEATURES, PLANS, PLAN_IDS, RESTAURANT_PLANS, RESTAURANT_TIERS } from "./plans.js";

const money = (cents: number): string => {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-CA") : d.toFixed(2)}`;
};
const pct = (bps: number): string => `${Number((bps / 100).toFixed(2))}%`;

/** The French pages (docs/legal/fr) use the same tokens; only the unit words of the retention periods and the minutes differ. */
export function legalTokens(lang: LegalLang = "en"): Record<string, string> {
  const t: Record<string, string> = {};
  for (const id of PLAN_IDS) {
    const p = PLANS[id];
    t[`plan.${id}.name`] = p.name;
    t[`plan.${id}.price`] = p.priceCents === 0 ? "$0" : `${money(p.priceCents)}/month`;
    t[`plan.${id}.annual`] = p.annualPriceCents === 0 ? "$0" : `${money(p.annualPriceCents)}/year`;
    t[`plan.${id}.sms`] = String(p.smsPerMonth);
  }
  for (const tier of RESTAURANT_TIERS) {
    const p = RESTAURANT_PLANS[tier];
    t[`restaurant.${tier}.name`] = p.name;
    t[`restaurant.${tier}.price`] = `${money(p.priceCents)}/month`;
    t[`restaurant.${tier}.annual`] = `${money(p.annualPriceCents)}/year`;
    t[`restaurant.${tier}.whatsapp`] = p.whatsappPerMonth.toLocaleString("en-CA");
  }
  for (const id of ADD_ON_IDS) {
    const a = ADD_ONS[id];
    t[`addon.${id}.name`] = a.name;
    t[`addon.${id}.price`] = `${money(a.priceCents)}${a.unit === "month" ? "/month" : " per pack"}`;
  }
  t["fee.orderFree"] = pct(FEES.orderBpsFree);
  t["fee.orderPaid"] = pct(FEES.orderBpsPaid);
  t["fee.depositInvoice"] = pct(FEES.depositInvoiceBps);
  t["fee.tiffin"] = pct(FEES.tiffinBps);
  t["fee.appointmentCheckout"] = pct(FEES.appointmentCheckoutBps);
  t["fee.classes"] = pct(FEES.classBps);
  t["fee.customerService"] = money(FEES.customerServiceFeeCents);
  t["fee.manual"] = "0%";
  for (const k of Object.keys(RETENTION) as RetentionKey[]) t[`retention.${k}`] = retentionLabel(k, lang);
  t["upload.linkMinutes"] = `${UPLOAD_LINK_MINUTES} minutes`;
  t["founding.firstYearPct"] = `${FOUNDING_OFFER.firstYearPct}%`;
  t["founding.lifetimePct"] = `${FOUNDING_OFFER.lifetimePct}%`;
  t["founding.slots"] = String(FOUNDING_OFFER.slotsPerCorridor);

  t["table.plans"] = [
    "| Plan | Monthly | Annual | What it adds |",
    "| --- | --- | --- | --- |",
    ...PLAN_IDS.map((id) => `| ${PLANS[id].name} | ${t[`plan.${id}.price`]} | ${t[`plan.${id}.annual`]} | ${PLANS[id].blurb} |`),
  ].join("\n");
  t["table.restaurant"] = [
    "| Restaurant plan | Monthly | Annual | WhatsApp messages included each month | What it adds |",
    "| --- | --- | --- | --- | --- |",
    ...RESTAURANT_TIERS.map((k) => `| ${RESTAURANT_PLANS[k].name} | ${t[`restaurant.${k}.price`]} | ${t[`restaurant.${k}.annual`]} | ${t[`restaurant.${k}.whatsapp`]} | ${RESTAURANT_PLANS[k].blurb} |`),
  ].join("\n");
  t["table.addons"] = ["| Add-on | Price |", "| --- | --- |", ...ADD_ON_IDS.map((id) => `| ${ADD_ONS[id].name} | ${t[`addon.${id}.price`]} |`)].join("\n");
  t["table.fees"] = [
    "| Payment | Our platform fee |",
    "| --- | --- |",
    `| Online orders, any paid plan or restaurant plan | ${t["fee.orderPaid"]} (commission-free) |`,
    `| Online orders, ${PLANS.free.name} plan | ${t["fee.orderFree"]} |`,
    `| Optional customer service fee on orders (only if you turn it on; paid by the customer) | ${t["fee.customerService"]} per order |`,
    `| Deposits (catering, banquet, quotes, online appointment deposits and no-show fees) and invoices | ${t["fee.depositInvoice"]} |`,
    `| Tiffin subscription billing | ${t["fee.tiffin"]} |`,
    `| Appointment checkout taken through the calendar (counter or pay link) | ${t["fee.appointmentCheckout"]} |`,
    `| Class bookings, class packs and membership billing paid online, and late-cancel or no-show fees charged to a saved card | ${t["fee.classes"]} |`,
    `| Payments you record by hand (Interac e-transfer, cash, cheque) | ${t["fee.manual"]} |`,
  ].join("\n");
  const names = (keys: readonly string[]) => keys.map((k) => FEATURES[k as keyof typeof FEATURES].name).join("; ");
  t["list.free"] = names(FREE_FOREVER);
  t["list.plus"] = names(PAID_FEATURES.filter((k) => FEATURES[k].minPlan === "plus"));
  t["list.studio"] = names(PAID_FEATURES.filter((k) => FEATURES[k].minPlan === "studio"));
  t["list.pro"] = names(PAID_FEATURES.filter((k) => FEATURES[k].minPlan === "pro"));
  return t;
}

/** Replace every {{token}}; throws on an unknown one so a typo fails the build instead of printing a wrong number. */
export function fillLegalTokens(md: string, lang: LegalLang = "en"): string {
  const tokens = legalTokens(lang);
  return md.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = tokens[key];
    if (v === undefined) throw new Error(`Unknown legal token {{${key}}}`);
    return v;
  });
}
