/**
 * Message catalogues in the browser: one per visitor, loaded on demand.
 *
 * `t` from @ll/shared imports all four catalogues statically (about 350 KB gzipped). Client code reads strings through
 * `useLocale()` instead, which loads only the catalogue for the scope's language: the /i18n/<locale> JSON that LocaleScope
 * preloads (app/i18n/[locale]/route.ts), or that language's chunk (`import()` per locale) where there is no scope.
 * Server components keep using `translator` / `getT` from @ll/shared: nothing reaches the browser from them.
 *
 * `useCatalog(locale)` suspends until the chunk is in (`use()`); during hydration the server's HTML stays on screen meanwhile.
 * `primeCatalog` fills the cache synchronously (unit tests, and any caller that already holds a catalogue).
 */
import { use } from "react";
import { formatMessage, type Locale, type MessageKey, type Messages, type Vars } from "@ll/shared";

/** On the server (SSR of client components) and as the fallback in the browser: the catalogue as its own chunk. */
const CHUNKS: Record<Locale, () => Promise<Messages>> = {
  en: () => import("@ll/shared/messages/en").then((m) => m.en),
  hi: () => import("@ll/shared/messages/hi").then((m) => m.hi),
  ur: () => import("@ll/shared/messages/ur").then((m) => m.ur),
  pa: () => import("@ll/shared/messages/pa").then((m) => m.pa),
};

const ready = new Map<Locale, Messages>();
const pending = new Map<Locale, Promise<Messages>>();

/**
 * Start (or reuse) the download of one language's catalogue. With `href` (LocaleScope's versioned /i18n/<locale> URL, which it also
 * preloads in the HTML) the browser fetches the JSON, so it arrives alongside the page's scripts; otherwise the chunk is imported.
 */
export function loadCatalog(locale: Locale, href?: string): Promise<Messages> {
  const have = ready.get(locale);
  if (have) return Promise.resolve(have);
  let p = pending.get(locale);
  if (!p) {
    const get =
      href && typeof window !== "undefined"
        ? fetch(href, { credentials: "same-origin" }).then((r) => (r.ok ? (r.json() as Promise<Messages>) : CHUNKS[locale]()), () => CHUNKS[locale]())
        : CHUNKS[locale]();
    p = get.then((m) => {
      ready.set(locale, m);
      return m;
    });
    pending.set(locale, p);
  }
  return p;
}

/** Put a catalogue in the cache without a download (tests; callers that already hold it). */
export function primeCatalog(locale: Locale, messages: Messages): void {
  ready.set(locale, messages);
  pending.set(locale, Promise.resolve(messages));
}

/** The catalogue if it is already in, without suspending. */
export function catalogNow(locale: Locale): Messages | undefined {
  return ready.get(locale);
}

/** The catalogue for `locale`, suspending the first time it is needed. */
export function useCatalog(locale: Locale, href?: string): Messages {
  return ready.get(locale) ?? use(loadCatalog(locale, href));
}

/** `t` against one loaded catalogue: the key itself when missing, so a bug is visible. */
export function translateWith(messages: Messages, locale: Locale, key: MessageKey, vars?: Vars): string {
  const msg = messages[key] ?? key;
  return vars || msg.includes("{") ? formatMessage(locale, msg, vars) : msg;
}
