import type { campaignsApi } from "@ll/shared";

/** Rows for the campaign report CSV (shops, totals, lift and the 30-day return). Shared by the real report and the sample. */
export function campaignReportRows(r: campaignsApi.CampaignReport): (string | number | null)[][] {
  return [
    ["shop", "visits", "baseline_visits", "customers", "new_members"],
    ...r.perMerchant.map((m) => [m.name, m.visits, m.baselineVisits, m.uniqueCustomers, m.newMembers]),
    [],
    ["total", r.visits, r.baselineVisits, r.uniqueCustomers, r.newMembers],
    ["lift_pct", r.visitLiftPct ?? ""],
    ["came_back_within_30_days", r.returnedWithin30d ?? "", r.returnedWithin30dPct ?? "", `available_from_${r.returnWindowEndsAt.slice(0, 10)}`],
  ];
}
