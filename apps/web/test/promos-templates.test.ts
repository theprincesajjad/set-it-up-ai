import { describe, expect, it } from "vitest";
import { PROMO_TEMPLATES, promoStatusLine, promoWhen, signedVisits, templateDraft, templatesFor, validatePromo } from "@/lib/dashboard/promos";

const p = (o: Partial<Parameters<typeof promoWhen>[0]> = {}) => ({ daysOfWeek: null, startTime: null, endTime: null, startsAt: "2026-10-01T04:00:00Z", endsAt: null, ...o });

describe("promo templates", () => {
  it("has the four templates and hides Bring a friend without referrals", () => {
    expect(PROMO_TEMPLATES.map((t) => t.title)).toEqual(["Slow afternoons", "Bring a friend", "Add a pastry", "Quiet Mondays"]);
    expect(templatesFor(true)).toHaveLength(4);
    expect(templatesFor(false).map((t) => t.key)).toEqual(["slow_afternoons", "add_pastry", "quiet_mondays"]);
  });

  it("pre-fills the rule, hours and weekdays, and every template passes the editor's validation", () => {
    const slow = templateDraft("slow_afternoons");
    expect(slow).toMatchObject({ kind: "multiplier", multiplier: "2", daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00" });
    expect(templateDraft("quiet_mondays").daysOfWeek).toEqual([1]);
    expect(templateDraft("add_pastry")).toMatchObject({ kind: "bonus_points", bonusPoints: "1" });
    for (const t of PROMO_TEMPLATES) expect(validatePromo(templateDraft(t.key))).toEqual({});
    // An unknown template is just a blank promo.
    expect(templateDraft("nope").title).toBe("");
  });
});

describe("promo table text", () => {
  it("says when a promo runs", () => {
    expect(promoWhen(p({ daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00" }))).toBe("Weekdays 2 to 4 pm");
    expect(promoWhen(p({ daysOfWeek: [2] }))).toBe("Tuesdays, all day");
    expect(promoWhen(p({ startsAt: "2026-10-01T04:00:00Z", endsAt: "2026-10-12T20:00:00Z" }))).toBe("Oct 1 to 12, all day");
    expect(promoWhen(p({ startsAt: "2026-09-28T04:00:00Z", endsAt: "2026-10-12T20:00:00Z" }))).toBe("Sep 28 to Oct 12, all day");
    expect(promoWhen(p({ daysOfWeek: [0, 6], startTime: "08:00", endTime: "12:00" }))).toBe("Weekends 8 am to 12 pm");
    expect(promoWhen(p({ daysOfWeek: [1, 3], startTime: "09:30", endTime: "11:00" }))).toBe("Mon, Wed 9:30 to 11 am");
    expect(promoWhen(p())).toBe("Every day, all day");
  });

  it("writes the status line", () => {
    expect(promoStatusLine({ status: "live", startsAt: "2026-10-01T04:00:00Z", endsAt: "2026-10-29T20:00:00Z" })).toBe("Live · until Oct 29");
    expect(promoStatusLine({ status: "live", startsAt: "2026-10-01T04:00:00Z", endsAt: null })).toBe("Live · no end date");
    expect(promoStatusLine({ status: "ended", startsAt: "2026-10-01T04:00:00Z", endsAt: "2026-10-12T20:00:00Z" })).toBe("Ended Oct 12");
  });

  it("signs extra visits", () => {
    expect([22, 0, -3].map(signedVisits)).toEqual(["+22", "0", "-3"]);
  });
});
