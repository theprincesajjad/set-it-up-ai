/** Message-key helpers that need no catalogue (types only), so client code can use them without loading one. */
import type { MessageKey } from "./messages/en.js";

/** Catalog `spice` 0..3 (mild, medium, hot, extra hot) to a message key. */
export const SPICE_KEYS = ["spice.mild", "spice.medium", "spice.hot", "spice.extraHot"] as const satisfies readonly MessageKey[];
export function spiceKey(level: number): MessageKey {
  return SPICE_KEYS[Math.max(0, Math.min(3, Math.round(level)))]!;
}

export const EVENT_TYPES = ["wedding", "mehndi", "walima", "nikah", "aqiqah", "eid", "iftar", "diwali", "vaisakhi", "birthday", "corporate", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeKey = (e: EventType): MessageKey => `event.${e}`;

export const STATIONS = ["tandoor", "curry", "grill", "chai", "sweets", "fry"] as const;
export type Station = (typeof STATIONS)[number];
export const stationKey = (s: Station): MessageKey => `station.${s}`;
