/** phase-solo D: shared helpers for the customer side of the people work (server and client). */
import type { appointmentsApi } from "@ll/shared";

/** The latest finished visit: where "Book again" goes (same service, same person). */
export function lastFinished(visits: appointmentsApi.MyAppointmentDto[]): appointmentsApi.MyAppointmentDto | null {
  return visits.filter((v) => v.status === "completed").sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0] ?? null;
}

export function bookAgainHref(v: appointmentsApi.MyAppointmentDto): string {
  const q = new URLSearchParams();
  const service = v.items.find((i) => i.serviceId)?.serviceId;
  if (service) q.set("service", service);
  if (v.staffId) q.set("staff", v.staffId);
  return `/shops/${encodeURIComponent(v.merchant.slug)}/book${q.size ? `?${q}` : ""}`;
}

