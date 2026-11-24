/**
 * Where a customer is in the booking flow, kept in the address: /shops/<slug>/book?step=time&service=<id>,<id>&staff=<id>&day=2026-11-25&at=<ISO>.
 * A refresh, the device Back button or a link sent to another phone land on the same step with the same choices.
 * Free text (the note, the name) is never in the address: BookFlow keeps it in sessionStorage.
 */
export type BookStep = "services" | "addons" | "time" | "details" | "pay";

export interface BookChoice {
  step: BookStep;
  ids: string[];
  staffId: string | null;
  addOnIds: string[];
  day: string | null;
  slot: { startsAt: string; staffId: string } | null;
  /** The unpaid booking the card step is for. */
  hold: string | null;
}

export type BookQuery = Record<string, string | undefined>;
type BookData = { services: { id: string; addOns?: { id: string }[] | null }[]; staff: { id: string }[] };

const STEPS: readonly BookStep[] = ["services", "addons", "time", "details", "pay"];
const KEYS = ["step", "service", "staff", "addon", "day", "at", "with", "hold"] as const;
const list = (v: string | undefined) => [...new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean))];

/** The choices an address carries, with anything the shop does not offer dropped and the step pulled back to the first one that is complete. */
export function readBookChoice(q: BookQuery, data: BookData): BookChoice {
  const ids = list(q.service).filter((id) => data.services.some((s) => s.id === id));
  const staffId = q.staff && data.staff.some((s) => s.id === q.staff) ? q.staff : null;
  const offered = new Set(data.services.filter((s) => ids.includes(s.id)).flatMap((s) => (s.addOns ?? []).map((a) => a.id)));
  const addOnIds = list(q.addon).filter((id) => offered.has(id));
  const day = q.day && /^\d{4}-\d{2}-\d{2}$/.test(q.day) ? q.day : null;
  const at = q.at && !Number.isNaN(Date.parse(q.at)) ? new Date(q.at).toISOString() : null;
  const withId = q.with && data.staff.some((s) => s.id === q.with) ? q.with : staffId;
  const slot = at && withId ? { startsAt: at, staffId: withId } : null;
  const hold = q.hold && /^[0-9a-f-]{36}$/i.test(q.hold) ? q.hold : null;
  let step: BookStep = STEPS.includes(q.step as BookStep) ? (q.step as BookStep) : "services";
  if (!ids.length) step = "services";
  else if (step === "addons" && !offered.size) step = "time";
  else if (step === "pay" && !hold) step = slot ? "details" : "time";
  else if (step === "details" && !slot) step = "time";
  const later = step !== "services" && step !== "addons";
  return { step, ids, staffId, addOnIds, day: step === "services" ? null : day, slot: later ? slot : null, hold: step === "pay" ? hold : null };
}

/** The query string for these choices. Everything else in `search` (lang, pet, rebook) is kept. */
export function writeBookChoice(search: string, c: BookChoice, opts: { solo?: boolean } = {}): string {
  const q = new URLSearchParams(search);
  for (const k of KEYS) q.delete(k);
  if (c.step !== "services") q.set("step", c.step);
  if (c.ids.length) q.set("service", c.ids.join(","));
  if (c.staffId && !opts.solo) q.set("staff", c.staffId);
  if (c.addOnIds.length) q.set("addon", c.addOnIds.join(","));
  const later = c.step !== "services" && c.step !== "addons";
  if (c.step !== "services" && c.day) q.set("day", c.day);
  if (later && c.slot) {
    q.set("at", c.slot.startsAt);
    if (c.slot.staffId !== c.staffId) q.set("with", c.slot.staffId);
  }
  if (c.step === "pay" && c.hold) q.set("hold", c.hold);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const queryOf = (search: string): BookQuery => Object.fromEntries(new URLSearchParams(search));
