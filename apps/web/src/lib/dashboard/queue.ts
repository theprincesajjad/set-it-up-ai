/** Pure helpers for the walk-in line pages (docs/research/barbers-beauty.md), so the words and the buttons are testable. */
import { waitText, type barberApi } from "@ll/shared";

export type Chair = barberApi.QueueChairDto;
export type Entry = barberApi.QueueEntryDto;

/** "about 25 min", "no wait", "-" when no chair takes walk-ins. */
export const waitLabel = (min: number | null): string => (min === null ? "No chair taking walk-ins" : waitText(min));

/** The one action on a chair, by what is happening there. `entryId` is the person it acts on. */
export type ChairAction = { kind: "done" | "start" | "call-next" | "none"; label: string };
export function chairAction(c: Chair, hasWaiting: boolean): ChairAction {
  if (!c.takesWalkIns) return { kind: "none", label: "Not taking walk-ins" };
  if (c.state === "busy" && c.entryId) return { kind: "done", label: "Done" };
  if (c.state === "called" && c.entryId) return { kind: "start", label: "In the chair" };
  if (c.state === "free") return hasWaiting ? { kind: "call-next", label: "Call next" } : { kind: "none", label: "Free" };
  return { kind: "none", label: c.state === "busy" ? "With an appointment" : "" };
}

/** Who a barber should call next: the first person who asked for this barber, else the first who asked for anyone. */
export function nextFor(staffId: string, waiting: Entry[]): Entry | null {
  return waiting.find((e) => e.requestedStaffId === staffId) ?? waiting.find((e) => !e.requestedStaffId) ?? waiting[0] ?? null;
}

/** "Cut and beard · Marcus (asked)", "Kids' cut · Aiden, with Sajjad". */
export function entryMeta(e: Entry): string {
  const who = e.requestedStaffName ? `${e.requestedStaffName} (asked)` : "Any barber";
  return [e.serviceName, e.withName ? `with ${e.withName}` : null, who].filter(Boolean).join(" · ");
}

export const modelLabel = (m: barberApi.PayModel, bps = 0): string => (m === "chair_rent" ? "Chair rental" : m === "commission" ? `Commission ${bps / 100}%` : "Employee");

/** Monday to Sunday of the week containing `date` (yyyy-mm-dd), as yyyy-mm-dd. */
export function weekRange(date: string, offsetWeeks = 0): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + offsetWeeks * 7);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from, to: d.toISOString().slice(0, 10) };
}
