/**
 * Messages (cafes-retail.md 7.5): audience chips, the text the composer starts with, the send time default and
 * the length count that includes the footer the server adds. Pure so it is unit-tested.
 */
import { messagingApi } from "@ll/shared";

const { LAPSED_DEFAULT_DAYS, QUIET_HOURS_LABEL, smsFooterText } = messagingApi;

const TZ = "America/Toronto";

export type AudienceKey = "slipping" | "regulars" | "reward_ready" | "all" | "lapsed" | "new";

export const AUDIENCES: { key: AudienceKey; label: string; segment: messagingApi.Segment; more?: boolean }[] = [
  { key: "slipping", label: "Slipping away", segment: { kind: "slipping" } },
  { key: "regulars", label: "Regulars", segment: { kind: "regulars" } },
  { key: "reward_ready", label: "Reward ready", segment: { kind: "reward_ready" } },
  { key: "all", label: "Everyone who agreed", segment: { kind: "all" } },
  { key: "lapsed", label: `Haven't visited in ${LAPSED_DEFAULT_DAYS / 7} weeks`, segment: { kind: "lapsed", days: LAPSED_DEFAULT_DAYS }, more: true },
  { key: "new", label: "New in the last 2 weeks", segment: { kind: "new", days: 14 }, more: true },
];

/** `?segment=` on /messages (Home links with segment=slipping) to the audience it selects. */
export function audienceFromParam(p: string | null | undefined): AudienceKey {
  return AUDIENCES.find((a) => a.key === p)?.key ?? "slipping";
}

/** The chip's count, as the frames word it: "9 can text" on the selected chip, the bare number on the others. */
export function chipLabel(a: { label: string }, recipients: number | null, selected: boolean, channel: messagingApi.Channel): string {
  if (recipients == null) return a.label;
  return selected ? `${a.label} · ${recipients} can ${channel === "sms" ? "text" : channel === "email" ? "email" : "get it"}` : `${a.label} · ${recipients}`;
}

/** What the composer starts with for an audience. `noun` is the reward ("free drink"). */
export function defaultBody(a: AudienceKey, noun = "treat"): string {
  switch (a) {
    case "slipping":
    case "lapsed":
      return `Hi {first_name}, it has been a few weeks. Come in this week and your next ${noun} is on us. Just show your card.`;
    case "regulars":
      return `Hi {first_name}, thanks for being a regular. Come in this week and your next ${noun} is on us. Just show your card.`;
    case "reward_ready":
      return `Hi {first_name}, your ${noun} is ready. Show your card at the counter.`;
    case "new":
      return `Hi {first_name}, thanks for joining. Come back this week and show your card to start earning toward your next ${noun}.`;
    default:
      return `Hi {first_name}, something new is on the counter. Come in this week and try it.`;
  }
}

const VARS = ["first_name", "name", "balance", "terminology", "merchant"];
/** `{first_name}` (what staff type) to `{{first_name}}` (what the API personalises). Double braces pass through. */
export function toApiBody(text: string): string {
  return text.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (m, v: string) => (VARS.includes(v) ? `{{${v}}}` : m));
}

/** Fill the placeholders for the preview bubble. */
export function renderPreview(text: string, who: { firstName: string; name?: string; balance?: number; terminology?: string }, merchant: string): string {
  return toApiBody(text)
    .replace(/\{\{\s*first_name\s*\}\}/g, who.firstName)
    .replace(/\{\{\s*name\s*\}\}/g, who.name ?? who.firstName)
    .replace(/\{\{\s*balance\s*\}\}/g, String(who.balance ?? 0))
    .replace(/\{\{\s*terminology\s*\}\}/g, who.terminology ?? "stamps")
    .replace(/\{\{\s*merchant\s*\}\}/g, merchant);
}

export const SMS_SEGMENT = 160;

/** Characters in what the customer receives: the message, a line break and the footer the server adds. */
export function smsLength(body: string, merchant: string, address: string | null): number {
  return body.length + 1 + `— ${smsFooterText(merchant, address)}`.length;
}

/** "141 of 160 characters, one text per person" / "212 characters, 2 texts per person". */
export function smsCountLine(len: number): string {
  return len <= SMS_SEGMENT ? `${len} of ${SMS_SEGMENT} characters, one text per person` : `${len} characters, ${Math.ceil(len / SMS_SEGMENT)} texts per person`;
}

export { QUIET_HOURS_LABEL };

const hourOf = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Wall-clock Toronto time to an instant (tries EDT then EST). */
export function torontoInstant(date: string, hh: number, mm: number): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  for (const off of [4, 5]) {
    const t = new Date(Date.UTC(y, mo - 1, d, hh + off, mm));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
    if (parts === `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) return t;
  }
  return new Date(Date.UTC(y, mo - 1, d, hh + 5, mm));
}

/**
 * The "Today at" default: the next half hour inside 8 am to 9 pm, or tomorrow at 9 am once that has passed
 * (promotional texts never go out in quiet hours).
 */
export function defaultSendTime(now: Date): { at: Date; label: string } {
  const today = ymd(now);
  const next = new Date(Math.ceil((now.getTime() + 60_000) / 1_800_000) * 1_800_000);
  const nextHour = hourOf(next);
  const nextMinutes = Number(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, minute: "numeric" }).format(next));
  const sameDay = ymd(next) === today;
  const inWindow = sameDay && nextHour >= 8 && (nextHour < 20 || (nextHour === 20 && nextMinutes === 0));
  if (inWindow) return { at: next, label: `Today ${timeLabel(next)}` };
  // Before 8 am today: 9 am today. Otherwise 9 am tomorrow.
  if (hourOf(now) < 8 && sameDay) return { at: torontoInstant(today, 9, 0), label: "Today 9:00 am" };
  const tomorrow = ymd(new Date(now.getTime() + 24 * 3600_000));
  return { at: torontoInstant(tomorrow, 9, 0), label: "Tomorrow 9:00 am" };
}

/** "10:30 am". */
export function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d).replace(/\./g, "").replace("a m", "am").replace("p m", "pm");
}

/** Is this instant inside quiet hours (9 pm to 8 am Toronto)? */
export function inQuiet(d: Date): boolean {
  const h = hourOf(d);
  return h >= 21 || h < 8;
}

/** "Schedule 9 texts" / "Send 9 emails". */
export function sendLabel(mode: "now" | "at" | "pick", n: number, channel: messagingApi.Channel): string {
  const noun = channel === "sms" ? "text" : channel === "email" ? "email" : "message";
  return `${mode === "now" ? "Send" : "Schedule"} ${n} ${noun}${n === 1 ? "" : "s"}`;
}
