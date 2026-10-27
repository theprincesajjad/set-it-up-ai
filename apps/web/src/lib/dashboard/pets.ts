/** Pet care display helpers (docs/research/pet-care.md). Pure, so they are unit-tested. */
import { VACCINE_LABELS, type petApi } from "@ll/shared";
import type { DotTone } from "@/components/dashboard/kit";

export const vaccineLabel = (kind: string): string => (VACCINE_LABELS as Record<string, string>)[kind] ?? kind;

/** "Current", "Expires in 24 days", "Expired" with the tone the Dot uses. */
export function vaccineTag(v: { status: "current" | "expiring" | "expired"; daysLeft: number }): { label: string; tone: DotTone } {
  if (v.status === "expired") return { label: "Expired", tone: "negative" };
  if (v.status === "expiring") return { label: v.daysLeft === 0 ? "Expires today" : `Expires in ${v.daysLeft} ${v.daysLeft === 1 ? "day" : "days"}`, tone: "accent" };
  return { label: "Current", tone: "positive" };
}

export function worstTag(w: "current" | "expiring" | "expired" | "none"): { label: string; tone: DotTone } {
  if (w === "none") return { label: "No shots on file", tone: "neutral" };
  return vaccineTag({ status: w, daysLeft: w === "expiring" ? 30 : 0 });
}

export const weeksLabel = (n: number): string => `${n} ${n === 1 ? "week" : "weeks"}`;
export const shortWeeks = (n: number): string => `${n} wk`;

/** "Nov 17" from a YYYY-MM-DD, without a time zone shift. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const poundsLabel = (grams: number): string => `${Math.round(grams / 45.3592) / 10} lb`;

/** A stay's one-line state for the daycare list. */
export function stayTag(s: Pick<petApi.DaycareStayDto, "status" | "blocks" | "checkInAt">): { label: string; tone: DotTone } {
  if (s.status === "in") return { label: "In the room", tone: "positive" };
  if (s.status === "out") return { label: "Went home", tone: "neutral" };
  if (s.status === "no_show") return { label: "No-show", tone: "negative" };
  if (s.status === "cancelled") return { label: "Cancelled", tone: "neutral" };
  const b = s.blocks.find((x) => x.code !== "capacity") ?? s.blocks[0];
  return b ? { label: "Blocked", tone: "negative" } : { label: "Expected", tone: "neutral" };
}

/** The circles of a punch card: `filled` of `total`. */
export const punchCircles = (filled: number, total: number): boolean[] => Array.from({ length: total }, (_, i) => i < filled);

export const MOOD_LABELS: Record<string, string> = { happy: "Happy", calm: "Calm", nervous: "A bit nervous", wiggly: "Wiggly" };
export const DID_LABELS: Record<string, string> = { bath: "Bath", haircut: "Haircut", nails: "Nails", ears: "Ears cleaned", brushed: "Brushed out", played: "Played", ate: "Ate well", napped: "Napped", potty: "Potty breaks", walk: "Walk" };
export const GROOM_DID: string[] = ["bath", "haircut", "nails", "ears", "brushed"];
export const DAY_DID: string[] = ["played", "ate", "napped", "potty", "walk"];
