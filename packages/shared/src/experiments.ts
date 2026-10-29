/**
 * Landing-page experiments: the pre-registered tests (docs/marketing/value-props.md §3, build spec ab-spec.md §2) and the
 * small pure helpers both apps share: which test is running on a page, the sticky draw from the anonymous id, the cookie
 * formats and the sample-size arithmetic the horizon comes from.
 *
 * Pre-registration: arms, weights, baseline, minimum detectable effect, horizon, the one interim look and the alphas are set
 * here, in code, before a test starts, and nobody changes them while it runs. Starting a test is setting `startedAt` (the page
 * assigns from that instant). Stopping one is `endedAt` here, or "End experiment" on /admin/experiments (stored in the
 * `experiment_ends` table, read by the web proxy within a minute).
 */

/** The three solo landing pages (apps/web/src/lib/marketing/solo.ts `SoloPageId`). */
export type ExperimentPage = "nail" | "barber" | "groom";
/** A `LANDING_VARIANTS` id (apps/web/src/copy/en-CA.ts): "control", "yours", "price" ... */
export type VariantId = string;

export const CONTROL_VARIANT = "control";

/** The page looks: the nail page's four trades, barber and groom. */
export const LANDING_LOOKS = ["nails", "brows", "lashes", "makeup", "barber", "groom"] as const;
export type LandingLook = (typeof LANDING_LOOKS)[number];

/** The page a look is served on. The four nail looks pool into one test (value-props §3.3.3). */
export function pageOfLook(look: LandingLook): ExperimentPage {
  return look === "barber" ? "barber" : look === "groom" ? "groom" : "nail";
}

/** The public URL of each page. */
export const LANDING_PATHS: Record<ExperimentPage, string> = { nail: "/for-nail-techs", barber: "/for-barbers", groom: "/for-groomers" };

export const LANDING_EVENT_KINDS = ["view", "scroll_50", "scroll_90", "cta_click", "start_submit"] as const;
export type LandingEventKind = (typeof LANDING_EVENT_KINDS)[number];
/** Counted once per anonymous id per test (a refresh is not a second exposure). */
export const ONCE_PER_VISITOR_KINDS: readonly LandingEventKind[] = ["view", "start_submit"];
export const CTA_IDS = ["hero", "nav", "plans", "faq"] as const;

/** First-party cookies (no personal information). */
export const LANDING_COOKIES = { aid: "ll_aid", variant: "ll_v", src: "ll_src" } as const;
/** `ll_aid=off`: the visitor turned counting off. */
export const AID_OFF = "off";
export const LANDING_COOKIE_DAYS = 30;
export const AID_OFF_DAYS = 365;
/** 16 random bytes, base64url, no padding. */
export const AID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** `ll_v` when no test runs on the page but an ad URL named a variant (`?v=dms`). */
export const NO_EXPERIMENT = "none";

export interface Experiment {
  id: string;
  pages: ExperimentPage[];
  arms: { variant: VariantId; weight: number }[];
  /** ISO date or instant; the page assigns only between startedAt and endedAt. */
  startedAt: string;
  endedAt?: string;
  decidingMetric: "start_submit" | "link_live";
  /** Baseline rate of the deciding metric. */
  baseline: number;
  /** Relative minimum detectable effect: 1.0 = +100%. */
  mde: number;
  /** Exposures, all arms together, at the final look. */
  horizonExposures: number;
  /** Share of the horizon at which the one interim look opens. */
  interimAt: number;
  alphaInterim: number;
  alphaFinal: number;
  guardrails: { maxCostPerSignupCents: number; minLinkLiveShareOfControl: number };
}

const T1_NUMBERS = {
  decidingMetric: "start_submit",
  baseline: 0.05,
  mde: 1.0,
  horizonExposures: 880,
  interimAt: 0.5,
  alphaInterim: 0.01,
  alphaFinal: 0.045,
  guardrails: { maxCostPerSignupCents: 9000, minLinkLiveShareOfControl: 0.5 },
} as const satisfies Partial<Experiment>;

/**
 * The pre-registered tests. T1 (value-props §3.1): the lead message, on the nail page (all four trades pooled) and on the
 * barber page, in parallel (separate pages, separate ad sets, no shared denominator).
 * `startedAt` is Day 1 of the ads (midnight in Toronto); move it (before the start, never after) if the ads start on another day.
 */
export const EXPERIMENTS: readonly Experiment[] = [
  { id: "t1-nails-lead", pages: ["nail"], arms: [{ variant: "control", weight: 0.5 }, { variant: "yours", weight: 0.5 }], startedAt: "2026-11-02T00:00:00-05:00", ...T1_NUMBERS, guardrails: { ...T1_NUMBERS.guardrails } },
  { id: "t1-barber-lead", pages: ["barber"], arms: [{ variant: "control", weight: 0.5 }, { variant: "price", weight: 0.5 }], startedAt: "2026-11-02T00:00:00-05:00", ...T1_NUMBERS, guardrails: { ...T1_NUMBERS.guardrails } },
];

export function experimentById(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

export function isArm(exp: Experiment, variant: string): boolean {
  return exp.arms.some((a) => a.variant === variant);
}

/** Running at `now`: started, not past `endedAt`, and not ended from the admin page (`ended`). */
export function isRunning(exp: Experiment, now: Date, ended: ReadonlySet<string> | readonly string[] = []): boolean {
  const stopped = Array.isArray(ended) ? (ended as readonly string[]).includes(exp.id) : (ended as ReadonlySet<string>).has(exp.id);
  if (stopped) return false;
  if (now.getTime() < new Date(exp.startedAt).getTime()) return false;
  return !exp.endedAt || now.getTime() < new Date(exp.endedAt).getTime();
}

/** The test running on a page, if any (at most one: tests on the same page never overlap). */
export function activeExperiment(page: ExperimentPage, now: Date, ended: ReadonlySet<string> | readonly string[] = [], list: readonly Experiment[] = EXPERIMENTS): Experiment | undefined {
  return list.find((e) => e.pages.includes(page) && isRunning(e, now, ended));
}

/**
 * Per-arm sample for a two-sided test at α = 0.05 and power 0.80 with equal arms (value-props §3.3, normal approximation):
 * n ≈ 15.7 × p̄(1 − p̄) / δ², p̄ the mean of the two rates, δ their difference. Returns both arms together.
 */
export function horizonFor(baseline: number, mde: number): number {
  const p2 = baseline * (1 + mde);
  const pBar = (baseline + p2) / 2;
  const delta = p2 - baseline;
  return 2 * Math.ceil((15.7 * pBar * (1 - pBar)) / (delta * delta));
}

/** A stable number in [0, 1) from a string (FNV-1a with a murmur3 finaliser): the same id always lands in the same place. */
export function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The arm an anonymous id draws, by weight. Deterministic: losing the `ll_v` cookie does not change the arm. */
export function drawArm(exp: Experiment, aid: string): VariantId {
  const r = unitHash(`${exp.id}:${aid}`);
  let acc = 0;
  for (const a of exp.arms) {
    acc += a.weight;
    if (r < acc) return a.variant;
  }
  return exp.arms[exp.arms.length - 1]!.variant;
}

const ID_PART = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** `ll_v` = `<experimentId>:<variantId>` (or `none:<variantId>`). Anything else is ignored. */
export function parseVariantCookie(raw: string | null | undefined): { experimentId: string | null; variant: VariantId } | null {
  if (!raw) return null;
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const i = v.indexOf(":");
  if (i < 0) return null;
  const exp = v.slice(0, i);
  const variant = v.slice(i + 1);
  if (!ID_PART.test(exp) || !ID_PART.test(variant)) return null;
  return { experimentId: exp === NO_EXPERIMENT ? null : exp, variant };
}

export function variantCookie(experimentId: string | null, variant: VariantId): string {
  return `${experimentId ?? NO_EXPERIMENT}:${variant}`;
}

/** A `?v=` value: a bare variant id. */
export function isVariantId(v: string | null | undefined): v is string {
  return !!v && ID_PART.test(v);
}

/**
 * The instant the experiment schedule is read at. Real time, except in tests: `EXPERIMENTS_NOW` (an ISO instant) pins it for a
 * whole e2e run, and the `x-ll-experiments-now` header moves it for one request. Both apply only when `enabled` (the API:
 * NODE_ENV is not production; the web app: EXPERIMENTS_TEST_CLOCK=1, which only e2e/run-all.sh sets).
 */
export const EXPERIMENTS_CLOCK_HEADER = "x-ll-experiments-now";
export function experimentsNow(real: Date, opts: { enabled: boolean; env?: string | null; header?: string | null }): Date {
  if (!opts.enabled) return real;
  for (const raw of [opts.header, opts.env]) {
    if (!raw) continue;
    const t = new Date(raw);
    if (!Number.isNaN(t.getTime())) return t;
  }
  return real;
}
