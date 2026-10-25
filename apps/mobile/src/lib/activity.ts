import type { MessageKey } from "@ll/shared";
import { dayGroupLabel, rewardInSentence } from "./format";
import { dayGroupLabelL, formatPtsL, type L } from "./formatL";
import { formatPts, termWord } from "./award";

/** Activity row titles by ledger type (customer-mobile.md § 7). */
export function activityTitle(tx: { type: string; points: number; description: string | null }, terminology: string, shopName?: string): string {
  const stamps = terminology.toLowerCase().startsWith("stamp");
  switch (tx.type) {
    case "earn":
      return stamps ? (tx.points === 1 ? `Got a ${termWord(terminology, 1)}` : `Got ${formatPts(tx.points, terminology)}`) : `Earned ${formatPts(tx.points, terminology)}`;
    case "redeem":
      return `Redeemed ${rewardInSentence(tx.description?.replace(/^Redeemed:?\s*/i, "") || "a reward")}`;
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

/** `activityTitle` in the shopper's language: English keeps the app voice above; hi / ur / pa use the shared transaction names. */
export function activityTitleL(L: L, tx: { type: string; points: number; description: string | null }, terminology: string, shopName?: string): string {
  if (L.locale === "en") return activityTitle(tx, terminology, shopName);
  const known = ["earn", "redeem", "adjust", "welcome_bonus", "birthday_bonus", "referral_bonus", "promo_bonus", "network_bonus", "campaign_bonus", "reversal", "expire", "import"];
  if (!known.includes(tx.type)) return tx.description ?? L.t("sh.tx.adjust");
  const name = L.t(`sh.tx.${tx.type}` as MessageKey);
  if (tx.type === "earn") return `${name} ${formatPtsL(L, tx.points, terminology)}`;
  if (tx.type === "redeem") return tx.description ? `${name}: ${tx.description.replace(/^Redeemed:?\s*/i, "")}` : name;
  return name;
}

/** `groupByDay` with day labels in the shopper's language. */
export function groupByDayL<T extends { createdAt: string }>(L: L, items: T[], now = new Date()): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const it of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const label = dayGroupLabelL(L, it.createdAt, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}
