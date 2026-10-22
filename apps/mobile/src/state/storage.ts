/**
 * Device storage.
 * - Tokens: expo-secure-store (Keychain / Android Keystore).
 * - Everything else (prefs, card cache, offline queue, query cache): AsyncStorage.
 * Every read/write is wrapped so a storage failure never crashes the counter.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { StoredTokens, TokenStore } from "../api/client";
import type { QueueStorage, QueuedEvent } from "../lib/offlineQueue";

const TOKENS_KEY = "ll.tokens.v1";

let memoryTokens: StoredTokens | null | undefined;

export const secureTokenStore: TokenStore = {
  async get() {
    if (memoryTokens !== undefined) return memoryTokens;
    try {
      const raw = await SecureStore.getItemAsync(TOKENS_KEY);
      memoryTokens = raw ? (JSON.parse(raw) as StoredTokens) : null;
    } catch {
      memoryTokens = null;
    }
    return memoryTokens;
  },
  async set(tokens) {
    memoryTokens = tokens;
    try {
      if (tokens) await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(TOKENS_KEY);
    } catch {
      // keep the in-memory copy; next launch will ask to sign in
    }
  },
};

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export const KEYS = {
  prefs: "ll.prefs.v1",
  card: "ll.card.v1",
  counter: "ll.counter.v1",
  queue: "ll.counter.queue.v1",
  memberCache: "ll.counter.members.v1",
  queryCache: "ll.query.v1",
  pushToken: "ll.push.v1",
} as const;

export const asyncQueueStorage: QueueStorage = {
  load: () => getJson<QueuedEvent[]>(KEYS.queue),
  save: (items) => setJson(KEYS.queue, items),
};

/** Wipe everything tied to the signed-in person (sign-out, account deletion). Keeps the offline queue only if asked. */
export async function clearUserData(opts: { keepQueue?: boolean } = {}): Promise<void> {
  const keys: string[] = [KEYS.card, KEYS.counter, KEYS.memberCache, KEYS.queryCache, KEYS.pushToken, KEYS.prefs];
  if (!opts.keepQueue) keys.push(KEYS.queue);
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // ignore
  }
}
