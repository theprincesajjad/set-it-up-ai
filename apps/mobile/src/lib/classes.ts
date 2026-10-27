/**
 * Pure helpers for the customer class screens (docs/research/fitness-studios.md, frames 05 to 08): the schedule by day, what a class
 * card says and offers, what pays for a class, what a membership lets the member do, and the agreement as rows. No React: unit-tested.
 * The words come from the cl.ui.* strings the web pages already use; these helpers only pick which one.
 */
import type { MessageKey, classesApi } from "@ll/shared";

type Session = classesApi.ClassSessionDto;
type Membership = classesApi.MyMembershipDto;
type Product = classesApi.ProductDto;

/** Days shown in the schedule strip, like the web page (two weeks). */
export const SCHEDULE_DAYS = 14;
/** How long a freeze can be asked for in the app (the studio's own maximum still applies on the server). */
export const FREEZE_CHOICES = [7, 14, 30] as const;

const addDays = (day: string, n: number) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + n)).toISOString().slice(0, 10);

/** `n` consecutive YYYY-MM-DD days starting at `today`. */
export function scheduleDays(today: string, n = SCHEDULE_DAYS): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i));
}

/** The studio's local YYYY-MM-DD for an instant. */
export function dayOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Scheduled classes by studio-local day, earliest first. Cancelled classes are left out. */
export function groupByDay(sessions: Session[], timeZone: string): Map<string, Session[]> {
  const out = new Map<string, Session[]>();
  for (const s of [...sessions].filter((x) => x.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = dayOf(s.startsAt, timeZone);
    out.set(k, [...(out.get(k) ?? []), s]);
  }
  return out;
}

/** The first day with a class, else today: where the strip opens. */
export function firstDay(sessions: Session[], today: string, timeZone: string): string {
  const days = [...groupByDay(sessions, timeZone).keys()].filter((d) => d >= today).sort();
  return days[0] ?? today;
}

export type CardState = { kind: "booked" } | { kind: "waitlisted"; position: number } | { kind: "held" } | { kind: "full"; waitlisted: number } | { kind: "open"; spotsLeft: number };

/** What the line on a class card says: the person's own state first, else how full it is. */
export function cardState(s: Session): CardState {
  const m = s.mine;
  if (m?.status === "booked" || m?.status === "attended") return { kind: "booked" };
  if (m?.status === "waitlisted") return { kind: "waitlisted", position: m.waitlistPosition ?? 1 };
  if (m?.status === "held") return { kind: "held" };
  const left = s.capacity - s.booked;
  return left <= 0 ? { kind: "full", waitlisted: s.waitlisted } : { kind: "open", spotsLeft: left };
}

export type CardAction = { kind: "book" } | { kind: "join_waitlist" } | { kind: "cancel"; bookingId: string } | { kind: "leave_waitlist"; bookingId: string } | { kind: "none" };

/** The button on a class card: Book, Join waitlist, Cancel or Leave waitlist; nothing while a drop-in payment is on hold. */
export function cardAction(s: Session): CardAction {
  const m = s.mine;
  if (m?.status === "booked") return { kind: "cancel", bookingId: m.bookingId };
  if (m?.status === "waitlisted") return { kind: "leave_waitlist", bookingId: m.bookingId };
  if (m) return { kind: "none" };
  return s.booked >= s.capacity ? { kind: "join_waitlist" } : { kind: "book" };
}

/** Minutes from start to end ("60 min" under the instructor). */
export const durationMin = (s: Pick<Session, "startsAt" | "endsAt">) => Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000);

/** The last moment a class can be cancelled for free. */
export const freeCancelUntil = (startsAt: string, windowHours: number) => new Date(new Date(startsAt).getTime() - windowHours * 3_600_000).toISOString();

export type PayChoice = { kind: "membership"; name: string } | { kind: "pack"; name: string; left: number; total: number } | { kind: "drop_in"; priceCents: number } | { kind: "none" };

/**
 * What a booking would use at one studio: an active membership first, then a pack with credits, then the drop-in price. Matches the
 * server's "auto" order, so the card above the Book button says what will really happen.
 */
export function payChoice(my: Pick<classesApi.MyClassesResponse, "memberships" | "passes"> | null | undefined, merchantId: string, dropIn: Pick<Product, "priceCents"> | null | undefined): PayChoice {
  const mem = my?.memberships.find((m) => m.merchant.id === merchantId && m.status === "active");
  if (mem) return { kind: "membership", name: mem.name };
  const pack = my?.passes.find((p) => p.merchant.id === merchantId && p.status === "active" && p.creditsLeft > 0);
  if (pack) return { kind: "pack", name: pack.name, left: pack.creditsLeft, total: pack.creditsTotal };
  if (dropIn) return { kind: "drop_in", priceCents: dropIn.priceCents };
  return { kind: "none" };
}

/** The drop-in button is offered only when nothing else would pay for the class. */
export const offerDropIn = (choice: PayChoice) => choice.kind === "drop_in";

/** Server error code to the string the web page shows. Null: show the server's own message. */
export function bookErrorKey(code: string | undefined): MessageKey | null {
  switch (code) {
    case "no_pass":
      return "cl.ui.err.noPass";
    case "membership_past_due":
      return "cl.ui.err.pastDue";
    case "membership_frozen":
      return "cl.ui.err.frozen";
    case "month_used":
      return "cl.ui.err.monthUsed";
    default:
      return null;
  }
}

export interface MembershipActions {
  freeze: boolean;
  changeCard: boolean;
  agreement: boolean;
  /** "Do not renew": a fixed term with a renewal notice out. */
  declineRenewal: boolean;
  cancel: boolean;
  /** "Keep my membership": a cancellation is pending. */
  keep: boolean;
  /** "Pay now": the last payment failed. */
  payNow: boolean;
}

/** Which buttons a membership card carries. An ended membership only offers the agreement. */
export function membershipActions(m: Pick<Membership, "status" | "canFreeze" | "termEndsOn" | "renewalNoticeSentAt" | "declineRenewal" | "cancelEffectiveOn">): MembershipActions {
  const live = m.status === "active" || m.status === "frozen" || m.status === "past_due";
  return {
    freeze: live && m.canFreeze,
    changeCard: live,
    agreement: true,
    declineRenewal: live && !!m.termEndsOn && !!m.renewalNoticeSentAt && !m.declineRenewal,
    cancel: live && !m.cancelEffectiveOn,
    keep: live && !!m.cancelEffectiveOn,
    payNow: m.status === "past_due",
  };
}

/** The sentence under the Cancel confirmation: inside the 10 days everything goes back, after that it ends on a date. */
export function cancelEndsOn(m: Pick<Membership, "termEndsOn" | "currentPeriodEnd">): string | null {
  const a = m.termEndsOn;
  const b = m.currentPeriodEnd;
  if (a && b) return a >= b ? a : b;
  return a ?? b ?? null;
}

/** The day before `cancelEffectiveOn`: the last day of the membership, as the web page words it. */
export const lastDayBefore = (day: string) => addDays(day, -1);

export interface AgreementRow {
  label: string;
  value: string;
}

/**
 * The agreement text as the rows of frame 08. The server writes one "Label: text" line per term, so the first colon splits it; the
 * title line and the line naming the member are left out of the table (the title is the screen's, the member is the signed-in person).
 */
export function agreementRows(text: string): AgreementRow[] {
  const rows: AgreementRow[] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf(": ");
    if (i < 1 || i > 24) continue;
    const label = line.slice(0, i).trim();
    if (label === "Member") continue;
    rows.push({ label, value: line.slice(i + 2).trim() });
  }
  return rows;
}

/** "Tue, Oct 27, 9:30 p.m." at the end of a sentence reads "p.m..": say "9:30 PM" where a full stop follows (the web page does the same). */
export const endsSentence = (when: string): string => when.replace(/\s([ap])\.m\.$/i, (_, x: string) => ` ${x.toUpperCase()}M`);
