import { describe, expect, it } from "vitest";
import { birthdayValue, daysInMonth, parseBirthday, withMonth } from "./birthday";

describe("birthday picker rules", () => {
  it("never keeps a day the month does not have", () => {
    expect(withMonth({ month: 1, day: 31 }, 2)).toEqual({ month: 2, day: null });
    expect(withMonth({ month: 1, day: 31 }, 4)).toEqual({ month: 4, day: null });
    expect(withMonth({ month: 1, day: 30 }, 4)).toEqual({ month: 4, day: 30 });
    expect(withMonth({ month: null, day: null }, 6)).toEqual({ month: 6, day: null });
  });
  it("day counts", () => {
    expect([daysInMonth(2), daysInMonth(9), daysInMonth(12), daysInMonth(null)]).toEqual([29, 30, 31, 31]);
  });
  it("round-trips the MM-DD the API stores", () => {
    expect(birthdayValue({ month: 3, day: 7 })).toBe("03-07");
    expect(birthdayValue({ month: 3, day: null })).toBeUndefined();
    expect(parseBirthday("11-26")).toEqual({ month: 11, day: 26 });
    expect(parseBirthday("2000-11-26")).toEqual({ month: 11, day: 26 });
    expect(parseBirthday(null)).toEqual({ month: null, day: null });
  });
});
