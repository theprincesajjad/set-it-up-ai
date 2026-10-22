import type { merchantApi } from "@ll/shared";
import { addDays, fromLocalInput, startOfTorontoDay, toLocalInput } from "./time";

export type PromoKind = merchantApi.Promo["kind"];
export const KIND_INFO: Record<PromoKind, { label: string; hint: string }> = {
  offer: { label: "Offer", hint: "A deal or freebie, e.g. free cookie with any coffee." },
  multiplier: { label: "Double points", hint: "Points multiply during the promo." },
  bonus_points: { label: "Bonus points", hint: "A flat bonus on each qualifying purchase." },
  discount: { label: "Discount", hint: "A percentage off for members." },
  event: { label: "Event", hint: "Tastings, workshops, sidewalk sales." },
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface PromoDraft {
  kind: PromoKind;
  title: string;
  body: string;
  imageUrl: string;
  startsLocal: string;
  endsLocal: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  multiplier: string;
  bonusPoints: string;
  percentOff: string;
  categoryId: string;
  audience: merchantApi.Promo["audience"];
}

export function emptyPromo(now = new Date()): PromoDraft {
  return { kind: "offer", title: "", body: "", imageUrl: "", startsLocal: toLocalInput(now), endsLocal: toLocalInput(addDays(now.toISOString(), 7)), daysOfWeek: [], startTime: "", endTime: "", multiplier: "2", bonusPoints: "", percentOff: "", categoryId: "", audience: "network" };
}

export function draftFromPromo(p: merchantApi.Promo): PromoDraft {
  return {
    kind: p.kind, title: p.title, body: p.body ?? "", imageUrl: p.imageUrl ?? "", startsLocal: toLocalInput(p.startsAt), endsLocal: toLocalInput(p.endsAt), daysOfWeek: p.daysOfWeek ?? [],
    startTime: p.startTime ?? "", endTime: p.endTime ?? "", multiplier: p.multiplierPct ? String(p.multiplierPct / 100) : "2", bonusPoints: p.bonusPoints ? String(p.bonusPoints) : "",
    percentOff: p.percentOff ? String(p.percentOff) : "", categoryId: p.categoryId ?? "", audience: p.audience,
  };
}

/** Quick date chips (Toronto): Today only, This weekend, 1 week. */
export function quickRange(kind: "today" | "weekend" | "week", now = new Date()): { startsLocal: string; endsLocal: string } {
  const sod = startOfTorontoDay(now);
  if (kind === "today") return { startsLocal: toLocalInput(now), endsLocal: toLocalInput(new Date(sod.getTime() + 86_400_000 - 60_000)) };
  if (kind === "week") return { startsLocal: toLocalInput(now), endsLocal: toLocalInput(addDays(now.toISOString(), 7)) };
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(now));
  const daysToSat = dow === 0 ? -1 : 6 - dow;
  const start = daysToSat <= 0 ? now : new Date(sod.getTime() + daysToSat * 86_400_000 + 3_600_000);
  const sunEnd = new Date(sod.getTime() + (daysToSat + 2) * 86_400_000 - 60_000);
  return { startsLocal: daysToSat <= 0 ? toLocalInput(start) : `${toLocalInput(start).slice(0, 10)}T00:00`, endsLocal: `${toLocalInput(new Date(sunEnd.getTime() - 3_600_000)).slice(0, 10)}T23:59` };
}

export type PromoErrors = Partial<Record<keyof PromoDraft, string>>;

export function validatePromo(d: PromoDraft): PromoErrors {
  const e: PromoErrors = {};
  if (!d.title.trim()) e.title = "Give your promo a title.";
  if (d.title.length > 60) e.title = "Keep the title to 60 characters.";
  if (d.body.length > 280) e.body = "Keep the description to 280 characters.";
  if (!d.startsLocal) e.startsLocal = "Pick a start.";
  if (d.endsLocal && d.startsLocal && fromLocalInput(d.endsLocal)! <= fromLocalInput(d.startsLocal)!) e.endsLocal = "End after the start.";
  if (d.kind === "multiplier" && !(Number.parseFloat(d.multiplier) > 1)) e.multiplier = "Use more than 1x, e.g. 2 for double.";
  if (d.kind === "bonus_points" && !(Number.parseInt(d.bonusPoints, 10) > 0)) e.bonusPoints = "Add how many bonus points.";
  if (d.kind === "discount" && !(Number.parseInt(d.percentOff, 10) >= 1 && Number.parseInt(d.percentOff, 10) <= 100)) e.percentOff = "Use 1 to 100%.";
  if ((d.startTime && !d.endTime) || (!d.startTime && d.endTime)) e.startTime = "Set both a start and an end time, or neither.";
  return e;
}

export function promoBody(d: PromoDraft): Record<string, unknown> {
  return {
    kind: d.kind,
    title: d.title.trim(),
    body: d.body.trim() || null,
    imageUrl: d.imageUrl.trim() || null,
    startsAt: fromLocalInput(d.startsLocal),
    endsAt: d.endsLocal ? fromLocalInput(d.endsLocal) : null,
    daysOfWeek: d.daysOfWeek.length ? [...d.daysOfWeek].sort() : null,
    startTime: d.startTime || null,
    endTime: d.endTime || null,
    multiplierPct: d.kind === "multiplier" ? Math.round(Number.parseFloat(d.multiplier) * 100) : null,
    bonusPoints: d.kind === "bonus_points" ? Number.parseInt(d.bonusPoints, 10) : null,
    percentOff: d.kind === "discount" ? Number.parseInt(d.percentOff, 10) : null,
    categoryId: d.categoryId || null,
    audience: d.audience,
  };
}

export const STATUS_ACTION: Partial<Record<merchantApi.PromoStatus, string>> = { live: "Publish now", scheduled: "Schedule", ended: "End now", archived: "Archive", draft: "Move to drafts" };
