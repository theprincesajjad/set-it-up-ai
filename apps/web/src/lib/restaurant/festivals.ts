/**
 * Pure helpers for the Festivals planner: which dates lead the strip for this shop's community, the confidence tag,
 * the "get the kitchen ready" checklist, and the message text per language (English from the template; Hindi, Urdu and
 * Punjabi are short drafts built from the greeting and need a native speaker's check before sending).
 */
import { formatFestivalDate, getFestival, type FestivalDef, type FestivalTemplate } from "@ll/shared";
import type { FestivalsUpcoming } from "@/lib/api/endpoints";

export type FestivalItem = FestivalsUpcoming["items"][number];
export type MsgLang = "en" | "hi" | "ur" | "pa";
export const MSG_LANGS: { code: MsgLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ur", label: "اردو" },
  { code: "pa", label: "ਪੰਜਾਬੀ" },
];

/** "Fixed", "Approximate" or "Moon sighting" (Islamic dates follow the moon). */
export function dateTag(o: Pick<FestivalItem, "approximate" | "tradition">): "Fixed" | "Approximate" | "Moon sighting" {
  return !o.approximate ? "Fixed" : o.tradition === "islamic" ? "Moon sighting" : "Approximate";
}

/**
 * The next `n` dates for the strip. A shop with cuisines set sees festivals for its community first and the rest only on request;
 * with none set nothing is hidden. Festivals under way count; each festival appears once (its next date).
 */
export function stripFestivals(items: FestivalItem[], opts: { showAll?: boolean; n?: number } = {}): FestivalItem[] {
  const seen = new Set<string>();
  const out: FestivalItem[] = [];
  for (const o of [...items].filter((x) => x.daysUntil >= 0 || x.endDate !== null).sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (!opts.showAll && o.relevance === "low") continue;
    if (seen.has(o.festivalId)) continue;
    seen.add(o.festivalId);
    out.push(o);
  }
  return out.slice(0, opts.n ?? 7);
}

const ORDER_PHRASE: Record<Exclude<MsgLang, "en">, string> = {
  hi: "पहले से ऑर्डर करें और पिकअप पर ले जाएँ।",
  ur: "پہلے سے آرڈر کریں اور پک اپ پر لے جائیں۔",
  pa: "ਪਹਿਲਾਂ ਤੋਂ ਆਰਡਰ ਕਰੋ ਅਤੇ ਪਿਕਅੱਪ ਤੇ ਲੈ ਜਾਓ।",
};

/** The message in one language. English is the template itself; other languages are the greeting plus a plain call to order ahead. */
export function festivalMessage(def: FestivalDef, template: FestivalTemplate, lang: MsgLang, shop: string, startDate: string, channel: "sms" | "email" | "whatsapp" = "whatsapp"): string {
  const base = channel === "email" ? template.body : channel === "sms" ? template.sms : template.whatsapp;
  const fill = (t: string) => t.replace(/\{\{\s*merchant\s*\}\}/g, shop).replace(/\{\{\s*first_name\s*\}\}/g, "Sam").replace(/\{\{\s*festival_date\s*\}\}/g, formatFestivalDate(startDate));
  if (lang === "en") return fill(base);
  const greeting = def.greeting[lang];
  if (!greeting) return fill(base);
  return `${greeting}! ${shop}: ${ORDER_PHRASE[lang]}`;
}

export interface KitchenTask {
  key: string;
  title: string;
  sub: string;
  action: { label: string; href: string };
}

const SHORT = (d: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const DISH: Record<string, string> = {
  diwali: "mithai box",
  holi: "gujiya and thandai box",
  eid_al_fitr: "sheer khurma tray",
  eid_al_adha: "qurbani-day degh tray",
  ramadan: "iftar box",
  chaand_raat: "mithai box",
  vaisakhi: "langar-style thali",
  navratri: "vrat thali",
  raksha_bandhan: "mithai box",
  karva_chauth: "sargi thali",
  gurpurab: "karah prasad tray",
  lohri: "gajak and rewri box",
};

/** Three things owners forget: the cap on the festival days, a dish for the day, and the opening hours. */
export function kitchenChecklist(o: Pick<FestivalItem, "festivalId" | "name" | "startDate" | "endDate">, ctx: { base: string; dailyCap: number | null; deghOn: boolean }): KitchenTask[] {
  const from = addDay(o.startDate, -1);
  const to = o.endDate ?? o.startDate;
  const q = new URLSearchParams({ rules: "open", from, to, label: o.name });
  const suggested = ctx.dailyCap ? Math.max(ctx.dailyCap + 5, Math.round((ctx.dailyCap * 1.75) / 5) * 5) : null;
  const tasks: KitchenTask[] = [];
  if (ctx.deghOn) tasks.push({ key: "cap", title: from === to ? `Raise the degh cap for ${SHORT(from)}` : `Raise the degh cap for ${SHORT(from)} and ${SHORT(to)}`, sub: ctx.dailyCap && suggested ? `${ctx.dailyCap} pots to ${suggested}` : "Set a higher number of pots", action: { label: "Open pre-order rules", href: `${ctx.base}/restaurant/preorders?${q.toString()}` } });
  const dish = DISH[o.festivalId] ?? "festival tray";
  tasks.push({ key: "dish", title: `Add the ${dish} to the menu`, sub: "Boxes and trays guests can pre-order", action: { label: "Add dish", href: `${ctx.base}/restaurant/menu` } });
  tasks.push({ key: "hours", title: `Set ${o.name} hours`, sub: `Open late on ${SHORT(o.startDate)}?`, action: { label: "Edit hours", href: `${ctx.base}/locations` } });
  return tasks;
}

function addDay(d: string, n: number): string {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** The day, 10:00 in the shop's morning: a sensible time for a scheduled festival message (never in the 9 pm to 8 am quiet hours). */
export function defaultSendTime(date: string): string {
  return `${date}T10:00`;
}

export { getFestival };
