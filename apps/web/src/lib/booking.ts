/** The customer booking logic lives in @ll/shared so the web flow and the phone app share it. */
import { bookingLogic } from "@ll/shared";

export const { staffDoes, serviceFor, summarize, groupServices, durationText, nextDays, timesOn, buildIcs, totalText } = bookingLogic;
export type PublicService = bookingLogic.PublicService;
export type PublicStaff = bookingLogic.PublicStaff;
export type Selection = bookingLogic.Selection;

const HOUR = new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: "America/Toronto" });
/** Morning before noon, afternoon until 5 pm, evening after (shop time): how the time pickers group a long list of times. */
export function dayPart(iso: string): "morning" | "afternoon" | "evening" {
  const h = Number(HOUR.format(new Date(iso)));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
