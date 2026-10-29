"use client";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { useApi } from "@/lib/dashboard/useApi";
import { isAppointmentLed } from "@/lib/dashboard/people";

/**
 * phase-solo D (people-side.md gap 11): true when the shop takes appointments, has one bookable calendar and nobody else on the
 * team. The sidebar then hides Staff and Settings shows "Add a second chair". Undefined until known (Staff stays meanwhile).
 */
export function useSoloCalendar(): boolean | undefined {
  const { api, enabled, role, detail } = useMerchant();
  const on = isAppointmentLed(detail.merchant.vertical, enabled("booking.appointments")) && (role === "owner" || role === "manager");
  const team = useApi(on ? () => api.team() : null, [api, on]);
  if (!on || !team.data) return undefined;
  return team.data.items.length <= 1;
}
