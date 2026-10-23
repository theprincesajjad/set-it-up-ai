/**
 * Rules for drop-off and repair businesses (tickets, quotes, invoices, pickup reminders), kept in one module so
 * they can follow the regulations if they change. Pure: no I/O, used by the API, the web app and the phone app.
 *
 * LEGAL UNKNOWNS (verify with counsel before relying on any of this; see docs/research/service-businesses.md 2.2):
 *  - The 10% cap is law for motor-vehicle repair in Ontario (Consumer Protection Act, 2002 and O. Reg. 17/05) and is
 *    reported to apply to consumer estimates generally (s. 10). We apply it to every ticket kind as a shop policy.
 *    "Estimate" is not defined in the statute and cost-plus work is unclear. The Consumer Protection Act, 2023 will
 *    replace the 2002 Act on a date not yet proclaimed.
 *  - The 60-day point is the Repair and Storage Liens Act's earliest date a repairer may sell an unclaimed article,
 *    and only after following the Part III notice procedure. We record dates and show a flag. We never sell, notify
 *    on the shop's behalf, or call anything "lien notice sent" unless staff say they sent one.
 *  - Whether voluntary tips are outside HST, and whether a rebooking nudge needs marketing consent (CASL), are open.
 */
import type { Vertical } from "./verticals.js";

/** An open invoice this many days old is shown as overdue to the shop. A display rule only; nothing is charged or sent. */
export const OVERDUE_INVOICE_DAYS = 7;

/** Final price may be at most this many basis points above the approved quote (10%). */
export const OVER_ESTIMATE_BPS = 1000;

/** Highest invoice total allowed against an approved quote, rounded down to the cent. */
export function maxAuthorizedCents(quoteTotalCents: number, bps = OVER_ESTIMATE_BPS): number {
  return Math.floor((Math.max(0, quoteTotalCents) * (10_000 + bps)) / 10_000);
}

/** Customer-facing statement of the cap. Conservative wording: a shop policy, not a statement of law. */
export const OVER_ESTIMATE_PERCENT = OVER_ESTIMATE_BPS / 100;

/** Tips are on by default for these verticals and off everywhere else (a merchant setting overrides). */
export const TIP_DEFAULT_VERTICALS: readonly Vertical[] = ["salon", "barber", "spa"];
export const DEFAULT_TIP_PRESETS = [15, 20, 25] as const;

export function tipsEnabledFor(vertical: string, override: boolean | null | undefined): boolean {
  if (typeof override === "boolean") return override;
  return (TIP_DEFAULT_VERTICALS as readonly string[]).includes(vertical);
}

/** Tip amounts for the presets, on the pre-tax subtotal. Tips are not taxed and never earn points. */
export function tipChoices(baseCents: number, presets: readonly number[] = DEFAULT_TIP_PRESETS): { percent: number; cents: number }[] {
  return presets.map((percent) => ({ percent, cents: Math.round((Math.max(0, baseCents) * percent) / 100) }));
}

/** A tip may be 0 to 100% of the pre-tax subtotal. */
export function tipWithinLimit(tipCents: number, baseCents: number): boolean {
  return Number.isInteger(tipCents) && tipCents >= 0 && tipCents <= Math.max(0, baseCents);
}

/**
 * Amounts that earn points: credits (negative lines, such as a credited diagnostic fee) reduce the earning lines in
 * proportion, so points follow what the customer actually pays for the work. Tax and tips are never in `lines`.
 */
export function earnableAmounts(lines: { amountCents: number }[]): number[] {
  const positive = lines.reduce((s, l) => s + Math.max(0, l.amountCents), 0);
  const credit = lines.reduce((s, l) => s + Math.min(0, l.amountCents), 0);
  if (!positive) return lines.map(() => 0);
  if (!credit) return lines.map((l) => Math.max(0, l.amountCents));
  const factor = Math.max(0, positive + credit) / positive;
  return lines.map((l) => (l.amountCents > 0 ? Math.floor(l.amountCents * factor) : 0));
}

/** Pickup reminder ladder for finished work. Day numbers count from the moment the ticket became ready. */
export const PICKUP_LADDER = [
  { day: 3, action: "text" as const },
  { day: 7, action: "text_with_pay_link" as const },
  { day: 30, action: "staff_task" as const },
  { day: 60, action: "lien_flag" as const },
];
export const LIEN_FLAG_DAYS = 60;

/** Every ladder step that has come due and not yet been done, oldest first. */
export function dueSteps(daysReady: number, lastDone: number): (typeof PICKUP_LADDER)[number][] {
  return PICKUP_LADDER.filter((step) => step.day > lastDone && daysReady >= step.day);
}

/** Condition chips offered at intake, by what is being dropped off. The shop can still type notes. */
export const INTAKE_CHECKLISTS: Record<string, string[]> = {
  device: ["Cracked screen", "Water indicator tripped", "Scratches or dents", "Does not power on", "Data-loss notice given", "Charger left with it"],
  garment: ["Stains", "Tears or holes", "Missing buttons", "Zipper issue", "Pinned and marked", "Number of items counted"],
  vehicle: ["Existing dents or scratches", "Warning lights on", "Fuel level noted", "Valuables removed", "Spare key left"],
  other: ["Scratches or damage", "Missing parts", "Photos taken"],
};

/** Quote validity and the money facts behind a bridal or event quote, stored in `itemDetails` of the ticket. */
export const EVENT_DETAIL_KEYS = ["eventType", "eventDate", "eventStart", "eventWhere", "trial", "balanceDueOn"] as const;
