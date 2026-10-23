/**
 * Appointments (Café & Retail: booking.appointments): the calendar, price list, staff hours, checkout, and the
 * customer booking calls. Spread into `merchantEndpoints` as `api.appointments`; the customer pages use
 * `publicAppointmentEndpoints` (no login) and `myAppointmentEndpoints` (signed in).
 * Contract: @ll/shared appointmentsApi; routes: docs/engineering/api/appointments.md.
 */
import type { appointmentsApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function appointmentEndpoints(c: ApiClient, b: string) {
  return {
    appointments: {
      list: (q: { from: string; to: string; staffId?: string; locationId?: string }) => c.get<appointmentsApi.AppointmentsResponse>(`${b}/appointments`, { query: q }),
      detail: (id: string) => c.get<{ appointment: appointmentsApi.AppointmentDto; lastVisits: { id: string; startsAt: string; summary: string }[]; member: { balance: number; visitCount: number } | null }>(`${b}/appointments/${enc(id)}`),
      staff: () => c.get<appointmentsApi.CalendarStaffResponse>(`${b}/appointments/staff`),
      create: (body: appointmentsApi.CreateAppointmentBody) => c.post<appointmentsApi.AppointmentDto>(`${b}/appointments`, body),
      update: (id: string, body: appointmentsApi.UpdateAppointmentBody) => c.patch<appointmentsApi.AppointmentDto>(`${b}/appointments/${enc(id)}`, body),
      status: (id: string, body: appointmentsApi.AppointmentStatusBody) => c.post<appointmentsApi.StatusResponse>(`${b}/appointments/${enc(id)}/status`, body),
      checkIn: (id: string) => c.post<appointmentsApi.StatusResponse>(`${b}/appointments/${enc(id)}/check-in`, {}),
      checkout: (id: string, body: appointmentsApi.CheckoutBody) => c.post<appointmentsApi.CheckoutResponse>(`${b}/appointments/${enc(id)}/checkout`, body),
      settings: () => c.get<appointmentsApi.AppointmentSettingsDto>(`${b}/appointments/settings`),
      saveSettings: (body: appointmentsApi.AppointmentSettingsBody) => c.put<appointmentsApi.AppointmentSettingsDto>(`${b}/appointments/settings`, body),
      services: (kind: appointmentsApi.ServiceKind = "appointment") => c.get<appointmentsApi.ServicesResponse>(`${b}/services`, { query: { kind } }),
      createService: (body: appointmentsApi.CreateServiceBody) => c.post<appointmentsApi.ServiceDto>(`${b}/services`, body),
      updateService: (id: string, body: appointmentsApi.UpdateServiceBody) => c.patch<appointmentsApi.ServiceDto>(`${b}/services/${enc(id)}`, body),
      deleteService: (id: string) => c.delete<void>(`${b}/services/${enc(id)}`),
      putHours: (userId: string, body: appointmentsApi.PutStaffHoursBody) => c.put<{ items: appointmentsApi.StaffHoursDto[] }>(`${b}/staff/${enc(userId)}/hours`, body),
      putStaffServices: (userId: string, body: appointmentsApi.PutStaffServicesBody) => c.put<{ items: appointmentsApi.StaffServiceDto[] }>(`${b}/staff/${enc(userId)}/services`, body),
      addTimeOff: (userId: string, body: appointmentsApi.CreateTimeOffBody) => c.post<appointmentsApi.TimeOffDto>(`${b}/staff/${enc(userId)}/time-off`, body),
      deleteTimeOff: (id: string) => c.delete<void>(`${b}/staff/time-off/${enc(id)}`),
    },
  };
}

/** Customer side, no login: the shop's services and policy, and computed availability. */
export function publicAppointmentEndpoints(c: ApiClient) {
  return {
    bookingServices: (slug: string) => c.get<appointmentsApi.PublicServicesResponse>(`/v1/public/shops/${enc(slug)}/services`, { anonymous: true }),
    bookingAvailability: (slug: string, q: { serviceIds: string[]; staffId: string; from: string; to: string }) =>
      c.get<appointmentsApi.AvailabilityResponse>(`/v1/public/shops/${enc(slug)}/availability`, { anonymous: true, query: { serviceIds: q.serviceIds.join(","), staffId: q.staffId, from: q.from, to: q.to } }),
  };
}

/** Customer side, signed in: book, look at, move and cancel. */
export function myAppointmentEndpoints(c: ApiClient) {
  return {
    appointments: () => c.get<appointmentsApi.MyAppointmentsResponse>("/v1/me/appointments"),
    appointment: (id: string) => c.get<appointmentsApi.MyAppointmentResponse>(`/v1/me/appointments/${enc(id)}`),
    bookAppointment: (body: appointmentsApi.CreateMyAppointmentBody) => c.post<appointmentsApi.CreateMyAppointmentResponse>("/v1/me/appointments", body),
    cancelAppointment: (id: string) => c.post<appointmentsApi.MyAppointmentChangeResponse>(`/v1/me/appointments/${enc(id)}/cancel`, {}),
    rescheduleAppointment: (id: string, body: appointmentsApi.RescheduleMyAppointmentBody) => c.post<appointmentsApi.MyAppointmentChangeResponse>(`/v1/me/appointments/${enc(id)}/reschedule`, body),
  };
}
