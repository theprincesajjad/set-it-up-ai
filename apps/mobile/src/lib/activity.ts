import { dayGroupLabel } from "./format";
import { formatPts, termWord } from "./award";

/** Activity row titles by ledger type (customer-mobile.md § 7). */
export function activityTitle(tx: { type: string; points: number; description: string | null }, terminology: string, shopName?: string): string {
  const stamps = terminology.toLowerCase().startsWith("stamp");
  switch (tx.type) {
    case "earn":
      return stamps ? (tx.points === 1 ? `Got a ${termWord(terminology, 1)}` : `Got ${formatPts(tx.points, terminology)}`) : `Earned ${formatPts(tx.points, terminology)}`;
    case "redeem":
      return `Redeemed ${tx.description?.replace(/^Redeemed:?\s*/i, "") || "a reward"}`;
    case "welcome_bonus":
      return "Welcome bonus";
    case "birthday_bonus":
      return "Birthday treat";
    case "referral_bonus":
      return "Referral bonus";
    case "promo_bonus":
      return "Double points bonus";
    case "network_bonus":
      return "Neighbourhood bonus";
    case "campaign_bonus":
      return "Passport bonus";
    case "adjust":
      return `Adjusted by ${shopName ?? "the shop"}`;
    case "reversal":
      return "Reversed";
    case "expire":
      return "Expired";
    case "import":
      return "Imported balance";
    default:
      return tx.description ?? "Activity";
  }
}

/** Group by day label ("Today", "Yesterday", "Mon, Oct 19"), newest first. */
export function groupByDay<T extends { createdAt: string }>(items: T[], now = new Date()): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const it of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const label = dayGroupLabel(it.createdAt, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}
