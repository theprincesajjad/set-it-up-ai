/**
 * Pet care rules (docs/research/pet-care.md). Pure functions so the API, the web and the tests share one answer:
 * vaccine status, groom cadence, the daycare check-in block, and the buy-N-get-1 food card with its run-out date.
 * Dates are shop-local "YYYY-MM-DD" strings; instants are Date or ISO strings.
 */
export const PET_SPECIES = ["dog", "cat", "other"] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];
export const SIZE_BANDS = ["small", "medium", "large", "giant"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const COATS = ["short", "double", "curly", "long_silky", "wire", "hairless"] as const;
export type Coat = (typeof COATS)[number];
/** Rabies is the only legal one (Ontario Reg. 567); the others are shop policy. */
export const VACCINE_KINDS = ["rabies", "dhpp", "bordetella", "other"] as const;
export type VaccineKind = (typeof VACCINE_KINDS)[number];
export const VACCINE_LABELS: Record<VaccineKind, string> = { rabies: "Rabies", dhpp: "DHPP", bordetella: "Bordetella", other: "Other" };
export const DEFAULT_REQUIRED_VACCINES: VaccineKind[] = ["rabies", "dhpp", "bordetella"];
export const MAX_PETS_PER_OWNER = 8;
export const EXPIRING_DAYS = 30;

const DAY_MS = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
export const addDaysStr = (d: string, n: number): string => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
export const daysBetweenStr = (a: string, b: string): number => Math.round(dayNum(b) - dayNum(a));

// ---------------------------------------------------------------- vaccines
export type VaccineStatus = "current" | "expiring" | "expired";
export function vaccineStatus(expiresOn: string, today: string): { status: VaccineStatus; daysLeft: number } {
  const daysLeft = daysBetweenStr(today, expiresOn);
  // The certificate is good through its expiry date.
  return { status: daysLeft < 0 ? "expired" : daysLeft <= EXPIRING_DAYS ? "expiring" : "current", daysLeft };
}

/** Required vaccine kinds a pet is missing or has expired on `day`. */
export function vaccineProblems(vaccines: readonly { kind: string; expiresOn: string }[], required: readonly string[], day: string): { kind: string; why: "missing" | "expired"; expiresOn?: string }[] {
  const out: { kind: string; why: "missing" | "expired"; expiresOn?: string }[] = [];
  for (const kind of required) {
    const v = vaccines.find((x) => x.kind === kind);
    if (!v) out.push({ kind, why: "missing" });
    else if (v.expiresOn < day) out.push({ kind, why: "expired", expiresOn: v.expiresOn });
  }
  return out;
}

// ---------------------------------------------------------------- groom cadence
/** Default weeks between grooms by coat (mid-points of the groomer sources in the research doc). */
export function defaultGroomWeeks(coat: string): number {
  switch (coat) {
    case "curly": return 5;
    case "long_silky": return 4;
    case "double": return 8;
    case "wire": return 8;
    case "hairless": return 8;
    default: return 8;
  }
}
export const GROOM_WEEKS_MIN = 1;
export const GROOM_WEEKS_MAX = 26;
export function groomDueOn(lastGroomDay: string, weeks: number): string {
  return addDaysStr(lastGroomDay, weeks * 7);
}
/** Listed when due within a week or late; days late is positive after the due date. */
export function groomState(dueOn: string, today: string): { state: "later" | "due" | "late"; daysLate: number } {
  const daysLate = daysBetweenStr(dueOn, today);
  return { state: daysLate > 0 ? "late" : daysLate >= -7 ? "due" : "later", daysLate };
}
/** The reminder goes out the day the groom is due (or after); one per cycle is enforced by the caller. */
export const GROOM_LEAD_DAYS = 0;

// ---------------------------------------------------------------- daycare
export interface CheckInInput {
  day: string;
  required: readonly string[];
  vaccines: readonly { kind: string; expiresOn: string }[];
  requireAssessment: boolean;
  assessment: string;
  inRoom: number;
  capacity: number;
  /** drop_in or a usable pack with days left */
  payKind: "pack" | "drop_in";
  packDaysLeft: number;
}
export type CheckInBlock = { code: "vaccine" | "assessment" | "capacity" | "pack_empty"; message: string };
const label = (k: string) => (VACCINE_LABELS as Record<string, string>)[k] ?? k;
/** "Oct 1, 2026" from a YYYY-MM-DD, without a time zone shift. */
const longDay = (ymd: string): string => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** Everything that stops a check-in today, in the order the counter should fix it. Empty means go. Capacity is the only one a manager may override. */
export function checkInBlocks(i: CheckInInput): CheckInBlock[] {
  const out: CheckInBlock[] = [];
  for (const p of vaccineProblems(i.vaccines, i.required, i.day)) {
    out.push({ code: "vaccine", message: p.why === "missing" ? `${label(p.kind)} proof is missing.` : `${label(p.kind)} expired on ${longDay(p.expiresOn!)}.` });
  }
  if (i.requireAssessment && i.assessment !== "passed") out.push({ code: "assessment", message: i.assessment === "declined" ? "The temperament check says not suitable for group play." : "No temperament check on file yet." });
  if (i.payKind === "pack" && i.packDaysLeft <= 0) out.push({ code: "pack_empty", message: "The pack has no days left." });
  if (i.inRoom >= i.capacity) out.push({ code: "capacity", message: `The room is full (${i.inRoom} of ${i.capacity}).` });
  return out;
}
/** Dogs per staff member right now (0 staff counts as the number of dogs). */
export const ratio = (dogs: number, staff: number): number => (staff > 0 ? dogs / staff : dogs);
/** Minutes past closing plus grace at check-out; 0 when on time. `closesAt` is "HH:MM" and `localMinutes` the shop-local minutes since midnight. */
export function lateMinutes(closesAt: string, graceMin: number, localMinutes: number): number {
  const [h, m] = closesAt.split(":").map(Number) as [number, number];
  const over = localMinutes - (h * 60 + m);
  return over > graceMin ? over : 0;
}

// ---------------------------------------------------------------- food cards
const MONTH_MS = 30.4375 * DAY_MS;
/** Bags that still count: none once the cycle is older than the program's window. */
export function effectivePunches(punches: number, cycleStartedAt: Date | string, expiryMonths: number, now: Date): number {
  return now.getTime() > new Date(cycleStartedAt).getTime() + expiryMonths * MONTH_MS ? 0 : punches;
}
/** Bags counted toward the next free one (0 to buyCount) and whether a free bag is waiting. */
export function foodCardState(card: { punches: number; given: number; cycleStartedAt: Date | string }, program: { buyCount: number; expiryMonths: number }, now: Date) {
  const counted = effectivePunches(card.punches, card.cycleStartedAt, program.expiryMonths, now);
  const earned = Math.floor(counted / program.buyCount);
  const owed = Math.max(0, earned - card.given);
  const expired = card.punches > 0 && counted === 0;
  const towardNext = owed > 0 ? program.buyCount : counted - card.given * program.buyCount;
  return { counted, owed, canRedeem: owed > 0, expired, towardNext: Math.max(0, towardNext), toGo: owed > 0 ? 0 : Math.max(0, program.buyCount - Math.max(0, towardNext)) };
}
/** How many days a bag lasts at a daily amount (rounded down, at least 1). */
export function bagLastsDays(bagGrams: number, dailyGrams: number): number {
  return Math.max(1, Math.floor(bagGrams / Math.max(1, dailyGrams)));
}
export const RUNOUT_LEAD_DAYS = 5;
export function runOutOn(lastBagDay: string, bagGrams: number, dailyGrams: number): string {
  return addDaysStr(lastBagDay, bagLastsDays(bagGrams, dailyGrams));
}
export const remindOn = (runOut: string): string => addDaysStr(runOut, -RUNOUT_LEAD_DAYS);
export const lbToGrams = (lb: number): number => Math.round(lb * 453.592);
