import { en, type MessageKey, type Messages } from "./messages/en.js";
import { hi } from "./messages/hi.js";
import { pa } from "./messages/pa.js";
import { ur } from "./messages/ur.js";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales.js";

export type { MessageKey, Messages };
export type Vars = Record<string, string | number | null | undefined>;

export const CATALOGS: Record<Locale, Messages> = { en, hi, ur, pa };
export const MESSAGE_KEYS = Object.keys(en) as MessageKey[];

/** Index of the `}` that closes the `{` at `start`, or -1. */
function closeBrace(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

const ruleCache = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: Locale, n: number): string {
  const tag = LOCALES[locale].bcp47;
  let r = ruleCache.get(tag);
  if (!r) {
    try {
      r = new Intl.PluralRules(tag);
    } catch {
      r = new Intl.PluralRules("en");
    }
    ruleCache.set(tag, r);
  }
  return r.select(n);
}

/**
 * ICU-lite: `{name}` substitution and `{n, plural, =0 {none} one {# item} other {# items}}`.
 * `#` is the number. Unknown variables are left as `{name}` so a bug is visible, not silent.
 */
export function formatMessage(locale: Locale, template: string, vars: Vars = {}): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch !== "{") {
      out += ch;
      i++;
      continue;
    }
    const end = closeBrace(template, i);
    if (end < 0) {
      out += template.slice(i);
      break;
    }
    const inner = template.slice(i + 1, end);
    const m = /^\s*(\w+)\s*(?:,\s*plural\s*,([\s\S]*))?$/.exec(inner);
    if (!m) {
      out += template.slice(i, end + 1);
    } else {
      const name = m[1]!;
      const v = vars[name];
      if (m[2] === undefined) {
        out += v === undefined || v === null ? `{${name}}` : String(v);
      } else {
        const n = Number(v ?? 0);
        const branches = new Map<string, string>();
        const body = m[2];
        let j = 0;
        while (j < body.length) {
          const sel = /^\s*(=\d+|\w+)\s*\{/.exec(body.slice(j));
          if (!sel) break;
          const open = j + sel[0].length - 1;
          const close = closeBrace(body, open);
          if (close < 0) break;
          branches.set(sel[1]!, body.slice(open + 1, close));
          j = close + 1;
        }
        const chosen = branches.get(`=${n}`) ?? branches.get(pluralCategory(locale, n)) ?? branches.get("other") ?? "";
        out += formatMessage(locale, chosen.replace(/#/g, String(n)), vars);
      }
    }
    i = end + 1;
  }
  return out;
}

/** Translate a key. Falls back to English, then to the key itself. */
export function t(locale: Locale, key: MessageKey, vars?: Vars): string {
  const msg = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return vars || msg.includes("{") ? formatMessage(locale, msg, vars) : msg;
}

/**
 * For a right-to-left language: a message that opens with a Latin run ("Local Loyalty کی خبریں") would be laid out left to
 * right by the browser's first-strong rule. A leading RLM (U+200F) makes the Urdu text decide the paragraph direction.
 * Text inside isolates (the wrapped shop and customer names) is ignored when looking for the first letter.
 */
export function withRtlMark(locale: Locale, text: string): string {
  if (LOCALES[locale].dir !== "rtl" || !text) return text;
  const outside = text.replace(/[\u2066\u2067\u2068][\s\S]*?\u2069/g, "");
  return /^[^\p{L}]*\p{Script=Latin}/u.test(outside) ? `\u200F${text}` : text;
}

/** Bind a locale once: `const tr = translator("ur"); tr("menu.add")`. */
export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Vars) => t(locale, key, vars);
}

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
