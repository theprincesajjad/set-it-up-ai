/**
 * Pure logic for the class pages (docs/research/fitness-studios.md, Figma frames 01 to 04): the week, day grouping,
 * capacity and waitlist wording, offer rules, door outcomes. No React, no I/O, so it is unit-tested.
 * Times are shown in the studio's zone (America/Toronto) like the rest of the dashboard.
 */
import type { classesApi } from "@ll/shared";
import { TZ, addDays, clock, instantAt, parts, todayOf, weekStart } from "./calendar";

type Session = classesApi.ClassSessionDto;

/** Monday to Sunday containing `date`, as local days and the [from, to) instants the API takes. */
export function weekRange(date: string, tz = TZ): { start: string; days: string[]; from: string; to: string } {
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return { start, days, from: instantAt(start, 0, tz).toISOString(), to: instantAt(addDays(start, 7), 0, tz).toISOString() };
}

/** "Today, Mon Oct 26" or "Tue Oct 27". */
export function dayHeading(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  return date === today ? `Today, ${label}` : label;
}

/** Sessions grouped by studio-local day, in time order, empty days left out. */
export function groupByDay(sessions: Session[], tz = TZ): { date: string; items: Session[] }[] {
  const by = new Map<string, Session[]>();
  for (const s of [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const d = parts(s.startsAt, tz).date;
    by.set(d, [...(by.get(d) ?? []), s]);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }));
}

export const timeLabel = (iso: string, tz = TZ) => clock(parts(iso, tz).minutes);

export const fillPct = (booked: number, capacity: number) => (capacity > 0 ? Math.round((Math.min(booked, capacity) / capacity) * 100) : 0);

/** "12/16", with "+3 waitlist" when people are waiting on a full class. */
export function capacityText(s: Pick<Session, "booked" | "capacity" | "waitlisted">): { count: string; waitlist: string | null; full: boolean } {
  return { count: `${s.booked}/${s.capacity}`, waitlist: s.waitlisted > 0 ? `+${s.waitlisted} waitlist` : null, full: s.booked >= s.capacity };
}

/** Where a class stands: cancelled, done, in progress, full or open. */
export function sessionState(s: Pick<Session, "status" | "startsAt" | "endsAt" | "booked" | "capacity">, now = new Date()): { text: string; tone: "positive" | "negative" | "neutral" | "accent" } {
  if (s.status === "cancelled") return { text: "Cancelled", tone: "negative" };
  if (new Date(s.endsAt) <= now) return { text: "Done", tone: "neutral" };
  if (new Date(s.startsAt) <= now) return { text: "In progress", tone: "accent" };
  return s.booked >= s.capacity ? { text: "Full", tone: "neutral" } : { text: "Open", tone: "positive" };
}

/** The week's numbers for the stat block. */
export function weekNumbers(sessions: Session[]): { booked: number; capacity: number; fill: number; waitlisted: number; fullClasses: number } {
  const live = sessions.filter((s) => s.status === "scheduled");
  const booked = live.reduce((n, s) => n + Math.min(s.booked, s.capacity), 0);
  const capacity = live.reduce((n, s) => n + s.capacity, 0);
  return { booked, capacity, fill: fillPct(booked, capacity), waitlisted: live.reduce((n, s) => n + s.waitlisted, 0), fullClasses: live.filter((s) => s.booked >= s.capacity && s.waitlisted > 0).length };
}

/** One line of rules for an offer, as the studio would say it. */
export function offerRules(p: Pick<classesApi.ProductDto, "kind" | "credits" | "validDays" | "introOnly" | "termMonths" | "classesPerMonth">): string {
  if (p.kind === "drop_in") return "Pay when you book";
  if (p.kind === "pack") return `${p.credits ?? 1} class${p.credits === 1 ? "" : "es"}, valid ${p.validDays ?? 90} days${p.introOnly ? ", new students only" : ""}`;
  const classes = p.classesPerMonth ? `${p.classesPerMonth} classes a month` : "Unlimited classes";
  return `${classes}, ${p.termMonths ? `${p.termMonths}-month term, renewal notice sent` : "month to month, cancel any time"}`;
}

export const offerType = (p: Pick<classesApi.ProductDto, "kind" | "introOnly">) => (p.kind === "membership" ? "Membership" : p.kind === "drop_in" ? "Single class" : p.introOnly ? "Intro offer" : "Pack");

export const offerPrice = (p: Pick<classesApi.ProductDto, "kind" | "priceCents">, money: (c: number) => string) => (p.kind === "membership" ? `${money(p.priceCents)}/mo` : money(p.priceCents));

/** Dot colour for a membership status in the studio's member list. */
export function memberTone(status: classesApi.MembershipStatus, issue: string | null): "positive" | "negative" | "neutral" | "accent" | "info" {
  if (status === "past_due") return "negative";
  if (status === "frozen") return "info";
  if (status === "active") return issue ? "accent" : "positive";
  return "neutral";
}

export const memberStatusLabel = (status: classesApi.MembershipStatus) => ({ pending: "Waiting for payment", active: "Active", frozen: "Frozen", past_due: "Payment failed", cancelled: "Cancelled", expired: "Ended" })[status];

/** What the door shows for each outcome: tone of the result card. */
export function doorTone(o: classesApi.CheckInOutcome): "positive" | "neutral" | "negative" {
  if (o === "checked_in" || o === "added_and_checked_in") return "positive";
  if (o === "already_checked_in") return "neutral";
  return "negative";
}

/** Roster status word and dot. */
export function rosterState(r: Pick<classesApi.RosterRowDto, "status" | "creditReturned">): { text: string; tone: "positive" | "negative" | "neutral" | "info" | "accent" } {
  switch (r.status) {
    case "attended": return { text: "Checked in", tone: "positive" };
    case "booked": return { text: "Booked", tone: "info" };
    case "held": return { text: "Waiting for payment", tone: "accent" };
    case "waitlisted": return { text: "Waitlisted", tone: "accent" };
    case "late_cancelled": return { text: "Late cancel", tone: "negative" };
    case "no_show": return { text: "No-show", tone: "negative" };
    default: return { text: r.creditReturned ? "Cancelled, credit back" : "Cancelled", tone: "neutral" };
  }
}

/** The ISO start for a local date + "HH:MM" typed into the Add class form. */
export function startsAtFrom(date: string, hhmm: string, tz = TZ): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return instantAt(date, h * 60 + m, tz).toISOString();
}

export { TZ, addDays, todayOf };

/** What the door field holds: a scanned QR ("LL:ABCD2345") or an 8-character member code, otherwise a phone number. */
export function classifyRef(input: string): { memberCode: string } | { phone: string } | null {
  const v = input.trim();
  if (!v) return null;
  if (/^LL:/i.test(v) || /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/i.test(v)) return { memberCode: v };
  if (v.replace(/\D/g, "").length >= 10) return { phone: v };
  return null;
}
