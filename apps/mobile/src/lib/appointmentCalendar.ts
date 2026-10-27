/**
 * Add an appointment to the phone's calendar: the .ics text (the same builder the web page uses, from @ll/shared)
 * and the file name. Pure, so it is unit-tested; src/features/customer/addToCalendar.ts hands it to the share sheet.
 */
import { bookingLogic, type appointmentsApi } from "@ll/shared";

export const ICS_MIME = "text/calendar";
export const ICS_UTI = "public.calendar-event";

/** The page where the guest manages the visit (also written into the event so the calendar links back). */
export const manageUrl = (webUrl: string, a: Pick<appointmentsApi.MyAppointmentDto, "id" | "merchant">) => `${webUrl.replace(/\/+$/, "")}/shops/${encodeURIComponent(a.merchant.slug)}/book/${a.id}`;

export function appointmentIcs(a: Pick<appointmentsApi.MyAppointmentDto, "id" | "items" | "startsAt" | "endsAt" | "merchant"> & { reminderText?: string }, webUrl: string, now = new Date(), privateTitle = "Appointment"): string {
  // A pharmacy visit (the reminder text is set only for pharmacies) is a bare "Appointment": no service, shop, address or link.
  if (a.reminderText) return bookingLogic.buildIcs({ uid: a.id, title: privateTitle, startsAt: a.startsAt, endsAt: a.endsAt }, now);
  const url = manageUrl(webUrl, a);
  return bookingLogic.buildIcs({ uid: a.id, title: `${a.items.map((i) => i.name).join(", ")} · ${a.merchant.name}`, startsAt: a.startsAt, endsAt: a.endsAt, location: a.merchant.address, description: url, url }, now);
}

/** A file name the share sheet shows: "bloom-studio-appointment.ics". */
export function icsFileName(a: Pick<appointmentsApi.MyAppointmentDto, "merchant"> & { reminderText?: string }): string {
  if (a.reminderText) return "appointment.ics";
  const slug = a.merchant.slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shop";
  return `${slug}-appointment.ics`;
}
