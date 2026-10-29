/**
 * Waitlist that fills cancelled slots (docs/business/pro-value.md §3.2 P2, workstream P2).
 *
 * A client asks for a spot from a full day on the booking page (public, or signed in); the owner can add one by hand. When a slot
 * opens (a cancellation, a no-show, or the owner's "Offer a slot"), the oldest matching ask is offered it with a two-hour hold on
 * Pro, Studio and the trial (`booking.waitlist`), by the client's best channel, with a one-tap "Take it" link (/w/<token>). If the
 * hold lapses the next match is offered, at most WAITLIST_MAX_OFFERS times per slot. On Free the asks are stored and shown, and
 * nothing is sent.
 */
import { z } from "zod";

export const WAITLIST_TIME_PREFS = ["any", "morning", "afternoon", "evening"] as const;
export type WaitlistTimePref = (typeof WAITLIST_TIME_PREFS)[number];

export const WAITLIST_STATUSES = ["waiting", "offered", "booked", "expired", "removed"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const FREED_SLOT_STATUSES = ["open", "offered", "filled", "unfilled", "skipped", "locked"] as const;
export type FreedSlotStatus = (typeof FREED_SLOT_STATUSES)[number];

/** How long an offer holds the slot. */
export const WAITLIST_HOLD_MINUTES = 120;
/** Offers per freed slot before it is left open for anyone to book. */
export const WAITLIST_MAX_OFFERS = 3;
/** A slot that starts sooner than this is not offered (nobody can get there). */
export const WAITLIST_MIN_LEAD_MINUTES = 30;
/** The longest window a client can ask for, in days. */
export const WAITLIST_MAX_WINDOW_DAYS = 31;
/** Open asks one client may have at one shop. */
export const WAITLIST_MAX_OPEN_PER_CLIENT = 3;

/** Local start minute bounds for each part of the day: morning before 12:00, afternoon 12:00-17:00, evening from 17:00. */
export function fitsTimePref(pref: WaitlistTimePref, localMinutes: number): boolean {
  if (pref === "morning") return localMinutes < 12 * 60;
  if (pref === "afternoon") return localMinutes >= 12 * 60 && localMinutes < 17 * 60;
  if (pref === "evening") return localMinutes >= 17 * 60;
  return true;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const windowRefine = <T extends { windowStart: string; windowEnd: string }>(b: T) => b.windowEnd >= b.windowStart;

/** Public ask from the booking page. Signed in: the account is used and name/phone/email are optional. */
export const joinWaitlistBody = z
  .object({
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().nullish(),
    windowStart: day,
    windowEnd: day,
    timePref: z.enum(WAITLIST_TIME_PREFS).default("any"),
    name: z.string().trim().min(1).max(80).nullish(),
    phone: z.string().trim().min(7).max(20).nullish(),
    email: z.string().trim().email().max(200).nullish(),
    locationId: z.string().uuid().nullish(),
  })
  .refine(windowRefine, { message: "The last day must be on or after the first", path: ["windowEnd"] });
export type JoinWaitlistBody = z.input<typeof joinWaitlistBody>;

/** The owner adds a client by hand (from a phone call or a message). */
export const addWaitlistBody = z
  .object({
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().nullish(),
    windowStart: day,
    windowEnd: day,
    timePref: z.enum(WAITLIST_TIME_PREFS).default("any"),
    userId: z.string().uuid().nullish(),
    name: z.string().trim().min(1).max(80).nullish(),
    phone: z.string().trim().min(7).max(20).nullish(),
    email: z.string().trim().email().max(200).nullish(),
    locationId: z.string().uuid().nullish(),
  })
  .refine(windowRefine, { message: "The last day must be on or after the first", path: ["windowEnd"] })
  .refine((b) => !!b.userId || !!b.name, { message: "Add the client's name", path: ["name"] });
export type AddWaitlistBody = z.input<typeof addWaitlistBody>;

/** "Offer a slot": one of the openings from GET .../waitlist/:id/openings, offered to this client now. */
export const offerSlotBody = z.object({ startsAt: z.string().datetime({ offset: true }), staffId: z.string().uuid() });
export type OfferSlotBody = z.infer<typeof offerSlotBody>;

/** The cancel confirm's switch: false = do not offer this appointment's slot to the waitlist when it is cancelled. */
export const slotPreferenceBody = z.object({ offer: z.boolean() });

export const listWaitlistQuery = z.object({
  status: z.enum(["open", "all"]).default("open"),
  /** Freed slots on this shop-local day (the calendar chip). */
  day: day.optional(),
});

/** One ask, as the owner sees it. */
export interface WaitlistEntryDto {
  id: string;
  customer: { userId: string | null; name: string; phone: string | null; email: string | null };
  serviceId: string;
  serviceName: string;
  durationMin: number;
  staffId: string | null;
  staffName: string | null;
  windowStart: string;
  windowEnd: string;
  timePref: WaitlistTimePref;
  status: WaitlistStatus;
  source: "online" | "staff";
  offeredAt: string | null;
  offerExpiresAt: string | null;
  /** The slot on offer (or booked from the list). */
  offeredSlot: { startsAt: string; endsAt: string; staffName: string | null } | null;
  bookedAppointmentId: string | null;
  createdAt: string;
}

/** A slot that opened, and what the waitlist did with it (the calendar chip and the cancel confirm). */
export interface FreedSlotDto {
  id: string;
  startsAt: string;
  endsAt: string;
  staffId: string | null;
  staffName: string | null;
  reason: "cancelled" | "no_show" | "manual";
  status: FreedSlotStatus;
  offers: number;
  /** The live offer, when one is open. */
  offer: { entryId: string; name: string; expiresAt: string } | null;
  /** Filled from the waitlist: who took it. */
  filledBy: string | null;
  /** Open asks that this slot would suit (Free: the "{n} waiting" line). */
  matching: number;
}

export interface WaitlistResponse {
  items: WaitlistEntryDto[];
  /** Open asks (waiting or offered). */
  waiting: number;
  /** Automatic offers are on (Pro, Studio, the trial). */
  autoOffer: boolean;
  /** Freed slots on `day`, when asked. */
  slots: FreedSlotDto[];
}

/** For the cancel confirm: how many would be offered this appointment's slot, and the saved switch. */
export interface SlotPreviewResponse {
  waiting: number;
  matching: number;
  autoOffer: boolean;
  offer: boolean;
}

export interface OpeningsResponse {
  timezone: string;
  items: { startsAt: string; endsAt: string; staffId: string; staffName: string | null }[];
}

/** The booking page: is there a waitlist, and which days the shop works (a working day with no times is "Full"). */
export interface PublicWaitlistInfo {
  open: boolean;
  workDays: string[];
}

/** One ask, as the client sees it (web pass, the app). */
export interface MyWaitlistEntryDto {
  id: string;
  merchant: { id: string; name: string; slug: string; brandColor: string | null; logoUrl: string | null };
  serviceName: string;
  staffName: string | null;
  windowStart: string;
  windowEnd: string;
  timePref: WaitlistTimePref;
  status: WaitlistStatus;
  /** An open offer: the slot and until when it is held. */
  offer: { startsAt: string; endsAt: string; expiresAt: string; token: string } | null;
  createdAt: string;
}

export interface MyWaitlistResponse {
  items: MyWaitlistEntryDto[];
}

/** The "Take it" page. */
export interface OfferDto {
  state: "open" | "taken" | "expired" | "booked";
  merchant: { name: string; slug: string; brandColor: string | null; logoUrl: string | null; vertical: string | null; timezone: string };
  serviceName: string;
  staffName: string | null;
  startsAt: string;
  endsAt: string;
  expiresAt: string | null;
  priceCents: number;
  /** Set once booked: the client's appointment. */
  appointmentId: string | null;
}

export interface TakeOfferResponse {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
}
