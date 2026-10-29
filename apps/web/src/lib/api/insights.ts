/** The weekly money report (docs/business/pro-value.md 3.2 P6). Spread into `merchantEndpoints` as `api.insights`. Contract: @ll/shared reportsApi. */
import type { reportsApi } from "@ll/shared";
import type { ApiClient } from "./client";

export function insightsEndpoints(c: ApiClient, b: string) {
  return {
    insights: {
      /** One week (default: this week); `start` is any date in it. */
      week: (start?: string) => c.get<reportsApi.WeekInsight>(`${b}/insights/week`, { query: start ? { start } : {} }),
      /** The 14-day trial receipt. */
      trial: () => c.get<reportsApi.TrialReceiptDto>(`${b}/insights/week`, { query: { trial: 1 } }),
      /** The last N weeks (the weekly report: Pro, Studio and the trial). */
      weeks: (weeks = 12) => c.get<reportsApi.WeeksHistory>(`${b}/insights/weeks`, { query: { weeks } }),
      saveSettings: (body: reportsApi.InsightsSettingsBody) => c.put<{ weeklyGoalCents: number | null; weeklyReportWeekday: number; weeklyReportHour: number }>(`${b}/insights/settings`, body),
    },
  };
}
