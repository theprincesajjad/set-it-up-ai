/**
 * API contract for barbershops, threading bars and beauty supply (features `booking.walkin_queue` and `staff.payouts`):
 * the walk-in line, chair-rental and commission payouts, "my barber" and family members.
 * Routes: apps/api/src/routes/barber. Docs: docs/engineering/api/barber.md. Research: docs/research/barbers-beauty.md.
 * Money is integer cents (CAD). Timestamps are ISO-8601 strings.
 */
import { z } from "zod";
import { centsSchema, uuidSchema } from "./common.js";

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();
const firstName = z.string().trim().min(1).max(40);

export const QUEUE_SOURCES = ["join", "tablet", "staff"] as const;
export const PAY_MODELS = ["employee", "commission", "chair_rent"] as const;
export type PayModel = (typeof PAY_MODELS)[number];

// ---- queue settings
export const queueSettingsBody = z.object({
  open: z.boolean().optional(),
  minutesPerCut: z.number().int().min(5).max(120).optional(),
  textNext: z.boolean().optional(),
  maxWaiting: z.number().int().min(1).max(100).optional(),
  callHoldMinutes: z.number().int().min(1).max(30).optional(),
});
export type QueueSettingsBody = z.infer<typeof queueSettingsBody>;
export interface QueueSettingsDto {
  open: boolean;
  minutesPerCut: number;
  textNext: boolean;
  maxWaiting: number;
  callHoldMinutes: number;
}

// ---- joining
export const joinQueueBody = z.object({
  name: firstName,
  /** Guests: the mobile number for the one text. Signed-in customers can leave it out. */
  phone: z.string().trim().min(7).max(20).optional(),
  serviceId: uuidSchema.nullish(),
  requestedStaffId: uuidSchema.nullish(),
  /** The person ticked "text me when I'm next". */
  textConsent: z.boolean().default(false),
  /** Signed-in parents: family members who join with them (their first names go on the list). */
  familyMemberIds: z.array(uuidSchema).max(6).default([]),
  source: z.enum(QUEUE_SOURCES).default("join"),
});
export type JoinQueueBody = z.input<typeof joinQueueBody>;

export const staffAddBody = z.object({
  name: firstName,
  phone: z.string().trim().min(7).max(20).optional(),
  serviceId: uuidSchema.nullish(),
  requestedStaffId: uuidSchema.nullish(),
  textConsent: z.boolean().default(false),
  /** tablet: typed in on the door tablet (the same form a customer sees); staff: added by the front desk. */
  source: z.enum(["staff", "tablet"]).default("staff"),
});
export type StaffAddBody = z.input<typeof staffAddBody>;

export const callBody = z.object({ staffId: uuidSchema });
export type CallBody = z.infer<typeof callBody>;

export interface QueueEntryDto {
  id: string;
  /** 1-based place among people still waiting; null once called. */
  position: number | null;
  name: string;
  /** The customer's name when the entry is a family member (so staff see "Aiden, with Sajjad"). */
  withName: string | null;
  serviceName: string;
  durationMin: number;
  requestedStaffId: string | null;
  requestedStaffName: string | null;
  status: "waiting" | "called" | "in_service" | "done" | "no_show" | "left";
  source: string;
  joinedAt: string;
  calledAt: string | null;
  calledStaffId: string | null;
  waitedMin: number;
  textedNext: boolean;
  skips: number;
  appointmentId: string | null;
  partyId: string | null;
}

export interface QueueChairDto {
  staffId: string;
  name: string;
  takesWalkIns: boolean;
  /** free | busy | called | away */
  state: "free" | "busy" | "called" | "away";
  /** What is happening at the chair ("Devon, fade") or null. */
  doing: string | null;
  entryId: string | null;
  appointmentId: string | null;
  minutesIn: number | null;
  waitingForThem: number;
}

export interface QueueBoardResponse {
  settings: QueueSettingsDto;
  waiting: QueueEntryDto[];
  called: QueueEntryDto[];
  inService: QueueEntryDto[];
  chairs: QueueChairDto[];
  stats: { waiting: number; longestWaitMin: number; estimateMin: number | null; chairsTaking: number; chairsTotal: number; servedToday: number; noShowsToday: number };
  services: { id: string; name: string; durationMin: number }[];
}

export interface PublicQueueResponse {
  shop: { name: string; slug: string };
  open: boolean;
  waiting: number;
  estimateMin: number | null;
  barbers: { id: string; name: string; estimateMin: number | null }[];
  services: { id: string; name: string; durationMin: number; priceCents: number }[];
}

export interface QueueStatusResponse {
  token: string;
  shop: { name: string; slug: string };
  name: string;
  serviceName: string;
  state: "waiting" | "called" | "in_service" | "done" | "no_show" | "left";
  /** 1-based; null unless waiting. */
  position: number | null;
  ahead: number;
  estimateMin: number | null;
  barberName: string | null;
  calledBarberName: string | null;
  /** Family members who joined with this person (first names). */
  party: { name: string; position: number | null }[];
}

export interface JoinQueueResponse {
  entries: { id: string; token: string; name: string }[];
  /** Status page of the first entry. */
  token: string;
  status: QueueStatusResponse;
}

/** What a skip changed, handed back so Undo can restore it. */
export const skipUndo = z.object({
  status: z.enum(["waiting", "called"]),
  skips: z.number().int().min(0),
  positionAt: z.string(),
  calledAt: z.string().nullable(),
  calledStaffId: uuidSchema.nullable(),
  notifiedNextAt: z.string().nullable(),
});
export type SkipUndo = z.infer<typeof skipUndo>;

export interface QueueActionResponse {
  entry: QueueEntryDto;
  appointmentId?: string | null;
  /** Present on a skip: send it back to undo the skip within a minute. */
  undo?: SkipUndo;
}

// ---- pay and payouts
export const staffPayBody = z.object({
  model: z.enum(PAY_MODELS),
  /** Commission: the share the shop keeps, 0 to 100 percent in basis points. */
  shopShareBps: z.number().int().min(0).max(10_000).default(0),
  rentCentsWeek: centsSchema.default(0),
  ownClientsOnly: z.boolean().default(false),
  takesWalkIns: z.boolean().default(true),
});
export type StaffPayBody = z.input<typeof staffPayBody>;
export interface StaffPayDto {
  userId: string;
  name: string;
  model: PayModel;
  shopShareBps: number;
  rentCentsWeek: number;
  ownClientsOnly: boolean;
  takesWalkIns: boolean;
}

export const payoutsQuery = z.object({ from: isoDate, to: isoDate });
export type PayoutsQuery = z.infer<typeof payoutsQuery>;

export interface PayoutRowDto {
  staffId: string;
  name: string;
  model: PayModel;
  shopShareBps: number;
  rentCentsWeek: number;
  visits: number;
  servicesCents: number;
  tipsCents: number;
  shopKeepsCents: number;
  rentCents: number;
  takeHomeCents: number;
}
export interface PayoutsResponse {
  from: string;
  to: string;
  days: number;
  rows: PayoutRowDto[];
  totals: { visits: number; servicesCents: number; tipsCents: number; shopKeepsCents: number; rentCents: number; takeHomeCents: number };
  /** True when the caller sees only their own row (own clients only, or a staff member without manager rights). */
  mine: boolean;
}

// ---- customer: my barber and family
export const familyBody = z.object({ firstName, consent: z.literal(true) });
export type FamilyBody = z.infer<typeof familyBody>;
export interface FamilyMemberDto {
  id: string;
  firstName: string;
  consentAt: string;
}
export interface FamilyResponse {
  items: FamilyMemberDto[];
  max: number;
}
export const preferredBody = z.object({ staffId: uuidSchema.nullable() });
export type PreferredBody = z.infer<typeof preferredBody>;
export interface MyBarberResponse {
  staffId: string | null;
  name: string | null;
  source: "auto" | "chosen" | null;
  visitsWith: number;
  /** Who can be picked. */
  barbers: { id: string; name: string }[];
}
