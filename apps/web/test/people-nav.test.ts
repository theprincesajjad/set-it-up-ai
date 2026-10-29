/** phase-solo D: the Inbox entry for appointment-led shops, and no Staff page for a one-calendar solo pro. */
import { describe, expect, it } from "vitest";
import type { FeatureKey } from "@ll/shared";
import { buildMerchantNav } from "../src/lib/dashboard/nav";
import { isAppointmentLed } from "../src/lib/dashboard/people";
import { bookAgainHref, lastFinished } from "../src/lib/people";

const on = new Set<FeatureKey>(["booking.appointments"]);
const keys = (vertical: string, soloCalendar?: boolean) => buildMerchantNav("/m/x", "owner", on, { vertical, plan: "free", soloCalendar }).map((e) => e.key);

describe("people-side nav", () => {
  it("adds Inbox under customers for beauty pros, barbers and salons, not for cafés", () => {
    expect(keys("nails")).toContain("inbox");
    expect(keys("barber")).toContain("inbox");
    expect(keys("cafe")).not.toContain("inbox");
    expect(isAppointmentLed("salon", false)).toBe(false);
  });

  it("hides Staff for a solo pro with one calendar, keeps it otherwise", () => {
    expect(keys("nails", true)).not.toContain("staff");
    expect(keys("nails", false)).toContain("staff");
    expect(keys("nails")).toContain("staff");
  });
});

describe("book again", () => {
  it("goes back to the last finished visit's service and person", () => {
    const v = (status: string, startsAt: string) => ({ status, startsAt, staffId: "s1", items: [{ serviceId: "svc", name: "Fill", durationMin: 60, priceCents: 1 }], merchant: { slug: "lash-bar" } }) as never;
    const last = lastFinished([v("completed", "2026-10-01T10:00:00Z"), v("completed", "2026-10-20T10:00:00Z"), v("booked", "2026-11-20T10:00:00Z")]);
    expect(last).toMatchObject({ startsAt: "2026-10-20T10:00:00Z" });
    expect(bookAgainHref(last!)).toBe("/shops/lash-bar/book?service=svc&staff=s1");
  });
});
