import { describe, expect, it } from "vitest";
import { queryOf, readBookChoice, writeBookChoice } from "../src/components/pass/bookState";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";
const ADD = "55555555-5555-4555-8555-555555555555";
const HOLD = "66666666-6666-4666-8666-666666666666";
const data = { services: [{ id: A, addOns: [{ id: ADD }] }, { id: B }], staff: [{ id: S1 }, { id: S2 }] };
const AT = "2026-12-05T15:15:00.000Z";

describe("the booking flow's address", () => {
  it("a bare address is the first step with nothing chosen", () => {
    expect(readBookChoice({}, data)).toEqual({ step: "services", ids: [], staffId: null, addOnIds: [], day: null, slot: null, hold: null });
    expect(writeBookChoice("", readBookChoice({}, data))).toBe("");
  });

  it("a rebooking link (?service=&staff=) still opens on the services step with them chosen", () => {
    expect(readBookChoice({ service: A, staff: S1 }, data)).toMatchObject({ step: "services", ids: [A], staffId: S1 });
  });

  it("round-trips every step with its choices, and keeps lang, pet and rebook", () => {
    for (const step of ["services", "addons", "time", "details", "pay"] as const) {
      const c = { step, ids: [A, B], staffId: null, addOnIds: [ADD], day: "2026-12-05", slot: { startsAt: AT, staffId: S2 }, hold: HOLD };
      const search = writeBookChoice("?lang=ur&pet=p1&rebook=r1", c);
      const q = queryOf(search);
      expect(q.lang).toBe("ur");
      expect(q.pet).toBe("p1");
      expect(q.rebook).toBe("r1");
      const back = readBookChoice(q, data);
      expect(back.step).toBe(step);
      expect(back.ids).toEqual([A, B]);
      expect(back.addOnIds).toEqual([ADD]);
      const later = step === "time" || step === "details" || step === "pay";
      expect(back.slot).toEqual(later ? { startsAt: AT, staffId: S2 } : null);
      expect(back.day).toBe(step === "services" ? null : "2026-12-05");
      expect(back.hold).toBe(step === "pay" ? HOLD : null);
      // Writing what was read changes nothing: Back and Forward never rewrite the address they land on.
      expect(writeBookChoice(search, back)).toBe(search);
    }
  });

  it("with a chosen stylist the time needs no `with`; a one-person shop keeps the stylist out of the address", () => {
    const c = { step: "details" as const, ids: [A], staffId: S1, addOnIds: [], day: "2026-12-05", slot: { startsAt: AT, staffId: S1 }, hold: null };
    const q = queryOf(writeBookChoice("", c));
    expect(q.with).toBeUndefined();
    expect(readBookChoice(q, data).slot).toEqual({ startsAt: AT, staffId: S1 });
    expect(queryOf(writeBookChoice("", c, { solo: true })).staff).toBeUndefined();
  });

  it("drops what the shop does not offer and pulls the step back to the first complete one", () => {
    // No such service: back to the services step.
    expect(readBookChoice({ step: "details", service: "nope", at: AT, with: S1 }, data)).toMatchObject({ step: "services", ids: [], slot: null });
    // A time step needs a service; a details step needs a time; a card step needs the hold.
    expect(readBookChoice({ step: "details", service: B }, data).step).toBe("time");
    expect(readBookChoice({ step: "details", service: B, at: "not a date", with: S1 }, data).step).toBe("time");
    expect(readBookChoice({ step: "pay", service: B, at: AT, with: S1 }, data).step).toBe("details");
    expect(readBookChoice({ step: "pay", service: B, hold: HOLD }, data)).toMatchObject({ step: "pay", hold: HOLD, slot: null });
    expect(readBookChoice({ step: "pay", service: B, hold: "x' or 1=1" }, data).step).toBe("time");
    // Add-ons are only a step when the chosen services offer some, and only offered ones are kept.
    expect(readBookChoice({ step: "addons", service: B }, data).step).toBe("time");
    expect(readBookChoice({ step: "addons", service: A, addon: `${ADD},other` }, data)).toMatchObject({ step: "addons", addOnIds: [ADD] });
    // Unknown stylist, unknown step, a malformed day.
    expect(readBookChoice({ step: "nowhere", service: A, staff: "ghost", day: "tomorrow" }, data)).toMatchObject({ step: "services", staffId: null, day: null });
  });
});
