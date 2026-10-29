/**
 * The catalogue-free half of the translator: ICU-lite formatting and the RTL mark. Client code imports these without pulling in any
 * message catalogue (t.ts imports all four statically; the web client loads only the visitor's one, apps/web/src/lib/i18n/catalog.ts).
 */
import { LOCALES, type Locale } from "./locales.js";

export type Vars = Record<string, string | number | null | undefined>;

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
/** Digits of any script (Arabic-Indic, Devanagari, Gurmukhi) as 0-9, so a formatted count still picks a plural branch. */
function asciiDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u0a66-\u0a6f]/g, (c) => String(c.charCodeAt(0) & 0xf)).replace(/\u066b/g, ".");
}

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
        // A pre-formatted count ("10,000") picks the branch by its value and prints as given.
        const shown = typeof v === "string" && v.trim() !== "" ? v : undefined;
        const n = Number(typeof v === "string" ? asciiDigits(v).replace(/[,\u066c\u060c\s]/g, "") : (v ?? 0));
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
        out += formatMessage(locale, chosen.replace(/#/g, shown ?? String(n)), vars);
      }
    }
    i = end + 1;
  }
  return out;
}

/**
 * For a right-to-left language: a message that opens with a Latin run ("Local Loyalty کی خبریں") or with an isolated name
 * ("\u2068Sarson Dhaba\u2069 میں خوش آمدید") would be laid out left to right by the browser's first-strong rule (Chromium's `dir="auto"`
 * looks inside isolates). A leading RLM (U+200F) makes the paragraph right to left; it is zero-width.
 */
export function withRtlMark(locale: Locale, text: string): string {
  if (LOCALES[locale].dir !== "rtl" || !text) return text;
  return /^[^\p{L}\u2066-\u2068]*(\p{Script=Latin}|[\u2066-\u2068])/u.test(text) ? `\u200F${text}` : text;
}
