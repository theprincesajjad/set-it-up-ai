/**
 * The Sunday report (docs/business/pro-value.md 5.5). Every 15 minutes: for each active shop whose local weekday and hour (merchants.
 * weekly_report_weekday and _hour, default Sunday 18:00) have come, and whose plan has insights.weekly (Pro, Studio and the trial),
 * send the owner a push and an email with the week's numbers. Free shops get nothing. A shop is sent at most once a week (a milestone
 * `weekly_report:<monday>` claims it first), and a quiet week (no money, no visits, no signals) sends nothing: there is nothing to say.
 */
import { eq } from "drizzle-orm";
import { merchantMilestones, merchants, pushTokens } from "@ll/db";
import { SIGNAL_KEYS, normalizeLocale } from "@ll/shared";
import type { AppContext } from "../context.js";
import { weekReport } from "../services/insights.js";
import { enabledFeaturesFor } from "../services/features.js";
import { localDate, weekStartOf } from "../services/signals.js";
import { weeklyReportMessage } from "../services/email-templates/weekly-report.js";
import { soloOwner } from "../services/onboarding-solo.js";
import type { Job } from "./index.js";

/** The report goes out in the report hour or the two after it (a restart or a slow pass does not lose the week). */
const SEND_WINDOW_HOURS = 3;

function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
}

export async function runWeeklyReports(ctx: AppContext): Promise<{ sent: number }> {
  const now = ctx.now();
  const all = await ctx.db.select().from(merchants).where(eq(merchants.status, "active"));
  const due = all.filter((m) => {
    const hour = localHour(now, m.timezone);
    return localDate(now, m.timezone).weekday === m.weeklyReportWeekday && hour >= m.weeklyReportHour && hour < m.weeklyReportHour + SEND_WINDOW_HOURS;
  });
  if (!due.length) return { sent: 0 };
  const features = await enabledFeaturesFor(ctx.db, due, ["insights.weekly"]);
  const web = ctx.config.publicWebUrl.replace(/\/$/, "");
  let sent = 0;
  for (const m of due) {
    if (!features.get(m.id)?.has("insights.weekly")) continue;
    try {
      const week = weekStartOf(now, m.timezone);
      const owner = await soloOwner(ctx.db, m.id);
      if (!owner) continue;
      const report = await weekReport(ctx, m);
      const quiet = report.revenueCents === 0 && report.visits === 0 && SIGNAL_KEYS.every((k) => report.signals[k].count === 0);
      // Claim the week first so a second worker or the next pass cannot send it twice.
      const claim = await ctx.db.insert(merchantMilestones).values({ merchantId: m.id, key: `weekly_report:${week}`, reachedAt: now, data: { quiet } }).onConflictDoNothing().returning({ id: merchantMilestones.id });
      if (!claim.length || quiet) continue;
      const locale = normalizeLocale(owner.locale) ?? "en";
      const base = `${web}/m/${m.id}`;
      const msg = weeklyReportMessage(report, {
        shop: m.name,
        locale,
        reportUrl: `${base}/reports/week`,
        settingsUrl: `${base}/settings/goal`,
        promoUrl: (weekday) => `${base}/promos/new?day=${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekday]}`,
        reportWeekday: m.weeklyReportWeekday,
      });
      const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, owner.userId));
      if (tokens.length) {
        await ctx.providers.push
          .send(tokens.map((x) => ({ token: x.token, title: msg.pushTitle, body: msg.pushBody, data: { type: "weekly_report", url: `/m/${m.id}/reports/week` }, priority: "normal" as const })))
          .catch((err) => console.error("[weekly-report.push]", m.id, err));
      }
      if (owner.email) await ctx.providers.email.send({ to: owner.email, subject: msg.subject, text: msg.text, html: msg.html });
      sent += 1;
    } catch (err) {
      console.error("[weekly-report]", m.id, err);
    }
  }
  return { sent };
}

export const weeklyReportJobs: Job[] = [{ name: "insights.weekly_report", everyMs: 15 * 60_000, run: async (ctx) => void (await runWeeklyReports(ctx)) }];
