/**
 * Sales tax for orders, quotes and invoices.
 *
 * Rates are per province (parts per million so QST's 9.975% is exact). The
 * province comes from the merchant's neighbourhood (default ON → HST 13%).
 * Every component is rounded half-up to the cent separately, as receipts show
 * them separately. Tax is charged on the post-discount amount; tips are never taxed.
 */
import { eq } from "drizzle-orm";
import { neighbourhoods, type DbOrTx } from "@ll/db";
import { salesTaxBps } from "@ll/shared";

export interface TaxComponent {
  label: string;
  ratePpm: number;
}

export const PROVINCIAL_TAX: Record<string, TaxComponent[]> = {
  ON: [{ label: "HST", ratePpm: 130_000 }],
  NB: [{ label: "HST", ratePpm: 150_000 }],
  NL: [{ label: "HST", ratePpm: 150_000 }],
  PE: [{ label: "HST", ratePpm: 150_000 }],
  NS: [{ label: "HST", ratePpm: 140_000 }],
  QC: [
    { label: "GST", ratePpm: 50_000 },
    { label: "QST", ratePpm: 99_750 },
  ],
  BC: [
    { label: "GST", ratePpm: 50_000 },
    { label: "PST", ratePpm: 70_000 },
  ],
  MB: [
    { label: "GST", ratePpm: 50_000 },
    { label: "RST", ratePpm: 70_000 },
  ],
  SK: [
    { label: "GST", ratePpm: 50_000 },
    { label: "PST", ratePpm: 60_000 },
  ],
  AB: [{ label: "GST", ratePpm: 50_000 }],
  YT: [{ label: "GST", ratePpm: 50_000 }],
  NT: [{ label: "GST", ratePpm: 50_000 }],
  NU: [{ label: "GST", ratePpm: 50_000 }],
};

export const DEFAULT_PROVINCE = "ON";

export interface TaxResult {
  province: string;
  taxCents: number;
  lines: { label: string; ratePpm: number; cents: number }[];
}

function components(province: string): TaxComponent[] {
  return PROVINCIAL_TAX[province.toUpperCase()] ?? PROVINCIAL_TAX[DEFAULT_PROVINCE]!;
}

/** Tax owed on a taxable amount (cents). */
export function computeTax(taxableCents: number, province = DEFAULT_PROVINCE): TaxResult {
  const base = Math.max(0, Math.round(taxableCents));
  const lines = components(province).map((c) => ({ label: c.label, ratePpm: c.ratePpm, cents: Math.round((base * c.ratePpm) / 1_000_000) }));
  return { province: province.toUpperCase(), taxCents: lines.reduce((s, l) => s + l.cents, 0), lines };
}

/** "HST 13%" / "GST 5% + QST 9.975%" */
export function taxLabel(province = DEFAULT_PROVINCE): { label: string; ratePpm: number } {
  const cs = components(province);
  return {
    label: cs.map((c) => `${c.label} ${+(c.ratePpm / 10_000).toFixed(3)}%`).join(" + "),
    ratePpm: cs.reduce((s, c) => s + c.ratePpm, 0),
  };
}

/** Province for a merchant (from its neighbourhood), default ON. */
export async function merchantProvince(db: DbOrTx, merchant: { neighbourhoodId: string | null }): Promise<string> {
  if (!merchant.neighbourhoodId) return DEFAULT_PROVINCE;
  const [n] = await db.select({ province: neighbourhoods.province }).from(neighbourhoods).where(eq(neighbourhoods.id, merchant.neighbourhoodId)).limit(1);
  return n?.province && PROVINCIAL_TAX[n.province.toUpperCase()] ? n.province.toUpperCase() : DEFAULT_PROVINCE;
}

/**
 * Tax for a merchant's quote or invoice: the province's rate, or nothing when the shop says it is not registered
 * for GST/HST (a small supplier). `taxRegistered` is the merchant tax setting; null/undefined means "not asked yet".
 */
export async function merchantTax(db: DbOrTx, merchant: { neighbourhoodId: string | null; taxRegistered?: boolean | null }, taxableCents: number): Promise<TaxResult & { label: string }> {
  const province = await merchantProvince(db, merchant);
  if (salesTaxBps({ province, taxRegistered: merchant.taxRegistered }) === 0) return { province, taxCents: 0, lines: [], label: "No tax (not registered)" };
  return { ...computeTax(taxableCents, province), label: taxLabel(province).label };
}
