import { describe, expect, it } from "vitest";
import type { restaurantApi } from "@ll/shared";
import { ageText, cashPriceCents, columnOf, groupTickets, isLate, liveAgeSeconds, nextItemStatus, tenderPrices, withItemStatus } from "./kitchen";

const item = (id: string, status: restaurantApi.KitchenItemStatus): restaurantApi.KitchenItemDto => ({ id, catalogItemId: null, name: id, nameEn: id, quantity: 1, modifiers: [], notes: null, station: null, status });
const ticket = (n: number, ageSeconds: number, ...items: restaurantApi.KitchenItemDto[]): restaurantApi.KitchenTicketDto => ({ orderId: `o${n}`, number: n, kind: "pickup", channel: "counter", orderStatus: "preparing", pickupAt: null, notes: null, firedAt: "2026-10-22T18:00:00Z", bumpedAt: null, ageSeconds, items, customerName: null, allergyNote: null, fireAt: null, cookMinutes: 0, pinned: false });

describe("kitchen tickets carry the current ticket shape", () => {
  it("a pinned degh pre-order keeps its fire time, cook time and the guest's allergy note", () => {
    const t = { ...ticket(7, 0, item("pot", "queued")), kind: "preorder", customerName: "Hira", allergyNote: "Nut allergy", fireAt: "2026-10-23T15:30:00Z", cookMinutes: 90, pinned: true, firedAt: null };
    expect(t).toMatchObject({ customerName: "Hira", allergyNote: "Nut allergy", cookMinutes: 90, pinned: true, firedAt: null });
    expect(columnOf(t)).toBe("new");
  });
});

describe("kitchen columns", () => {
  it("sorts a ticket by how far its items are", () => {
    expect(columnOf(ticket(1, 0, item("a", "queued"), item("b", "queued")))).toBe("new");
    expect(columnOf(ticket(1, 0, item("a", "cooking"), item("b", "queued")))).toBe("cooking");
    expect(columnOf(ticket(1, 0, item("a", "ready"), item("b", "queued")))).toBe("cooking");
    expect(columnOf(ticket(1, 0, item("a", "ready"), item("b", "ready")))).toBe("ready");
  });
  it("groups oldest first", () => {
    const g = groupTickets([ticket(1, 60, item("a", "queued")), ticket(2, 900, item("b", "queued")), ticket(3, 5, item("c", "ready"))]);
    expect(g.new.map((t) => t.number)).toEqual([2, 1]);
    expect(g.ready.map((t) => t.number)).toEqual([3]);
  });
  it("advances one step at a time", () => {
    expect(nextItemStatus("queued")).toBe("cooking");
    expect(nextItemStatus("cooking")).toBe("ready");
    expect(nextItemStatus("ready")).toBeNull();
  });
  it("updates one item in place", () => {
    const out = withItemStatus([ticket(1, 0, item("a", "queued"), item("b", "queued"))], "b", "cooking");
    expect(out[0]!.items.map((i) => i.status)).toEqual(["queued", "cooking"]);
  });
});

describe("ticket age", () => {
  it("counts forward from the last poll", () => {
    expect(liveAgeSeconds(100, 1_000, 31_000)).toBe(130);
    expect(liveAgeSeconds(100, 5_000, 1_000)).toBe(100);
  });
  it("turns late at 10 minutes", () => {
    expect(isLate(599)).toBe(false);
    expect(isLate(600)).toBe(true);
  });
  it("formats m:ss and h:mm:ss", () => {
    expect(ageText(65)).toBe("1:05");
    expect(ageText(3725)).toBe("1:02:05");
    expect(ageText(-4)).toBe("0:00");
  });
});

describe("cash price", () => {
  it("takes the discount off the card price", () => {
    expect(cashPriceCents(2000, 300)).toBe(1940);
    expect(cashPriceCents(1599, 300)).toBe(1551);
    expect(cashPriceCents(2000, 0)).toBe(2000);
  });
  it("never discounts past 10%", () => {
    expect(cashPriceCents(1000, 5000)).toBe(900);
  });
  it("reports both prices and the saving", () => {
    expect(tenderPrices(2000, 300)).toEqual({ card: 2000, cash: 1940, saved: 60 });
  });
});
