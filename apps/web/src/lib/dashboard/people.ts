/**
 * phase-solo D: which shops get the appointment-led people side (the visits-first Customers list, the profile's next visit and
 * timeline, the Inbox in the sidebar). booking.appointments is free for every shop now (one calendar), so the feature alone is not
 * the signal: the kind of shop is. Beauty pros, barbers, salons and spas.
 */
export const APPOINTMENT_LED_VERTICALS: readonly string[] = ["salon", "barber", "spa", "nails", "brows_lashes", "makeup"];

export function isAppointmentLed(vertical: string | null | undefined, appointmentsOn: boolean): boolean {
  return appointmentsOn && !!vertical && APPOINTMENT_LED_VERTICALS.includes(vertical);
}
