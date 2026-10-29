/**
 * Landing-page A/B tests: the beacon body (POST /v1/public/landing-events), the admin report (GET /v1/admin/experiments[/:id])
 * and the three admin writes. Docs: docs/engineering/api/experiments.md. Pre-registration: packages/shared/src/experiments.ts.
 */
import { z } from "zod";
import { AID_PATTERN, LANDING_EVENT_KINDS, type Experiment, type VariantId } from "../experiments.js";

// ---------------------------------------------------------------------------
// Beacon (no login; first-party; the IP is used for rate limiting only and is not stored)
// ---------------------------------------------------------------------------
export const BEACON_MAX_BYTES = 2048;
export const BEACON_MAX_EVENTS = 10;
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Kinds we do not know are dropped, not refused, so an old page in a browser tab never errors. */
export const landingEventsBody = z.object({
  aid: z.string().regex(AID_PATTERN),
  /** The `ll_v` cookie: `<experimentId>:<variantId>`, `none:<variantId>`, or null. */
  v: z.string().max(90).nullish(),
  /** The variant the page rendered (`data-variant`), for a visitor with no `ll_v`. */
  rv: z.string().regex(ID).nullish(),
  /** location.pathname: /for-nail-techs, /for-barbers or /for-groomers. */
  p: z.string().max(200),
  /** The page look (`data-solo-trade`): nails, brows, lashes, makeup, barber, groom. */
  tr: z.string().max(20).nullish(),
  src: z.string().max(80).nullish(),
  /** location.search, when the page sends it instead of `src`; only its `src` is read. */
  q: z.string().max(400).nullish(),
  ev: z
    .array(z.object({ k: z.string().max(20), t: z.number().optional(), d: z.string().max(20).nullish() }))
    .min(1)
    .max(BEACON_MAX_EVENTS),
});
export type LandingEventsBody = z.infer<typeof landingEventsBody>;
export const KNOWN_KINDS: readonly string[] = LANDING_EVENT_KINDS;

/** GET /v1/public/experiments: what the web proxy needs to assign (cached there for a minute). */
export interface PublicExperimentsState {
  /** Tests ended from the admin page before their pre-registered end. */
  ended: string[];
}

// ---------------------------------------------------------------------------
// Admin report
// ---------------------------------------------------------------------------
export type Look = "none" | "interim" | "final";
export interface Rate {
  p: number;
  lo: number;
  hi: number;
}
export type RateKey = "startSubmit" | "linkLive" | "firstBooking" | "paid";
export interface Lift {
  /** (arm − control) / control; null when the control rate is 0. */
  relative: number | null;
  pValue: number;
  verdict: "chance" | "unlikely_chance";
}
export interface ArmGuardrails {
  costPerSignupCents: number | null;
  linkLiveShareOfControl: number | null;
  lighthouse: number | null;
  status: "ok" | "watch" | "red";
}
export interface ArmReport {
  variant: VariantId;
  exposures: number;
  startSubmits: number;
  signedUp: number;
  linkLive: number;
  firstBooking7d: number;
  paid30d: number;
  /** Signups that carry this variant but whose anonymous id has no `view` row (cookie cleared, GPC on, another device). */
  unmatchedSignups: number;
  /** Wilson 95% intervals; denominator = exposures. */
  rates: Record<RateKey, Rate>;
  /** Present only while a pre-registered look is open, and never on the control arm. */
  lift?: Record<"startSubmit" | "linkLive", Lift>;
  guardrails: ArmGuardrails;
}
export type ExperimentStatus = "scheduled" | "running" | "interim" | "horizon" | "ended";
export interface ExperimentReport {
  experiment: Experiment;
  status: ExperimentStatus;
  /** When the test was ended from the admin page (or its pre-registered endedAt has passed). */
  ended: { at: string; reason: string | null } | null;
  exposures: number;
  horizonPct: number;
  look: Look;
  /** The alpha of the open look (null when no look is open). */
  alpha: number | null;
  interimTakenAt: string | null;
  arms: ArmReport[];
  byTrade: { trade: string; variant: VariantId; exposures: number; startSubmits: number; linkLive: number }[];
  bySrc: { src: string; variant: VariantId; exposures: number; startSubmits: number; linkLive: number }[];
}
export interface ExperimentSummary {
  experiment: Experiment;
  status: ExperimentStatus;
  exposures: number;
  horizonPct: number;
}

export const recordLookBody = z.object({ look: z.literal("interim") });
export const guardrailInputBody = z.object({ variant: z.string().regex(ID), costPerSignupCents: z.number().int().min(0).max(10_000_000) });
export const endExperimentBody = z.object({ reason: z.string().trim().min(3).max(500) });
export type GuardrailInputBody = z.infer<typeof guardrailInputBody>;
