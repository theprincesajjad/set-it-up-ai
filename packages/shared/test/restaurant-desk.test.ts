import { describe, expect, it } from "vitest";
import { FESTIVALS, communitiesForCuisines, festivalOccurrences, festivalRelevance, restaurantApi } from "../src/index.js";

const { splitCents, splitByItems } = restaurantApi;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("splitCents", () => {
  it("floors each share and gives the leftover cents to the first guest", () => {
    expect(splitCents(4740, [1898, 1150, 1150])).toEqual([2144, 1298, 1298]);
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(0, [1, 1])).toEqual([0, 0]);
  });
  it("always adds up, for awkward totals and weights", () => {
    for (const total of [1, 7, 999, 6328, 123457]) for (const w of [[1, 1], [1, 2, 3], [5, 5, 5, 5, 1], [1898, 1150, 1150]]) expect(splitCents(total, w).reduce((a, b) => a + b, 0)).toBe(total);
  });
  it("refuses to split among nothing", () => {
    expect(() => splitCents(100, [0, 0])).toThrow();
  });
});

describe("splitByItems", () => {
  const lines = [
    { id: id(1), quantity: 1, unitPriceCents: 1898 },
    { id: id(2), quantity: 1, unitPriceCents: 1150 },
    { id: id(3), quantity: 1, unitPriceCents: 1150 },
  ];
  it("shares tax in proportion to each guest's food and gives the odd cent to the first", () => {
    expect(splitByItems(4740, lines, [[id(1)], [id(2)], [id(3)]])).toEqual([2144, 1298, 1298]);
  });
  it("splits a shared unit between the guests who share it", () => {
    const shares = splitByItems(3000, [{ id: id(1), quantity: 1, unitPriceCents: 2000 }, { id: id(2), quantity: 1, unitPriceCents: 1000 }], [[id(1), id(2)], [id(1)]]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(shares[0]).toBeGreaterThan(shares[1]!);
  });
  it("lets one unit of a line go to each guest", () => {
    const shares = splitByItems(2000, [{ id: id(1), quantity: 2, unitPriceCents: 1000 }], [[`${id(1)}:1`], [`${id(1)}:2`]]);
    expect(shares).toEqual([1000, 1000]);
  });
  it("says so when a unit is on nobody's bill", () => {
    expect(() => splitByItems(2000, [{ id: id(1), quantity: 2, unitPriceCents: 1000 }], [[`${id(1)}:1`]])).toThrow();
  });
});

describe("festival relevance", () => {
  const def = (fid: string) => FESTIVALS.find((f) => f.id === fid)!;
  it("with no cuisines set nothing is demoted", () => {
    expect(festivalRelevance(def("karva_chauth"), [])).toBe("some");
  });
  it("a Hyderabadi shop is led by Eid and not by Karva Chauth or Bangladesh Victory Day", () => {
    expect(communitiesForCuisines(["hyderabadi"]).length).toBeGreaterThan(0);
    expect(festivalRelevance(def("eid_al_fitr"), ["hyderabadi"])).toBe("high");
    expect(festivalRelevance(def("karva_chauth"), ["hyderabadi"])).toBe("low");
    expect(festivalRelevance(def("bangladesh_victory"), ["hyderabadi"])).toBe("low");
  });
  it("a Punjabi shop gets Karva Chauth", () => {
    expect(festivalRelevance(def("karva_chauth"), ["punjabi"])).not.toBe("low");
  });
  it("moves an occurrence with an override and reports the calendar date", () => {
    const [o] = festivalOccurrences("2026-11-01", "2026-11-30", { diwali: { 2026: "2026-11-09" } }).filter((x) => x.festivalId === "diwali");
    expect(o).toMatchObject({ startDate: "2026-11-09", moved: true, calendarStartDate: "2026-11-08" });
  });
});
