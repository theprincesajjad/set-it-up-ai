import { describe, expect, it } from "vitest";
import type { FeatureKey, classesApi } from "@ll/shared";
import { buildMerchantNav, canOpen } from "@/lib/dashboard/nav";
import { capacityText, classifyRef, dayHeading, doorTone, fillPct, groupByDay, memberTone, offerRules, rosterState, sessionState, startsAtFrom, weekNumbers, weekRange } from "@/lib/dashboard/classes";

const s = (over: Partial<classesApi.ClassSessionDto> = {}): classesApi.ClassSessionDto => ({
  id: "s1", classTypeId: "t1", name: "Bhangra Cardio", instructorName: "Simran G.", room: null, startsAt: "2026-10-26T22:30:00.000Z", endsAt: "2026-10-26T23:30:00.000Z",
  capacity: 16, booked: 12, waitlisted: 0, womenOnly: true, status: "scheduled", locationId: "l1", notes: null, ...over,
});

describe("class schedule logic", () => {
  it("builds a Monday to Sunday week with DST-safe bounds", () => {
    const w = weekRange("2026-10-28");
    expect(w.start).toBe("2026-10-26");
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toBe("2026-11-01");
    // The week that contains the clock change is 7 days and 1 hour long.
    expect(new Date(w.to).getTime() - new Date(w.from).getTime()).toBe(7 * 86_400_000 + 3_600_000);
  });
  it("groups by studio-local day and labels today", () => {
    const g = groupByDay([s({ id: "b", startsAt: "2026-10-27T11:00:00.000Z" }), s({ id: "a", startsAt: "2026-10-27T01:00:00.000Z" }), s({ id: "c", startsAt: "2026-10-26T22:30:00.000Z" })]);
    expect(g.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27"]); // 01:00Z on the 27th is 9 PM on the 26th in Toronto
    expect(g[0]!.items.map((x) => x.id)).toEqual(["c", "a"]);
    expect(dayHeading("2026-10-26", "2026-10-26")).toBe("Today, Mon Oct 26");
    expect(dayHeading("2026-10-27", "2026-10-26")).toBe("Tue Oct 27");
  });
  it("describes capacity, fill and state", () => {
    expect(fillPct(12, 16)).toBe(75);
    expect(fillPct(20, 16)).toBe(100);
    expect(fillPct(0, 0)).toBe(0);
    expect(capacityText(s({ booked: 16, waitlisted: 3 }))).toEqual({ count: "16/16", waitlist: "+3 waitlist", full: true });
    const now = new Date("2026-10-26T21:00:00Z");
    expect(sessionState(s(), now)).toEqual({ text: "Open", tone: "positive" });
    expect(sessionState(s({ booked: 16 }), now).text).toBe("Full");
    expect(sessionState(s(), new Date("2026-10-26T22:45:00Z")).text).toBe("In progress");
    expect(sessionState(s(), new Date("2026-10-27T05:00:00Z")).text).toBe("Done");
    expect(sessionState(s({ status: "cancelled" }), now)).toEqual({ text: "Cancelled", tone: "negative" });
  });
  it("adds up a week and ignores cancelled classes", () => {
    const n = weekNumbers([s({ booked: 16, waitlisted: 3 }), s({ booked: 9, capacity: 14 }), s({ booked: 5, status: "cancelled" })]);
    expect(n).toEqual({ booked: 25, capacity: 30, fill: 83, waitlisted: 3, fullClasses: 1 });
  });
  it("turns the Add class form into the right instant, on both sides of the clock change", () => {
    expect(startsAtFrom("2026-10-29", "18:30")).toBe("2026-10-29T22:30:00.000Z");
    expect(startsAtFrom("2026-11-05", "18:30")).toBe("2026-11-05T23:30:00.000Z");
  });
});

describe("offers and members", () => {
  it("states the rules of each offer in the studio's words", () => {
    expect(offerRules({ kind: "drop_in", credits: null, validDays: null, introOnly: false, termMonths: null, classesPerMonth: null })).toBe("Pay when you book");
    expect(offerRules({ kind: "pack", credits: 10, validDays: 90, introOnly: false, termMonths: null, classesPerMonth: null })).toBe("10 classes, valid 90 days");
    expect(offerRules({ kind: "pack", credits: 3, validDays: 30, introOnly: true, termMonths: null, classesPerMonth: null })).toBe("3 classes, valid 30 days, new students only");
    expect(offerRules({ kind: "membership", credits: null, validDays: null, introOnly: false, termMonths: null, classesPerMonth: null })).toBe("Unlimited classes, month to month, cancel any time");
    expect(offerRules({ kind: "membership", credits: null, validDays: null, introOnly: false, termMonths: 3, classesPerMonth: 4 })).toBe("4 classes a month, 3-month term, renewal notice sent");
  });
  it("colours a member's dot by what the studio must do", () => {
    expect(memberTone("past_due", "Payment failed")).toBe("negative");
    expect(memberTone("active", null)).toBe("positive");
    expect(memberTone("active", "Renewal notice not sent yet")).toBe("accent");
    expect(memberTone("frozen", null)).toBe("info");
  });
  it("words the roster states", () => {
    expect(rosterState({ status: "attended", creditReturned: false }).text).toBe("Checked in");
    expect(rosterState({ status: "cancelled", creditReturned: true }).text).toBe("Cancelled, credit back");
    expect(rosterState({ status: "no_show", creditReturned: false }).tone).toBe("negative");
  });
});

describe("door", () => {
  it("tells a scanned card or member code from a phone number", () => {
    expect(classifyRef("LL:ABCD2345")).toEqual({ memberCode: "LL:ABCD2345" });
    expect(classifyRef(" abcd2345 ")).toEqual({ memberCode: "abcd2345" });
    expect(classifyRef("(416) 555-0100")).toEqual({ phone: "(416) 555-0100" });
    expect(classifyRef("5550")).toBeNull();
    expect(classifyRef("")).toBeNull();
  });
  it("shows green for a check-in, grey for repeats and white for everything the desk must act on", () => {
    expect(doorTone("checked_in")).toBe("positive");
    expect(doorTone("added_and_checked_in")).toBe("positive");
    expect(doorTone("already_checked_in")).toBe("neutral");
    for (const o of ["no_pass", "past_due", "class_full", "not_booked", "no_class"] as const) expect(doorTone(o)).toBe("negative");
  });
});

describe("class navigation", () => {
  const nav = (enabled: FeatureKey[], vertical: string, role: "owner" | "staff" = "owner") => buildMerchantNav("/m/x", role, new Set(enabled), { vertical, plan: "plus" }).map((n) => n.key);
  const ON: FeatureKey[] = ["booking.classes", "memberships.recurring", "orders.order_ahead", "booking.pickup_slots"];
  it("a studio sees the schedule, memberships and the door, and none of the café or repair sections", () => {
    const k = nav(ON, "fitness");
    expect(k).toEqual(expect.arrayContaining(["classes", "class-offers", "class-door", "customers", "program"]));
    for (const gone of ["orders", "catalog", "slots", "tickets"]) expect(k).not.toContain(gone);
  });
  it("a studio that also bought service tickets keeps the Tickets section", () => {
    expect(nav([...ON, "service.tickets"], "fitness")).toContain("tickets");
  });
  it("hides the class sections until a class feature is enabled", () => {
    const k = nav(["promos.basic"], "fitness");
    for (const gone of ["classes", "class-offers", "class-door"]) expect(k).not.toContain(gone);
  });
  it("front-desk staff get the schedule, the door and the desk sale page", () => {
    const k = nav(ON, "fitness", "staff");
    expect(k).toEqual(expect.arrayContaining(["home", "counter", "classes", "class-door", "class-offers"]));
    expect(canOpen("staff", "classes")).toBe(true);
    expect(canOpen("staff", "class-offers")).toBe(true);
    expect(canOpen("staff", "billing")).toBe(false);
  });
});
