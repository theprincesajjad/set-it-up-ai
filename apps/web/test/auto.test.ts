import { describe, expect, it } from "vitest";
import { buildMerchantNav, canOpen, enabledSet, navVisible } from "../src/lib/dashboard/nav";
import { dayLabel, dueText, kmLabel, overText, planStateLabel, reminderTag, seasonLabel, shortDate, treadTag, windowLabel } from "../src/lib/dashboard/auto";

describe("auto care helpers", () => {
  it("formats days and km without a time zone shift", () => {
    expect(shortDate("2026-12-08")).toBe("Dec 8");
    expect(dayLabel("2026-11-01")).toBe("Sun, Nov 1");
    expect(kmLabel(84210)).toBe("84,210 km");
    expect(kmLabel(null)).toBe("");
    expect(windowLabel({ name: "fall", start: "2026-10-15", end: "2026-11-30" })).toBe("Fall window Oct 15 to Nov 30");
  });
  it("says why a service is due and how far away", () => {
    expect(dueText({ dueOn: "2026-12-08", basis: "km", daysToDue: 46 })).toBe("Dec 8 by km (in 46 days)");
    expect(dueText({ dueOn: "2027-04-14", basis: "months", daysToDue: 1 })).toBe("Apr 14 by months (in 1 day)");
    expect(dueText({ dueOn: "2026-07-05", basis: "months", daysToDue: -114 })).toBe("Jul 5 by months (114 days ago)");
    expect(dueText({ dueOn: null, basis: null, daysToDue: null })).toBe("Log a service to start the reminder");
    expect(reminderTag("overdue").tone).toBe("negative");
    expect(reminderTag("due_soon").label).toBe("Due soon");
    expect(reminderTag("unknown").label).toBe("Not logged yet");
  });
  it("labels tread, seasons and the estimate comparison", () => {
    expect(treadTag("replace_soon").label).toBe("Replace soon");
    expect(treadTag("wear_bar").tone).toBe("negative");
    expect(seasonLabel("all_weather")).toBe("All-weather");
    expect(overText(3.6)).toBe("3.6% over the estimate (limit 10%)");
    expect(overText(-2)).toBe("2% under the estimate");
    expect(overText(0)).toBe("Same as the estimate");
    expect(planStateLabel("past_due")).toBe("Past due");
  });
});

describe("auto care navigation", () => {
  const garage = enabledSet([{ key: "auto.vehicles", enabled: true }, { key: "auto.tires", enabled: true }, { key: "service.tickets", enabled: true }]);
  const wash = enabledSet([{ key: "auto.vehicles", enabled: true }, { key: "auto.wash", enabled: true }, { key: "booking.classes", enabled: true }, { key: "memberships.recurring", enabled: true }]);
  const keys = (e: ReturnType<typeof buildMerchantNav>) => e.map((x) => x.key);
  it("a garage sees vehicles, reminders and tire season, not the wash", () => {
    const k = keys(buildMerchantNav("/m/1", "owner", garage, { vertical: "repair_auto", plan: "pro" }));
    expect(k).toEqual(expect.arrayContaining(["vehicles", "service-reminders", "tire-season", "tickets"]));
    expect(k).not.toContain("wash");
  });
  it("a car wash sees vehicles, the wash desk and plans, not tire season", () => {
    const k = keys(buildMerchantNav("/m/1", "owner", wash, { vertical: "car_wash", plan: "plus" }));
    expect(k).toEqual(expect.arrayContaining(["vehicles", "wash", "class-offers"]));
    expect(k).not.toContain("tire-season");
  });
  it("front-desk staff get the auto pages their shop has", () => {
    const k = keys(buildMerchantNav("/m/1", "staff", wash, { vertical: "car_wash", plan: "plus" }));
    expect(k).toContain("wash");
    for (const key of ["vehicles", "service-reminders", "tire-season", "wash"]) expect(canOpen("staff", key)).toBe(true);
  });
  it("hidden without the feature", () => {
    expect(navVisible("wash", enabledSet([]))).toBe(false);
    expect(navVisible("tire-season", enabledSet([]))).toBe(false);
  });
});
