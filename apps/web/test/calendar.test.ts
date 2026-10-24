import { describe, expect, it } from "vitest";
import type { appointmentsApi } from "@ll/shared";
import {
  PX_PER_HOUR,
  addDays,
  blockLabel,
  bookedMinutes,
  clock,
  columnAt,
  dayBounds,
  dayColumns,
  dayDescription,
  dayNumbers,
  duePreview,
  duration,
  geometry,
  hourLabel,
  instantAt,
  minutesAtY,
  movedTimes,
  offSegments,
  parts,
  resizedEnd,
  snap,
  stateLine,
  tipChoices,
  walkInGaps,
  gapRange,
  weekColumns,
  weekStart,
  workWindow,
} from "@/lib/dashboard/calendar";

type Appt = appointmentsApi.AppointmentDto;
type Staff = appointmentsApi.BookableStaffDto;

const staff = (id: string, name: string, shifts: [number, string, string][] = [[3, "09:00", "17:00"]], timeOff: Staff["timeOff"] = []): Staff => ({
  userId: id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  role: "staff",
  hours: shifts.map(([weekday, a, b], i) => ({ id: `${id}${i}`, locationId: "L", userId: id, weekday, startsLocal: a, endsLocal: b })),
  timeOff,
  services: [],
});
const appt = (over: Partial<Appt> & { start: string; end: string }): Appt => ({
  id: over.id ?? "a",
  merchantId: "m",
  locationId: "L",
  customer: { id: "u", name: "Neha Sharma", phone: "+14165550111", language: "en" },
  staffId: "s1",
  staffName: "Simran Kaur",
  requestedStaff: false,
  source: "staff",
  items: [{ serviceId: "x", name: "Cut and blow-dry", durationMin: 75, priceCents: 6500 }],
  startsAt: instantAt("2026-11-04", Number(over.start.slice(0, 2)) * 60 + Number(over.start.slice(3)), "America/Toronto").toISOString(),
  endsAt: instantAt("2026-11-04", Number(over.end.slice(0, 2)) * 60 + Number(over.end.slice(3)), "America/Toronto").toISOString(),
  status: "booked",
  groupId: null,
  notes: null,
  clientNote: null,
  totalCents: 6500,
  depositCents: 0,
  depositPaidAt: null,
  hasCardOnFile: false,
  noShowFeeCents: null,
  feeChargedAt: null,
  cancelledAt: null,
  cancelReason: null,
  arrivedAt: null,
  startedAt: null,
  completedAt: null,
  invoiceId: null,
  holdExpiresAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("dates and zones", () => {
  it("reads local parts and builds instants across the clock change", () => {
    expect(parts("2026-11-04T14:30:00Z")).toEqual({ date: "2026-11-04", minutes: 9 * 60 + 30, weekday: 3 });
    expect(instantAt("2026-11-04", 9 * 60).toISOString()).toBe("2026-11-04T14:00:00.000Z");
    expect(instantAt("2026-07-04", 9 * 60).toISOString()).toBe("2026-07-04T13:00:00.000Z");
    // Day bounds are 25 hours on the fall-back day and 23 on the spring-forward day.
    const fall = dayBounds("2026-11-01");
    expect((new Date(fall.to).getTime() - new Date(fall.from).getTime()) / 3_600_000).toBe(25);
    const spring = dayBounds("2026-03-08");
    expect((new Date(spring.to).getTime() - new Date(spring.from).getTime()) / 3_600_000).toBe(23);
    expect(instantAt("2026-03-08", 9 * 60).toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });
  it("moves dates and finds Monday", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekStart("2026-11-04")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });
  it("formats clock times, hour labels and durations", () => {
    expect(clock(0)).toBe("12:00 am");
    expect(clock(9 * 60)).toBe("9:00 am");
    expect(clock(12 * 60 + 30)).toBe("12:30 pm");
    expect(clock(17 * 60 + 5)).toBe("5:05 pm");
    expect(hourLabel(9)).toBe("9 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(13)).toBe("1 pm");
    expect(duration(45)).toBe("45 min");
    expect(duration(120)).toBe("2 h");
    expect(duration(150)).toBe("2 h 30 min");
  });
});

describe("drag, resize and click maths (15 minutes, 60 px per hour)", () => {
  const a = appt({ start: "10:00", end: "11:15" });
  it("snaps to 15 minutes", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45);
    expect(PX_PER_HOUR).toBe(60);
  });
  it("moves a block by whole steps", () => {
    const m = movedTimes(a, 30); // 30 px = 30 minutes
    expect(parts(m.startsAt).minutes).toBe(10 * 60 + 30);
    expect(parts(m.endsAt).minutes).toBe(11 * 60 + 45);
    const up = movedTimes(a, -61);
    expect(parts(up.startsAt).minutes).toBe(9 * 60);
    expect(new Date(movedTimes(a, 4).startsAt).getTime()).toBe(new Date(a.startsAt).getTime()); // under half a step: stays
  });
  it("resizes from the bottom edge, never below one step", () => {
    expect(parts(resizedEnd(a, 30)).minutes).toBe(11 * 60 + 45);
    expect(parts(resizedEnd(a, -30)).minutes).toBe(10 * 60 + 45);
    expect(parts(resizedEnd(a, -500)).minutes).toBe(10 * 60 + 15);
  });
  it("picks the column under the pointer, clamped", () => {
    const edges = [{ left: 0, right: 100 }, { left: 100, right: 200 }, { left: 200, right: 300 }];
    expect(columnAt(150, edges)).toBe(1);
    expect(columnAt(-20, edges)).toBe(0);
    expect(columnAt(999, edges)).toBe(2);
    expect(columnAt(10, [])).toBe(-1);
  });
  it("turns a click into a snapped start", () => {
    expect(minutesAtY(0, 9 * 60)).toBe(9 * 60);
    expect(minutesAtY(74, 9 * 60)).toBe(9 * 60 + 60);
    expect(minutesAtY(-5, 9 * 60)).toBe(9 * 60);
  });
});

describe("working window and shading", () => {
  const sim = staff("s1", "Simran Kaur", [[3, "09:00", "17:00"], [4, "10:00", "19:00"]]);
  const ais = staff("s2", "Aisha Rahman", [[3, "08:30", "16:00"]]);
  it("spans everyone's hours, rounded to whole hours, with a default for a closed day", () => {
    expect(workWindow("2026-11-04", [sim, ais], [])).toEqual([8 * 60, 17 * 60]);
    expect(workWindow("2026-11-05", [sim, ais], [])).toEqual([10 * 60, 19 * 60]);
    expect(workWindow("2026-11-08", [sim, ais], [])).toEqual([9 * 60, 18 * 60]);
  });
  it("widens to fit a visit outside the hours", () => {
    expect(workWindow("2026-11-04", [sim], [appt({ start: "07:30", end: "08:30" })])).toEqual([7 * 60, 17 * 60]);
    expect(workWindow("2026-11-04", [sim], [appt({ start: "17:00", end: "19:15" })])).toEqual([9 * 60, 20 * 60]);
  });
  it("shades the hours a person doesn't work and their time off", () => {
    const w: [number, number] = [8 * 60, 17 * 60];
    expect(offSegments(ais, "2026-11-04", w)).toEqual([[8 * 60, 8 * 60 + 30], [16 * 60, 17 * 60]]);
    expect(offSegments(sim, "2026-11-04", w)).toEqual([[8 * 60, 9 * 60]]);
    expect(offSegments(sim, "2026-11-08", w)).toEqual([[8 * 60, 17 * 60]]);
    const off = staff("s3", "Priya", [[3, "09:00", "17:00"]], [{ id: "t", userId: "s3", startsAt: instantAt("2026-11-04", 12 * 60).toISOString(), endsAt: instantAt("2026-11-04", 13 * 60).toISOString(), reason: "Lunch" }]);
    expect(offSegments(off, "2026-11-04", [9 * 60, 17 * 60])).toContainEqual([12 * 60, 13 * 60]);
  });
});

describe("blocks", () => {
  const w: [number, number] = [9 * 60, 18 * 60];
  it("places a block by its start and length", () => {
    expect(geometry(appt({ start: "09:00", end: "10:15" }), "2026-11-04", w)).toEqual({ top: 0, height: 74 });
    expect(geometry(appt({ start: "13:00", end: "14:00" }), "2026-11-04", w)).toEqual({ top: 240, height: 59 });
    // Never shorter than a quarter hour.
    expect(geometry(appt({ start: "10:00", end: "10:05" }), "2026-11-04", w).height).toBe(14);
  });
  it("labels the state on the block's second line", () => {
    const now = new Date("2026-11-04T15:00:00Z");
    expect(stateLine(appt({ start: "10:00", end: "11:00", status: "in_service" }), now)).toEqual({ text: "In the chair", tone: "plain" });
    expect(stateLine(appt({ start: "10:00", end: "11:00", status: "no_show" }), now)).toEqual({ text: "No-show", tone: "negative" });
    expect(stateLine(appt({ start: "10:00", end: "11:00", status: "no_show", feeChargedAt: "2026-11-04T16:00:00Z" }), now).text).toBe("No-show, fee charged");
    expect(stateLine(appt({ start: "10:00", end: "11:00", depositPaidAt: "2026-11-01T00:00:00Z", depositCents: 4000 }), now)).toEqual({ text: "Deposit $40 paid", tone: "positive" });
    expect(stateLine(appt({ start: "10:00", end: "11:00", holdExpiresAt: "2026-11-04T15:05:00Z" }), now).text).toBe("Waiting for deposit");
    expect(stateLine(appt({ start: "10:00", end: "11:00", status: "arrived", source: "walk_in" }), now).text).toBe("Walk-in, arrived");
    expect(stateLine(appt({ start: "10:00", end: "11:00" }), now).text).toBe("");
  });
  it("writes the screen reader label the spec asks for", () => {
    expect(blockLabel(appt({ start: "09:00", end: "10:15", status: "completed", invoiceId: "i" }))).toBe("Neha Sharma, cut and blow-dry, 9:00 to 10:15, Simran, paid");
    expect(blockLabel(appt({ start: "09:00", end: "10:15", staffId: null, staffName: null }))).toBe("Neha Sharma, cut and blow-dry, 9:00 to 10:15, unassigned, booked");
    expect(blockLabel(appt({ start: "09:00", end: "10:15", status: "in_service" }))).toContain("in the chair");
  });
});

describe("the day's numbers and columns", () => {
  const list = [
    appt({ id: "1", start: "09:00", end: "10:00" }),
    appt({ id: "2", start: "10:00", end: "11:30", status: "in_service" }),
    appt({ id: "3", start: "12:00", end: "13:00", status: "no_show" }),
    appt({ id: "4", start: "13:00", end: "14:00", status: "cancelled" }),
    appt({ id: "5", start: "14:00", end: "15:00", staffId: null, staffName: null, holdExpiresAt: "2026-11-04T20:00:00Z" }),
  ];
  it("counts what is on the page and describes the day", () => {
    const n = dayNumbers(list, new Date("2026-11-04T15:00:00Z"));
    expect(n).toEqual({ booked: 4, noShows: 1, inChair: 1, depositsDue: 1 });
    expect(dayDescription("2026-11-04", n)).toBe("Wednesday, November 4. 4 booked, 1 in the chair, 1 no-show, 1 deposit still due.");
    expect(dayDescription("2026-11-04", { booked: 0, noShows: 0, inChair: 0, depositsDue: 0 })).toBe("Wednesday, November 4. 0 booked.");
  });
  it("adds up booked time and builds columns with an Unassigned column only when needed", () => {
    expect(bookedMinutes(list, "s1")).toBe(60 + 90 + 60);
    const sim = staff("s1", "Simran Kaur");
    const ais = staff("s2", "Aisha Rahman");
    const cols = dayColumns("2026-11-04", [sim, ais], list);
    expect(cols.map((c) => c.title)).toEqual(["Simran", "Aisha", "Unassigned"]);
    expect(cols[0]!.subtitle).toBe("3 booked, 3.5 h");
    expect(dayColumns("2026-11-04", [sim, ais], list.slice(0, 2)).map((c) => c.title)).toEqual(["Simran", "Aisha"]);
    expect(dayColumns("2026-11-04", [sim, ais], list, { onlyStaff: "s2", showUnassigned: false }).map((c) => c.key)).toEqual(["s2"]);
  });
  it("builds seven day columns for one stylist", () => {
    const sim = staff("s1", "Simran Kaur");
    const cols = weekColumns("2026-11-02", sim, list);
    expect(cols).toHaveLength(7);
    expect(cols.map((c) => c.date)[0]).toBe("2026-11-02");
    expect(cols[2]!.subtitle).toBe("Nov 4 · 3 booked");
  });
});

describe("checkout preview", () => {
  it("credits the deposit and never goes negative", () => {
    expect(duePreview([{ priceCents: 14500 }, { priceCents: 3500 }], 4000)).toEqual({ subtotalCents: 18000, depositCents: 4000, dueCents: 14000 });
    expect(duePreview([{ priceCents: 3000 }], 4000)).toEqual({ subtotalCents: 3000, depositCents: 3000, dueCents: 0 });
  });
  it("prices the tip presets on the pre-tax amount", () => {
    expect(tipChoices(18000, [15, 20, 25])).toEqual([{ percent: 15, cents: 2700 }, { percent: 20, cents: 3600 }, { percent: 25, cents: 4500 }]);
  });
});

describe("open walk-in gaps", () => {
  const win: [number, number] = [9 * 60, 18 * 60];
  const early = new Date(instantAt("2026-11-04", 7 * 60).getTime()); // before opening
  const day = [appt({ start: "09:00", end: "10:15" }), appt({ id: "b", start: "10:45", end: "12:00" }), appt({ id: "c", start: "13:30", end: "15:00" })];
  it("finds the free stretches of 30 to 90 minutes inside working time", () => {
    const g = walkInGaps(staff("s1", "Simran Kaur"), "s1", "2026-11-04", win, day, early);
    // 10:15-10:45 (30 min), 12:00-13:30 (90 min); 15:00-17:00 is two hours, an empty afternoon rather than a gap.
    expect(g.map((x) => [x.start, x.end])).toEqual([[10 * 60 + 15, 10 * 60 + 45], [12 * 60, 13 * 60 + 30]]);
    expect(g[0]).toMatchObject({ top: 75, height: 29 });
    expect(gapRange(g[1]!)).toBe("12:00 to 1:30");
  });
  it("ignores cancelled and other people's appointments, counts time off, and shows nothing for past days or off-shift staff", () => {
    const s = staff("s1", "Simran Kaur", [[3, "09:00", "17:00"]], [{ id: "t", userId: "s1", startsAt: instantAt("2026-11-04", 12 * 60).toISOString(), endsAt: instantAt("2026-11-04", 13 * 60).toISOString(), reason: "Lunch" }]);
    const more = [...day, appt({ id: "x", start: "15:30", end: "16:00", status: "cancelled" }), appt({ id: "y", start: "15:00", end: "16:30", staffId: "s2" })];
    expect(walkInGaps(s, "s1", "2026-11-04", win, more, early).map((x) => [x.start, x.end])).toEqual([[10 * 60 + 15, 10 * 60 + 45], [13 * 60, 13 * 60 + 30]]);
    expect(walkInGaps(s, "s1", "2026-11-04", win, more, new Date(instantAt("2026-11-05", 7 * 60)))).toEqual([]);
    expect(walkInGaps(s, "s1", "2026-11-05", win, [], early)).toEqual([]); // Thursday: no shift
    expect(walkInGaps(null, null, "2026-11-04", win, day, early)).toEqual([]);
  });
  it("on today only the time after now counts, rounded up to the next quarter hour", () => {
    const now = instantAt("2026-11-04", 12 * 60 + 5);
    const g = walkInGaps(staff("s1", "Simran Kaur"), "s1", "2026-11-04", win, day, now);
    expect(g.map((x) => [x.start, x.end])).toEqual([[12 * 60 + 15, 13 * 60 + 30]]);
  });
  it("is counted in the page description", () => {
    expect(dayDescription("2026-11-04", { booked: 3, noShows: 0, depositsDue: 0, inChair: 0, gaps: 2 })).toBe("Wednesday, November 4. 3 booked, 2 walk-in gaps open.");
    expect(dayDescription("2026-11-04", { booked: 3, noShows: 0, depositsDue: 0, inChair: 0, gaps: 1 })).toContain("1 walk-in gap open");
  });
});
