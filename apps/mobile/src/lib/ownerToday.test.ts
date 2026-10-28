import { t as translate, type MessageKey, type reportsApi, type staffApi, type Vars } from "@ll/shared";
import { describe, expect, it } from "vitest";
import { deltaVs, greetingKey, hourBars, needsItems, statCards } from "./ownerToday";

const f = { t: (k: MessageKey, v?: Vars) => translate("en", k, v), number: (n: number) => String(n) };

const report = (over: Partial<reportsApi.TodayReportDto["today"]> = {}, extra: Partial<reportsApi.TodayReportDto> = {}): reportsApi.TodayReportDto =>
  ({
    asOf: "2026-10-28T13:00:00Z",
    timezone: "America/Toronto",
    yesterday: { visits: 0, typicalVisits: 0, newMembers: 0, newViaQr: 0 },
    today: { visits: 21, typicalVisitsFullDay: 20, typicalVisitsSoFar: 5, newMembers: 4, newViaQr: 2, stampsGiven: 26, redemptions: 2, regularsSeen: 0, regularsTotal: 0, ...over },
    hourly: { hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], typical: [], today: [1, 4, 6, 3, 2, 5, 0, 0, 0, 0, 0, 0] },
    rewardsWaiting: { count: 5, goal: 10, members: [] },
    slipping: { count: 2, canText: 1, members: [] },
    staff: [],
    promoWindow: null,
    counter: { online: true, staffName: null, signedInAt: null },
    ...extra,
  }) as reportsApi.TodayReportDto;

const counter: staffApi.TodayResponse = { date: "2026-10-28", visitCount: 9, newMembers: 1, pointsIssued: 12, redemptions: 3, items: [] };

describe("owner Today on the phone", () => {
  it("greets by the time of day, with or without a name", () => {
    expect(greetingKey(8, true)).toBe("shell.today.goodMorning");
    expect(greetingKey(14, false)).toBe("shell.today.goodAfternoonPlain");
    expect(greetingKey(19, true)).toBe("shell.today.goodEvening");
  });
  it("compares only when there is something to compare with", () => {
    expect(deltaVs(21, 5, "Wed", f)).toEqual({ text: "+16 vs last Wed", good: true });
    expect(deltaVs(5, 5, "Wed", f)?.good).toBeNull();
    expect(deltaVs(0, 0, "Wed", f)).toBeNull();
    expect(deltaVs(3, null, "Wed", f)).toBeNull();
    expect(deltaVs(12, 10, "Wed", f)?.text).toBe("+20% vs last Wed");
  });
  it("owners get the four mock cards with real captions", () => {
    const cards = statCards({ report: report(), counter, terminology: "stamps", weekday: "Wed" }, f);
    expect(cards.map((c) => c.label)).toEqual(["Visits today", "Stamps given", "Rewards redeemed", "New customers"]);
    expect(cards.map((c) => c.value)).toEqual(["21", "26", "2", "4"]);
    expect(cards[0]!.chip).toEqual({ text: "+16 vs last Wed", tone: "up", arrow: true });
    expect(cards[1]!.chip).toBeNull();
    expect(cards[2]!.chip?.text).toBe("5 waiting");
    expect(cards[3]!.chip).toBeNull();
  });
  it("staff (no report) see the counter's numbers and no invented captions", () => {
    const cards = statCards({ report: null, counter, terminology: "points", weekday: "Wed" }, f);
    expect(cards.map((c) => c.value)).toEqual(["9", "12", "3", "1"]);
    expect(cards[1]!.label).toBe("Points given");
    expect(cards.every((c) => c.chip === null)).toBe(true);
  });
  it("Needs you lists rewards waiting, then regulars slipping away", () => {
    const rows = needsItems(report(), f);
    expect(rows.map((r) => r.key)).toEqual(["rewards", "slipping"]);
    expect(rows[0]!.title).toBe("5 customers have a reward waiting");
    expect(rows[1]!.subtitle).toBe("Haven't been in as often as usual");
    expect(needsItems(report({}, { rewardsWaiting: { count: 0, goal: null, members: [] }, slipping: { count: 0, canText: 0, members: [] } }), f)).toEqual([]);
    expect(needsItems(null, f)).toEqual([]);
  });
  it("visits by hour: the current hour is the trade bar and the peak is named", () => {
    const b = hourBars(report(), 9)!;
    expect(b.heights).toHaveLength(12);
    expect(Math.max(...b.heights)).toBe(1);
    expect(Math.min(...b.heights)).toBeGreaterThan(0);
    expect(b.current).toBe(2);
    expect(b.peakHour).toBe(9);
    expect(hourBars(report(), 22)!.current).toBe(-1);
    expect(hourBars(null, 9)).toBeNull();
  });
});
