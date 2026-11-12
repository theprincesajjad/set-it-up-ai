const PROVINCE = /^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|PEI|YT|NT|NU|Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland.*|Prince Edward Island|Yukon|Northwest Territories|Nunavut|Canada)\b/i;
const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

/** The city an owner typed inside a street address ("14 Main St N, Brampton, ON" gives "Brampton"), or null when there isn't one. */
export function cityFromAddress(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of parts.slice(1)) {
    if (PROVINCE.test(p) || POSTAL.test(p) || /^\d/.test(p)) continue;
    return p.slice(0, 80);
  }
  return null;
}

/** "14 Main St N, Brampton": the street address plus its city, without repeating a city the address already names. */
export function addressLine(address: string, city: string | null | undefined): string {
  const c = (city ?? "").trim();
  if (!c) return address;
  return address.toLowerCase().includes(c.toLowerCase()) ? address : `${address}, ${c}`;
}
