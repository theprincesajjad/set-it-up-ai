import { describe, expect, it } from "vitest";
import { filterFromSegment, filterQuery, maskPhone, startOfMonthToronto, usuallyAround } from "@/lib/dashboard/customers";

describe("customer filter chips", () => {
  it("map to server-side filters so the total is exact", () => {
    const now = Date.parse("2026-10-31T12:00:00Z");
    expect(filterQuery("new", now).query).toEqual({ sort: "joined", joinedAfter: "2026-10-01T04:00:00.000Z" });
    expect(filterQuery("opted_in").query).toEqual({ consent: "opted_in" });
    expect(filterQuery("muted").query).toEqual({ muted: "true" });
    expect(filterQuery("reward").query).toEqual({ rewardAvailable: "true" });
    expect(filterQuery("all").query).toEqual({});
  });

  it("maps the café chips to server segments", () => {
    expect(filterQuery("regulars").query).toEqual({ segment: "regulars" });
    expect(filterQuery("slipping").query).toEqual({ segment: "slipping" });
    expect(filterQuery("birthday").query).toEqual({ segment: "birthday_month" });
    expect(filterQuery("can_text").query).toEqual({ segment: "can_text" });
  });

  it("selects a chip from ?segment=", () => {
    expect(filterFromSegment("slipping")).toBe("slipping");
    expect(filterFromSegment("regulars")).toBe("regulars");
    expect(filterFromSegment("reward")).toBe("reward");
    expect(filterFromSegment("texts")).toBe("can_text");
    expect(filterFromSegment("nonsense")).toBe("all");
    expect(filterFromSegment(null)).toBe("all");
  });

  it("starts the month at Toronto midnight, in EDT and EST", () => {
    expect(startOfMonthToronto(Date.parse("2026-10-23T15:00:00Z"))).toBe("2026-10-01T04:00:00.000Z");
    expect(startOfMonthToronto(Date.parse("2026-12-15T15:00:00Z"))).toBe("2026-12-01T05:00:00.000Z");
    // 11 pm on Oct 31 Toronto is already Nov 1 UTC: still October.
    expect(startOfMonthToronto(Date.parse("2026-11-01T02:30:00Z"))).toBe("2026-10-01T04:00:00.000Z");
  });

  it("says 'around' in the detail panel", () => {
    expect(usuallyAround("Weekdays 8 am")).toBe("Weekdays around 8 am");
    // A range already says when: no "around".
    expect(usuallyAround("Weekdays 8 to 10 am")).toBe("Weekdays 8 to 10 am");
    expect(usuallyAround(null)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("renders API-masked phones and masks full numbers the same way", () => {
    expect(maskPhone("(416) ***-0123")).toBe("(416) •••-0123");
    expect(maskPhone("+14165550123")).toBe("(416) •••-0123");
    expect(maskPhone(null)).toBe("No phone");
  });
});
