import { describe, expect, it } from "vitest";
import type { commerceApi, serviceApi } from "@ll/shared";
import { buildGrid, cellKey, todaysBookings } from "@/lib/dashboard/dropoff";
import { dueLabel, ruleWeeks } from "@/lib/dashboard/rebooking";
import { BOARD_COLUMNS, ageText, cardModel, sortColumn } from "@/lib/dashboard/tickets";

const NOW = new Date("2026-10-27T15:00:00Z"); // Tue 11:00 Toronto
const t = (o: Partial<serviceApi.TicketDto>): serviceApi.TicketDto =>
  ({ id: "x", merchantId: "m", merchantName: "S", locationId: null, userId: "u", number: 1, itemKind: "device", itemDetails: { make: "Apple", model: "iPad Air" }, issue: "Will not charge", intakeNotes: null, photos: [], status: "intake", assignedStaffId: null, promisedAt: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), intakeChecklist: [], termsAcceptedAt: null, shelfLocation: null, readyAt: null, customer: { name: "Marta Singh", phone: null }, ...o }) as serviceApi.TicketDto;

describe("tickets board", () => {
  it("maps statuses to the four columns", () => {
    expect(BOARD_COLUMNS.flatMap((c) => c.statuses).sort()).toEqual(["approved", "declined", "diagnosing", "in_progress", "intake", "quote_sent", "ready", "waiting_parts"].sort());
  });
  it("sorts overdue, then due today, then the rest, declined last", () => {
    const list = [t({ id: "a", updatedAt: "2026-10-27T10:00:00Z" }), t({ id: "b", dueState: "today", updatedAt: "2026-10-26T10:00:00Z" }), t({ id: "c", dueState: "overdue", updatedAt: "2026-10-20T10:00:00Z" }), t({ id: "d", status: "declined", updatedAt: "2026-10-28T10:00:00Z" })];
    expect(sortColumn(list).map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });
  it("says opened, not approved for a viewed quote and shows overdue in red words", () => {
    const m = cardModel(t({ status: "quote_sent", quote: { status: "sent", totalCents: 27120, sentAt: "2026-10-27T13:00:00Z", firstViewedAt: "2026-10-27T14:00:00Z", expiresAt: "2026-11-03T13:00:00Z" } }), NOW);
    expect(m.statusLabel).toBe("Quote sent 2 h ago");
    expect(m.note).toEqual({ text: "Quote $271.20, opened, not approved", tone: "info" });
    const o = cardModel(t({ status: "in_progress", dueState: "overdue", promisedAt: "2026-10-26T15:00:00Z" }), NOW);
    expect(o.overdue).toBe(true);
    expect(o.who).toBe("Marta Singh · overdue 1 day");
    expect(o.note?.text).toBe("Overdue: text Marta a new time");
  });
  it("ready tickets show days and the open invoice", () => {
    const m = cardModel(t({ status: "ready", readyAt: "2026-10-21T15:00:00Z", invoice: { status: "open", amountDueCents: 16400, totalCents: 16400 } }), NOW);
    expect(m.statusLabel).toBe("Ready 6 days");
    expect(m.note?.text).toBe("Invoice $164.00 open");
    expect(ageText("2026-10-27T14:55:00Z", NOW)).toBe("5 min");
  });
});

describe("drop-off grid", () => {
  const slot = (iso: string, booked: number, capacity: number): commerceApi.SlotDto => ({ id: iso, merchantId: "m", locationId: null, kind: "dropoff", startsAt: iso, endsAt: iso, capacity, booked, remaining: capacity - booked });
  it("groups slots by local day and hour; full and closed are states", () => {
    const g = buildGrid([slot("2026-10-27T14:00:00Z", 1, 3), slot("2026-10-27T14:30:00Z", 3, 3), slot("2026-10-28T14:00:00Z", 6, 6)], "America/Toronto", NOW, 3);
    expect(g.days.map((d) => d.date)).toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
    expect(g.hours).toEqual([10]);
    expect(g.cells[cellKey("2026-10-27", 10)]).toEqual({ booked: 4, capacity: 6, state: "open" });
    expect(g.cells[cellKey("2026-10-28", 10)]?.state).toBe("full");
    expect(g.cells[cellKey("2026-10-29", 10)]).toBeUndefined();
  });
  it("lists only today's bookings", () => {
    const r = todaysBookings([{ startsAt: "2026-10-27T18:00:00Z" }, { startsAt: "2026-10-28T18:00:00Z" }, { startsAt: "2026-10-27T14:00:00Z" }], "America/Toronto", NOW);
    expect(r.map((b) => b.startsAt)).toEqual(["2026-10-27T14:00:00Z", "2026-10-27T18:00:00Z"]);
  });
});

describe("rebooking words", () => {
  it("labels due dates and weeks", () => {
    expect(dueLabel({ dueOn: "2026-10-15", daysLate: 12 })).toEqual({ text: "Due Oct 15, 12 days late", late: true });
    expect(dueLabel({ dueOn: "2026-10-27", daysLate: 0 })).toEqual({ text: "Due today", late: false });
    expect(ruleWeeks(35)).toBe(5);
    expect(ruleWeeks(null)).toBeNull();
  });
});
