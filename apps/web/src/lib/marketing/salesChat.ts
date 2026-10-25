/**
 * Pure helpers for the marketing site's chat widget (components/marketing/SalesChat.tsx): language, merging lines, saved chat.
 * The widget talks to the same assistant as our WhatsApp number (apps/api/src/services/sales-agent).
 */
import { isAgentLang, type AgentLang, type salesAgentApi } from "@ll/shared";

export type Line = salesAgentApi.ChatLine;

/** The widget's language from the page's `lang` (set by ?lang=), then the browser's; English otherwise. */
export function chatLang(...candidates: (string | null | undefined)[]): AgentLang {
  for (const c of candidates) {
    const base = (c ?? "").toLowerCase().split(/[-_]/)[0];
    if (isAgentLang(base)) return base;
  }
  return "en";
}

/** Add `incoming` to the end of `current`; a line whose id is already there is not added twice. Arrival order is the order (clocks differ). */
export function mergeLines(current: Line[], incoming: Line[]): Line[] {
  const seen = new Set(current.map((l) => l.id));
  const added = incoming.filter((l) => !seen.has(l.id));
  return added.length ? [...current, ...added] : current;
}

/**
 * What the thread looks like after the server answered `mine`. On the first message the server's first line is the disclosure,
 * which belongs before the visitor's own line; everything else follows it.
 */
export function afterReply(current: Line[], mine: Line, reply: Line[]): Line[] {
  const prior = current.filter((l) => l.id !== mine.id);
  if (prior.length === 0 && reply[0]?.role === "assistant" && reply.length > 1) return [reply[0]!, mine, ...reply.slice(1)];
  return mergeLines([...prior, mine], reply);
}

export interface SavedChat {
  token: string;
  lines: Line[];
  status: salesAgentApi.ConversationStatus;
}

const KEY = "ll.sales-chat.v1";

/** Saved per tab (sessionStorage): closing the tab ends the visitor's session on this device. Storage can be blocked; every call is guarded. */
export function loadChat(store: Pick<Storage, "getItem"> | null): SavedChat | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedChat>;
    if (typeof v.token !== "string" || !Array.isArray(v.lines)) return null;
    return { token: v.token, lines: v.lines.slice(-60), status: v.status ?? "open" };
  } catch {
    return null;
  }
}

export function saveChat(store: Pick<Storage, "setItem"> | null, chat: SavedChat): void {
  try {
    store?.setItem(KEY, JSON.stringify({ ...chat, lines: chat.lines.slice(-60) }));
  } catch {
    /* private window or storage blocked: the chat still works for this page view */
  }
}

/** The newest line time we hold from the team side, for polling "since". */
export function lastRemoteAt(lines: Line[]): string | undefined {
  return [...lines].reverse().find((l) => l.role === "assistant" || l.role === "human")?.at;
}

/** Poll only while a person is involved: the visitor is waiting for them. */
export const shouldPoll = (status: salesAgentApi.ConversationStatus): boolean => status === "handoff" || status === "human";
