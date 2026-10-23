/** The customer booking logic lives in @ll/shared so the web flow and the phone app share it. */
import { bookingLogic } from "@ll/shared";

export const { staffDoes, serviceFor, summarize, groupServices, durationText, nextDays, timesOn, buildIcs } = bookingLogic;
export type PublicService = bookingLogic.PublicService;
export type PublicStaff = bookingLogic.PublicStaff;
export type Selection = bookingLogic.Selection;
