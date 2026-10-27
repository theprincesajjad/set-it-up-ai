/**
 * Pure helpers that turn free text ("2 chicken biryani and one naan", a phone
 * transcript, a WhatsApp reply) into menu lines by fuzzy-matching item names
 * and their translations. No I/O, so it is easy to test and to reuse from the
 * WhatsApp ordering bot and the phone assistant.
 */
export interface MenuMatchItem {
  id: string;
  name: string;
  /** { hi: { name }, ur: { name }, pa: { name } } */
  translations?: Record<string, { name?: string; description?: string }>;
}

export interface ParsedLine {
  catalogItemId: string;
  name: string;
  quantity: number;
  /** 0..1 match quality. */
  score: number;
}

export interface ParsedOrder {
  lines: ParsedLine[];
  /** Things the caller asked for that are not on the menu (e.g. "pizza"). */
  unmatched: string[];
  /** A phrase that fits more than one item ("biryani"): ask which one. `quantity` is what was said ("two biryani" = 2), kept when one is picked. */
  ambiguous: { phrase: string; quantity: number; options: { catalogItemId: string; name: string }[] }[];
  /** "in 30 minutes" / "in an hour". */
  pickupInMinutes?: number;
  /** "at 6 pm", "tonight": kept as a note, the shop confirms the time. */
  pickupNote?: string;
  /** A spoken clock time ("at 8", "8 baje", "آٹھ بجے"). `meridiem` is set only when the caller said am or pm. */
  pickupClock?: { hour: number; minute: number; meridiem?: "am" | "pm"; said: string };
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------
const DIGIT_BLOCKS: [number, number][] = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic (Urdu)
  [0x0966, 0x096f], // Devanagari
  [0x0a66, 0x0a6f], // Gurmukhi
];

function asciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const block = DIGIT_BLOCKS.find(([a, b]) => cp >= a && cp <= b);
    out += block ? String(cp - block[0]) : ch;
  }
  return out;
}

/** Lowercase, strip Latin diacritics and punctuation, keep letters and digits of any script. */
export function normalize(s: string): string {
  return asciiDigits(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// ---------------------------------------------------------------------------
// Numbers and filler words (English, plus romanized and native Hindi, Urdu, Punjabi)
// ---------------------------------------------------------------------------
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  a: 1, an: 1, single: 1, couple: 2, pair: 2, dozen: 12,
  // romanized Hindi / Urdu / Punjabi
  ek: 1, aik: 1, ik: 1, do: 2, dho: 2, teen: 3, tin: 3, tinn: 3, char: 4, chaar: 4, panch: 5, paanch: 5, panj: 5, chhe: 6, chheh: 6, che: 6, saat: 7, satt: 7, aath: 8, atth: 8, nau: 9, das: 10, dus: 10, barah: 12,
  // native scripts
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5, "چھ": 6, "سات": 7, "آٹھ": 8, "نو": 9, "دس": 10,
  "ਇੱਕ": 1, "ਦੋ": 2, "ਤਿੰਨ": 3, "ਚਾਰ": 4, "ਪੰਜ": 5, "ਛੇ": 6, "ਸੱਤ": 7, "ਅੱਠ": 8, "ਨੌ": 9, "ਦਸ": 10,
};
const QTY_FILLERS = new Set(["x", "of", "pieces", "piece", "pcs", "plates", "plate", "orders", "order", "portions", "portion", "full", "half", "trays", "tray", "pots", "pot", "boxes", "box", "bottles"]);
const FILLERS = new Set([
  "i", "id", "want", "would", "like", "to", "order", "please", "pls", "the", "and", "aur", "or", "for", "pickup", "pick", "up", "at", "pm", "am", "my", "name", "is", "can", "could", "get", "give", "me", "we", "need", "have", "thanks", "thank", "you", "hello", "hi", "hey", "also", "add", "with", "some", "of", "in", "on", "it", "that", "this", "will", "be", "going", "today", "tonight", "tomorrow", "minutes", "minute", "mins", "hour", "hours", "an", "a", "just", "only", "too", "plus", "one", "then", "so", "ok", "okay",
]);

const wordNumber = (tok: string): number | null => {
  if (/^\d{1,3}$/.test(tok)) return Number(tok);
  const x = /^x(\d{1,2})$/.exec(tok);
  if (x) return Number(x[1]);
  return NUMBER_WORDS[tok] ?? null;
};

// ---------------------------------------------------------------------------
// Matching names
// ---------------------------------------------------------------------------
interface Candidate {
  item: MenuMatchItem;
  /** Normalized name tokens. */
  tokens: string[];
  text: string;
}

function candidatesFor(items: MenuMatchItem[], languages?: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    const names = [item.name];
    for (const [lang, tr] of Object.entries(item.translations ?? {})) if (tr.name && (!languages || languages.includes(lang))) names.push(tr.name);
    for (const n of new Set(names)) {
      const text = normalize(n);
      if (text) out.push({ item, tokens: text.split(" "), text });
    }
  }
  return out;
}

export interface NameMatch {
  item: MenuMatchItem;
  score: number;
}

/** Rank items for one phrase ("chiken biryani"). Best first; at most `limit`. */
export function rankItems(phrase: string, items: MenuMatchItem[], opts: { minScore?: number; limit?: number } = {}): NameMatch[] {
  const q = normalize(phrase);
  if (!q) return [];
  const qTokens = q.split(" ");
  const best = new Map<string, NameMatch>();
  for (const c of candidatesFor(items)) {
    let score = similarity(q, c.text);
    // Every word of the item name is in the phrase ("2 chicken biryani please").
    if (c.tokens.every((t) => qTokens.some((qt) => similarity(qt, t) >= 0.8))) score = Math.max(score, 0.95 - 0.01 * Math.max(0, qTokens.length - c.tokens.length));
    // The phrase is part of the item name ("biryani" for "Chicken Biryani"): plausible but weaker.
    else if (qTokens.every((qt) => c.tokens.some((t) => similarity(qt, t) >= 0.8)) && q.length >= 4) score = Math.max(score, 0.8);
    const prev = best.get(c.item.id);
    if (!prev || prev.score < score) best.set(c.item.id, { item: c.item, score });
  }
  return [...best.values()]
    .filter((m) => m.score >= (opts.minScore ?? 0.7))
    .sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
    .slice(0, opts.limit ?? 5);
}

/** Pick one item for a phrase, or report ambiguity (two different items scoring within 0.03). */
export function matchOne(phrase: string, items: MenuMatchItem[], minScore = 0.75): { match: NameMatch | null; ambiguous: NameMatch[] } {
  const ranked = rankItems(phrase, items, { minScore });
  const top = ranked[0];
  if (!top) return { match: null, ambiguous: [] };
  const close = ranked.filter((r) => top.score - r.score <= 0.03);
  if (close.length > 1 && top.score < 0.95) return { match: null, ambiguous: close };
  return { match: top, ambiguous: [] };
}

// ---------------------------------------------------------------------------
// Extracting a whole order from running text
// ---------------------------------------------------------------------------
interface Hit {
  start: number;
  end: number; // exclusive
  item: MenuMatchItem;
  score: number;
  /** Partial name ("biryani" for two items). */
  ambiguousWith?: MenuMatchItem[];
}

const PICKUP_IN = /\bin (?:about |around )?(an?|\d{1,3}|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five|forty-five) ?(minutes?|mins?|hours?|hrs?)\b/;
const PICKUP_AT = /\b(?:at|around|by) (\d{1,2}(?::\d{2})?) ?(am|pm)?\b|\b(tonight|this evening|this afternoon|tomorrow|for lunch|for dinner|after maghrib)\b/;
// "8 baje", "sade chhe baje", "आठ बजे", "साढ़े छह बजे", "آٹھ بجے", "ساڑھے چھ بجے", "ਅੱਠ ਵਜੇ": a number, then the word for o'clock.
const alt = (words: string[]) => `(?:${words.map((w) => normalize(w)).join("|")})`;
const BAJE = alt(["baje", "bajay", "bajey", "bje", "bajae", "बजे", "बजकर", "بجے", "بجئے", "ਵਜੇ"]);
const SADE = alt(["sade", "saade", "साढ़े", "साढे", "साड़े", "ساڑھے", "ਸਾਢੇ"]);
const PICKUP_CLOCK = new RegExp(`(?:^| )(?:(${SADE}) )?(\\d{1,2}(?::\\d{2})?|[\\p{L}\\p{M}]+) ${BAJE}(?= |$)`, "u");

function wordHour(w: string): number | null {
  const n = /^\d/.test(w) ? Number(w.split(":")[0]) : NUMBER_WORDS[w];
  return n === undefined || Number.isNaN(n) ? null : n;
}

/** A spoken clock time, and the text with that phrase taken out so its number is not read as a quantity. */
function clockHint(t: string): { clock?: NonNullable<ParsedOrder["pickupClock"]>; rest: string } {
  const b = PICKUP_CLOCK.exec(t);
  if (b) {
    const hour = wordHour(b[2]!);
    if (hour !== null && hour >= 1 && hour <= 12) {
      const minute = b[2]!.includes(":") ? Number(b[2]!.split(":")[1]) : b[1] ? 30 : 0;
      return { clock: { hour, minute, said: b[0].trim() }, rest: t.replace(b[0], " ") };
    }
  }
  const a = /\b(?:at|around|by) (\d{1,2})(?::(\d{2}))?(?: ?(am|pm))?\b/.exec(t);
  if (a && (a[3] || a[2] || Number(a[1]) <= 12)) {
    const hour = Number(a[1]);
    if (hour >= 1 && hour <= 12) return { clock: { hour, minute: a[2] ? Number(a[2]) : 0, ...(a[3] ? { meridiem: a[3] as "am" | "pm" } : {}), said: a[0] }, rest: t.replace(a[0], " ") };
  }
  return { rest: t };
}
const WORD_MIN: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, "forty five": 45, "forty-five": 45 };

function pickupHints(text: string): Pick<ParsedOrder, "pickupInMinutes" | "pickupNote" | "pickupClock"> {
  const t = normalize(text).replace(/ (\d{1,2}) (\d{2}) /g, " $1:$2 ");
  const m = PICKUP_IN.exec(t);
  if (m) {
    const n = WORD_MIN[m[1]!] ?? Number(m[1]);
    const mins = /^h/.test(m[2]!) ? n * 60 : n;
    if (mins > 0 && mins <= 24 * 60) return { pickupInMinutes: mins };
  }
  const { clock } = clockHint(t);
  if (clock) return { pickupClock: clock, pickupNote: `Pickup at ${clock.said}`.replace(/\s+/g, " ").trim() };
  const a = PICKUP_AT.exec(t);
  if (a) return { pickupNote: `Pickup ${a[0]}`.replace(/\s+/g, " ").trim() };
  return {};
}

/**
 * Find menu items and quantities in free text. Quantity is the number just
 * before the item ("2 chicken biryani", "do biryani"), else just after
 * ("biryani x2"), else 1.
 */
export function extractOrderLines(text: string, items: MenuMatchItem[], opts: { minScore?: number } = {}): ParsedOrder {
  const minScore = opts.minScore ?? 0.8;
  // The spoken time ("8 baje") is not a quantity: take it out before reading quantities.
  const tokens = clockHint(normalize(text).replace(/ (\d{1,2}) (\d{2}) /g, " $1:$2 ")).rest.split(" ").filter(Boolean);
  const cands = candidatesFor(items);
  const hits: Hit[] = [];

  // 1. Every window of the same word count as an item name, scored against that name.
  for (const c of cands) {
    const n = c.tokens.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      const window = tokens.slice(i, i + n);
      if (window.every((w) => FILLERS.has(w) || wordNumber(w) !== null)) continue;
      const score = similarity(window.join(" "), c.text);
      // Very short names need an exact match: "do" or "ek" must not fuzzy-match "dal".
      if (score >= minScore && (c.text.length >= 5 || score === 1)) hits.push({ start: i, end: i + n, item: c.item, score });
    }
  }

  // 2. Single distinctive words of a longer name ("biryani" for "Chicken Biryani"), unique or ambiguous.
  const partials: Hit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.length < 4 || FILLERS.has(tok) || wordNumber(tok) !== null) continue;
    if (hits.some((h) => h.start <= i && i < h.end)) continue;
    const owners = new Map<string, MenuMatchItem>();
    for (const c of cands) if (c.tokens.length > 1 && c.tokens.some((t) => t.length >= 4 && similarity(tok, t) >= 0.85)) owners.set(c.item.id, c.item);
    if (owners.size >= 1) {
      // "chicken biryani": a distinctive word right after another one narrows the same phrase down ("chicken" and "biryani" are not two orders).
      const last = partials[partials.length - 1];
      if (last && last.end === i) {
        const prev = last.ambiguousWith ?? [last.item];
        const both = prev.filter((p) => owners.has(p.id));
        if (both.length) {
          last.end = i + 1;
          last.item = both[0]!;
          last.ambiguousWith = both.length > 1 ? both : undefined;
          continue;
        }
      }
      const list = [...owners.values()];
      partials.push({ start: i, end: i + 1, item: list[0]!, score: 0.8, ambiguousWith: list.length > 1 ? list : undefined });
    }
  }

  // 3. Keep the best non-overlapping hits (longer, then higher score, first).
  const all = [...hits, ...partials].sort((a, b) => b.end - b.start - (a.end - a.start) || b.score - a.score || a.start - b.start);
  const chosen: Hit[] = [];
  for (const h of all) if (!chosen.some((c) => c.start < h.end && h.start < c.end)) chosen.push(h);
  chosen.sort((a, b) => a.start - b.start);

  // 4. Quantities.
  const numberUsed = new Set<number>();
  const qty = new Map<Hit, number>();
  for (const h of chosen) {
    let j = h.start - 1;
    let steps = 0;
    while (j >= 0 && steps < 3 && QTY_FILLERS.has(tokens[j]!)) {
      j--;
      steps++;
    }
    const n = j >= 0 ? wordNumber(tokens[j]!) : null;
    if (n !== null && n > 0 && !chosen.some((o) => o.start <= j && j < o.end)) {
      qty.set(h, Math.min(n, 50));
      numberUsed.add(j);
    }
  }
  for (const h of chosen) {
    if (qty.has(h)) continue;
    let j = h.end;
    while (j < tokens.length && QTY_FILLERS.has(tokens[j]!) && tokens[j] !== "of") j++;
    const n = j < tokens.length ? wordNumber(tokens[j]!) : null;
    const isNextItemQty = chosen.some((o) => o.start === j + 1 || o.start === j + 2) && !/^x\d+$/.test(tokens[j] ?? "");
    if (n !== null && n > 0 && !numberUsed.has(j) && !isNextItemQty && !chosen.some((o) => o.start <= j && j < o.end)) {
      qty.set(h, Math.min(n, 50));
      numberUsed.add(j);
    }
  }

  const lines = new Map<string, ParsedLine>();
  const ambiguous: ParsedOrder["ambiguous"] = [];
  for (const h of chosen) {
    if (h.ambiguousWith) {
      ambiguous.push({ phrase: tokens.slice(h.start, h.end).join(" "), quantity: qty.get(h) ?? 1, options: h.ambiguousWith.map((i) => ({ catalogItemId: i.id, name: i.name })) });
      continue;
    }
    const q = qty.get(h) ?? 1;
    const prev = lines.get(h.item.id);
    if (prev) prev.quantity = Math.min(50, prev.quantity + q);
    else lines.set(h.item.id, { catalogItemId: h.item.id, name: h.item.name, quantity: q, score: Number(h.score.toFixed(3)) });
  }

  // 5. Quantities followed by words we could not place: "2 pizza".
  const unmatched: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (numberUsed.has(i) || chosen.some((c) => c.start <= i && i < c.end)) continue;
    const n = wordNumber(tokens[i]!);
    if (n === null || n === 0 || tokens[i] === "a" || tokens[i] === "an") continue;
    if (!/^\d/.test(tokens[i]!) && NUMBER_WORDS[tokens[i]!] === undefined) continue;
    const phrase: string[] = [];
    for (let j = i + 1; j < tokens.length && phrase.length < 3; j++) {
      const w = tokens[j]!;
      if (chosen.some((c) => c.start <= j && j < c.end) || FILLERS.has(w) || QTY_FILLERS.has(w) || wordNumber(w) !== null) break;
      phrase.push(w);
    }
    if (phrase.length) unmatched.push(phrase.join(" "));
  }

  return { lines: [...lines.values()], unmatched: [...new Set(unmatched)].slice(0, 8), ambiguous, ...pickupHints(text) };
}
