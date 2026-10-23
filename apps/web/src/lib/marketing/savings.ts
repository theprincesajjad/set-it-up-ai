import { DOORDASH_CANADA } from "./sources";

/** Slider range for the savings calculator, in cents of monthly orders. */
export const SAVINGS_RANGE = { minCents: 100_000, maxCents: 3_000_000, stepCents: 50_000, defaultCents: 500_000 } as const;

const pct = (cents: number, bps: number) => Math.round((cents * bps) / 10_000);

/**
 * What the delivery apps would keep of `monthlyCents` of orders, from DoorDash Canada's published rates.
 * Pickup is a range (8% on Plus and Premier, 10% on Basic); delivery is "up to" 29%. We do not run drivers, so
 * delivery is only a ceiling for orders the owner delivers themselves.
 */
export function appCommission(monthlyCents: number) {
  const low = pct(monthlyCents, DOORDASH_CANADA.pickupBps.plusPremier);
  const high = pct(monthlyCents, DOORDASH_CANADA.pickupBps.basic);
  return { pickupLowCents: low, pickupHighCents: high, deliveryMaxCents: pct(monthlyCents, DOORDASH_CANADA.deliveryUpToBps) };
}

/** "$400" (whole dollars; the calculator never shows cents). */
export const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-CA")}`;

/** "$400 to $500" */
export const dollarRange = (lowCents: number, highCents: number) => (lowCents === highCents ? dollars(lowCents) : `${dollars(lowCents)} to ${dollars(highCents)}`);

/** The words used under the calculator and on the landing band. Quotes the rates exactly as DoorDash Canada lists them. */
export const DOORDASH_RATE_LINE = `DoorDash Canada: ${DOORDASH_CANADA.pickupBps.plusPremier / 100}% pickup (Plus, Premier), ${DOORDASH_CANADA.pickupBps.basic / 100}% (Basic), up to ${DOORDASH_CANADA.deliveryUpToBps / 100}% delivery (Premier).`;
