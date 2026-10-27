/**
 * API contract for pet care (features `pets.profiles`, `pets.daycare`, `pets.food_cards`, `pets.report_cards`):
 * pets under their owner, vaccine proof, groom cadence and reminders, daycare check-in and packs, buy-N-get-1 food cards, report cards.
 * Routes: apps/api/src/routes/pets. Docs: docs/engineering/api/pets.md. Research: docs/research/pet-care.md.
 * Money is integer cents (CAD). Dates are shop-local YYYY-MM-DD; timestamps are ISO-8601 strings.
 */
import { z } from "zod";
import { COATS, PET_SPECIES, SIZE_BANDS, VACCINE_KINDS } from "../pets.js";
import { centsSchema, uuidSchema } from "./common.js";

const isoDate = z.iso.date();

// ---- pets
export const petBody = z.object({
  name: z.string().trim().min(1).max(40),
  species: z.enum(PET_SPECIES).default("dog"),
  breed: z.string().trim().max(60).nullish(),
  sizeBand: z.enum(SIZE_BANDS).default("medium"),
  coat: z.enum(COATS).default("short"),
});
export type PetBody = z.input<typeof petBody>;
export const staffPetBody = petBody.extend({ memberId: uuidSchema });
export const updatePetBody = petBody.partial();
export const vaccineBody = z.object({
  expiresOn: isoDate,
  /** A stored upload path from POST /me/pets/uploads or a shop upload. Null clears the proof. */
  proofUrl: z.string().max(500).nullish(),
});
export const vaccineKindParam = z.enum(VACCINE_KINDS);

export interface VaccineDto {
  kind: string;
  expiresOn: string;
  status: "current" | "expiring" | "expired";
  daysLeft: number;
  /** A short-lived signed link to the certificate photo, or null. */
  proofUrl: string | null;
}
export interface PetDto {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sizeBand: string;
  coat: string;
  ownerId: string;
  ownerName: string | null;
  vaccines: VaccineDto[];
}
export interface PetShopDto {
  groomEveryWeeks: number | null;
  /** What the shop would use if none is set (from the coat). */
  defaultWeeks: number;
  handlingNote: string | null;
  assessment: "none" | "passed" | "declined";
  assessedAt: string | null;
  lastGroomOn: string | null;
  nextDueOn: string | null;
  recentVisits: { id: string; kind: string; at: string; mood: string | null; sent: boolean }[];
}
export interface StaffPetDto extends PetDto {
  shop: PetShopDto;
  /** The owner's other pets (name and id) for the switcher. */
  siblings: { id: string; name: string; species: string }[];
}
export interface PetListItemDto {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  ownerName: string | null;
  worst: "current" | "expiring" | "expired" | "none";
  nextDueOn: string | null;
}
export interface PetListResponse {
  items: PetListItemDto[];
}

export const petShopBody = z.object({
  groomEveryWeeks: z.number().int().min(1).max(26).nullish(),
  handlingNote: z.string().trim().max(500).nullish(),
  assessment: z.enum(["none", "passed", "declined"]).optional(),
});
export const petListQuery = z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

// ---- visits and report cards
export const MOODS = ["happy", "calm", "nervous", "wiggly"] as const;
export const DID_TAGS = ["bath", "haircut", "nails", "ears", "brushed", "played", "ate", "napped", "potty", "walk"] as const;
export const reportCardBody = z.object({
  kind: z.enum(["groom", "daycare"]).default("groom"),
  mood: z.enum(MOODS).nullish(),
  did: z.array(z.enum(DID_TAGS)).max(10).default([]),
  note: z.string().trim().max(280).nullish(),
  /** A stored upload path from POST /merchants/:id/pets/uploads. */
  photoUrl: z.string().max(500).nullish(),
  /** False logs the visit (moves the groom cadence) without texting the owner. */
  send: z.boolean().default(true),
});
export type ReportCardBody = z.input<typeof reportCardBody>;
export interface ReportCardResponse {
  visitId: string;
  sent: boolean;
  /** Why nothing was texted (no phone, no credits, quiet hours), when send was true. */
  skipped: "no_phone" | "no_credits" | "quiet" | "opted_out" | null;
  url: string | null;
  text: string | null;
}
export interface PublicVisitResponse {
  shop: { name: string; slug: string };
  pet: { name: string };
  kind: string;
  at: string;
  mood: string | null;
  did: string[];
  note: string | null;
  photoUrl: string | null;
  bookUrl: string | null;
}
export interface UploadResponse {
  url: string;
  contentType: string;
  bytes: number;
}

// ---- groom rebooking
export interface RebookingItemDto {
  petId: string;
  petName: string;
  ownerName: string | null;
  breed: string | null;
  coat: string;
  everyWeeks: number;
  lastGroomOn: string;
  dueOn: string;
  state: "due" | "late";
  daysLate: number;
  canSend: boolean;
}
export interface PetRebookingResponse {
  items: RebookingItemDto[];
  counts: { due: number; late: number; onCadence: number };
  previewText: string;
}
export const rebookingSendBody = z.object({ petIds: z.array(uuidSchema).max(200).optional(), skip: z.boolean().default(false) });
export interface RebookingSendResponse {
  sent: number;
  skipped: number;
}

// ---- settings
export const petSettingsBody = z.object({
  capacity: z.number().int().min(1).max(200).optional(),
  dogsPerStaff: z.number().int().min(1).max(40).optional(),
  staffOn: z.number().int().min(0).max(40).optional(),
  requiredVaccines: z.array(z.enum(VACCINE_KINDS)).max(4).optional(),
  requireAssessment: z.boolean().optional(),
  dropInCents: centsSchema.optional(),
  packs: z.array(z.object({ days: z.number().int().min(2).max(100), priceCents: centsSchema, validDays: z.number().int().min(14).max(730) })).max(6).optional(),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  lateGraceMin: z.number().int().min(0).max(120).optional(),
  autoGroomReminders: z.boolean().optional(),
});
export interface PetSettingsDto {
  capacity: number;
  dogsPerStaff: number;
  staffOn: number;
  requiredVaccines: string[];
  requireAssessment: boolean;
  dropInCents: number;
  packs: { days: number; priceCents: number; validDays: number }[];
  closesAt: string;
  lateGraceMin: number;
  autoGroomReminders: boolean;
}

// ---- daycare
export const stayBody = z.object({ petId: uuidSchema, day: isoDate.optional() });
export const checkInBody = z.object({ overrideCapacity: z.string().trim().min(3).max(120).optional() });
export const packBody = z.object({ memberId: uuidSchema, days: z.number().int().min(2).max(100), priceCents: centsSchema, validDays: z.number().int().min(14).max(730).optional() });
export interface DaycareStayDto {
  id: string;
  petId: string;
  petName: string;
  ownerName: string | null;
  status: "expected" | "in" | "out" | "no_show" | "cancelled";
  payKind: "pack" | "drop_in";
  packDaysLeft: number | null;
  checkInAt: string | null;
  lateMinutes: number;
  /** Why this dog cannot check in right now (empty when it can). */
  blocks: { code: string; message: string }[];
}
export interface DaycareDayResponse {
  day: string;
  settings: PetSettingsDto;
  inRoom: number;
  expected: number;
  ratioNow: number;
  packsLow: number;
  items: DaycareStayDto[];
}
export interface DaycarePackDto {
  id: string;
  ownerName: string | null;
  daysLeft: number;
  daysTotal: number;
  expiresAt: string;
}

// ---- food cards
export const foodProgramBody = z.object({ brand: z.string().trim().min(1).max(60), buyCount: z.number().int().min(2).max(30).default(12), expiryMonths: z.number().int().min(1).max(36).default(12), active: z.boolean().optional() });
export const foodSkuBody = z.object({ name: z.string().trim().min(1).max(80), bagGrams: z.number().int().min(100).max(60_000) });
export const punchBody = z.object({
  memberId: uuidSchema,
  skuId: uuidSchema,
  qty: z.number().int().min(1).max(6).default(1),
  /** Set when the cashier also records the daily amount for a run-out reminder. */
  dailyGrams: z.number().int().min(10).max(3000).nullish(),
  petId: uuidSchema.nullish(),
  /** The customer said yes to a text before they run out (the cashier asked). */
  remind: z.boolean().optional(),
});
export interface FoodSkuDto {
  id: string;
  name: string;
  bagGrams: number;
  active: boolean;
}
export interface FoodProgramDto {
  id: string;
  brand: string;
  buyCount: number;
  expiryMonths: number;
  active: boolean;
  skus: FoodSkuDto[];
  cards: number;
}
export interface FoodCardDto {
  id: string;
  programId: string;
  brand: string;
  skuId: string;
  skuName: string;
  buyCount: number;
  counted: number;
  owed: number;
  canRedeem: boolean;
  expired: boolean;
  toGo: number;
  given: number;
  dailyGrams: number | null;
  runOutOn: string | null;
  remindOn: string | null;
  remind: boolean;
  petName: string | null;
  customerName: string | null;
  customerId: string;
  shop?: { id: string; name: string; slug: string };
}
export interface FoodCardsResponse {
  programs: FoodProgramDto[];
}
export interface FoodCardLookupResponse {
  cards: FoodCardDto[];
}
export interface RunOutItemDto {
  cardId: string;
  customerName: string | null;
  petName: string | null;
  brand: string;
  skuName: string;
  runOutOn: string;
  remindOn: string;
  readyToText: boolean;
}
export interface RunOutResponse {
  items: RunOutItemDto[];
  askText: string;
}
export interface MyFoodCardsResponse {
  items: FoodCardDto[];
}
export const myRemindBody = z.object({ remind: z.boolean(), dailyGrams: z.number().int().min(10).max(3000).optional() });

/** The pet things a shop page can say before someone joins: the food card deal and the daycare packs. Public. */
export interface PublicPetInfoResponse {
  food: { brand: string; buyCount: number }[];
  packs: { days: number; priceCents: number }[];
  dropInCents: number | null;
}
