import { afterEach, describe, expect, it } from "vitest";
import { observeServerDate, observeServerTimestamp, resetServerClock, secondsLeft, serverNow } from "./serverClock";

describe("serverClock", () => {
  afterEach(() => resetServerClock());

  it("uses the Date header offset for countdowns", () => {
    const phone = Date.parse("2026-10-22T14:00:00Z");
    // Phone is 2 minutes fast.
    observeServerDate("Thu, 22 Oct 2026 13:58:00 GMT", phone);
    expect(serverNow(phone)).toBe(Date.parse("2026-10-22T13:58:00Z"));
    expect(secondsLeft("2026-10-22T14:08:00Z", serverNow(phone))).toBe(600);
  });

  it("falls back to a fresh server timestamp, but a Date header wins", () => {
    const phone = Date.parse("2026-10-22T14:00:00Z");
    observeServerTimestamp("2026-10-22T13:59:30Z", phone);
    expect(serverNow(phone)).toBe(Date.parse("2026-10-22T13:59:30Z"));
    observeServerDate("Thu, 22 Oct 2026 14:00:10 GMT", phone);
    observeServerTimestamp("2026-10-22T13:00:00Z", phone);
    expect(serverNow(phone)).toBe(Date.parse("2026-10-22T14:00:10Z"));
  });

  it("ignores junk and old timestamps", () => {
    observeServerDate("not a date");
    observeServerTimestamp("2020-01-01T00:00:00Z");
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });

  it("secondsLeft: null for no expiry, 0 once past, rounds up", () => {
    const now = Date.parse("2026-10-22T14:00:00Z");
    expect(secondsLeft(null, now)).toBeNull();
    expect(secondsLeft("2026-10-22T13:59:00Z", now)).toBe(0);
    expect(secondsLeft("2026-10-22T14:00:00.200Z", now)).toBe(1);
  });
});
