/**
 * How long we keep personal information. This is the one place the periods are set: the jobs in
 * apps/api/src/jobs/retention.ts read it, and the privacy policy (docs/legal/privacy-policy.md, section 6)
 * prints it through {{retention.*}} tokens (legal-tokens.ts), so the page and the deletion cannot drift.
 * Change a number here and both change. Tests (apps/api/test/retention.test.ts, apps/web/test/legal-pages.test.ts)
 * fail if either side stops using this file.
 */
export const RETENTION = {
  /** Phone-call transcript and the drafted order text, after the call. */
  phoneTranscriptDays: 90,
  /** WhatsApp message bodies, carts and the allergy note on the chat, after the message. */
  whatsappMessageDays: 90,
  /** Repair photos (files and links), after the ticket closes (picked up or cancelled). */
  repairPhotoMonths: 24,
  /** Private review feedback text and the shop's reply, after it was given. */
  reviewFeedbackMonths: 24,
  /** Tiffin delivery address, postal code, notes and dietary notes, after the subscription ends. */
  tiffinAddressMonths: 12,
  /** Appointment notes and the name typed at the desk, after the visit. */
  appointmentMonths: 24,
  /** Allergy note on an order, after the order is picked up or cancelled. */
  allergyNoteDays: 30,
  /** A driver link stops working the same night; the row (which route, which day, when opened) is deleted after this. */
  driverLinkDays: 30,
  /** Unpaid appointment and hall holds that lapsed, kept this long before the row is deleted. */
  abandonedHoldDays: 7,
  /** Sales assistant chats (web and WhatsApp): messages, tool calls and the contact's number, after the last message. */
  salesAgentDays: 90,
  /** Pharmacy appointments: the name, phone and appointment type are removed this long after the appointment (the booking is kept as a count only). */
  pharmacyAppointmentDays: 30,
  /** Pharmacy order-ready and reminder texts (our delivery log and the customer's inbox copy). */
  pharmacyMessageDays: 30,
  /** After a shop closes or falls back to Free it can still download its members and visits CSV for this long, free (merchant agreement 2.1). */
  leaverExportDays: 90,
} as const;

export type RetentionKey = keyof typeof RETENTION;

/** How long a signed photo link works (apps/api/src/providers/storage.ts). The privacy policy prints it as {{upload.linkMinutes}}. */
export const UPLOAD_LINK_MINUTES = 15;

/** "90 days", "24 months", "1 day": the wording the policy prints. */
export function retentionLabel(key: RetentionKey, lang: "en" | "fr" = "en"): string {
  const n: number = RETENTION[key];
  if (lang === "fr") return `${n} ${key.endsWith("Months") ? "mois" : n === 1 ? "jour" : "jours"}`;
  const unit = key.endsWith("Months") ? "month" : "day";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Calendar-month arithmetic (UTC) so "24 months" means 24 calendar months, not 730 days. */
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}
export const daysAgo = (now: Date, days: number): Date => new Date(now.getTime() - days * 86_400_000);
