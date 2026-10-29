/** Review requests after a completed appointment (phase-pro P4). The restaurant review types stay in whatsapp.ts. */
import { z } from "zod";

export const REVIEW_REQUESTS_MODES = ["off", "on"] as const;
export type ReviewRequestsMode = (typeof REVIEW_REQUESTS_MODES)[number];

/** Wait this long after a visit before the request goes out (mirrors the API's SEND_DELAY_MS). */
export const APPOINTMENT_REVIEW_DELAY_MS = 2 * 60 * 60_000;

export const appointmentReviewSettingsBody = z.object({
  googleReviewUrl: z.url({ protocol: /^https?$/ }).max(500).nullable().optional(),
  mode: z.enum(REVIEW_REQUESTS_MODES).optional(),
});
export type AppointmentReviewSettingsBody = z.input<typeof appointmentReviewSettingsBody>;

export interface AppointmentReviewSettings {
  googleReviewUrl: string | null;
  mode: ReviewRequestsMode;
  /** The plan includes automatic requests (Pro, Studio or a live trial). On Free the switch is locked. */
  available: boolean;
  /** Last 30 days, appointment requests only. */
  last30: { asked: number; google: number; privateNotes: number };
}

/** What the checkout success state shows: has a request been scheduled for this visit, and when does it go out. */
export interface AppointmentReviewStatus {
  available: boolean;
  scheduled: boolean;
  sendAt: string | null;
}
