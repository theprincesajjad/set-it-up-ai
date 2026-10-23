"use client";
import { useCallback, useMemo, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import type { MerchantEndpoints } from "@/lib/api/endpoints";
import { useApi } from "@/lib/dashboard/useApi";

type Appt = appointmentsApi.AppointmentDto;

/**
 * The day's (or week's) appointments with a 15-second refresh and optimistic move and resize: the block jumps
 * to its new place at once and snaps back if the server says no (409 slot_taken, outside_hours...).
 */
export function useAppointments(api: MerchantEndpoints, range: { from: string; to: string } | null, locationId?: string) {
  const state = useApi(range ? () => api.appointments.list({ from: range.from, to: range.to, locationId }) : null, [api, range?.from, range?.to, locationId], { pollMs: 15_000 });
  const [pending, setPending] = useState<Record<string, Partial<Appt>>>({});
  const items = useMemo(() => (state.data?.items ?? []).map((a) => (pending[a.id] ? { ...a, ...pending[a.id] } : a)), [state.data, pending]);

  /** Apply `optimistic` now, send `body`, keep the server's answer or put things back. */
  const patch = useCallback(
    async (id: string, body: appointmentsApi.UpdateAppointmentBody, optimistic: Partial<Appt>): Promise<{ ok: true; appt: Appt } | { ok: false; error: unknown }> => {
      setPending((p) => ({ ...p, [id]: optimistic }));
      try {
        const appt = await api.appointments.update(id, body);
        state.setData((d) => (d ? { items: d.items.map((x) => (x.id === id ? appt : x)) } : d));
        return { ok: true, appt };
      } catch (error) {
        return { ok: false, error };
      } finally {
        setPending((p) => {
          const rest = { ...p };
          delete rest[id];
          return rest;
        });
      }
    },
    [api, state],
  );

  return { items, loading: state.loading, error: state.error, status: state.status, reload: state.reload, patch, setData: state.setData };
}
