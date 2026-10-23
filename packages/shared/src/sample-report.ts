/**
 * The sample board report shown on /for-bias and the landing page. Every number here is made up to show what the
 * report looks like; the UI must show a "Sample data" tag whenever `sample` is true. It is typed as a real
 * `CampaignReport`, so the sample and the real report render through the same component.
 *
 * The totals are consistent with the per-shop rows (visits 1,420 = sum of the nine shops, 1,029 before).
 */
import type { CampaignReport } from "./api/campaigns.js";

export type SampleBoardReport = CampaignReport & { sample: true; title: string };

const SHOPS = [
  ["Café", 330, 240, 190, 24],
  ["Bakery", 290, 215, 160, 20],
  ["Books", 210, 150, 120, 14],
  ["Florist", 170, 125, 100, 12],
  ["Pharmacy", 130, 95, 75, 9],
  ["Hardware", 100, 75, 60, 7],
  ["Salon", 80, 60, 45, 5],
  ["Deli", 60, 40, 35, 3],
  ["Repair", 50, 29, 30, 2],
] as const;

export const SAMPLE_BOARD_REPORT: SampleBoardReport = {
  sample: true,
  title: "Passport week",
  campaignId: "sample",
  window: { startsAt: "2025-10-10T04:00:00.000Z", endsAt: "2025-10-17T04:00:00.000Z" },
  baselineWindow: { startsAt: "2025-10-03T04:00:00.000Z", endsAt: "2025-10-10T04:00:00.000Z" },
  visits: 1420,
  baselineVisits: 1029,
  visitLiftPct: 38,
  uniqueCustomers: 412,
  baselineUniqueCustomers: 305,
  newMembers: 96,
  baselineNewMembers: 31,
  participants: 412,
  completions: 96,
  bonusPointsIssued: 9850,
  returnedWithin30d: 157,
  returnedWithin30dPct: 38.1,
  returnWindowEndsAt: "2025-11-16T04:00:00.000Z",
  baselineReturnedWithin30d: 98,
  baselineReturnedWithin30dPct: 32.1,
  perMerchant: SHOPS.map(([name, visits, baselineVisits, uniqueCustomers, newMembers]) => ({
    merchantId: `sample-${name.toLowerCase()}`,
    name,
    visits,
    baselineVisits,
    uniqueCustomers,
    newMembers,
  })),
};
