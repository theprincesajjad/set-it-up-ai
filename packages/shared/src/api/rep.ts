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
