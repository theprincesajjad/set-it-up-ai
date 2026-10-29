// phase-pro P5: add-on math (docs/business/pro-value.md §3.2 P5).
import { describe, expect, it } from "vitest";
import { appointmentsApi } from "../src/index.js";

const { addOnOfferedWith, addOnsForServices, addOnTotals, splitAddOnItems, createMyAppointmentBody, availabilityQuery } = appointmentsApi;
const ids = { gel: "00000000-0000-4000-8000-000000000001", mani: "00000000-0000-4000-8000-000000000002", art: "00000000-0000-4000-8000-000000000003", removal: "00000000-0000-4000-8000-000000000004" };

describe("add-ons", () => {
  const art = { id: ids.art, offeredWith: [] as string[], sort: 0, durationMin: 15, priceCents: 1000 };
  const removal = { id: ids.removal, offeredWith: [ids.gel], sort: 1, durationMin: 20, priceCents: 1500 };
  const hidden = { id: "x", offeredWith: [], active: false, sort: 2, durationMin: 5, priceCents: 500 };

  it("offers an add-on with every service when it has no list, else only with its services", () => {
    expect(addOnOfferedWith(art, [ids.mani])).toBe(true);
    expect(addOnOfferedWith(removal, [ids.mani])).toBe(false);
    expect(addOnOfferedWith(removal, [ids.mani, ids.gel])).toBe(true);
    expect(addOnsForServices([removal, hidden, art], [ids.gel]).map((a) => a.id)).toEqual([ids.art, ids.removal]);
    expect(addOnsForServices([removal, art], [ids.mani]).map((a) => a.id)).toEqual([ids.art]);
    expect(addOnsForServices([removal, art], [])).toEqual([]);
  });

  it("adds minutes and price", () => {
    expect(addOnTotals([art, removal])).toEqual({ durationMin: 35, priceCents: 2500 });
    expect(addOnTotals([])).toEqual({ durationMin: 0, priceCents: 0 });
  });

  it("splits a ticket into services and add-ons", () => {
    const items = [{ name: "Gel fill" }, { name: "Nail art", kind: "add_on" }, { name: "Lunch", kind: "service" }];
    expect(splitAddOnItems(items)).toEqual({ services: [items[0], items[2]], addOns: [items[1]] });
  });

  it("takes add-on ids on booking and availability", () => {
    expect(createMyAppointmentBody.parse({ serviceIds: [ids.gel], startsAt: "2026-11-04T15:00:00Z" }).addOnIds).toEqual([]);
    expect(availabilityQuery.parse({ serviceIds: ids.gel, from: "2026-11-04", to: "2026-11-04", addOnIds: `${ids.art},${ids.removal}` }).addOnIds).toEqual([ids.art, ids.removal]);
    expect(availabilityQuery.parse({ serviceIds: ids.gel, from: "2026-11-04", to: "2026-11-04" }).addOnIds).toEqual([]);
    expect(() => availabilityQuery.parse({ serviceIds: ids.gel, from: "2026-11-04", to: "2026-11-04", addOnIds: "nope" })).toThrow();
  });
});
