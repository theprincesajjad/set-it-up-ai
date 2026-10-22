import { describe, expect, it } from "vitest";
import { filterQuery, maskPhone } from "@/lib/dashboard/customers";

describe("customer filter chips", () => {
  it("map to server-side filters so the total is exact", () => {
    const now = Date.parse("2026-10-31T12:00:00Z");
    expect(filterQuery("new", now).query).toEqual({ sort: "joined", joinedAfter: "2026-10-01T12:00:00.000Z" });
    expect(filterQuery("opted_in").query).toEqual({ consent: "opted_in" });
    expect(filterQuery("muted").query).toEqual({ muted: "true" });
    expect(filterQuery("reward").query).toEqual({ rewardAvailable: "true" });
    expect(filterQuery("all").query).toEqual({});
  });
});

describe("maskPhone", () => {
  it("renders API-masked phones and masks full numbers the same way", () => {
    expect(maskPhone("(416) ***-0123")).toBe("(416) •••-0123");
    expect(maskPhone("+14165550123")).toBe("(416) •••-0123");
    expect(maskPhone(null)).toBe("No phone");
  });
});
