/**
 * Auto care (docs/research/auto-care.md): vehicles and service reminders, tire season and storage, wash check-in.
 * Spread into `merchantEndpoints` as `api.auto`; the customer pages use `myAutoEndpoints` (signed in).
 * Contract: @ll/shared autoApi; routes: docs/engineering/api/auto.md.
 */
import type { autoApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function autoEndpoints(c: ApiClient, b: string) {
  return {
    auto: {
      settings: () => c.get<autoApi.AutoSettingsDto>(`${b}/auto/settings`),
      saveSettings: (body: Partial<Omit<autoApi.AutoSettingsDto, "swapsPerDay" | "services">> & { services?: autoApi.AutoServiceDto[] }) => c.put<autoApi.AutoSettingsDto>(`${b}/auto/settings`, body),
      vehicles: (q: { q?: string } = {}) => c.get<autoApi.VehicleListResponse>(`${b}/auto/vehicles`, { query: q }),
      vehicle: (id: string) => c.get<autoApi.VehicleDetailDto>(`${b}/auto/vehicles/${enc(id)}`),
      addVehicle: (body: { memberId: string; year?: number | null; make: string; model: string; use?: "personal" | "rideshare"; plate?: string | null; odometerKm?: number }) => c.post<autoApi.VehicleDetailDto>(`${b}/auto/vehicles`, body),
      saveVehicle: (id: string, body: Partial<autoApi.VehicleBody> & { kmPerDayOverride?: number | null; note?: string | null }) => c.patch<autoApi.VehicleDetailDto>(`${b}/auto/vehicles/${enc(id)}`, body),
      addReading: (id: string, body: { km: number; day?: string }) => c.post<autoApi.VehicleDetailDto>(`${b}/auto/vehicles/${enc(id)}/readings`, body),
      logService: (id: string, body: { serviceKey: string; doneOn?: string; km?: number | null }) => c.post<autoApi.VehicleDetailDto>(`${b}/auto/vehicles/${enc(id)}/services`, body),
      reminders: () => c.get<autoApi.RemindersResponse>(`${b}/auto/reminders`),
      sendReminders: (body: { items?: { vehicleId: string; serviceKey: string }[]; skip?: boolean }) => c.post<autoApi.RemindersSendResponse>(`${b}/auto/reminders/send`, body),
      tirePlan: (q: { from?: string; days?: number } = {}) => c.get<autoApi.TirePlanResponse>(`${b}/auto/tires/plan`, { query: q }),
      tireSets: (status: "stored" | "picked_up" = "stored") => c.get<autoApi.TireSetsResponse>(`${b}/auto/tires/sets`, { query: { status } }),
      addTireSet: (body: { memberId: string; vehicleId?: string | null; rack: string; season: "winter" | "summer" | "all_weather"; label?: string | null; treadMm?: number | null; note?: string | null }) => c.post<autoApi.TireSetDto>(`${b}/auto/tires/sets`, body),
      saveTireSet: (id: string, body: { rack?: string; season?: "winter" | "summer" | "all_weather"; label?: string | null; treadMm?: number | null; note?: string | null }) => c.patch<autoApi.TireSetDto>(`${b}/auto/tires/sets/${enc(id)}`, body),
      pickupTireSet: (id: string) => c.post<autoApi.TireSetDto>(`${b}/auto/tires/sets/${enc(id)}/pickup`, {}),
      bookSwap: (body: { memberId: string; vehicleId?: string | null; day: string; note?: string | null }) => c.post<autoApi.TirePlanResponse>(`${b}/auto/tires/swaps`, body),
      swapStatus: (id: string, status: "done" | "no_show" | "cancelled") => c.post<{ ok: true }>(`${b}/auto/tires/swaps/${enc(id)}/status`, { status }),
      sendPickupTexts: () => c.post<{ sent: number }>(`${b}/auto/tires/pickup-texts`, {}),
      washLookup: (q: string) => c.get<autoApi.WashLookupResponse>(`${b}/auto/wash/lookup`, { query: { q } }),
      washCheckIn: (body: { memberId?: string; plate?: string; phone?: string; memberCode?: string; source?: "plate" | "qr" | "phone" | "manual" }) => c.post<autoApi.WashCheckInResponse>(`${b}/auto/wash/check-in`, body),
      washSummary: () => c.get<autoApi.WashSummaryResponse>(`${b}/auto/wash/summary`),
    },
  };
}

/** Customer side, signed in: my vehicles, odometer readings and tire swaps. */
export function myAutoEndpoints(c: ApiClient) {
  return {
    myVehicles: () => c.get<autoApi.MyVehiclesResponse>("/v1/me/vehicles"),
    addVehicle: (body: autoApi.VehicleBody) => c.post<autoApi.VehicleDto>("/v1/me/vehicles", body),
    removeVehicle: (id: string) => c.delete<void>(`/v1/me/vehicles/${enc(id)}`),
    addMyReading: (id: string, km: number) => c.post<autoApi.ReadingDto>(`/v1/me/vehicles/${enc(id)}/readings`, { km }),
    bookMySwap: (body: { merchantId: string; vehicleId?: string | null; day: string }) => c.post<{ id: string; day: string }>("/v1/me/tire-swaps", body),
    cancelMySwap: (id: string) => c.delete<void>(`/v1/me/tire-swaps/${enc(id)}`),
  };
}
