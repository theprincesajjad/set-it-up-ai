/** phase-solo D: the Inbox entry for appointment-led shops, and no Staff page for a one-calendar solo pro. */
import { describe, expect, it } from "vitest";
import { FEATURES, type FeatureKey } from "@ll/shared";
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
  it("a brow tech on the paid plan gets her own tools, not the café, studio or barbershop sections (final audit)", () => {
    // What the annual plan unlocks for her (every Pro feature; the restaurant and grocery packs are add-ons she does not have).
    const all = new Set((Object.keys(FEATURES) as FeatureKey[]).filter((k) => ["free", "plus"].includes((FEATURES[k] as { minPlan?: string }).minPlan ?? "free") && !k.startsWith("restaurant.") && !k.startsWith("grocery.")));
    const paid = (vertical: string, soloCalendar: boolean) => buildMerchantNav("/m/x", "owner", all, { vertical, plan: "plus", soloCalendar }).map((e) => e.key);
    const k = paid("brows_lashes", true);
    for (const gone of ["orders", "catalog", "payouts", "classes", "class-offers", "class-door", "slots", "tickets"]) expect(k, gone).not.toContain(gone);
    // The walk-in line and payouts are Studio features since phase-pro P1: not in her Pro sidebar.
    for (const kept of ["calendar", "services", "customers", "inbox", "messages", "site"]) expect(k, kept).toContain(kept);
    expect(k).not.toContain("queue");
    const studio = new Set([...all, ...(Object.keys(FEATURES) as FeatureKey[]).filter((x) => FEATURES[x].minPlan === "studio" && !x.startsWith("grocery."))]);
    expect(buildMerchantNav("/m/x", "owner", studio, { vertical: "nails", plan: "studio", soloCalendar: false }).map((e) => e.key)).toContain("payouts");
    expect(buildMerchantNav("/m/x", "owner", studio, { vertical: "barber", plan: "studio", soloCalendar: true }).map((e) => e.key)).toContain("queue");
    expect(paid("barber", true)).toContain("classes");
  });
  it("a café on Free keeps its loyalty-first sidebar although one calendar is free for everyone; a groomer and a nail tech keep the calendar", () => {
    const free = (vertical: string, plan: "free" | "plus" = "free") => buildMerchantNav("/m/x", "owner", on, { vertical, plan }).map((e) => e.key);
    expect(free("cafe")).not.toContain("calendar");
    expect(free("bakery")).not.toContain("services");
    expect(free("cafe", "plus")).toContain("calendar");
    expect(free("pet")).toContain("calendar");
    expect(free("nails")).toContain("calendar");
  });
  it("keeps Settings above its sub-rows when Staff is hidden (final audit: it fell below POS & integrations and Billing)", () => {
    for (const solo of [true, false]) {
      const k = keys("nails", solo);
      expect(k.indexOf("settings"), String(solo)).toBeLessThan(k.indexOf("integrations"));
      expect(k.indexOf("settings"), String(solo)).toBeLessThan(k.indexOf("billing"));
    }
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
