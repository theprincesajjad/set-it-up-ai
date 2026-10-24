/**
 * Street-day outcomes that survive a bad connection. A tap is written to this queue first (localStorage), shown
 * on screen straight away, and sent when the phone has signal. Every entry carries a clientId so a retry never
 * records the same visit twice (the API ignores a clientId it has seen).
 */
import type { repApi } from "@ll/shared";

export interface QueuedOutcome extends repApi.LeadOutcomeBody {
  leadId: string;
  /** Business name, for the "3 to sync" list. */
  label?: string;
}

const QUEUE_KEY = "ll.rep.outcomeQueue.v1";
const DAY_KEY = "ll.rep.streetDay.v1";

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const store = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function newClientId(now = Date.now(), rand: () => number = Math.random): string {
  return `web-${now.toString(36)}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")}`;
}

export function loadQueue(s: Store | null = store()): QueuedOutcome[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(QUEUE_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as QueuedOutcome[]).filter((x) => x && typeof x.clientId === "string" && typeof x.leadId === "string") : [];
  } catch {
    return [];
  }
}

export function saveQueue(q: QueuedOutcome[], s: Store | null = store()): void {
  try {
    s?.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage full or blocked: the queue still lives in memory for this visit */
  }
}

/** Add one outcome unless its clientId is already queued. */
export function enqueue(q: QueuedOutcome[], item: QueuedOutcome): QueuedOutcome[] {
  return q.some((x) => x.clientId === item.clientId) ? q : [...q, item];
}

export interface FlushResult {
  remaining: QueuedOutcome[];
  sent: number;
  /** Items the server refused for good (the lead is gone or not ours): dropped from the queue. */
  dropped: QueuedOutcome[];
  failed: boolean;
  /** Client ids the server confirmed (recorded, duplicate or refused): remove exactly these from the live queue. */
  confirmed: string[];
}

/** Send the queue in order, in batches. A network error keeps everything not yet confirmed. */
export async function flushQueue(q: QueuedOutcome[], send: (items: QueuedOutcome[]) => Promise<repApi.OutcomeSyncResult>, batch = 25): Promise<FlushResult> {
  let rest = [...q];
  let sent = 0;
  const dropped: QueuedOutcome[] = [];
  const confirmed: string[] = [];
  while (rest.length) {
    const chunk = rest.slice(0, batch);
    let res: repApi.OutcomeSyncResult;
    try {
      res = await send(chunk);
    } catch {
      return { remaining: rest, sent, dropped, failed: true, confirmed };
    }
    const status = new Map(res.results.map((r) => [r.clientId, r.status]));
    for (const it of chunk) {
      const st = status.get(it.clientId);
      if (st === "recorded" || st === "duplicate") sent++;
      else if (st === "not_found") dropped.push(it);
      else return { remaining: rest, sent, dropped, failed: true, confirmed };
      confirmed.push(it.clientId);
      rest = rest.filter((x) => x.clientId !== it.clientId);
    }
  }
  return { remaining: rest, sent, dropped, failed: false, confirmed };
}

/** Apply a queued outcome to the cached day so the list moves on straight away. */
export function applyOutcome(day: repApi.StreetDay, o: Pick<QueuedOutcome, "leadId" | "outcome">): repApi.StreetDay {
  const stop = day.stops.find((s) => s.id === o.leadId);
  if (!stop || stop.todayOutcome) return day;
  const open = day.stops.filter((s) => s.id !== o.leadId && !s.todayOutcome);
  const done = day.stops.filter((s) => s.id !== o.leadId && s.todayOutcome);
  const moved = { ...stop, todayOutcome: o.outcome, order: null, stage: o.outcome === "not_interested" ? ("lost" as const) : stop.stage === "new" ? ("contacted" as const) : stop.stage };
  const reordered = open.map((s, i) => ({ ...s, order: i + 1 }));
  const c = day.counts;
  const bump = (k: keyof repApi.StreetDay["counts"], n = 1) => ({ [k]: c[k] + n });
  const key = { signed_up: "signedUp", setup_call: "setupCalls", come_back: "comeBack", not_interested: "notInterested", not_in: "notIn" }[o.outcome] as keyof repApi.StreetDay["counts"];
  return { ...day, stops: [...reordered, ...done, moved], counts: { ...c, ...bump("visited"), ...bump(key), left: c.left - 1 } };
}

export function cacheDay(day: repApi.StreetDay, s: Store | null = store()): void {
  try {
    s?.setItem(DAY_KEY, JSON.stringify(day));
  } catch {
    /* ignore */
  }
}
export function cachedDay(s: Store | null = store()): repApi.StreetDay | null {
  try {
    const v = s?.getItem(DAY_KEY);
    return v ? (JSON.parse(v) as repApi.StreetDay) : null;
  } catch {
    return null;
  }
}
