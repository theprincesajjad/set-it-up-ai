/** Pure helpers for the Pre-orders screen: caps in words, pickup windows, the shopping line and channel counts. */
import { restaurantApi, type commerceApi } from "@ll/shared";

const DAY_NAMES: Record<restaurantApi.Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** "Mon to Thu 12 · Fri, Sat 20 · Sun 25": runs of neighbouring days with the same cap. Days with no weekday cap use the daily cap. */
export function capsInWords(rules: Pick<restaurantApi.PreorderRulesResponse, "preorderDailyCap" | "capByWeekday">): string {
  const caps = restaurantApi.WEEKDAYS.map((d) => ({ d, cap: rules.capByWeekday[d] ?? rules.preorderDailyCap }));
  if (caps.every((c) => c.cap == null)) return "No daily limit";
  const runs: { days: restaurantApi.Weekday[]; cap: number | null }[] = [];
  for (const c of caps) {
    const last = runs[runs.length - 1];
    if (last && last.cap === c.cap) last.days.push(c.d);
    else runs.push({ days: [c.d], cap: c.cap });
  }
  const label = (days: restaurantApi.Weekday[]) => (days.length === 1 ? DAY_NAMES[days[0]!] : days.length === 7 ? "Every day" : days.length === 2 ? `${DAY_NAMES[days[0]!]}, ${DAY_NAMES[days[1]!]}` : `${DAY_NAMES[days[0]!]} to ${DAY_NAMES[days[days.length - 1]!]}`);
  return runs.map((r) => `${label(r.days)} ${r.cap ?? "no limit"}`).join(" · ");
}

const potWord = (name: string) => (name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? name);

/** "Chicken 24 h · Goat 48 h": the notice each pre-order dish needs. */
export function noticeInWords(items: Pick<commerceApi.CatalogItemDto, "name" | "leadTimeHours">[]): string {
  const seen = new Map<string, number>();
  for (const i of items) seen.set(potWord(i.name), i.leadTimeHours ?? 0);
  const entries = [...seen.entries()];
  if (!entries.length) return "Set a notice period on each degh";
  const hours = new Set(entries.map(([, h]) => h));
  if (hours.size === 1) return `${[...hours][0]} h for every dish`;
  return entries.map(([w, h]) => `${w} ${h} h`).join(" · ");
}

/** "30%, balance at pickup" or "No deposit". */
export function depositInWords(items: Pick<commerceApi.CatalogItemDto, "depositBps">[]): string {
  const bps = [...new Set(items.map((i) => i.depositBps ?? 0))];
  if (!bps.length || (bps.length === 1 && bps[0] === 0)) return "No deposit";
  const label = bps.filter((b) => b > 0).map((b) => `${b / 100}%`).join(" to ");
  return `${label}, balance at pickup`;
}

/** "11 am to 6 pm" (or just "6 pm") for the first and last pickup of a dish on a day. */
export function pickupsInWords(first: string, last: string): string {
  const f = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/[  ]/g, " ").replace(/\./g, "").toLowerCase().replace(":00", "");
  return f(first) === f(last) ? f(first) : `${f(first)} to ${f(last)}`;
}

/** "4:30 pm" for a fire time. */
export function fireInWords(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(/[  ]/g, " ").replace(/\./g, "").toLowerCase();
}

/** "2 phone, 4 web link, 3 WhatsApp". */
export function channelMix(orders: { channel: string }[]): string {
  const label: Record<string, string> = { phone: "phone", web: "web link", whatsapp: "WhatsApp", counter: "counter", app: "app" };
  const n = new Map<string, number>();
  for (const o of orders) n.set(o.channel, (n.get(o.channel) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${k} ${label[c] ?? c}`).join(", ");
}
