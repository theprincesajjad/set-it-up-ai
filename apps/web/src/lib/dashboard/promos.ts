import type { merchantApi } from "@ll/shared";
import { addDays, fromLocalInput, startOfTorontoDay, toLocalInput } from "./time";

export type PromoKind = merchantApi.Promo["kind"];
export const KIND_INFO: Record<PromoKind, { label: string; hint: string }> = {
  offer: { label: "Offer", hint: "A deal or a freebie, like a free cookie with any coffee." },
  multiplier: { label: "Double points", hint: "Customers earn extra while the promo runs." },
  bonus_points: { label: "Bonus points", hint: "A fixed bonus on each qualifying purchase." },
  discount: { label: "Discount", hint: "A percentage off for your customers." },
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

// ---------------------------------------------------------------------------
// Café & retail: templates and the results table (cafes-retail.md 7.6)
// ---------------------------------------------------------------------------
export type PromoTemplateKey = "slow_afternoons" | "bring_friend" | "add_pastry" | "quiet_mondays";

export interface PromoTemplate {
  key: PromoTemplateKey;
  title: string;
  blurb: string;
  /** The job it does, as a label on the card. */
  job: string;
  /** Feature that must be on for the card to show. */
  needs?: "loyalty.referrals";
  draft: Partial<PromoDraft>;
}

/** Four templates; each pre-fills the editor (rule, hours, weekdays). Bring a friend needs `loyalty.referrals`. */
export const PROMO_TEMPLATES: PromoTemplate[] = [
  { key: "slow_afternoons", title: "Slow afternoons", blurb: "Double stamps weekdays 2 to 4 pm", job: "Fills quiet hours", draft: { kind: "multiplier", title: "Double stamps on slow afternoons", body: "Double stamps weekdays 2 to 4 pm.", multiplier: "2", daysOfWeek: [1, 2, 3, 4, 5], startTime: "14:00", endTime: "16:00", endsLocal: "" } },
  { key: "bring_friend", title: "Bring a friend", blurb: "Both of you get a stamp on their first visit", job: "Brings new customers", needs: "loyalty.referrals", draft: { kind: "offer", title: "Bring a friend", body: "Bring a friend. Both of you get a stamp on their first visit.", endsLocal: "" } },
  { key: "add_pastry", title: "Add a pastry", blurb: "Bonus stamp with any pastry and drink", job: "Raises the average sale", draft: { kind: "bonus_points", title: "Add a pastry", body: "Bonus stamp with any pastry and drink.", bonusPoints: "1", endsLocal: "" } },
  { key: "quiet_mondays", title: "Quiet Mondays", blurb: "Free upsize every Monday", job: "Fixes your slowest day", draft: { kind: "offer", title: "Quiet Mondays", body: "Free upsize every Monday.", daysOfWeek: [1], endsLocal: "" } },
];

export function templateDraft(key: string | null | undefined, now = new Date(), terminology = "stamps"): PromoDraft {
  const found = PROMO_TEMPLATES.find((x) => x.key === key);
  const t = found ? inUnit(found, terminology) : undefined;
  return { ...emptyPromo(now), ...(t?.draft ?? {}) };
}

/** Template wording in the shop's own unit: stamps are the default wording, points shops get the points version. */
const POINTS_WORDING: Record<PromoTemplateKey, { blurb?: string; title?: string; body?: string; bonusPoints?: string } | undefined> = {
  slow_afternoons: { blurb: "Double points weekdays 2 to 4 pm", title: "Double points on slow afternoons", body: "Double points weekdays 2 to 4 pm." },
  bring_friend: { blurb: "Both of you get bonus points on their first visit", body: "Bring a friend. Both of you get bonus points on their first visit." },
  add_pastry: { blurb: "Bonus points with any pastry and drink", body: "Bonus points with any pastry and drink.", bonusPoints: "10" },
  quiet_mondays: undefined,
};
export function inUnit(t: PromoTemplate, terminology: string): PromoTemplate {
  const w = terminology === "stamps" ? undefined : POINTS_WORDING[t.key];
  if (!w) return t;
  return { ...t, blurb: w.blurb ?? t.blurb, draft: { ...t.draft, ...(w.title ? { title: w.title } : {}), ...(w.body ? { body: w.body } : {}), ...(w.bonusPoints ? { bonusPoints: w.bonusPoints } : {}) } };
}
export const templatesFor = (referrals: boolean, terminology = "stamps") => PROMO_TEMPLATES.filter((t) => !t.needs || referrals).map((t) => inUnit(t, terminology));

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const hr = (t: string) => {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  return { n: `${h % 12 === 0 ? 12 : h % 12}${m && m !== "00" ? `:${m}` : ""}`, ap: h >= 12 && h < 24 ? "pm" : "am" };
};

/** "Weekdays 2 to 4 pm", "Tuesdays, all day", "Oct 1 to 12, all day" (no weekday rule: the dates). */
export function promoWhen(p: Pick<merchantApi.Promo, "daysOfWeek" | "startTime" | "endTime" | "startsAt" | "endsAt">): string {
  const days = [...(p.daysOfWeek ?? [])].sort();
  const key = days.join(",");
  let dayLabel: string;
  if (key === "1,2,3,4,5") dayLabel = "Weekdays";
  else if (key === "0,6") dayLabel = "Weekends";
  else if (key === "0,1,2,3,4,5,6") dayLabel = "Every day";
  else if (days.length === 1) dayLabel = DAY_NAMES[days[0]!]!;
  else if (days.length) dayLabel = days.map((d) => DAY_NAMES[d]!.slice(0, 3)).join(", ");
  else {
    const fmt = (iso: string, withMonth: boolean) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", ...(withMonth ? { month: "short" as const } : {}), day: "numeric" }).format(new Date(iso));
    if (p.endsAt) {
      const sameMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short" }).format(new Date(p.startsAt)) === new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short" }).format(new Date(p.endsAt));
      dayLabel = `${fmt(p.startsAt, true)} to ${fmt(p.endsAt, !sameMonth)}`;
    } else dayLabel = "Every day";
  }
  if (!p.startTime && !p.endTime) return `${dayLabel}, all day`;
  const a = hr(p.startTime ?? "00:00");
  const b = hr(p.endTime ?? "24:00");
  return `${dayLabel} ${a.ap === b.ap ? `${a.n} to ${b.n} ${b.ap}` : `${a.n} ${a.ap} to ${b.n} ${b.ap}`}`;
}

/** The status line under a promo's name: "Live · until Oct 29", "Live · no end date", "Ended Oct 12". */
export function promoStatusLine(p: Pick<merchantApi.Promo, "status" | "endsAt" | "startsAt">): string {
  const d = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" }).format(new Date(iso));
  if (p.status === "live") return p.endsAt ? `Live · until ${d(p.endsAt)}` : "Live · no end date";
  if (p.status === "ended") return `Ended ${d(p.endsAt ?? p.startsAt)}`;
  if (p.status === "scheduled") return `Starts ${d(p.startsAt)}`;
  return p.status[0]!.toUpperCase() + p.status.slice(1);
}

/** "+22", "-3", "0": the Extra visits cell. */
export const signedVisits = (n: number) => (n > 0 ? `+${n}` : String(n));
