/**
 * One shop row in the wallet (canvas Wallet, Hearth & Crumb Bakery): the italic subtitle under the name and the
 * trailing figure. Pure and unit tested; the screen only paints what this returns.
 *
 *   reward ready   "free drink ready"                      → "Show card"
 *   stamps         "6 stamps · 2 to a free loaf"           → "6 / 8"
 *   points         "340 points · 60 to a free drink"       → "340" with its unit
 *   nothing next   the expiry line the program carries     → the balance
 */
import { termWord, formatNumber } from "./award";
import { rewardInSentence } from "./format";
import { rewardPhrase } from "./hero";

export interface WalletRowInput {
  balance: number;
  terminology: string;
  program: { earnType: "per_dollar" | "per_visit" | "stamps" } | null;
  rewardsAvailableCount: number;
  nextReward: { name: string; pointsNeeded: number; pointsCost: number } | null;
  expiryDisclosure: string;
}

export type WalletTrailing = { kind: "showCard" } | { kind: "fraction"; text: string } | { kind: "balance"; value: number; unit: string };

export interface WalletRow {
  /** The italic line under the shop name. */
  subtitle: string;
  trailing: WalletTrailing;
  /** The subtitle takes the accent (only for "ready"). */
  accent: boolean;
  /** 0 to 1 progress toward the next reward, null when there is none or one is ready. */
  progress: number | null;
}

export function walletRow(m: WalletRowInput, readyName?: string | null): WalletRow {
  const unit = termWord(m.terminology, m.balance);
  if (m.rewardsAvailableCount > 0) {
    const subtitle = m.rewardsAvailableCount > 1 ? `${m.rewardsAvailableCount} rewards ready` : readyName ? `${rewardInSentence(readyName)} ready` : "reward ready";
    return { subtitle, trailing: { kind: "showCard" }, accent: true, progress: null };
  }
  const next = m.nextReward;
  if (!next) return { subtitle: m.expiryDisclosure, trailing: { kind: "balance", value: m.balance, unit }, accent: false, progress: null };
  const progress = next.pointsCost > 0 ? Math.max(0, Math.min(1, (next.pointsCost - next.pointsNeeded) / next.pointsCost)) : null;
  const subtitle = `${formatNumber(m.balance)} ${unit} · ${formatNumber(next.pointsNeeded)} to ${rewardPhrase(next.name)}`;
  const trailing: WalletTrailing = m.program?.earnType === "stamps" ? { kind: "fraction", text: `${m.balance} / ${next.pointsCost}` } : { kind: "balance", value: m.balance, unit };
  return { subtitle, trailing, accent: false, progress };
}
