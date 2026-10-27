/**
 * API contract for appointments (Café & Retail, feature `booking.appointments`): services and prices,
 * staff hours and time off, the day calendar, computed availability, online booking with a deposit or a
 * card on file, checkout with a tip, and the no-show policy.
 * Routes: apps/api/src/routes/appointments. Docs: docs/engineering/api/appointments.md.
 *
 * Money is integer cents (CAD). Timestamps are ISO-8601 strings. Wall-clock hours ("09:00") are in the
 * shop's time zone (America/Toronto by default).
 */
import { z } from "zod";
import { centsSchema, uuidSchema } from "./common.js";
import { translationsSchema } from "./restaurant.js";

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

export const APPOINTMENT_STATUSES = ["booked", "arrived", "in_service", "completed", "no_show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
/** Statuses that hold a chair (the overlap guard only counts these). */
export const ACTIVE_APPOINTMENT_STATUSES = ["booked", "arrived", "in_service"] as const;

export const APPOINTMENT_SOURCES = ["online", "staff", "walk_in"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

export const SERVICE_KINDS = ["appointment", "repair_line"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const serviceKindSchema = z.enum(SERVICE_KINDS);

/** The calendar and the booking page snap to this many minutes. */
export const SLOT_STEP_MIN = 15;
/** An unpaid online hold lasts this long. */
export const HOLD_MINUTES = 10;
/** Default cancel/reschedule window and fee policy (merchants.cancelWindowHours / noShowFeeCents). */
export const DEFAULT_CANCEL_WINDOW_HOURS = 24;
export const DEFAULT_TIP_PRESETS = [15, 20, 25] as const;

// ---------------------------------------------------------------------------
// Services (one generic table: appointment services and the repair price list)
// ---------------------------------------------------------------------------
const serviceFields = {
  kind: serviceKindSchema.default("appointment"),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  /** Minutes. Appointment services need at least 5; repair lines may use 0. */
  durationMin: z.number().int().min(0).max(720).default(30),
  priceCents: centsSchema,
  /** "from $X": the price is a starting price (colour, bridal). */
  priceFrom: z.boolean().default(false),
  /** Deposit taken online to hold the booking, credited at checkout. */
  depositCents: centsSchema.default(0),
  /** Clean-up time after the service that nobody else can book. */
  bufferMin: z.number().int().min(0).max(120).default(0),
  /** A merchant category (so no-earn categories keep working); the customer page groups by its name. */
  categoryId: uuidSchema.nullish(),
  rebookAfterDays: z.number().int().min(1).max(730).nullish(),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(100000).default(0),
  translations: translationsSchema.optional(),
  /** Staff who do this service. Omit or leave empty: any bookable staff member can. */
  staffIds: z.array(uuidSchema).max(100).optional(),
};

export const createServiceBody = z
  .object(serviceFields)
  .refine((b) => b.kind !== "appointment" || b.durationMin >= 5, { message: "An appointment service needs at least 5 minutes", path: ["durationMin"] })
  .refine((b) => b.depositCents <= b.priceCents || b.priceCents === 0, { message: "The deposit can't be more than the price", path: ["depositCents"] });
export type CreateServiceBody = z.input<typeof createServiceBody>;

export const updateServiceBody = z.object(serviceFields).partial().refine((b) => Object.keys(b).length > 0, { message: "Nothing to change" });
export type UpdateServiceBody = z.input<typeof updateServiceBody>;

export const listServicesQuery = z.object({
  kind: serviceKindSchema.optional(),
  active: z.enum(["1", "true", "0", "false"]).optional(),
});

export interface ServiceDto {
  id: string;
  merchantId: string;
  kind: ServiceKind;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  priceFrom: boolean;
  depositCents: number;
  bufferMin: number;
  categoryId: string | null;
  categoryName: string | null;
  rebookAfterDays: number | null;
  taxable: boolean;
  active: boolean;
  sort: number;
  translations: Record<string, { name?: string; description?: string }>;
  /** Staff assigned to this service (empty = anyone). */
  staffIds: string[];
}
export interface ServicesResponse {
  items: ServiceDto[];
}

// ---------------------------------------------------------------------------
// Staff hours, time off, staff services
// ---------------------------------------------------------------------------
export const staffHoursRowSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startsLocal: hhmm, endsLocal: hhmm })
  .refine((r) => r.startsLocal < r.endsLocal, { message: "A shift must end after it starts", path: ["endsLocal"] });
/** PUT /staff/:userId/hours replaces that person's weekly hours at one location. Several rows per day = split shifts. */
export const putStaffHoursBody = z.object({
  locationId: uuidSchema.optional(),
  days: z.array(staffHoursRowSchema).max(70),
});
export type PutStaffHoursBody = z.input<typeof putStaffHoursBody>;

export const createTimeOffBody = z
  .object({ startsAt: isoDateTime, endsAt: isoDateTime, reason: z.string().trim().max(200).nullish() })
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { message: "Time off must end after it starts", path: ["endsAt"] });
export type CreateTimeOffBody = z.input<typeof createTimeOffBody>;

/** PUT /staff/:userId/services: which services this person does, with optional own duration and price. */
export const putStaffServicesBody = z.object({
  services: z
    .array(z.object({ serviceId: uuidSchema, durationMin: z.number().int().min(5).max(720).nullish(), priceCents: centsSchema.nullish() }))
    .max(200),
});
export type PutStaffServicesBody = z.input<typeof putStaffServicesBody>;

export interface StaffHoursDto {
  id: string;
  locationId: string;
  userId: string;
  weekday: number;
  startsLocal: string;
  endsLocal: string;
}
export interface TimeOffDto {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}
export interface StaffServiceDto {
  serviceId: string;
  durationMin: number | null;
  priceCents: number | null;
}
export interface BookableStaffDto {
  userId: string;
  name: string;
  initials: string;
  role: "owner" | "manager" | "staff" | "instructor";
  hours: StaffHoursDto[];
  timeOff: TimeOffDto[];
  services: StaffServiceDto[];
}
export interface CalendarStaffResponse {
  items: BookableStaffDto[];
  /** First-run state: the calendar needs at least one active service and one staff schedule. */
  setup: { services: number; staffWithHours: number; ready: boolean };
  timezone: string;
  locations: { id: string; name: string; hours: Record<string, [string, string][]> | null }[];
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------
export const appointmentItemSchema = z.object({
  serviceId: uuidSchema.nullable(),
  name: z.string().trim().min(1).max(160),
  durationMin: z.number().int().min(0).max(720),
  priceCents: centsSchema,
});
export type AppointmentItem = z.infer<typeof appointmentItemSchema>;

export interface AppointmentCustomerDto {
  id: string | null;
  name: string;
  phone: string | null;
  language: "en" | "hi" | "ur" | "pa";
}

/** The dog (or cat) a groom is for, as the calendar card shows it. The handling note is the shop's own note; only the shop's team sees it. */
export interface AppointmentPetDto {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sizeBand: string;
  coat: string;
  handlingNote: string | null;
  /** The worst vaccine state: current | expiring | expired | none (none recorded). */
  vaccines: "current" | "expiring" | "expired" | "none";
  /** Cadence the shop uses for this pet, in weeks (for the "next groom" step at checkout). */
  groomEveryWeeks: number;
}

export interface AppointmentDto {
  id: string;
  merchantId: string;
  locationId: string;
  customer: AppointmentCustomerDto;
  /** The pet this visit is for, when one was picked (pet shops). */
  pet?: AppointmentPetDto | null;
  staffId: string | null;
  staffName: string | null;
  requestedStaff: boolean;
  source: AppointmentSource;
  items: AppointmentItem[];
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  groupId: string | null;
  notes: string | null;
  clientNote: string | null;
  /** Sum of the item prices (before tax). */
  totalCents: number;
  depositCents: number;
  depositPaidAt: string | null;
  /** The card was saved by the customer: a no-show fee can be charged. */
  hasCardOnFile: boolean;
  noShowFeeCents: number | null;
  feeChargedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  invoiceId: string | null;
  /** Set while an online booking waits for its deposit or card; the job cancels it when this passes. */
  holdExpiresAt: string | null;
  createdAt: string;
}
export interface AppointmentsResponse {
  items: AppointmentDto[];
}

export const listAppointmentsQuery = z.object({
  from: isoDateTime,
  to: isoDateTime,
  staffId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  status: appointmentStatusSchema.optional(),
});

export const appointmentCustomerBody = z.object({
  /** An existing customer, or find-or-create by phone. */
  userId: uuidSchema.optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const createAppointmentBody = z
  .object({
    locationId: uuidSchema.optional(),
    customer: appointmentCustomerBody.optional(),
    staffId: uuidSchema.nullish(),
    requestedStaff: z.boolean().default(false),
    /** Services from the price list (durations and prices come from the server) ... */
    serviceIds: z.array(uuidSchema).max(20).default([]),
    /** ... and/or free lines (a lunch hold, a one-off). */
    items: z.array(appointmentItemSchema).max(20).default([]),
    /** Walk-ins start now; others need a start. */
    startsAt: isoDateTime.optional(),
    /** Override the computed end (resize). */
    endsAt: isoDateTime.optional(),
    source: z.enum(["staff", "walk_in"]).default("staff"),
    notes: z.string().trim().max(1000).nullish(),
    clientNote: z.string().trim().max(1000).nullish(),
    groupId: uuidSchema.nullish(),
    /** The pet this visit is for. With no customer given, the pet's owner is the customer. */
    petId: uuidSchema.nullish(),
    /** Managers may book outside a person's working hours. */
    force: z.boolean().default(false),
  })
  .refine((b) => b.serviceIds.length + b.items.length > 0, { message: "Pick at least one service", path: ["serviceIds"] })
  .refine((b) => b.source === "walk_in" || !!b.startsAt, { message: "Pick a start time", path: ["startsAt"] })
  .refine((b) => b.source === "walk_in" || !!b.customer || !!b.petId || b.items.some((i) => i.serviceId === null), { message: "Add the client's name or phone", path: ["customer"] });
export type CreateAppointmentBody = z.input<typeof createAppointmentBody>;

export const updateAppointmentBody = z
  .object({
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    staffId: uuidSchema.nullable().optional(),
    serviceIds: z.array(uuidSchema).min(1).max(20).optional(),
    items: z.array(appointmentItemSchema).min(1).max(20).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    clientNote: z.string().trim().max(1000).nullable().optional(),
    petId: uuidSchema.nullable().optional(),
    /** Moving a client who asked for a stylist by name to someone else needs this. */
    confirmStaffChange: z.boolean().default(false),
    force: z.boolean().default(false),
  })
  .refine((b) => Object.keys(b).some((k) => k !== "force" && k !== "confirmStaffChange"), { message: "Nothing to change" });
export type UpdateAppointmentBody = z.input<typeof updateAppointmentBody>;

export const appointmentStatusBody = z.object({
  status: appointmentStatusSchema,
  /** With status no_show: charge the shop's fee to the card on file. */
  chargeFee: z.boolean().default(false),
  reason: z.string().trim().max(200).nullish(),
});
export type AppointmentStatusBody = z.input<typeof appointmentStatusBody>;

export const COUNTER_METHODS = ["cash", "card_terminal", "other"] as const;
export const checkoutBody = z.object({
    /** Replace the lines at checkout (add or remove services). Omit to bill the booked services. */
    items: z.array(appointmentItemSchema).min(1).max(30).optional(),
    /** Tip on the pre-tax amount; tips never earn points. */
    tipCents: centsSchema.default(0),
    tipStaffId: uuidSchema.nullish(),
    /** A loyalty reward redeemed at the counter for this visit. */
    rewardId: uuidSchema.nullish(),
    mode: z.enum(["link", "counter"]),
    counterMethod: z.enum(COUNTER_METHODS).default("card_terminal"),
    note: z.string().trim().max(300).nullish(),
    /** A groom: weeks until the next one (sets the dog's cadence). Omit to keep the current cadence. */
    nextGroomWeeks: z.number().int().min(1).max(26).nullish(),
    /** A walk-in with no client on file: add a phone to check out (and earn points). */
    customer: appointmentCustomerBody.optional(),
});
export type CheckoutBody = z.input<typeof checkoutBody>;

export interface CheckoutInvoiceDto {
  id: string;
  number: number;
  status: "draft" | "open" | "paid" | "void";
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  depositAppliedCents: number;
  tipCents: number;
  tipStaffId: string | null;
  amountDueCents: number;
  platformFeeCents: number;
  pointsEarned: number;
  payUrl: string | null;
}
export interface CheckoutResponse {
  appointment: AppointmentDto;
  invoice: CheckoutInvoiceDto;
  /** Pay link texted to the customer (mode link). */
  payUrl: string | null;
  /** A groom for a pet was logged: the dog's cadence and when the next one is due. */
  pet?: { id: string; name: string; groomEveryWeeks: number; nextDueOn: string; logged: boolean } | null;
}

export interface StatusResponse {
  appointment: AppointmentDto;
  /** A no-show fee was charged (or already had been). */
  feeCharged: boolean;
  feeCents: number;
}

// ---------------------------------------------------------------------------
// Settings (cancel window, no-show fee, tips)
// ---------------------------------------------------------------------------
export const appointmentSettingsBody = z.object({
  cancelWindowHours: z.number().int().min(0).max(14 * 24).optional(),
  noShowFeeCents: centsSchema.optional(),
  tipsEnabled: z.boolean().nullable().optional(),
  tipPresets: z.array(z.number().int().min(1).max(100)).min(1).max(4).optional(),
});
export type AppointmentSettingsBody = z.input<typeof appointmentSettingsBody>;
export interface AppointmentSettingsDto {
  cancelWindowHours: number;
  noShowFeeCents: number;
  /** null = the vertical default (on for salons, barbers, nails, beauty). */
  tipsEnabled: boolean | null;
  tipsOn: boolean;
  tipPresets: number[];
  /** `applies` only when the shop is registered for GST/HST (checkout then adds `name` on taxable services). */
  tax: { applies: boolean; name: string };
  /** registered: tax is added; small: a small supplier charges none; unset: the owner has not answered, so none is added yet. */
  taxStatus: "registered" | "small" | "unset";
}

// ---------------------------------------------------------------------------
// Availability (computed, never stored per slot)
// ---------------------------------------------------------------------------
export const availabilityQuery = z.object({
  serviceIds: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(uuidSchema).min(1).max(20)),
  /** "any" or a staff user id. */
  staffId: z.union([z.literal("any"), uuidSchema]).default("any"),
  from: isoDate,
  to: isoDate,
  locationId: uuidSchema.optional(),
});
export interface AvailabilityResponse {
  timezone: string;
  /** Total minutes the chosen services block (durations plus buffers). */
  blockMin: number;
  days: { date: string; times: { startsAt: string; staffId: string }[] }[];
}

// ---------------------------------------------------------------------------
// Public shop and customer booking
// ---------------------------------------------------------------------------
export interface PublicServiceDto {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  priceFrom: boolean;
  depositCents: number;
  categoryName: string | null;
  translations: Record<string, { name?: string; description?: string }>;
  /** Staff who do it (empty = anyone). */
  staffIds: string[];
  /** The service carries sales tax (when the shop is registered). */
  taxable: boolean;
  /** Per-person overrides of duration and price (staff_services). */
  staffOverrides: { staffId: string; durationMin: number | null; priceCents: number | null }[];
}
export interface PublicStaffDto {
  id: string;
  name: string;
  initials: string;
}
export interface PublicBookingPolicyDto {
  cancelWindowHours: number;
  noShowFeeCents: number;
  /** Deposits and cards are taken online (the shop's payments are set up). */
  takesCards: boolean;
}
export interface PublicServicesResponse {
  shop: { name: string; slug: string; timezone: string; address: string | null; phone: string | null; logoUrl: string | null; brandColor: string | null; locationId: string | null; vertical?: string; pharmacy?: boolean };
  /** `applies` only when the shop is registered for GST/HST; `name` is what to call it ("HST"). */
  tax: { applies: boolean; name: string };
  policy: PublicBookingPolicyDto;
  services: PublicServiceDto[];
  staff: PublicStaffDto[];
}

export const createMyAppointmentBody = z.object({
  serviceIds: z.array(uuidSchema).min(1).max(20),
  /** null or omitted: any stylist (the server picks). */
  staffId: uuidSchema.nullish(),
  startsAt: isoDateTime,
  notes: z.string().trim().max(1000).nullish(),
  /** A bridal party shares one group. */
  groupId: uuidSchema.nullish(),
  locationId: uuidSchema.optional(),
  /** First name, when the account has none yet: the shop sees it on the calendar instead of "Walk-in". */
  customerName: z.string().trim().min(1).max(60).nullish(),
  /** One of the customer's own pets (pet shops). */
  petId: uuidSchema.nullish(),
});
export type CreateMyAppointmentBody = z.input<typeof createMyAppointmentBody>;

export const rescheduleMyAppointmentBody = z.object({ startsAt: isoDateTime, staffId: uuidSchema.nullish() });
export type RescheduleMyAppointmentBody = z.input<typeof rescheduleMyAppointmentBody>;

export interface MyAppointmentDto {
  id: string;
  merchant: { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null; address: string | null; phone: string | null; timezone: string };
  staffId: string | null;
  staffName: string | null;
  items: AppointmentItem[];
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  totalCents: number;
  depositCents: number;
  depositPaidAt: string | null;
  hasCardOnFile: boolean;
  /** Still waiting for the deposit or card (expires at holdExpiresAt). */
  pending: boolean;
  holdExpiresAt: string | null;
  policy: { cancelWindowHours: number; noShowFeeCents: number };
  /** Tax is added to this visit (the shop is registered and a service on it is taxable). */
  tax: { applies: boolean; name: string };
  /** Cancelling now is free (before the window). */
  freeChangeUntil: string;
  feeChargedAt: string | null;
  notes: string | null;
  petName: string | null;
  /**
   * Pharmacies only: the exact reminder text we will text for this booking (no service, no health details), in the customer's
   * language and with the STOP line. The booked screen shows it as "Reminder we will send".
   */
  reminderText?: string;
}
export interface PaymentRefDto {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
}
export interface SetupRefDto {
  setupIntentId: string;
  clientSecret: string;
}
export interface CreateMyAppointmentResponse {
  appointment: MyAppointmentDto;
  /** Pay this to hold the booking (services carry a deposit). */
  deposit: PaymentRefDto | null;
  /** Save a card to hold the booking (the shop has a no-show fee and no deposit). */
  setup: SetupRefDto | null;
  /** True when nothing is owed: the booking is already confirmed. */
  confirmed: boolean;
}
export interface MyAppointmentsResponse {
  items: MyAppointmentDto[];
}
export interface MyAppointmentChangeResponse {
  appointment: MyAppointmentDto;
  /** The change came inside the window and the fee was charged to the card on file. */
  feeCharged: boolean;
  feeCents: number;
}

/** GET /me/appointments/:id: the booking, plus the payment to finish when it is still a hold. */
export interface MyAppointmentResponse {
  appointment: MyAppointmentDto;
  deposit: PaymentRefDto | null;
  setup: SetupRefDto | null;
}
