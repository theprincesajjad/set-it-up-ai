import { afterEach, describe, expect, it } from "vitest";
import { addLine, cartCount, cartSubtotal, defaultOptionIds, idempotencyKeyFor, lineKey, loadCart, pickupCode, pickupDays, preorderBill, priceDish, pruneCart, saveCart, setQty, taxOf, type Item } from "@/lib/restaurant/order";
import { available, buildSections, isFiltering, matches, NO_FILTERS } from "@/lib/restaurant/menu";
import { buildIcs, icsFold, icsText } from "@/lib/restaurant/ics";
import { whatsappChatUrl, whatsappShareUrl } from "@/lib/restaurant/share";

const degh = {
  id: "d1",
  priceCents: 18900,
  options: {
    groups: [
      { id: "size", name: "Size", type: "single", required: true, priceMode: "absolute", options: [{ id: "full", name: "Full degh", priceCents: 18900, serves: 15 }, { id: "half", name: "Half degh", priceCents: 9900, serves: 8 }] },
      { id: "spice", name: "Spice", type: "single", required: false, priceMode: "delta", options: [{ id: "mild", name: "Mild", priceCents: 0 }, { id: "medium", name: "Medium", priceCents: 0, default: true }, { id: "hot", name: "Hot", priceCents: 0 }] },
      { id: "pot", name: "Add to the pot", type: "multi", required: false, priceMode: "delta", options: [{ id: "raita", name: "Raita, 1 L", priceCents: 800 }, { id: "naan", name: "Garlic naan × 20", priceCents: 3000 }] },
    ],
  },
} as unknown as Item;
const plain = { id: "p1", priceCents: 1899 } as Item;

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("dish pricing from options", () => {
  it("a size sets the price, add-ons add to it, a required group falls back to its default", () => {
    expect(priceDish(degh, ["full", "medium", "raita", "naan"]).unitCents).toBe(22700); // the frame: $227.00
    expect(priceDish(degh, ["half", "raita"])).toMatchObject({ unitCents: 10700, serves: 8 });
    expect(priceDish(degh, []).unitCents).toBe(18900); // full is the first and default size
    expect(priceDish(degh, ["half"]).picks).toEqual([{ group: "Size", option: "Half degh", priceCents: -9000, serves: 8 }]);
    expect(priceDish(plain, []).unitCents).toBe(1899);
  });
  it("unknown ids add nothing; the page never sends two picks for a single group (the server refuses it)", () => {
    expect(priceDish(degh, ["half", "gold"]).unitCents).toBe(9900);
    expect(priceDish(degh, ["half", "full"]).picks.filter((p) => p.group === "Size")).toHaveLength(1);
  });
  it("preselects required sizes and anything marked default", () => {
    expect(defaultOptionIds(degh)).toEqual(["full", "medium"]);
    expect(defaultOptionIds(plain)).toEqual([]);
  });
});

describe("pre-order bill", () => {
  it("is the frame: $227.00 + 13% HST = $256.51, 30% deposit $76.95, balance $179.56", () => {
    expect(preorderBill(22700, 1, 3000, 130_000)).toEqual({ subtotal: 22700, tax: 2951, total: 25651, deposit: 7695, balance: 17956 });
  });
  it("no deposit rule: everything is due at pickup", () => {
    expect(preorderBill(10000, 1, 0, 130_000)).toMatchObject({ deposit: 0, balance: 11300 });
  });
  it("tax rounds half up", () => {
    expect(taxOf(1899, 130_000)).toBe(247);
    expect(taxOf(0, 130_000)).toBe(0);
  });
});

describe("cart", () => {
  const items = new Map([["d1", degh], ["p1", plain]]);
  it("merges the same dish with the same choices, keeps different choices apart", () => {
    let c = addLine({ lines: [] }, "p1", []);
    c = addLine(c, "p1", []);
    c = addLine(c, "d1", ["half", "raita"]);
    c = addLine(c, "d1", ["raita", "half"]); // same choices, other order
    c = addLine(c, "d1", ["full"]);
    expect(c.lines.map((l) => [l.itemId, l.qty])).toEqual([["p1", 2], ["d1", 2], ["d1", 1]]);
    expect(cartCount(c)).toBe(5);
    expect(cartSubtotal(c, items)).toBe(2 * 1899 + 2 * 10700 + 18900);
    expect(lineKey("d1", ["b", "a"])).toBe(lineKey("d1", ["a", "b"]));
  });
  it("caps a line at 20 and removes at zero", () => {
    const c = addLine({ lines: [] }, "p1", [], 99);
    expect(c.lines[0]!.qty).toBe(20);
    expect(setQty(c, c.lines[0]!.key, 0).lines).toEqual([]);
  });
  it("drops dishes that left the menu, and pre-order dishes (they have their own page)", () => {
    const c = { lines: [{ key: "x:", itemId: "gone", qty: 1, optionIds: [] }, { key: "p1:", itemId: "p1", qty: 1, optionIds: [] }, { key: "d1:", itemId: "d1", qty: 1, optionIds: [] }] };
    const withPre = new Map([["p1", plain], ["d1", { ...degh, preorderOnly: true } as Item]]);
    expect(pruneCart(c, withPre).lines.map((l) => l.itemId)).toEqual(["p1"]);
  });
  it("saves and loads per shop; storage trouble never throws", () => {
    saveCart("nawab", { lines: [{ key: lineKey("p1", []), itemId: "p1", qty: 2, optionIds: [] }] });
    expect(loadCart("nawab").lines[0]).toMatchObject({ itemId: "p1", qty: 2 });
    expect(loadCart("other").lines).toEqual([]);
    window.localStorage.setItem("ll.cart.bad", "{not json");
    expect(loadCart("bad").lines).toEqual([]);
    window.localStorage.setItem("ll.cart.junk", JSON.stringify({ lines: [{ itemId: 5 }, { itemId: "p1", qty: 0, optionIds: [] }] }));
    expect(loadCart("junk").lines).toEqual([]);
    saveCart("nawab", { lines: [] });
    expect(window.localStorage.getItem("ll.cart.nawab")).toBeNull();
  });
});

describe("idempotency key", () => {
  it("is stable for the same order and new for a different one", () => {
    const a = idempotencyKeyFor("nawab", "sig-1");
    expect(idempotencyKeyFor("nawab", "sig-1")).toBe(a);
    expect(idempotencyKeyFor("nawab", "sig-2")).not.toBe(a);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe("pickup times", () => {
  const hours = { mon: [["11:00", "13:00"]], tue: [["11:00", "13:00"]], wed: [], thu: [["11:00", "13:00"]], fri: [["11:00", "13:00"]], sat: [["11:00", "13:00"]], sun: [["11:00", "13:00"]] } as Record<string, [string, string][]>;
  it("15 minute steps after the quoted wait, last pickup 15 minutes before close, closed days dropped", () => {
    // Mon 2026-11-02 11:50 Toronto (16:50Z), 20 minute wait: earliest 12:10 -> 12:15 ... 12:45
    const d = pickupDays(hours, new Date("2026-11-02T16:50:00Z"), 20, 3);
    expect(d.map((x) => x.date)).toEqual(["2026-11-02", "2026-11-03"]); // Wednesday is closed, and only 3 days are looked at
    expect(d[0]!.times.map((t) => t.hhmm)).toEqual(["12:15", "12:30", "12:45"]);
    expect(d[1]!.times[0]).toMatchObject({ hhmm: "11:00", iso: "2026-11-03T16:00:00.000Z" }); // 11:00 EST on Nov 3 is 16:00Z
  });
  it("no hours on file: 11:00 to 21:00", () => {
    const d = pickupDays(null, new Date("2026-11-02T14:00:00Z"), 20, 1);
    expect(d[0]!.times[0]!.hhmm).toBe("11:00");
    expect(d[0]!.times.at(-1)!.hhmm).toBe("20:45");
  });
});

describe("pickup code", () => {
  it("initials of the first two words and the order number", () => {
    expect(pickupCode("Nawab Biryani House", 4821)).toBe("NB-4821");
    expect(pickupCode("Sarson Dhaba", 12)).toBe("SD-12");
    expect(pickupCode("Meethi", 7)).toBe("M-7");
    expect(pickupCode("", 3)).toBe("OR-3");
  });
});

describe("menu filters and sections", () => {
  const dish = (id: string, name: string, extra: Partial<Item> = {}) => ({ id, name, priceCents: 1000, ...extra }) as Item;
  const items = [
    dish("a", "Chicken biryani", { dietary: { halal: true, zabihah: true, allergens: ["dairy"] } }),
    dish("b", "Mirchi ka salan", { dietary: { vegan: true, vegetarian: true, glutenFree: true, allergens: ["Peanuts", "sesame"] } }),
    dish("c", "Butter chicken", { dietary: { halal: true, allergens: ["dairy", "nuts"] } }),
    dish("d", "Jain thali", { dietary: { jain: true } }),
    dish("e", "Plain naan"),
  ];
  const names = (f: Partial<typeof NO_FILTERS>) => items.filter((i) => matches(i, { ...NO_FILTERS, ...f })).map((i) => i.id);
  it("veg includes vegan and Jain; halal includes zabihah; untagged dishes never pass a dietary chip", () => {
    expect(names({})).toEqual(["a", "b", "c", "d", "e"]);
    expect(names({ veg: true })).toEqual(["b", "d"]);
    expect(names({ vegan: true })).toEqual(["b"]);
    expect(names({ jain: true })).toEqual(["d"]);
    expect(names({ glutenFree: true })).toEqual(["b"]);
    expect(names({ halal: true })).toEqual(["a", "c"]);
  });
  it("'Without nuts' hides every dish with peanut or tree nut, however the owner typed it", () => {
    expect(names({ withoutNuts: true })).toEqual(["a", "d", "e"]);
    expect(isFiltering({ ...NO_FILTERS, withoutNuts: true })).toBe(true);
    expect(isFiltering(NO_FILTERS)).toBe(false);
  });
  it("only offers chips for tags the shop uses", () => {
    expect(available(items)).toEqual({ halal: true, veg: true, vegan: true, jain: true, glutenFree: true, nuts: true });
    expect(available([dish("z", "Naan")])).toEqual({ halal: false, veg: false, vegan: false, jain: false, glutenFree: false, nuts: false });
  });
  it("puts Degh last and drops empty sections", () => {
    const pot = dish("p", "Degh", { preorderOnly: true });
    const s = buildSections({ categories: [{ id: "c1", name: "Biryani", items: [items[0]!, pot] }, { id: "c2", name: "Empty", items: [] }, { id: "c3", name: "Curries", items: [items[2]!] }], uncategorized: [items[4]!] }, { more: "More", degh: "Degh" });
    expect(s.map((x) => [x.id, x.items.map((i) => i.id)])).toEqual([["c1", ["a"]], ["c3", ["c"]], ["more", ["e"]], ["degh", ["p"]]]);
    expect(s.at(-1)!.preorder).toBe(true);
  });
});

describe("calendar file", () => {
  it("is a valid single-event calendar with the pickup in UTC", () => {
    const ics = buildIcs({ uid: "abc", start: new Date("2026-10-24T18:00:00Z"), durationMin: 60, summary: "Pick up at Nawab Biryani House", location: "Unit 12, 3250 Ridgecrest Blvd, Mississauga", description: "Pickup code NB-4821\n1 x Degh", now: new Date("2026-10-20T12:00:00Z") });
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART:20261024T180000Z");
    expect(lines).toContain("DTEND:20261024T190000Z");
    expect(lines).toContain("DTSTAMP:20261020T120000Z");
    expect(lines).toContain("UID:abc@local-loyalty");
    expect(ics).toContain("LOCATION:Unit 12\\, 3250 Ridgecrest Blvd\\, Mississauga");
    expect(ics).toContain("DESCRIPTION:Pickup code NB-4821\\n1 x Degh");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
  it("escapes text and folds long lines at 75 octets", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
    const folded = icsFold(`DESCRIPTION:${"x".repeat(200)}`);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(200)}`);
    // Never splits a multi-byte character.
    const urdu = icsFold(`SUMMARY:${"نواب".repeat(30)}`);
    expect(urdu.replace(/\r\n /g, "")).toBe(`SUMMARY:${"نواب".repeat(30)}`);
  });
});

describe("share links", () => {
  it("encodes the family message and the shop chat link", () => {
    expect(whatsappShareUrl("Degh Sat 2 pm. https://x.test/shops/n?a=1&b=2")).toBe("https://wa.me/?text=Degh%20Sat%202%20pm.%20https%3A%2F%2Fx.test%2Fshops%2Fn%3Fa%3D1%26b%3D2");
    expect(whatsappChatUrl("+1 (905) 555-0101")).toBe("https://wa.me/19055550101");
    expect(whatsappChatUrl("+19055550101", "Salaam")).toBe("https://wa.me/19055550101?text=Salaam");
  });
});
