import { describe, expect, it } from "vitest";
import { birthdaySchema, isMonthDay, toMonthDay } from "../src/index";

describe("birthday (month and day only)", () => {
  it("accepts real month-days including Feb 29", () => {
    for (const v of ["01-01", "02-29", "12-31", "04-30"]) expect(isMonthDay(v)).toBe(true);
  });
  it("rejects impossible or malformed values", () => {
    for (const v of ["02-30", "04-31", "13-01", "00-10", "1-5", "2000-01-01", ""]) expect(isMonthDay(v)).toBe(false);
  });
  it("drops the year from a legacy full date", () => {
    expect(toMonthDay("1990-05-04")).toBe("05-04");
    expect(toMonthDay("05-04")).toBe("05-04");
    expect(toMonthDay("1990-02-30")).toBeNull();
    expect(toMonthDay(null)).toBeNull();
  });
  it("the API schema always yields MM-DD", () => {
    expect(birthdaySchema.parse("1985-03-05")).toBe("03-05");
    expect(birthdaySchema.safeParse("nope").success).toBe(false);
  });
});
