/** Review requests after a visit (phase-pro P4): the owner endpoints and the words around them. */
import type { reviewsApi } from "@ll/shared";
import type { ApiClient } from "@/lib/api/client";

const enc = encodeURIComponent;

export function appointmentReviewsApi(c: ApiClient, merchantId: string) {
  const b = `/v1/merchants/${enc(merchantId)}/reviews/appointments`;
  return {
    settings: () => c.get<reviewsApi.AppointmentReviewSettings>(`${b}/settings`),
    save: (body: reviewsApi.AppointmentReviewSettingsBody) => c.put<reviewsApi.AppointmentReviewSettings>(`${b}/settings`, body),
    /** The checkout success line: is a request waiting for this visit, and when does it go out. */
    status: (appointmentId: string) => c.get<reviewsApi.AppointmentReviewStatus>(`${b}/${enc(appointmentId)}`),
  };
}

/** The first word of a client's name ("Ayesha Rao" -> "Ayesha"); "your client" when there is none. */
export const firstName = (name: string | null | undefined, fallback: string): string => name?.trim().split(/\s+/)[0] || fallback;

/** A link that Google's own "Ask for reviews" would hand out: https only. Empty is fine (it clears the link). */
export const looksLikeLink = (v: string): boolean => !v.trim() || /^https:\/\/[^\s.]+\.[^\s]+$/i.test(v.trim());
