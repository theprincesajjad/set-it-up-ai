/**
 * phase-pro P1 · The trial's clock (docs/business/pro-value.md §2.2, §5.4). Hourly:
 *  - end every trial whose trial_ends_at has passed (services/trial.ts endExpiredTrials writes the `trial_ended` milestone), and send
 *    the receipt: the 14 days' numbers from P6's trialReceipt, by push and email to the owner, in the owner's language;
 *  - start the trial for a shop whose link went live but whose trial did not start (startMissedTrials).
 */
import { eq } from "drizzle-orm";
import { pushTokens } from "@ll/db";
import { PLANS, formatCurrency, normalizeLocale, t, type Locale, type reportsApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { trialReceipt } from "../services/insights.js";
import { soloOwner } from "../services/onboarding-solo.js";
import { endExpiredTrials, startMissedTrials } from "../services/trial.js";
import type { Job } from "./index.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface TrialReceiptMessage {
  pushTitle: string;
  pushBody: string;
  subject: string;
  text: string;
  html: string;
}

/** The receipt (pro-value.md §5.4), pure: the Sunday report's layout, the 14 days' numbers, the price from PLANS. */
export function trialReceiptMessage(r: reportsApi.TrialReceiptDto, o: { locale: Locale; billingUrl: string }): TrialReceiptMessage {
  const l = o.locale;
  const price = formatCurrency(l, PLANS.plus.priceCents);
  const title = t(l, "trial.receipt.title");
  const summary = t(l, "trial.receipt.summary", { days: r.days, bookings: r.bookings, amount: formatCurrency(l, r.amountCents) });
  const parts = t(l, "trial.receipt.parts", { fills: r.fills, rebooked: r.rebooked, reviews: r.reviews, addons: r.addons });
  const paused = t(l, "trial.receipt.paused");
  const cta = t(l, "trial.receipt.cta", { price, plan: PLANS.plus.name });
  const text = [title, "", summary, parts, "", paused, "", `${cta}: ${o.billingUrl}`].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
<p style="margin:0 0 4px;font-weight:600">${esc(summary)}</p>
<p style="margin:0 0 16px">${esc(parts)}</p>
<p style="margin:0 0 20px;color:#444">${esc(paused)}</p>
<p style="margin:0"><a href="${esc(o.billingUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111;color:#fff;text-decoration:none">${esc(cta)}</a></p>
</div>`;
  return { pushTitle: title, pushBody: summary, subject: title, text, html };
}

export async function runTrialJob(ctx: AppContext): Promise<{ ended: number; receipts: number; started: number }> {
  const started = await startMissedTrials(ctx);
  const ended = await endExpiredTrials(ctx);
  const web = ctx.config.publicWebUrl.replace(/\/$/, "");
  let receipts = 0;
  for (const m of ended) {
    try {
      const owner = await soloOwner(ctx.db, m.id);
      if (!owner) continue;
      const receipt = await trialReceipt(ctx, m);
      const locale = normalizeLocale(owner.locale) ?? "en";
      const billingUrl = `${web}/m/${m.id}/billing?plan=plus`;
      const msg = trialReceiptMessage(receipt, { locale, billingUrl });
      const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, owner.userId));
      if (tokens.length) {
        await ctx.providers.push
          .send(tokens.map((x) => ({ token: x.token, title: msg.pushTitle, body: msg.pushBody, data: { type: "trial_ended", url: `/m/${m.id}/billing` }, priority: "normal" as const })))
          .catch((err) => console.error("[trial.push]", m.id, err));
      }
      if (owner.email) await ctx.providers.email.send({ to: owner.email, subject: msg.subject, text: msg.text, html: msg.html });
      receipts += 1;
    } catch (err) {
      console.error("[trial.receipt]", m.id, err);
    }
  }
  return { ended: ended.length, receipts, started };
}

export const billingTrialJobs: Job[] = [{ name: "billing.trial", everyMs: 60 * 60_000, run: async (ctx) => void (await runTrialJob(ctx)) }];
