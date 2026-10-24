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
import { rewardPhrase, type HeroI18n } from "./hero";
import { unitLabel as localizedUnit } from "@ll/shared";

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

export function walletRow(m: WalletRowInput, readyName?: string | null, i18n?: HeroI18n): WalletRow {
  const other = !!i18n && i18n.locale !== "en";
  const unit = other ? localizedUnit(i18n!.locale, m.terminology, m.balance).replace(/^[\d,.\s]+/, "") : termWord(m.terminology, m.balance);
  if (m.rewardsAvailableCount > 0) {
    const subtitle = other
      ? m.rewardsAvailableCount > 1
        ? i18n!.t("sh.wallet.rewardsReadyN", { n: m.rewardsAvailableCount })
        : readyName
          ? i18n!.t("sh.hero.readyAt", { reward: readyName })
          : i18n!.t("sh.wallet.rewardReady")
      : m.rewardsAvailableCount > 1
        ? `${m.rewardsAvailableCount} rewards ready`
        : readyName
          ? `${rewardInSentence(readyName)} ready`
          : "reward ready";
    return { subtitle, trailing: { kind: "showCard" }, accent: true, progress: null };
  }
  const next = m.nextReward;
  if (!next) {
    // The expiry sentence is the shop's English text; in other languages the row just states the balance.
    const subtitle = other ? localizedUnit(i18n!.locale, m.terminology, m.balance) : m.expiryDisclosure;
    return { subtitle, trailing: { kind: "balance", value: m.balance, unit }, accent: false, progress: null };
  }
  const progress = next.pointsCost > 0 ? Math.max(0, Math.min(1, (next.pointsCost - next.pointsNeeded) / next.pointsCost)) : null;
  const subtitle = other
    ? `${localizedUnit(i18n!.locale, m.terminology, m.balance)} · ${i18n!.t("sh.n.earnNext", { need: localizedUnit(i18n!.locale, m.terminology, next.pointsNeeded), reward: next.name }).replace(/[.।۔]$/, "")}`
    : `${formatNumber(m.balance)} ${unit} · ${formatNumber(next.pointsNeeded)} to ${rewardPhrase(next.name)}`;
  const trailing: WalletTrailing = m.program?.earnType === "stamps" ? { kind: "fraction", text: `${m.balance} / ${next.pointsCost}` } : { kind: "balance", value: m.balance, unit };
  return { subtitle, trailing, accent: false, progress };
}
