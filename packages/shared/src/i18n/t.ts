import { en, type MessageKey, type Messages } from "./messages/en.js";
import { hi } from "./messages/hi.js";
import { pa } from "./messages/pa.js";
import { ur } from "./messages/ur.js";
import { DEFAULT_LOCALE, type Locale } from "./locales.js";
import { formatMessage, type Vars } from "./message-format.js";

export type { MessageKey, Messages };

/**
 * Every catalogue, statically: for the API, the mobile app and server components. Browser code must not import `t`, `translator`,
 * `CATALOGS` or `MESSAGE_KEYS` (that ships all four catalogues, about 350 KB gzipped); it uses `useLocale()` (apps/web/src/lib/i18n),
 * which loads only the visitor's catalogue. The helpers in message-format.ts and message-keys.ts are catalogue-free.
 */
export const CATALOGS: Record<Locale, Messages> = { en, hi, ur, pa };
export const MESSAGE_KEYS = Object.keys(en) as MessageKey[];

/** Translate a key. Falls back to English, then to the key itself. */
export function t(locale: Locale, key: MessageKey, vars?: Vars): string {
  const msg = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return vars || msg.includes("{") ? formatMessage(locale, msg, vars) : msg;
}

/** Bind a locale once: `const tr = translator("ur"); tr("menu.add")`. */
export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Vars) => t(locale, key, vars);
}
