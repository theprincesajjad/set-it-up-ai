/**
 * "Add to calendar" for a booked appointment. Phones: write the .ics to the cache and open the share sheet (Calendar,
 * Google Calendar and others take it). No share sheet (web, or a device without one): open the shop's manage page,
 * where the web page offers the same .ics download.
 */
import type { appointmentsApi } from "@ll/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";
import { WEB_URL } from "../../config";
import { ICS_MIME, ICS_UTI, appointmentIcs, icsFileName, manageUrl } from "../../lib/appointmentCalendar";

export type CalendarResult = "shared" | "opened_web" | "failed";
type Appt = Pick<appointmentsApi.MyAppointmentDto, "id" | "items" | "startsAt" | "endsAt" | "merchant"> & { reminderText?: string };

export async function addAppointmentToCalendar(a: Appt, dialogTitle: string, privateTitle?: string): Promise<CalendarResult> {
  try {
    if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
      const file = new File(Paths.cache, icsFileName(a));
      if (file.exists) file.delete();
      file.create();
      file.write(appointmentIcs(a, WEB_URL, new Date(), privateTitle));
      await Sharing.shareAsync(file.uri, { mimeType: ICS_MIME, UTI: ICS_UTI, dialogTitle });
      return "shared";
    }
    await Linking.openURL(manageUrl(WEB_URL, a));
    return "opened_web";
  } catch {
    return "failed";
  }
}
