/**
 * API contract for the "rep" area (/v1/rep/...): onboarding rep console.
 * Auth: platform role "rep" (admins pass too). Endpoint docs: docs/engineering/api/rep.md.
 *
 * Done-for-you: a rep creates the merchant for the owner, applies the
 * vertical template, prints the QR kit, and tracks activation (25 members
 * with a visit). Reps act as "owner" on merchants they signed (requireStaff),
 * so they can use every /v1/merchants/:merchantId/... endpoint for setup.
 */
import { z } from "zod";
import { phoneSchema, uuidSchema } from "./common.js";
import { createMerchantBody, type QrKit } from "./merchant.js";

/** Rep pay (CAD cents). See PRD unit economics: $50 commission + $25 30-day activation bonus. */
export const REP_COMMISSION = {
  /** Paid per merchant the rep signs (merchant created with repUserId = rep). */
  signedCents: 5000,
  /** Paid when the merchant activates (≥ activation threshold members with a visit)… */
  activationBonusCents: 2500,
  /** …within this many days of signup. */
  activationWindowDays: 30,
} as const;

/** Rep check-ins after signup (PRD: day 7 and day 30 phone check-ins). */
export const CHECK_IN_DAYS = [7, 30] as const;

export const LEAD_STAGES = ["new", "contacted", "visit_booked", "signed", "activated", "lost"] as const;
export const leadStageSchema = z.enum(LEAD_STAGES);
export type LeadStage = z.infer<typeof leadStageSchema>;
export const LEAD_ACTIVITY_KINDS = ["call", "email", "visit", "note"] as const;
export const leadActivityKindSchema = z.enum(LEAD_ACTIVITY_KINDS);

export const LEAD_SOURCES = ["website", "street", "phone", "referral", "bia"] as const;
export const SETUP_CHANNELS = ["phone", "whatsapp", "video"] as const;
export type SetupChannel = (typeof SETUP_CHANNELS)[number];

const leadFields = {
  businessName: z.string().trim().min(1).max(160),
  vertical: z.string().trim().max(40).nullable(),
  address: z.string().trim().max(300).nullable(),
  contactName: z.string().trim().max(120).nullable(),
  phone: phoneSchema.nullable(),
  email: z.email().nullable(),
  neighbourhoodId: uuidSchema.nullable(),
  /** e.g. "paper punch card", "SoPoints", "none". */
  currentLoyalty: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  nextActionAt: z.iso.datetime({ offset: true }).nullable(),
  /** Admins can assign; reps can only assign to themselves. */
  assignedRepId: uuidSchema.nullable(),
  /** website | street | phone | referral | bia. */
  source: z.enum(LEAD_SOURCES).nullable(),
  /** Pin dropped from the rep's phone at the door. */
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** Remote setup session booked with the owner. */
  setupAt: z.iso.datetime({ offset: true }).nullable(),
  setupChannel: z.enum(SETUP_CHANNELS).nullable(),
};
export const createLeadBody = z.object(leadFields).partial().required({ businessName: true });
export const updateLeadBody = z.object({ ...leadFields, stage: leadStageSchema }).partial();
export const listLeadsQuery = z.object({
  stage: leadStageSchema.optional(),
  neighbourhoodId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  /** Admin: only leads assigned to me. Reps always see theirs + unassigned. */
  mine: z.enum(["true", "false"]).optional(),
  /** Only leads whose next action is due (nextActionAt <= now). */
  due: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
/** Marketing-site lead forms: "book a visit", "talk to us", BIA enquiry, restaurant visit. */
export const PUBLIC_LEAD_KINDS = ["book_visit", "talk_to_us", "bia", "restaurant"] as const;
export type PublicLeadKind = (typeof PUBLIC_LEAD_KINDS)[number];
/** Languages a restaurant owner can ask us to use (the app's four). */
export const LEAD_LANGUAGES = ["en", "hi", "ur", "pa"] as const;
/** A BIA lead with a board meeting this close is flagged in the rep inbox. */
export const BOARD_MEETING_SOON_DAYS = 30;
/** Per-IP submissions allowed per rolling hour on POST /v1/public/leads. */
export const PUBLIC_LEAD_RATE_LIMIT_PER_HOUR = 5;

/** POST /v1/public/leads (no auth). Give at least one of email or phone so someone can reply. */
export const publicLeadBody = z
  .object({
    businessName: z.string().trim().min(1).max(160),
    contactName: z.string().trim().max(120).optional(),
    email: z.email().max(200).optional(),
    phone: phoneSchema.optional(),
    vertical: z.string().trim().max(40).optional(),
    neighbourhoodSlug: z.string().trim().max(80).optional(),
    message: z.string().trim().max(2000).optional(),
    kind: z.enum(PUBLIC_LEAD_KINDS),
    /** Restaurants: the language to call or message in. */
    language: z.enum(LEAD_LANGUAGES).optional(),
    /** BIA enquiries: the contact's role, the event they have in mind, their next board meeting and member count. */
    role: z.string().trim().max(120).optional(),
    eventDate: z.iso.date().optional(),
    boardMeetingAt: z.iso.date().optional(),
    memberCount: z.number().int().min(1).max(5000).optional(),
  })
  .refine((b) => !!b.email || !!b.phone, { message: "Give an email or phone number so we can reply", path: ["email"] })
  .refine((b) => b.kind !== "restaurant" || !!b.phone, { message: "Restaurants need a phone number: we call, text or WhatsApp", path: ["phone"] });
export type PublicLeadBody = z.infer<typeof publicLeadBody>;
export interface PublicLeadResponse {
  id: string;
  received: true;
}

export const addLeadActivityBody = z.object({
  kind: leadActivityKindSchema,
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
  /** Optionally move the lead and set the next action in the same call. */
  stage: leadStageSchema.optional(),
  nextActionAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export interface Lead {
  id: string;
  businessName: string;
  vertical: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  neighbourhoodId: string | null;
  stage: LeadStage;
  currentLoyalty: string | null;
  assignedRepId: string | null;
  merchantId: string | null;
  nextActionAt: string | null;
  notes: string | null;
  /** From the marketing forms: restaurants' preferred language, BIA role, event date, next board meeting (YYYY-MM-DD) and member count. */
  language: (typeof LEAD_LANGUAGES)[number] | null;
  contactRole: string | null;
  eventDate: string | null;
  boardMeetingAt: string | null;
  memberCount: number | null;
  source: (typeof LEAD_SOURCES)[number] | null;
  lat: number | null;
  lng: number | null;
  setupAt: string | null;
  setupChannel: SetupChannel | null;
  activityCount: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface LeadActivity {
  id: string;
  kind: (typeof LEAD_ACTIVITY_KINDS)[number];
  outcome: string | null;
  notes: string | null;
  repUserId: string | null;
  createdAt: string;
}
export interface LeadDetail extends Lead {
  activities: LeadActivity[];
}

/** Done-for-you merchant creation. The owner gets an invite by email (preferred) or SMS. */
export const repCreateMerchantBody = createMerchantBody.extend({
  owner: z
    .object({ name: z.string().trim().max(120).optional(), email: z.email().optional(), phone: phoneSchema.optional() })
    .refine((o) => o.email || o.phone, { message: "Owner needs an email or phone number" }),
  /** Link the lead this came from (moves it to "signed"). */
  leadId: uuidSchema.optional(),
});
export type RepCreateMerchantBody = z.infer<typeof repCreateMerchantBody>;

export const logCheckInBody = z.object({
  day: z.union([z.literal(7), z.literal(30)]),
  outcome: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export interface CheckInState {
  day: 7 | 30;
  dueAt: string;
  /** Due date reached and not logged yet. */
  due: boolean;
  doneAt: string | null;
}

export interface RepMerchant {
  merchantId: string;
  name: string;
  slug: string;
  vertical: string;
  status: "onboarding" | "active" | "paused" | "closed";
  neighbourhoodId: string | null;
  createdAt: string;
  activatedAt: string | null;
  /** Members with ≥1 visit. */
  activeMembers: number;
  totalMembers: number;
  target: number;
  progressPct: number;
  daysSinceSignup: number;
  onboardingStep: string;
  checkIns: CheckInState[];
}

export interface CommissionItem {
  merchantId: string;
  name: string;
  signedAt: string;
  activatedAt: string | null;
  signedCents: number;
  activationBonusCents: number;
  /** activated = bonus earned; pending = window still open; missed = window closed without activation. */
  bonusStatus: "activated" | "pending" | "missed";
}
export interface CommissionSummary {
  rates: typeof REP_COMMISSION;
  merchantsSigned: number;
  merchantsActivated: number;
  signedEarnedCents: number;
  activationEarnedCents: number;
  totalEarnedCents: number;
  /** Bonus still achievable (pending merchants × bonus). */
  pendingBonusCents: number;
  items: CommissionItem[];
}

export type RepQrKit = QrKit;

// ---------------------------------------------------------------------------
// Street day, outcomes (offline-safe), today, proof
// ---------------------------------------------------------------------------
/** What happened at the door. Each one is one tap on the phone. */
export const LEAD_OUTCOMES = ["signed_up", "setup_call", "come_back", "not_interested", "not_in"] as const;
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number];
export const OUTCOME_LABEL: Record<LeadOutcome, string> = {
  signed_up: "Signed up",
  setup_call: "Setup call booked",
  come_back: "Come back",
  not_interested: "Not interested",
  not_in: "Not in",
};

export const leadOutcomeBody = z.object({
  outcome: z.enum(LEAD_OUTCOMES),
  /** Generated on the phone; the same id sent twice records one outcome (offline replays). */
  clientId: z.string().trim().min(8).max(80),
  /** When it happened on the phone (ISO); defaults to now. */
  at: z.iso.datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
  /** come_back: when to return (default in 2 days). */
  nextActionAt: z.iso.datetime({ offset: true }).optional(),
  /** setup_call: when and how. */
  setupAt: z.iso.datetime({ offset: true }).optional(),
  setupChannel: z.enum(SETUP_CHANNELS).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type LeadOutcomeBody = z.infer<typeof leadOutcomeBody>;
export const OUTCOME_SYNC_MAX = 100;
export const outcomeSyncBody = z.object({ items: z.array(leadOutcomeBody.extend({ leadId: uuidSchema })).min(1).max(OUTCOME_SYNC_MAX) });
export interface OutcomeSyncResult {
  results: { clientId: string; leadId: string; status: "recorded" | "duplicate" | "not_found" }[];
}

export interface StreetStop extends Lead {
  /** 1-based position in today's walking order (open stops only). */
  order: number | null;
  todayOutcome: LeadOutcome | null;
}
export interface StreetDay {
  area: { id: string; name: string; streetDayOn: string | null; targetShops: number; storefrontEstimate: number | null } | null;
  /** Open stops in walking order, then the ones already visited today. */
  stops: StreetStop[];
  counts: { total: number; visited: number; signedUp: number; setupCalls: number; comeBack: number; notInterested: number; notIn: number; left: number };
  generatedAt: string;
}

export interface RepToday {
  repName: string | null;
  streetDay: { areaId: string; areaName: string; streetDayOn: string | null; visited: number; total: number; isToday: boolean } | null;
  checkInsDue: { merchantId: string; name: string; day: 7 | 30; daysSinceSignup: number; activeMembers: number; target: number }[];
  setupSessions: { leadId: string; businessName: string; setupAt: string; setupChannel: SetupChannel | null; phone: string | null }[];
  leadsDue: Lead[];
  websiteLeads: Lead[];
}

/** Live numbers a rep shows at the door, computed from the real network. */
export interface PitchProof {
  area: { id: string; name: string } | null;
  shopsLive: number;
  customers: number;
  multiShopPct: number;
  visitsLast7Days: number;
  topShops: { name: string; vertical: string; members: number }[];
  /** The whole network, for areas with too few shops of their own to talk about yet. */
  network: { shopsLive: number; customers: number };
}
