import { describe, expect, it } from "vitest";
import type { appointmentsApi } from "@ll/shared";
import { buildIcs, durationText, groupServices, nextDays, serviceFor, staffDoes, summarize, timesOn } from "@/lib/booking";

type S = appointmentsApi.PublicServiceDto;
const svc = (over: Partial<S> & { id: string }): S => ({ name: over.id, description: null, durationMin: 60, priceCents: 5000, priceFrom: false, depositCents: 0, categoryName: null, translations: {}, staffIds: [], staffOverrides: [], ...over });

describe("who does what", () => {
  const cut = svc({ id: "cut", staffIds: ["a", "b"], staffOverrides: [{ staffId: "b", durationMin: 75, priceCents: 7000 }] });
  it("lets anyone do a service nobody is assigned to, otherwise only the list", () => {
    expect(staffDoes(svc({ id: "x" }), "a")).toBe(true);
    expect(staffDoes(cut, "a")).toBe(true);
    expect(staffDoes(cut, "c")).toBe(false);
    expect(staffDoes(cut, null)).toBe(true);
  });
  it("uses a stylist's own length and price, and the shop's for 'anyone'", () => {
    expect(serviceFor(cut, "b")).toEqual({ durationMin: 75, priceCents: 7000 });
    expect(serviceFor(cut, "a")).toEqual({ durationMin: 60, priceCents: 5000 });
    expect(serviceFor(cut, null)).toEqual({ durationMin: 60, priceCents: 5000 });
  });
});

describe("totals", () => {
  const list = [svc({ id: "high", durationMin: 120, priceCents: 14500, depositCents: 4000 }), svc({ id: "toner", durationMin: 30, priceCents: 3500 }), svc({ id: "cut", durationMin: 45, priceCents: 6500 })];
  it("adds length, price and the deposit (never more than the price)", () => {
    expect(summarize(list, ["high", "toner"], null)).toMatchObject({ count: 2, durationMin: 150, priceCents: 18000, depositCents: 4000 });
    expect(summarize(list, [], null)).toMatchObject({ count: 0, durationMin: 0, priceCents: 0, depositCents: 0 });
    expect(summarize([svc({ id: "x", priceCents: 1000, depositCents: 4000 })], ["x"], null).depositCents).toBe(1000);
  });
  it("groups by category in listed order", () => {
    const g = groupServices([svc({ id: "1", categoryName: "Hair" }), svc({ id: "2", categoryName: "Threading" }), svc({ id: "3", categoryName: "Hair" }), svc({ id: "4", categoryName: null })]);
    expect(g.map((x) => [x.name, x.items.map((i) => i.id)])).toEqual([["Hair", ["1", "3"]], ["Threading", ["2"]], [null, ["4"]]]);
  });
});

describe("dates and wording", () => {
  it("builds the date strip across month ends", () => {
    expect(nextDays("2026-10-30", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("finds the times on a day", () => {
    const av = { timezone: "America/Toronto", blockMin: 30, days: [{ date: "2026-11-04", times: [{ startsAt: "2026-11-04T14:00:00.000Z", staffId: "a" }] }] };
    expect(timesOn(av, "2026-11-04")).toHaveLength(1);
    expect(timesOn(av, "2026-11-05")).toEqual([]);
    expect(timesOn(null, "2026-11-04")).toEqual([]);
  });
  it("words durations through the catalog", () => {
    const t = (k: string, v: Record<string, number>) => ({ "bk.dur.min": `${v.n} min`, "bk.dur.h": `${v.h} h`, "bk.dur.hm": `${v.h} h ${v.m}` })[k]!;
    expect(durationText(t as never, 45)).toBe("45 min");
    expect(durationText(t as never, 120)).toBe("2 h");
    expect(durationText(t as never, 150)).toBe("2 h 30");
  });
});

describe("calendar file", () => {
  const ics = buildIcs({ uid: "abc", title: "Highlights, half head at Bloom", startsAt: "2026-10-29T15:30:00.000Z", endsAt: "2026-10-29T18:00:00.000Z", location: "220 Roncesvalles Ave, Toronto", description: "Change or cancel; free until 24 hours before", url: "https://x.test/shops/bloom/book/abc" }, new Date("2026-10-23T12:00:00Z"));
  it("is a valid VEVENT in UTC with CRLF lines", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261029T153000Z");
    expect(ics).toContain("DTEND:20261029T180000Z");
    expect(ics).toContain("DTSTAMP:20261023T120000Z");
    expect(ics).toContain("UID:abc@localloyalty");
    expect(ics).toContain("SUMMARY:Highlights\\, half head at Bloom");
    expect(ics).toContain("DESCRIPTION:Change or cancel\; free until 24 hours before");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("folds long lines at 75 octets", () => {
    const long = buildIcs({ uid: "u", title: "x", startsAt: "2026-10-29T15:30:00.000Z", endsAt: "2026-10-29T18:00:00.000Z", description: "word ".repeat(40) });
    const lines = long.split("\r\n");
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    // Unfolding gives the original text back.
    expect(long.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"word ".repeat(40)}`);
  });
});
