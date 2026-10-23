import { describe, expect, it } from "vitest";
import { BRAND, SAMPLE_BOARD_REPORT, campaignsApi, repApi } from "../src/index.js";

describe("sample board report", () => {
  const r = SAMPLE_BOARD_REPORT;
  it("is flagged as sample data and has per-shop rows that add up to the totals", () => {
    expect(r.sample).toBe(true);
    expect(r.perMerchant.reduce((n, m) => n + m.visits, 0)).toBe(r.visits);
    expect(r.perMerchant.reduce((n, m) => n + m.baselineVisits, 0)).toBe(r.baselineVisits);
    expect(r.perMerchant.reduce((n, m) => n + m.newMembers, 0)).toBe(r.newMembers);
    expect(Math.round(((r.visits - r.baselineVisits) / r.baselineVisits) * 1000) / 10).toBe(r.visitLiftPct);
    expect(r.completions).toBeLessThanOrEqual(r.participants);
    expect(r.returnedWithin30d).toBeLessThanOrEqual(r.uniqueCustomers);
    expect(Math.round(((r.returnedWithin30d ?? 0) / r.uniqueCustomers) * 1000) / 10).toBe(r.returnedWithin30dPct);
  });
  it("uses the same window length before and during", () => {
    const len = (w: { startsAt: string; endsAt: string }) => new Date(w.endsAt).getTime() - new Date(w.startsAt).getTime();
    expect(len(r.window)).toBe(len(r.baselineWindow));
    expect(new Date(r.returnWindowEndsAt).getTime() - new Date(r.window.endsAt).getTime()).toBe(30 * 86_400_000);
  });
});

describe("unlock thresholds", () => {
  it("are the four per-street gates", () => {
    expect(campaignsApi.UNLOCK_PER_NEIGHBOURHOOD).toEqual({ liveMonths: 6, activeShops: 20, activeCustomers: 1500, multiShopPct: 25 });
  });
});

describe("period queries", () => {
  it("default to the last 30 days, reject backwards and over-long periods, and know csv and json", () => {
    expect(campaignsApi.periodQuery.safeParse({}).success).toBe(true);
    expect(campaignsApi.periodQuery.safeParse({ from: "2026-10-01", to: "2026-09-01" }).success).toBe(false);
    expect(campaignsApi.periodQuery.safeParse({ from: "2024-01-01", to: "2026-01-01" }).success).toBe(false);
    expect(campaignsApi.periodQuery.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(true);
    expect(campaignsApi.reportQuery.parse({}).format).toBe("json");
    expect(campaignsApi.reportQuery.safeParse({ format: "pdf" }).success).toBe(false);
  });
});

describe("public lead body", () => {
  const ok = { businessName: "Karahi House", kind: "restaurant", phone: "+14165550188", language: "ur" } as const;
  it("takes a restaurant lead with a language, and needs a phone for it", () => {
    expect(repApi.publicLeadBody.safeParse(ok).success).toBe(true);
    expect(repApi.publicLeadBody.safeParse({ ...ok, phone: undefined, email: "a@example.com" }).success).toBe(false);
    expect(repApi.publicLeadBody.safeParse({ ...ok, language: "fr" }).success).toBe(false);
  });
  it("takes a BIA lead with a role, dates and a member count", () => {
    const bia = { businessName: "Roncesvalles Village BIA", kind: "bia", email: "m@example.com", role: "Executive director", boardMeetingAt: "2026-11-20", eventDate: "2026-12-05", memberCount: 74 } as const;
    expect(repApi.publicLeadBody.safeParse(bia).success).toBe(true);
    expect(repApi.publicLeadBody.safeParse({ ...bia, boardMeetingAt: "November" }).success).toBe(false);
    expect(repApi.publicLeadBody.safeParse({ ...bia, memberCount: 0 }).success).toBe(false);
  });
});

describe("brand", () => {
  it("has a digits-only WhatsApp number for wa.me", () => {
    expect(BRAND.whatsappNumber).toMatch(/^\d{10,15}$/);
  });
});
