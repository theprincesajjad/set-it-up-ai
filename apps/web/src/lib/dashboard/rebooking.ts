/** Words for the rebooking page, from the server's rows. Pure so it is unit-tested. */
import { LOCALES, type Locale, type serviceApi } from "@ll/shared";

export const initials = (name: string | null | undefined): string => {
  const p = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0]![0]! + (p.length > 1 ? p[p.length - 1]![0]! : "")).toUpperCase() : "?";
};

/** "Due Oct 15, 12 days late" / "Due today" / "Due Fri". */
export function dueLabel(r: Pick<serviceApi.RebookingRowDto, "dueOn" | "daysLate">): { text: string; late: boolean } {
  const d = new Date(`${r.dueOn}T12:00:00Z`);
  const md = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
  if (r.daysLate > 0) return { text: `Due ${md}, ${r.daysLate} ${r.daysLate === 1 ? "day" : "days"} late`, late: true };
  if (r.daysLate === 0) return { text: "Due today", late: false };
  return { text: `Due ${new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short" }).format(d)}`, late: false };
}

export function weeksAgo(iso: string, now: Date): string {
  const w = Math.max(1, Math.round((now.getTime() - new Date(iso).getTime()) / (7 * 86_400_000)));
  return `${w} ${w === 1 ? "week" : "weeks"} ago`;
}

export const channelLabel = (r: Pick<serviceApi.RebookingRowDto, "channel" | "language" | "canSend">): string => (r.canSend ? `${r.channel === "sms" ? "SMS" : "Push"} · ${LOCALES[r.language as Locale]?.englishName ?? "English"}` : "No consent");

export const ruleWeeks = (days: number | null): number | null => (days ? Math.max(1, Math.round(days / 7)) : null);
export const DEFAULT_RULE_DAYS = 28;
