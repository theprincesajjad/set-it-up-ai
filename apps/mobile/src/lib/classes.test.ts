import { describe, expect, it } from "vitest";
import type { classesApi } from "@ll/shared";
import { agreementRows, bookErrorKey, cancelEndsOn, cardAction, cardState, dayOf, durationMin, endsSentence, firstDay, freeCancelUntil, groupByDay, membershipActions, offerDropIn, payChoice, scheduleDays } from "./classes";

const session = (over: Partial<classesApi.ClassSessionDto> = {}): classesApi.ClassSessionDto => ({
  id: "s1", classTypeId: null, name: "Bhangra Cardio", instructorName: "Simran G.", room: null, startsAt: "2026-10-26T22:30:00.000Z", endsAt: "2026-10-26T23:30:00.000Z", capacity: 16, booked: 10, waitlisted: 0, womenOnly: true, status: "scheduled", locationId: "l1", notes: null, ...over,
});
const mine = (status: string, over: object = {}) => ({ bookingId: "b1", status, waitlistPosition: null, payWith: null, freeCancelUntil: "2026-10-26T10:30:00.000Z", holdExpiresAt: null, ...over }) as classesApi.ClassSessionDto["mine"];

describe("the schedule by day", () => {
  it("lists the next days and groups classes by the studio's own day, earliest first, cancelled left out", () => {
    expect(scheduleDays("2026-10-26", 3)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(scheduleDays("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
    // 22:30 UTC on the 26th is 6:30 PM in Toronto (EDT), still the 26th; 04:30 UTC on the 27th is 12:30 AM, the 27th; 02:00 UTC on the 27th is 10 PM on the 26th.
    const list = [session({ id: "a", startsAt: "2026-10-27T04:30:00.000Z" }), session({ id: "b", startsAt: "2026-10-27T02:00:00.000Z" }), session({ id: "c" }), session({ id: "x", status: "cancelled" })];
    const g = groupByDay(list, "America/Toronto");
    expect(g.get("2026-10-26")!.map((s) => s.id)).toEqual(["c", "b"]);
    expect(g.get("2026-10-27")!.map((s) => s.id)).toEqual(["a"]);
    expect([...g.values()].flat().some((s) => s.id === "x")).toBe(false);
    expect(dayOf("2026-01-15T04:30:00.000Z", "America/Toronto")).toBe("2026-01-14"); // EST
  });
  it("opens on the first day with a class, else today", () => {
    expect(firstDay([session()], "2026-10-24", "America/Toronto")).toBe("2026-10-26");
    expect(firstDay([session()], "2026-10-28", "America/Toronto")).toBe("2026-10-28");
    expect(firstDay([], "2026-10-28", "America/Toronto")).toBe("2026-10-28");
  });
});

describe("a class card", () => {
  it("says the person's own state first, else how full it is", () => {
    expect(cardState(session({ mine: mine("booked") }))).toEqual({ kind: "booked" });
    expect(cardState(session({ mine: mine("attended") }))).toEqual({ kind: "booked" });
    expect(cardState(session({ mine: mine("waitlisted", { waitlistPosition: 3 }) }))).toEqual({ kind: "waitlisted", position: 3 });
    expect(cardState(session({ mine: mine("held") }))).toEqual({ kind: "held" });
    expect(cardState(session({ booked: 11 }))).toEqual({ kind: "open", spotsLeft: 5 });
    expect(cardState(session({ booked: 16, waitlisted: 3 }))).toEqual({ kind: "full", waitlisted: 3 });
  });
  it("offers Book, Join waitlist, Cancel or Leave waitlist, and nothing while a payment is on hold", () => {
    expect(cardAction(session())).toEqual({ kind: "book" });
    expect(cardAction(session({ booked: 16 }))).toEqual({ kind: "join_waitlist" });
    expect(cardAction(session({ mine: mine("booked") }))).toEqual({ kind: "cancel", bookingId: "b1" });
    expect(cardAction(session({ mine: mine("waitlisted", { waitlistPosition: 2 }) }))).toEqual({ kind: "leave_waitlist", bookingId: "b1" });
    expect(cardAction(session({ mine: mine("held") }))).toEqual({ kind: "none" });
  });
  it("says AM and PM where a full stop follows, so the sentence has one full stop", () => {
    expect(endsSentence("Tue, Oct 27, 9:30 p.m.")).toBe("Tue, Oct 27, 9:30 PM");
    expect(endsSentence("Wed, Oct 28, 8:00 a.m.")).toBe("Wed, Oct 28, 8:00 AM");
    expect(endsSentence("Wed, Oct 28, 8:00 AM")).toBe("Wed, Oct 28, 8:00 AM");
    expect(endsSentence("منگل، 9:30 شام")).toBe("منگل، 9:30 شام");
  });
  it("knows how long a class is and the last free-cancel moment", () => {
    expect(durationMin(session())).toBe(60);
    expect(freeCancelUntil("2026-10-26T22:30:00.000Z", 12)).toBe("2026-10-26T10:30:00.000Z");
  });
});

describe("what pays for the class", () => {
  const my = {
    memberships: [{ id: "m1", name: "Unlimited monthly", status: "active", merchant: { id: "studio" } }],
    passes: [{ id: "p1", name: "10-class pack", status: "active", creditsLeft: 7, creditsTotal: 10, merchant: { id: "studio" } }],
  } as unknown as classesApi.MyClassesResponse;
  it("takes an active membership first, then a pack with credits, then the drop-in price", () => {
    expect(payChoice(my, "studio", { priceCents: 2500 })).toEqual({ kind: "membership", name: "Unlimited monthly" });
    expect(payChoice({ ...my, memberships: [] }, "studio", { priceCents: 2500 })).toEqual({ kind: "pack", name: "10-class pack", left: 7, total: 10 });
    expect(payChoice({ ...my, memberships: [], passes: [{ ...my.passes[0]!, creditsLeft: 0 }] }, "studio", { priceCents: 2500 })).toEqual({ kind: "drop_in", priceCents: 2500 });
    expect(payChoice(null, "studio", null)).toEqual({ kind: "none" });
  });
  it("ignores another studio's membership and a frozen or past-due one", () => {
    expect(payChoice(my, "elsewhere", null)).toEqual({ kind: "none" });
    expect(payChoice({ ...my, memberships: [{ ...my.memberships[0]!, status: "frozen" }], passes: [] }, "studio", { priceCents: 2500 })).toEqual({ kind: "drop_in", priceCents: 2500 });
  });
  it("offers the drop-in button only when nothing else pays", () => {
    expect(offerDropIn({ kind: "drop_in", priceCents: 2500 })).toBe(true);
    expect(offerDropIn({ kind: "membership", name: "x" })).toBe(false);
    expect(offerDropIn({ kind: "none" })).toBe(false);
  });
  it("maps the server's refusal codes to the words the web page uses", () => {
    expect(bookErrorKey("no_pass")).toBe("cl.ui.err.noPass");
    expect(bookErrorKey("membership_past_due")).toBe("cl.ui.err.pastDue");
    expect(bookErrorKey("membership_frozen")).toBe("cl.ui.err.frozen");
    expect(bookErrorKey("month_used")).toBe("cl.ui.err.monthUsed");
    expect(bookErrorKey("something_else")).toBeNull();
    expect(bookErrorKey(undefined)).toBeNull();
  });
});

describe("a membership card", () => {
  const base = { status: "active", canFreeze: true, termEndsOn: null, renewalNoticeSentAt: null, declineRenewal: false, cancelEffectiveOn: null } as const;
  it("offers Freeze, Change card, the agreement and Cancel on a live membership", () => {
    expect(membershipActions(base)).toEqual({ freeze: true, changeCard: true, agreement: true, declineRenewal: false, cancel: true, keep: false, payNow: false });
  });
  it("hides Freeze when the studio's limit is used up, and swaps Cancel for Keep once a cancellation is pending", () => {
    expect(membershipActions({ ...base, canFreeze: false }).freeze).toBe(false);
    expect(membershipActions({ ...base, cancelEffectiveOn: "2026-11-12" })).toMatchObject({ cancel: false, keep: true });
  });
  it("asks to pay when the last payment failed, and only offers the agreement once it has ended", () => {
    expect(membershipActions({ ...base, status: "past_due" })).toMatchObject({ payNow: true, changeCard: true });
    expect(membershipActions({ ...base, status: "cancelled" })).toEqual({ freeze: false, changeCard: false, agreement: true, declineRenewal: false, cancel: false, keep: false, payNow: false });
  });
  it("offers Do not renew only for a fixed term with a notice out that has not been declined", () => {
    const term = { ...base, termEndsOn: "2027-10-11", renewalNoticeSentAt: "2027-08-12T10:00:00.000Z" };
    expect(membershipActions(term).declineRenewal).toBe(true);
    expect(membershipActions({ ...term, declineRenewal: true }).declineRenewal).toBe(false);
    expect(membershipActions({ ...term, renewalNoticeSentAt: null }).declineRenewal).toBe(false);
  });
  it("ends on the later of the term end and the period end", () => {
    expect(cancelEndsOn({ termEndsOn: null, currentPeriodEnd: "2026-11-11" })).toBe("2026-11-11");
    expect(cancelEndsOn({ termEndsOn: "2027-10-11", currentPeriodEnd: "2026-11-11" })).toBe("2027-10-11");
    expect(cancelEndsOn({ termEndsOn: "2026-10-01", currentPeriodEnd: "2026-11-11" })).toBe("2026-11-11");
    expect(cancelEndsOn({ termEndsOn: null, currentPeriodEnd: null })).toBeNull();
  });
});

describe("the agreement as rows", () => {
  const text = [
    "MEMBERSHIP AGREEMENT",
    "Studio: Sakina Studio, 1523 Birchmount Rd, Scarborough",
    "Member: Sam Secret",
    "Services: Unlimited monthly. Unlimited group classes. Classes are booked in the app and are subject to space.",
    "Price: $129.00 + $16.77 HST = $145.77 each month.",
    "Payments: $145.77 is charged to your card today for the first month, then on the 12th of each month. There is no fixed number of payments.",
    "Starts: Oct 26, 2026.",
    "Term: Month to month. There is no fixed end date.",
    "Cancelling: You can cancel for a full refund within 10 days (until Nov 5, 2026). After that, cancel any time in the app: it ends after the month you have paid and there are no further payments.",
    "Renewal: It renews every month until you cancel.",
    "Your rights: Ontario's Consumer Protection Act, 2002 applies to this agreement. A copy is kept in the app under Passes.",
  ].join("\n");
  it("splits each term at its first colon, leaves out the title and the member's name, and keeps every other term", () => {
    const rows = agreementRows(text);
    expect(rows.map((r) => r.label)).toEqual(["Studio", "Services", "Price", "Payments", "Starts", "Term", "Cancelling", "Renewal", "Your rights"]);
    expect(rows.find((r) => r.label === "Price")!.value).toBe("$129.00 + $16.77 HST = $145.77 each month.");
    expect(rows.find((r) => r.label === "Cancelling")!.value).toContain("until Nov 5, 2026");
    expect(JSON.stringify(rows)).not.toContain("Sam Secret");
  });
  it("does not split on a colon inside a sentence", () => {
    const rows = agreementRows("Studio: A\nCancelling: You can cancel any time in the app: it ends after the month you paid.");
    expect(rows[1]).toEqual({ label: "Cancelling", value: "You can cancel any time in the app: it ends after the month you paid." });
  });
});
