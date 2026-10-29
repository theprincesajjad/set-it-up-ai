/**
 * The Sunday report: one push and one single-column email from a WeekInsight (docs/business/pro-value.md 5.5).
 * Pure: no database, no clock. The copy is in the shared catalogue (`insights.*`), in the owner's own language.
 */
import { BRAND, DATE_NAMES, formatCurrency, reportsApi, t, type Locale } from "@ll/shared";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** A weekday's name in a language (0 = Sunday). */
export function weekdayName(locale: Locale, weekday: number): string {
  if (locale !== "en") return DATE_NAMES[locale].weekdaysLong[weekday]!;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday]!;
}

/** "$240 ahead of last week", "$80 behind last week", "the same as last week" or "a quiet week". */
export function deltaPhrase(locale: Locale, w: Pick<reportsApi.WeekInsight, "deltaCents" | "revenueCents" | "previous">): string {
  if (w.deltaCents > 0) return t(locale, "insights.line.ahead", { amount: formatCurrency(locale, w.deltaCents) });
  if (w.deltaCents < 0) return t(locale, "insights.line.behind", { amount: formatCurrency(locale, -w.deltaCents) });
  return w.revenueCents === 0 && w.previous.revenueCents === 0 ? t(locale, "insights.line.quiet") : t(locale, "insights.line.same");
}

/** The signal lines worth saying (a count of zero is left out), in the order of 5.5. */
export function signalParts(locale: Locale, s: reportsApi.WeekInsight["signals"]): string[] {
  const money = (c: number) => formatCurrency(locale, c);
  const parts: string[] = [];
  if (s.waitlist_fills.count > 0) parts.push(t(locale, "insights.part.fills", { n: s.waitlist_fills.count, amount: money(s.waitlist_fills.amountCents) }));
  if (s.rebook_booked.count > 0) parts.push(t(locale, "insights.part.rebooked", { n: s.rebook_booked.count, amount: money(s.rebook_booked.amountCents) }));
  if (s.reviews_requested.count > 0) parts.push(t(locale, "insights.part.reviews", { n: s.reviews_requested.count, google: s.reviews_google.count }));
  if (s.addons_sold.count > 0) parts.push(t(locale, "insights.part.addons", { n: s.addons_sold.count, amount: money(s.addons_sold.amountCents) }));
  return parts;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface WeeklyReportMessage {
  pushTitle: string;
  pushBody: string;
  subject: string;
  text: string;
  html: string;
}

export function weeklyReportMessage(
  w: reportsApi.WeekInsight,
  o: { shop: string; locale: Locale; reportUrl: string; settingsUrl: string; promoUrl: (weekday: number) => string; reportWeekday: number },
): WeeklyReportMessage {
  const { locale: l } = o;
  const amount = formatCurrency(l, w.revenueCents);
  const delta = deltaPhrase(l, w);
  const headline = t(l, "insights.email.headline", { shop: o.shop, amount, delta });
  const counts = t(l, "insights.email.counts", { visits: w.visits, fresh: w.newClients });
  const goal = w.goal.cents && w.goal.progress != null ? t(l, w.goal.reached ? "insights.email.goalReached" : "insights.email.goal", { progress: Math.round(w.goal.progress * 100), goal: formatCurrency(l, w.goal.cents) }) : null;
  const parts = signalParts(l, w.signals);
  const best = w.bestDayToPromote;
  const day = best ? weekdayName(l, best.weekday) : null;
  const quiet = best && day ? t(l, w.promosLeft > 0 ? "insights.email.quietPromo" : "insights.email.quiet", { day, n: w.promosLeft }) : null;
  const promoCta = best && day && w.promosLeft > 0 ? { label: t(l, "insights.email.promoCta", { day }), url: o.promoUrl(best.weekday) } : null;
  const foot = t(l, "insights.email.foot", { weekday: weekdayName(l, o.reportWeekday), settings: o.settingsUrl });
  const openLabel = t(l, "insights.email.open");

  const lines = [headline, "", [counts, goal].filter(Boolean).join(" · "), parts.length ? parts.join(" · ") : null, quiet, "", promoCta ? `${promoCta.label}: ${promoCta.url}` : null, `${openLabel}: ${o.reportUrl}`, "", "--", foot, BRAND.name];
  const text = lines.filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n");

  const p = (s: string, style = "") => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;${style}">${esc(s)}</p>`;
  const button = (label: string, url: string, solid: boolean) =>
    `<a href="${esc(url)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 20px;border-radius:22px;font-size:15px;font-weight:600;text-decoration:none;margin:0 8px 8px 0;${solid ? "background:#17171a;color:#ffffff;" : "background:#f2f2f7;color:#17171a;"}">${esc(label)}</a>`;
  const html = `<!doctype html><html lang="${l}"${l === "ur" ? ' dir="rtl"' : ""}><body style="margin:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17171a;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;"><div style="background:#ffffff;border-radius:20px;padding:24px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;">${esc(headline)}</h1>
${p([counts, goal].filter(Boolean).join(" · "), "color:#54545a;")}
${parts.length ? p(parts.join(" · ")) : ""}
${quiet ? p(quiet) : ""}
<div style="margin-top:16px;">${promoCta ? button(promoCta.label, promoCta.url, true) : ""}${button(openLabel, o.reportUrl, !promoCta)}</div>
</div><p style="margin:16px 8px 0;font-size:12px;line-height:16px;color:#54545a;">${esc(foot)}</p></div></body></html>`;

  return {
    pushTitle: t(l, "insights.push.title", { shop: o.shop }),
    pushBody: t(l, "insights.push.body", { amount, delta }),
    subject: headline,
    text,
    html,
  };
}
