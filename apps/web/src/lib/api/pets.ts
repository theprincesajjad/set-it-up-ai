/**
 * Pet care (docs/research/pet-care.md): pets and vaccine proof, groom rebooking, daycare, food cards and report cards.
 * Spread into `merchantEndpoints` as `api.pets`; the customer pages use `myPetEndpoints` (signed in) and `publicPetEndpoints`
 * (no login). Contract: @ll/shared petApi; routes: docs/engineering/api/pets.md.
 */
import type { petApi } from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function petEndpoints(c: ApiClient, b: string) {
  return {
    pets: {
      list: (q: { q?: string } = {}) => c.get<petApi.PetListResponse>(`${b}/pets`, { query: q }),
      get: (id: string) => c.get<petApi.StaffPetDto>(`${b}/pets/${enc(id)}`),
      create: (body: { memberId: string } & petApi.PetBody) => c.post<petApi.PetDto>(`${b}/pets`, body),
      saveShop: (id: string, body: { groomEveryWeeks?: number | null; handlingNote?: string | null; assessment?: "none" | "passed" | "declined" }) => c.put<{ ok: true }>(`${b}/pets/${enc(id)}/shop`, body),
      saveVaccine: (id: string, kind: string, body: { expiresOn: string; proofUrl?: string | null }) => c.put<petApi.VaccineDto>(`${b}/pets/${enc(id)}/vaccines/${enc(kind)}`, body),
      reportCard: (id: string, body: petApi.ReportCardBody) => c.post<petApi.ReportCardResponse>(`${b}/pets/${enc(id)}/report-card`, body),
      uploadPhoto: (file: Blob) => c.post<petApi.UploadResponse>(`${b}/pets-uploads`, file, { headers: { "content-type": file.type || "image/jpeg" } }),
      rebooking: () => c.get<petApi.PetRebookingResponse>(`${b}/pets/rebooking`),
      sendRebooking: (body: { petIds?: string[]; skip?: boolean }) => c.post<petApi.RebookingSendResponse>(`${b}/pets/rebooking/send`, body),
      settings: () => c.get<petApi.PetSettingsDto>(`${b}/pets/settings`),
      saveSettings: (body: Partial<petApi.PetSettingsDto>) => c.put<petApi.PetSettingsDto>(`${b}/pets/settings`, body),
    },
    daycare: {
      day: (day?: string) => c.get<petApi.DaycareDayResponse>(`${b}/daycare/day`, { query: { day } }),
      expect: (petId: string) => c.post<{ id: string }>(`${b}/daycare/stays`, { petId }),
      checkIn: (id: string, overrideCapacity?: string) => c.post<{ ok: true; payKind: string; packDaysLeft: number | null }>(`${b}/daycare/stays/${enc(id)}/check-in`, overrideCapacity ? { overrideCapacity } : {}),
      checkOut: (id: string) => c.post<{ ok: true; lateMinutes: number }>(`${b}/daycare/stays/${enc(id)}/check-out`, {}),
      noShow: (id: string) => c.post<{ ok: true }>(`${b}/daycare/stays/${enc(id)}/no-show`, {}),
      packs: () => c.get<{ items: petApi.DaycarePackDto[] }>(`${b}/daycare/packs`),
      sellPack: (body: { memberId: string; days: number; priceCents: number; validDays?: number }) => c.post<petApi.DaycarePackDto>(`${b}/daycare/packs`, body),
    },
    food: {
      programs: () => c.get<petApi.FoodCardsResponse>(`${b}/food/programs`),
      addProgram: (body: { brand: string; buyCount: number; expiryMonths: number }) => c.post<petApi.FoodProgramDto>(`${b}/food/programs`, body),
      addSku: (programId: string, body: { name: string; bagGrams: number }) => c.post<petApi.FoodSkuDto>(`${b}/food/programs/${enc(programId)}/skus`, body),
      cards: (memberId: string) => c.get<petApi.FoodCardLookupResponse>(`${b}/food/cards`, { query: { memberId } }),
      punch: (body: { memberId: string; skuId: string; qty: number; dailyGrams?: number | null; petId?: string | null; remind?: boolean }) => c.post<petApi.FoodCardDto & { needsCustomerYes: boolean }>(`${b}/food/punch`, body),
      redeem: (cardId: string) => c.post<petApi.FoodCardDto>(`${b}/food/cards/${enc(cardId)}/redeem`, {}),
      undo: (cardId: string) => c.post<petApi.FoodCardDto>(`${b}/food/cards/${enc(cardId)}/undo`, {}),
      runOut: () => c.get<petApi.RunOutResponse>(`${b}/food/runout`),
      sendRunOut: (cardIds?: string[]) => c.post<{ sent: number; skipped: number }>(`${b}/food/runout/send`, cardIds ? { cardIds } : {}),
    },
  };
}

/** Customer side, signed in: my pets, vaccine proof and my food cards. */
export function myPetEndpoints(c: ApiClient) {
  return {
    myPets: () => c.get<{ items: petApi.PetDto[]; nextGroom: Record<string, { shop: string; on: string }> }>("/v1/me/pets"),
    addPet: (body: petApi.PetBody) => c.post<petApi.PetDto>("/v1/me/pets", body),
    removePet: (id: string) => c.delete<void>(`/v1/me/pets/${enc(id)}`),
    saveMyVaccine: (id: string, kind: string, body: { expiresOn: string; proofUrl?: string | null }) => c.put<petApi.VaccineDto>(`/v1/me/pets/${enc(id)}/vaccines/${enc(kind)}`, body),
    uploadPetProof: (file: Blob) => c.post<petApi.UploadResponse>("/v1/me/pets-uploads", file, { headers: { "content-type": file.type || "image/jpeg" } }),
    myFoodCards: () => c.get<petApi.MyFoodCardsResponse>("/v1/me/food-cards"),
    setFoodReminder: (id: string, body: { remind: boolean; dailyGrams?: number }) => c.put<petApi.FoodCardDto>(`/v1/me/food-cards/${enc(id)}/remind`, body),
  };
}

/** A report card page: public by its token. */
export function publicPetEndpoints(c: ApiClient) {
  return {
    petInfo: (slug: string) => c.get<petApi.PublicPetInfoResponse>(`/v1/public/shops/${enc(slug)}/pets`, { anonymous: true }),
    visit: (token: string) => c.get<petApi.PublicVisitResponse>(`/v1/public/visits/${enc(token)}`, { anonymous: true }),
  };
}
