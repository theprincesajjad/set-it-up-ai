import { describe, expect, it } from "vitest";
import { LAUNCH_PLAN, messagingCostCents, orderStreetDay, parseStreetAddress, planMonth, planPace } from "../src/launch.js";

describe("plan pace", () => {
  it("finds the plan month and straight-lines inside it", () => {
    expect(planMonth(new Date("2026-10-31T12:00:00Z"))).toBe(0);
    expect(planMonth(new Date("2026-11-15T12:00:00Z"))).toBe(1);
    expect(planMonth(new Date("2027-01-02T12:00:00Z"))).toBe(3);
    const mid = planPace(new Date("2026-11-16T00:00:00Z"), 40);
    expect(mid.month).toBe(1);
    expect(mid.plannedEndOfMonth).toBe(109);
    expect(mid.plannedToday).toBe(Math.round(109 * (15 / 30)));
    expect(mid.delta).toBe(40 - mid.plannedToday);
  });
  it("holds the last planned total after month 3 and is all-ahead before the plan", () => {
    expect(planPace(new Date("2027-05-01T00:00:00Z"), 380)).toMatchObject({ month: 3, plannedToday: 400, delta: -20 });
    expect(planPace(new Date("2026-10-20T00:00:00Z"), 12)).toMatchObject({ month: 0, plannedToday: 0, delta: 12 });
    expect(LAUNCH_PLAN.cumulativeShops.at(-1)).toBe(400);
  });
  it("prices messaging from segment counts", () => {
    expect(messagingCostCents(100, 0)).toBe(220);
    expect(messagingCostCents(0, 200)).toBe(100);
  });
});

describe("street day route", () => {
  const stop = (id: string, address: string | null, lat?: number, lng?: number) => ({ id, address, lat, lng });
  it("parses addresses", () => {
    expect(parseStreetAddress("1432 Gerrard St E")).toEqual({ n: 1432, street: "gerrard st e" });
    expect(parseStreetAddress("1432 Gerrard Street East")).toEqual({ n: 1432, street: "gerrard st e" });
    expect(parseStreetAddress("Unit 4 220 Bloor St W").n).toBe(220);
    expect(parseStreetAddress("Ridgeway Plaza").n).toBeNull();
  });
  it("walks the odd side up and the even side back", () => {
    const stops = [stop("a", "1440 Gerrard St E"), stop("b", "1431 Gerrard St E"), stop("c", "1436 Gerrard St E"), stop("d", "1433 Gerrard St E"), stop("e", "Food court")];
    expect(orderStreetDay(stops).map((s) => s.id)).toEqual(["b", "d", "a", "c", "e"]);
  });
  it("orders by nearest neighbour when most stops have a pin", () => {
    const stops = [stop("far", "9 A St", 43.7, -79.3), stop("near", "5 A St", 43.6601, -79.4), stop("start", "1 A St", 43.66, -79.4)];
    expect(orderStreetDay(stops).map((s) => s.id)).toEqual(["start", "near", "far"]);
    expect(orderStreetDay(stops, { start: { lat: 43.7, lng: -79.3 } }).map((s) => s.id)[0]).toBe("far");
  });
});
