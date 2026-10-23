/**
 * Merchant-level sales tax rate, shared by the API (quotes, invoices, tiffin
 * charges, catering) and the web/mobile apps (so a screen can say "+ HST").
 *
 * Basis points: 1300 = 13%. `taxRegistered === false` means the merchant is
 * not registered for GST/HST (small supplier) and charges no tax at all.
 * `null`/`undefined` means "not asked yet": we still compute at the provincial
 * rate and the UI labels it "tax status not set".
 *
 * Quebec's combined 14.975% is rounded to the nearest whole basis point here;
 * exact per-component amounts live in `apps/api/src/services/tax.ts`.
 */
export const PROVINCIAL_SALES_TAX_BPS: Record<string, number> = {
  ON: 1300,
  NB: 1500,
  NL: 1500,
  PE: 1500,
  NS: 1400,
  QC: 1498,
  BC: 1200,
  MB: 1200,
  SK: 1100,
  AB: 500,
  YT: 500,
  NT: 500,
  NU: 500,
};

export const DEFAULT_SALES_TAX_PROVINCE = "ON";

export function salesTaxBps(input: { province?: string | null; taxRegistered?: boolean | null }): number {
  if (input.taxRegistered === false) return 0;
  const key = (input.province ?? DEFAULT_SALES_TAX_PROVINCE).toUpperCase();
  return PROVINCIAL_SALES_TAX_BPS[key] ?? PROVINCIAL_SALES_TAX_BPS[DEFAULT_SALES_TAX_PROVINCE]!;
}

/** GST/HST registration number: 9 digits, optional "RT0001"-style program suffix. */
export const GST_HST_NUMBER_RE = /^\d{9}(\s?RT\s?\d{4})?$/i;
export function isValidGstHstNumber(v: string): boolean {
  return GST_HST_NUMBER_RE.test(v.trim());
}
