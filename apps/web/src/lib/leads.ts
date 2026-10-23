import { LOCALES, repApi, type Locale } from "@ll/shared";

/** Whole days from `now` to a lead's next board meeting (YYYY-MM-DD, end of that day). Null when there is none. */
export function boardMeetingInDays(lead: Pick<repApi.Lead, "boardMeetingAt">, now: Date = new Date()): number | null {
  if (!lead.boardMeetingAt) return null;
  return Math.floor((new Date(`${lead.boardMeetingAt}T23:59:59`).getTime() - now.getTime()) / 86_400_000);
}

/** A BIA lead whose board meets within 30 days (and has not passed) is flagged: the report deadline is close. */
export function boardMeetingSoon(lead: Pick<repApi.Lead, "boardMeetingAt">, now: Date = new Date()): boolean {
  const d = boardMeetingInDays(lead, now);
  return d !== null && d >= 0 && d < repApi.BOARD_MEETING_SOON_DAYS;
}

/** "Urdu" for a lead's language code. */
export const leadLanguageName = (code: string | null | undefined): string | null => (code && code in LOCALES ? LOCALES[code as Locale].englishName : null);
