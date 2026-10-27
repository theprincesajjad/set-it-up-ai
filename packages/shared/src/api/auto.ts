/**
 * API contract for auto care (features `auto.vehicles`, `auto.tires`, `auto.wash`): vehicles under their owner, service
 * reminders by km or months, tire season capacity and storage, wash check-in. Routes: apps/api/src/routes/auto.
 * Docs: docs/engineering/api/auto.md. Research: docs/research/auto-care.md.
 * Money is integer cents (CAD). Dates are shop-local YYYY-MM-DD; timestamps are ISO-8601 strings.
 */
import { z } from "zod";
import { PART_CONDITIONS, PARTS_RETURN, TIRE_SEASONS, VEHICLE_USES } from "../auto.js";
import { phoneSchema, uuidSchema } from "./common.js";

const isoDate = z.iso.date();
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const kmSchema = z.number().int().min(0).max(1_500_000);

// ---- vehicles
export const vehicleBody = z.object({
  year: z.number().int().min(1950).max(2100).nullish(),
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  use: z.enum(VEHICLE_USES).default("personal"),
  /** Optional. Shown to the shop's staff and the owner only; never in a message. */
  plate: z.string().trim().max(12).nullish(),
});
export type VehicleBody = z.input<typeof vehicleBody>;
export const staffVehicleBody = vehicleBody.extend({ memberId: uuidSchema, odometerKm: kmSchema.optional() });
export const updateVehicleBody = vehicleBody.partial().extend({ kmPerDayOverride: z.number().int().min(1).max(1000).nullish(), note: z.string().trim().max(300).nullish() });
export const readingBody = z.object({ km: kmSchema, day: isoDate.optional() });
export const serviceDoneBody = z.object({ serviceKey: z.string().trim().min(1).max(40), doneOn: isoDate.optional(), km: kmSchema.nullish() });
export const vehicleListQuery = z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export type ReminderStatusDto = "overdue" | "due_soon" | "ok" | "unknown";
export interface ReminderDto {
  serviceKey: string;
  label: string;
  /** "8,000 km or 6 months" */
  every: string;
  lastDoneOn: string | null;
  lastKm: number | null;
  status: ReminderStatusDto;
  dueOn: string | null;
  basis: "km" | "months" | null;
  dueByKmOn: string | null;
  dueByMonthsOn: string | null;
  dueAtKm: number | null;
  daysToDue: number | null;
}
export interface ReadingDto {
  id: string;
  km: number;
  day: string;
  source: string;
}
export interface VehicleDto {
  id: string;
  year: number | null;
  make: string;
  model: string;
  use: "personal" | "rideshare";
  /** The plate, for staff and the owner. */
  plate: string | null;
  ownerId: string;
  ownerName: string | null;
  label: string;
}
export interface VehicleRowDto extends VehicleDto {
  odometerKm: number | null;
  odometerOn: string | null;
  worst: ReminderStatusDto;
  nextDue: { label: string; dueOn: string; status: ReminderStatusDto } | null;
}
export interface VehicleListResponse {
  items: VehicleRowDto[];
}
export interface VehicleVisitDto {
  ticketId: string;
  number: number;
  at: string;
  issue: string;
  status: string;
  mileageIn: string | null;
  estimateCents: number | null;
  invoiceCents: number | null;
  /** Percent over the approved estimate, one decimal; null when there was no estimate or invoice. */
  percentOver: number | null;
}
export interface VehicleDetailDto extends VehicleDto {
  kmPerDay: number;
  kmPerDayBasis: "override" | "readings" | "default";
  odometerKm: number | null;
  odometerOn: string | null;
  note: string | null;
  /** The owner's phone, for staff, to start an estimate on a ticket. */
  ownerPhone: string | null;
  canText: boolean;
  reminders: ReminderDto[];
  readings: ReadingDto[];
  visits: VehicleVisitDto[];
  tireSets: TireSetDto[];
}

// ---- reminders (staff list)
export interface ReminderRowDto {
  vehicleId: string;
  vehicleLabel: string;
  ownerName: string | null;
  serviceKey: string;
  label: string;
  status: "overdue" | "due_soon";
  dueOn: string;
  basis: "km" | "months";
  daysToDue: number;
  lastTextOn: string | null;
  canSend: boolean;
  /** Why not, in words, when canSend is false. */
  cannotWhy: string | null;
}
export interface RemindersResponse {
  items: ReminderRowDto[];
  counts: { dueSoon: number; overdue: number; texted7d: number; noReading: number };
  previewText: string;
}
export const remindersSendBody = z.object({ items: z.array(z.object({ vehicleId: uuidSchema, serviceKey: z.string().min(1).max(40) })).max(200).optional(), skip: z.boolean().default(false) });
export interface RemindersSendResponse {
  sent: number;
  skipped: number;
}

// ---- settings
export const serviceDefBody = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(1).max(60),
  everyKm: z.number().int().min(500).max(100_000).nullable(),
  everyMonths: z.number().int().min(1).max(60).nullable(),
  severeKm: z.number().int().min(500).max(100_000).nullish(),
  severeMonths: z.number().int().min(1).max(60).nullish(),
  active: z.boolean(),
});
export const autoSettingsBody = z.object({
  services: z.array(serviceDefBody).max(20).optional(),
  autoReminders: z.boolean().optional(),
  defaultKmPerDay: z.number().int().min(5).max(400).optional(),
  bays: z.number().int().min(1).max(30).optional(),
  hoursPerDay: z.number().int().min(1).max(16).optional(),
  minutesPerSwap: z.number().int().min(10).max(180).optional(),
  fallStart: mmdd.optional(),
  fallEnd: mmdd.optional(),
  springStart: mmdd.optional(),
  springEnd: mmdd.optional(),
  pickupLeadDays: z.number().int().min(0).max(60).optional(),
  washMaxPerDay: z.number().int().min(1).max(10).optional(),
});
export interface AutoServiceDto {
  key: string;
  label: string;
  everyKm: number | null;
  everyMonths: number | null;
  severeKm: number | null;
  severeMonths: number | null;
  active: boolean;
}
export interface AutoSettingsDto {
  services: AutoServiceDto[];
  autoReminders: boolean;
  defaultKmPerDay: number;
  bays: number;
  hoursPerDay: number;
  minutesPerSwap: number;
  swapsPerDay: number;
  fallStart: string;
  fallEnd: string;
  springStart: string;
  springEnd: string;
  pickupLeadDays: number;
  washMaxPerDay: number;
}

// ---- tires
export const tireSetBody = z.object({
  memberId: uuidSchema,
  vehicleId: uuidSchema.nullish(),
  rack: z.string().trim().min(1).max(20),
  season: z.enum(TIRE_SEASONS),
  label: z.string().trim().max(80).nullish(),
  /** In millimetres, one decimal (6.5). Stored in tenths. */
  treadMm: z.number().min(0).max(15).nullish(),
  storedOn: isoDate.optional(),
  note: z.string().trim().max(200).nullish(),
});
export const updateTireSetBody = tireSetBody.omit({ memberId: true }).partial();
export interface TireSetDto {
  id: string;
  rack: string;
  season: "winter" | "summer" | "all_weather";
  label: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  ownerId: string;
  ownerName: string | null;
  treadMm: number | null;
  treadStatus: "ok" | "replace_soon" | "wear_bar" | "unknown";
  storedOn: string;
  status: "stored" | "picked_up";
  pickedUpOn: string | null;
  note: string | null;
  /** The window this set will be wanted for next, and when the pickup text goes. */
  pickupWindow: { name: "fall" | "spring"; start: string } | null;
  pickupTextOn: string | null;
  pickupTexted: boolean;
}
export interface TireSetsResponse {
  items: TireSetDto[];
  counts: { stored: number; racks: number; replaceSoon: number };
}
export interface TireDayDto {
  day: string;
  capacity: number;
  booked: number;
  free: number;
  full: boolean;
  window: "fall" | "spring" | null;
}
export interface TireSwapDto {
  id: string;
  day: string;
  status: "booked" | "done" | "cancelled" | "no_show";
  source: "customer" | "staff";
  ownerId: string;
  ownerName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  tireSetRack: string | null;
  note: string | null;
}
export interface TirePlanResponse {
  settings: AutoSettingsDto;
  window: { name: "fall" | "spring"; start: string; end: string; open: boolean };
  days: TireDayDto[];
  swaps: TireSwapDto[];
}
export const tirePlanQuery = z.object({ from: isoDate.optional(), days: z.coerce.number().int().min(1).max(60).default(14) });
export const swapBody = z.object({ memberId: uuidSchema, vehicleId: uuidSchema.nullish(), day: isoDate, note: z.string().trim().max(200).nullish() });
export const swapStatusBody = z.object({ status: z.enum(["done", "no_show", "cancelled"]) });
export const customerSwapBody = z.object({ merchantId: uuidSchema, vehicleId: uuidSchema.nullish(), day: isoDate });
export interface MyTireShopDto {
  merchantId: string;
  shopName: string;
  slug: string;
  window: { name: "fall" | "spring"; start: string; end: string; open: boolean };
  /** Days a swap can be booked, with room left. Only open-window days appear. */
  days: TireDayDto[];
  sets: { id: string; rack: string; season: string; label: string | null; treadMm: number | null; treadStatus: string; vehicleLabel: string | null }[];
  swaps: { id: string; day: string; vehicleLabel: string | null }[];
}

// ---- wash
export const washLookupQuery = z.object({ q: z.string().trim().min(2).max(40) });
export const washCheckInBody = z
  .object({
    memberId: uuidSchema.optional(),
    memberCode: z.string().trim().min(6).max(40).optional(),
    phone: phoneSchema.optional(),
    plate: z.string().trim().max(12).optional(),
    source: z.enum(["plate", "qr", "phone", "manual"]).default("manual"),
  })
  .refine((b) => !!(b.memberId || b.memberCode || b.phone || b.plate), { message: "Give a member, a member code, a phone number or a plate." });
export interface WashMemberDto {
  memberId: string;
  userId: string;
  name: string | null;
  vehicleLabel: string | null;
  plan: { id: string; name: string; state: string } | null;
  punch: { name: string; left: number } | null;
  washesThisMonth: number;
  washedToday: boolean;
}
export interface WashLookupResponse {
  items: WashMemberDto[];
}
export interface WashCheckInResponse {
  ok: boolean;
  kind: "member" | "punch" | null;
  reason: string | null;
  message: string;
  member: WashMemberDto | null;
}
export interface WashSummaryResponse {
  members: number;
  washesToday: number;
  washes30d: number;
  avgPerMember30d: number | null;
  atRisk: { memberId: string; name: string | null; planName: string; washes30d: number }[];
  punchCardsOpen: number;
}

// ---- customer (/me)
export interface MyVehicleShopDto {
  merchantId: string;
  shopName: string;
  slug: string;
  reminders: ReminderDto[];
}
export interface MyVehicleDto {
  id: string;
  year: number | null;
  make: string;
  model: string;
  use: "personal" | "rideshare";
  plate: string | null;
  label: string;
  odometerKm: number | null;
  odometerOn: string | null;
  shops: MyVehicleShopDto[];
}
export interface MyVehiclesResponse {
  vehicles: MyVehicleDto[];
  tireShops: MyTireShopDto[];
}

// ---- vehicle estimate fields (tickets, quotes, invoices; no new endpoints)
export const partConditionSchema = z.enum(PART_CONDITIONS);
export const partsReturnBody = z.object({ partsReturn: z.enum(PARTS_RETURN), mileageOut: z.string().trim().max(20).nullish() });
