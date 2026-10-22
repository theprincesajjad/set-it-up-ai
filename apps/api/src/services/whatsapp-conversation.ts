/**
 * WhatsApp ordering conversation: a small, pure state machine. No I/O, so
 * every branch is unit-testable. services/whatsapp.ts loads the session and
 * menu, calls `converse`, sends the replies and performs the returned action.
 *
 * States (whatsapp_sessions.state): browsing | cart | checkout | awaiting_payment | done | opted_out
 *
 * Customers can say: menu, a number from the menu, "2 x 3" (item 2, quantity 3),
 * "add 2 biryani", cart, remove biryani, clear, checkout, language hi|ur|pa|en,
 * stop / start. Words in Hindi, Urdu and Punjabi work for the commands.
 */
import { extractOrderLines, normalize, type MenuMatchItem } from "../lib/menu-match.js";

export type WaLang = "en" | "hi" | "ur" | "pa";
export const LANGS: readonly WaLang[] = ["en", "hi", "ur", "pa"];

export interface MenuViewItem extends MenuMatchItem {
  /** Number the customer replies with. */
  number: number;
  priceCents: number;
  category: string;
}

export interface MenuView {
  merchantName: string;
  items: MenuViewItem[];
  /** Pay at pickup only, or a card link as well. */
  cardPayments: boolean;
}

export interface CartLine {
  catalogItemId: string;
  quantity: number;
}

export interface ConverseInput {
  state: string;
  language: WaLang;
  cart: CartLine[];
  text: string;
  menu: MenuView;
  /** An order from this conversation already exists (awaiting payment). */
  orderNumber?: number | null;
}

export type ConverseAction = { type: "checkout" } | { type: "opt_in" } | { type: "opt_out" } | null;

export interface ConverseOutput {
  state: string;
  language: WaLang;
  cart: CartLine[];
  replies: string[];
  action: ConverseAction;
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------
/** Guess a language from the script of the first message. Latin text stays English (romanized Hindi/Urdu reads fine to us). */
export function detectLanguage(text: string): WaLang | null {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[؀-ۿ]/.test(text)) return "ur";
  if (/[਀-੿]/.test(text)) return "pa";
  return null;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function displayName(item: MenuViewItem, lang: WaLang): string {
  return (lang !== "en" && item.translations?.[lang]?.name) || item.name;
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------
interface Strings {
  greeting(shop: string): string;
  menuHint: string;
  added(qty: number, name: string): string;
  cartEmpty: string;
  cartHeader: string;
  total(amount: string): string;
  cartHint: string;
  removed(name: string): string;
  cleared: string;
  unknown: string;
  which(phrase: string, options: string[]): string;
  notOnMenu(phrase: string): string;
  langSet: string;
  stopped: string;
  started: string;
  help: string;
  awaiting(n: number): string;
  noItemNumber(n: number): string;
}

const STRINGS: Record<WaLang, Strings> = {
  en: {
    greeting: (s) => `Welcome to ${s}. Reply MENU to see the menu, or tell us what you would like, for example "add 2 biryani".`,
    menuHint: "Reply with an item number, or say what you want, like \"add 2 biryani\". Reply CART to review or CHECKOUT to pay.",
    added: (q, n) => `Added ${q} x ${n}.`,
    cartEmpty: "Your cart is empty. Reply MENU to see what we have.",
    cartHeader: "Your cart:",
    total: (a) => `Subtotal: ${a} (tax is added at checkout)`,
    cartHint: "Reply CHECKOUT to order, \"remove <item>\" to change, or CLEAR to start over.",
    removed: (n) => `Removed ${n}.`,
    cleared: "Cart cleared.",
    unknown: "Sorry, we did not catch that. Reply MENU for the menu, CART for your cart, or HELP.",
    which: (p, o) => `Which "${p}" do you mean? ${o.map((x, i) => `${i + 1}. ${x}`).join("  ")}`,
    notOnMenu: (p) => `We could not find "${p}" on the menu. Reply MENU to see it.`,
    langSet: "Language set to English.",
    stopped: "You will not get WhatsApp messages from us any more. Reply START to turn them back on.",
    started: "You are back on. Reply MENU to order.",
    help: "MENU: see the menu. CART: your cart. CHECKOUT: place the order. CLEAR: empty the cart. LANGUAGE HI, UR, PA or EN. STOP: no more messages.",
    awaiting: (n) => `Your order #${n} is waiting for payment. Use the link we sent, or reply MENU to start a new order.`,
    noItemNumber: (n) => `There is no item ${n} on the menu. Reply MENU to see the numbers.`,
  },
  hi: {
    greeting: (s) => `${s} में आपका स्वागत है। मेन्यू देखने के लिए MENU लिखें, या सीधे बताएं, जैसे "add 2 biryani"।`,
    menuHint: "आइटम का नंबर भेजें, या बताएं जैसे \"add 2 biryani\"। CART से कार्ट देखें, CHECKOUT से ऑर्डर करें।",
    added: (q, n) => `${q} x ${n} जोड़ दिया।`,
    cartEmpty: "आपका कार्ट खाली है। MENU लिखकर मेन्यू देखें।",
    cartHeader: "आपका कार्ट:",
    total: (a) => `कुल: ${a} (टैक्स चेकआउट पर जुड़ेगा)`,
    cartHint: "ऑर्डर के लिए CHECKOUT लिखें, बदलने के लिए \"remove <आइटम>\", या CLEAR।",
    removed: (n) => `${n} हटा दिया।`,
    cleared: "कार्ट खाली कर दिया।",
    unknown: "माफ़ कीजिए, समझ नहीं आया। MENU, CART या HELP लिखें।",
    which: (p, o) => `"${p}" में से कौन सा? ${o.map((x, i) => `${i + 1}. ${x}`).join("  ")}`,
    notOnMenu: (p) => `"${p}" मेन्यू में नहीं मिला। MENU लिखकर देखें।`,
    langSet: "भाषा हिंदी कर दी गई।",
    stopped: "अब आपको हमारे WhatsApp संदेश नहीं मिलेंगे। दोबारा शुरू करने के लिए START लिखें।",
    started: "आप वापस जुड़ गए। ऑर्डर के लिए MENU लिखें।",
    help: "MENU: मेन्यू। CART: कार्ट। CHECKOUT: ऑर्डर। CLEAR: कार्ट खाली। LANGUAGE HI, UR, PA, EN। STOP: संदेश बंद।",
    awaiting: (n) => `आपका ऑर्डर #${n} भुगतान का इंतज़ार कर रहा है। भेजे गए लिंक से भुगतान करें, या नए ऑर्डर के लिए MENU लिखें।`,
    noItemNumber: (n) => `मेन्यू में आइटम ${n} नहीं है। नंबर देखने के लिए MENU लिखें।`,
  },
  ur: {
    greeting: (s) => `${s} میں خوش آمدید۔ مینو دیکھنے کے لیے MENU لکھیں، یا سیدھا بتائیں، جیسے "add 2 biryani"۔`,
    menuHint: "آئٹم کا نمبر بھیجیں، یا بتائیں جیسے \"add 2 biryani\"۔ CART سے کارٹ دیکھیں، CHECKOUT سے آرڈر کریں۔",
    added: (q, n) => `${q} x ${n} شامل کر دیا۔`,
    cartEmpty: "آپ کا کارٹ خالی ہے۔ MENU لکھ کر مینو دیکھیں۔",
    cartHeader: "آپ کا کارٹ:",
    total: (a) => `کل: ${a} (ٹیکس چیک آؤٹ پر شامل ہوگا)`,
    cartHint: "آرڈر کے لیے CHECKOUT لکھیں، تبدیلی کے لیے \"remove <آئٹم>\"، یا CLEAR۔",
    removed: (n) => `${n} ہٹا دیا۔`,
    cleared: "کارٹ خالی کر دیا۔",
    unknown: "معذرت، سمجھ نہیں آیا۔ MENU، CART یا HELP لکھیں۔",
    which: (p, o) => `"${p}" میں سے کون سا؟ ${o.map((x, i) => `${i + 1}. ${x}`).join("  ")}`,
    notOnMenu: (p) => `"${p}" مینو میں نہیں ملا۔ MENU لکھ کر دیکھیں۔`,
    langSet: "زبان اردو کر دی گئی۔",
    stopped: "اب آپ کو ہمارے WhatsApp پیغامات نہیں ملیں گے۔ دوبارہ شروع کرنے کے لیے START لکھیں۔",
    started: "آپ دوبارہ شامل ہو گئے۔ آرڈر کے لیے MENU لکھیں۔",
    help: "MENU: مینو۔ CART: کارٹ۔ CHECKOUT: آرڈر۔ CLEAR: کارٹ خالی۔ LANGUAGE HI, UR, PA, EN۔ STOP: پیغامات بند۔",
    awaiting: (n) => `آپ کا آرڈر #${n} ادائیگی کا منتظر ہے۔ بھیجے گئے لنک سے ادائیگی کریں، یا نئے آرڈر کے لیے MENU لکھیں۔`,
    noItemNumber: (n) => `مینو میں آئٹم ${n} نہیں ہے۔ نمبر دیکھنے کے لیے MENU لکھیں۔`,
  },
  pa: {
    greeting: (s) => `${s} ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ। ਮੀਨੂ ਦੇਖਣ ਲਈ MENU ਲਿਖੋ, ਜਾਂ ਸਿੱਧਾ ਦੱਸੋ, ਜਿਵੇਂ "add 2 biryani"।`,
    menuHint: "ਆਈਟਮ ਦਾ ਨੰਬਰ ਭੇਜੋ, ਜਾਂ ਦੱਸੋ ਜਿਵੇਂ \"add 2 biryani\"। CART ਨਾਲ ਕਾਰਟ ਦੇਖੋ, CHECKOUT ਨਾਲ ਆਰਡਰ ਕਰੋ।",
    added: (q, n) => `${q} x ${n} ਜੋੜ ਦਿੱਤਾ।`,
    cartEmpty: "ਤੁਹਾਡਾ ਕਾਰਟ ਖਾਲੀ ਹੈ। MENU ਲਿਖ ਕੇ ਮੀਨੂ ਦੇਖੋ।",
    cartHeader: "ਤੁਹਾਡਾ ਕਾਰਟ:",
    total: (a) => `ਕੁੱਲ: ${a} (ਟੈਕਸ ਚੈੱਕਆਊਟ ਤੇ ਜੁੜੇਗਾ)`,
    cartHint: "ਆਰਡਰ ਲਈ CHECKOUT ਲਿਖੋ, ਬਦਲਣ ਲਈ \"remove <ਆਈਟਮ>\", ਜਾਂ CLEAR।",
    removed: (n) => `${n} ਹਟਾ ਦਿੱਤਾ।`,
    cleared: "ਕਾਰਟ ਖਾਲੀ ਕਰ ਦਿੱਤਾ।",
    unknown: "ਮਾਫ਼ ਕਰਨਾ, ਸਮਝ ਨਹੀਂ ਆਇਆ। MENU, CART ਜਾਂ HELP ਲਿਖੋ।",
    which: (p, o) => `"${p}" ਵਿੱਚੋਂ ਕਿਹੜਾ? ${o.map((x, i) => `${i + 1}. ${x}`).join("  ")}`,
    notOnMenu: (p) => `"${p}" ਮੀਨੂ ਵਿੱਚ ਨਹੀਂ ਮਿਲਿਆ। MENU ਲਿਖ ਕੇ ਦੇਖੋ।`,
    langSet: "ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਕਰ ਦਿੱਤੀ ਗਈ।",
    stopped: "ਹੁਣ ਤੁਹਾਨੂੰ ਸਾਡੇ WhatsApp ਸੁਨੇਹੇ ਨਹੀਂ ਮਿਲਣਗੇ। ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਕਰਨ ਲਈ START ਲਿਖੋ।",
    started: "ਤੁਸੀਂ ਵਾਪਸ ਜੁੜ ਗਏ। ਆਰਡਰ ਲਈ MENU ਲਿਖੋ।",
    help: "MENU: ਮੀਨੂ। CART: ਕਾਰਟ। CHECKOUT: ਆਰਡਰ। CLEAR: ਕਾਰਟ ਖਾਲੀ। LANGUAGE HI, UR, PA, EN। STOP: ਸੁਨੇਹੇ ਬੰਦ।",
    awaiting: (n) => `ਤੁਹਾਡਾ ਆਰਡਰ #${n} ਭੁਗਤਾਨ ਦੀ ਉਡੀਕ ਵਿੱਚ ਹੈ। ਭੇਜੇ ਲਿੰਕ ਨਾਲ ਭੁਗਤਾਨ ਕਰੋ, ਜਾਂ ਨਵੇਂ ਆਰਡਰ ਲਈ MENU ਲਿਖੋ।`,
    noItemNumber: (n) => `ਮੀਨੂ ਵਿੱਚ ਆਈਟਮ ${n} ਨਹੀਂ ਹੈ। ਨੰਬਰ ਦੇਖਣ ਲਈ MENU ਲਿਖੋ।`,
  },
};

export const strings = (lang: WaLang): Strings => STRINGS[lang] ?? STRINGS.en;

/** Order placed, pay-by-link or pay-at-pickup. Used by the service after checkout. */
export function orderPlacedText(lang: WaLang, p: { number: number; totalCents: number; payUrl: string | null; shop: string }): string {
  const t = money(p.totalCents);
  const link = p.payUrl;
  switch (lang) {
    case "hi":
      return link
        ? `ऑर्डर #${p.number} बन गया (${t})। भुगतान के लिए यह सुरक्षित लिंक खोलें: ${link}`
        : `ऑर्डर #${p.number} बन गया (${t})। ${p.shop} पर पिकअप के समय भुगतान करें।`;
    case "ur":
      return link
        ? `آرڈر #${p.number} بن گیا (${t})۔ ادائیگی کے لیے یہ محفوظ لنک کھولیں: ${link}`
        : `آرڈر #${p.number} بن گیا (${t})۔ ${p.shop} پر پک اپ کے وقت ادائیگی کریں۔`;
    case "pa":
      return link
        ? `ਆਰਡਰ #${p.number} ਬਣ ਗਿਆ (${t})। ਭੁਗਤਾਨ ਲਈ ਇਹ ਸੁਰੱਖਿਅਤ ਲਿੰਕ ਖੋਲ੍ਹੋ: ${link}`
        : `ਆਰਡਰ #${p.number} ਬਣ ਗਿਆ (${t})। ${p.shop} ਤੇ ਪਿਕਅੱਪ ਵੇਲੇ ਭੁਗਤਾਨ ਕਰੋ।`;
    default:
      return link
        ? `Order #${p.number} is placed (${t}). Pay securely here to confirm it: ${link}`
        : `Order #${p.number} is placed (${t}). Pay at ${p.shop} when you pick it up. We will message you when it is ready.`;
  }
}

// ---------------------------------------------------------------------------
// Command words (English, romanized, and native scripts)
// ---------------------------------------------------------------------------
const words = (...w: string[]) => new Set(w.map((x) => normalize(x)));
const CMD = {
  menu: words("menu", "menus", "hi", "hello", "hey", "hii", "start over", "namaste", "namaskar", "salaam", "salam", "assalamualaikum", "assalam o alaikum", "sat sri akal", "मेन्यू", "मेनू", "नमस्ते", "مینو", "سلام", "ਮੇਨੂ", "ਮੀਨੂ", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ"),
  cart: words("cart", "basket", "my order", "review", "कार्ट", "کارٹ", "ਕਾਰਟ"),
  checkout: words("checkout", "check out", "pay", "place order", "place my order", "confirm", "done", "order now", "चेकआउट", "ऑर्डर", "چیک آؤٹ", "آرڈر", "ਚੈੱਕਆਊਟ", "ਆਰਡਰ"),
  clear: words("clear", "reset", "empty", "cancel", "start again", "साफ़", "खाली", "صاف", "ਖਾਲੀ"),
  help: words("help", "info", "madad", "मदद", "مدد", "ਮਦਦ"),
  stop: words("stop", "stopall", "unsubscribe", "quit", "end", "optout", "opt out", "रुकें", "बंद", "بند", "ਬੰਦ"),
  start: words("start", "subscribe", "unstop", "yes", "शुरू", "شروع", "ਸ਼ੁਰੂ"),
};
/** Language names (bare, or after "language"). The two-letter codes only count after "language" because "hi" is also a greeting. */
const LANG_NAMES: Record<string, WaLang> = { english: "en", hindi: "hi", "हिंदी": "hi", "हिन्दी": "hi", urdu: "ur", "اردو": "ur", punjabi: "pa", panjabi: "pa", "ਪੰਜਾਬੀ": "pa" };
const LANG_CODES: Record<string, WaLang> = { en: "en", hi: "hi", ur: "ur", pa: "pa" };

const MENU_CHUNK = 3200;

/** Menu text split into WhatsApp-sized messages, grouped by category, items numbered. */
export function menuMessages(menu: MenuView, lang: WaLang): string[] {
  const s = strings(lang);
  if (!menu.items.length) return [s.cartEmpty];
  const head = `*${menu.merchantName}*\n`;
  const chunks: string[] = [];
  let cur = head;
  let category = "";
  for (const it of menu.items) {
    const catLine = `\n*${it.category}*\n`;
    const line = `${it.number}. ${displayName(it, lang)}  ${money(it.priceCents)}\n`;
    const block = (it.category !== category ? catLine : "") + line;
    if (cur.length + block.length > MENU_CHUNK && cur !== head) {
      chunks.push(cur.trimEnd());
      cur = head + catLine + line;
    } else cur += block;
    category = it.category;
  }
  chunks.push(cur.trimEnd());
  chunks[chunks.length - 1] += `\n\n${s.menuHint}`;
  return chunks;
}

export function cartText(menu: MenuView, cart: CartLine[], lang: WaLang): { text: string; subtotalCents: number } {
  const s = strings(lang);
  const byId = new Map(menu.items.map((i) => [i.id, i]));
  let subtotal = 0;
  const lines: string[] = [];
  for (const c of cart) {
    const it = byId.get(c.catalogItemId);
    if (!it) continue;
    subtotal += it.priceCents * c.quantity;
    lines.push(`${c.quantity} x ${displayName(it, lang)}  ${money(it.priceCents * c.quantity)}`);
  }
  return { text: lines.length ? `${s.cartHeader}\n${lines.join("\n")}\n${s.total(money(subtotal))}\n${s.cartHint}` : s.cartEmpty, subtotalCents: subtotal };
}

function addToCart(cart: CartLine[], id: string, qty: number): CartLine[] {
  const next = cart.map((c) => ({ ...c }));
  const hit = next.find((c) => c.catalogItemId === id);
  if (hit) hit.quantity = Math.min(50, hit.quantity + qty);
  else next.push({ catalogItemId: id, quantity: Math.min(50, qty) });
  return next;
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------
export function converse(input: ConverseInput): ConverseOutput {
  const text = input.text.trim();
  const norm = normalize(text);
  let { state, language: lang, cart } = input;
  const out = (replies: string[], patch: Partial<ConverseOutput> = {}): ConverseOutput => ({ state, language: lang, cart, replies, action: null, ...patch });

  // Opted out: only START brings the customer back.
  if (state === "opted_out") {
    if (CMD.start.has(norm)) return out([strings(lang).started], { state: "browsing", action: { type: "opt_in" } });
    return out([]);
  }

  // Language switch: "language hi", "hindi", "lang ur".
  const langMatch = /^(?:language|lang|bhasha|zaban)\s+(\S+)$/.exec(norm);
  const wantedLang = langMatch ? (LANG_NAMES[langMatch[1]!] ?? LANG_CODES[langMatch[1]!]) : LANG_NAMES[norm];
  if (wantedLang) {
    lang = wantedLang;
    return out([strings(lang).langSet]);
  }

  if (CMD.stop.has(norm)) return out([strings(lang).stopped], { state: "opted_out", cart: [], action: { type: "opt_out" } });
  if (CMD.help.has(norm)) return out([strings(lang).help]);

  const s = strings(lang);
  if (CMD.menu.has(norm)) {
    const fresh = state === "done" || state === "awaiting_payment";
    if (fresh) {
      state = "browsing";
      cart = [];
    }
    return out(menuMessages(input.menu, lang), { state: cart.length ? "cart" : "browsing" });
  }
  if (CMD.cart.has(norm)) return out([cartText(input.menu, cart, lang).text]);
  if (CMD.clear.has(norm)) return out([s.cleared], { state: "browsing", cart: [] });

  if (state === "awaiting_payment" && input.orderNumber) {
    // A fresh item request while an order awaits payment starts a new cart below; anything else gets a status line.
    if (CMD.checkout.has(norm)) return out([s.awaiting(input.orderNumber)]);
  }
  if (state === "done" || state === "awaiting_payment") {
    state = "browsing";
    cart = [];
  }

  if (CMD.checkout.has(norm)) {
    if (!cart.length) return out([s.cartEmpty]);
    return out([], { state: "checkout", action: { type: "checkout" } });
  }

  const byNumber = new Map(input.menu.items.map((i) => [i.number, i]));

  // "remove biryani"
  const rm = /^(?:remove|delete|hatao|हटाओ|हटाएं|ہٹاؤ|ਹਟਾਓ)\s+(.+)$/.exec(norm);
  if (rm) {
    const parsed = extractOrderLines(rm[1]!, input.menu.items);
    const hit = parsed.lines[0];
    if (!hit) return out([s.notOnMenu(rm[1]!)]);
    const had = cart.find((c) => c.catalogItemId === hit.catalogItemId);
    if (!had) return out([s.notOnMenu(rm[1]!)]);
    cart = cart.filter((c) => c.catalogItemId !== hit.catalogItemId);
    const it = byNumber.size ? input.menu.items.find((i) => i.id === hit.catalogItemId) : undefined;
    return out([s.removed(it ? displayName(it, lang) : hit.name), cartText(input.menu, cart, lang).text], { state: cart.length ? "cart" : "browsing" });
  }

  // "3" = item 3. "3 x 2" or "3*2" = item 3, quantity 2.
  const num = /^(\d{1,3})(?:\s*[x*×]\s*(\d{1,2}))?$/.exec(norm.replace(/\s*[×*]\s*/g, " x "));
  if (num) {
    const n = Number(num[1]);
    const q = num[2] ? Math.max(1, Number(num[2])) : 1;
    const it = byNumber.get(n);
    if (!it) return out([s.noItemNumber(n)]);
    cart = addToCart(cart, it.id, q);
    return out([s.added(q, displayName(it, lang)), cartText(input.menu, cart, lang).text], { state: "cart", cart });
  }

  // Free text: "add 2 biryani", "do chicken biryani aur ek naan".
  const parsed = extractOrderLines(text, input.menu.items);
  const replies: string[] = [];
  for (const l of parsed.lines) {
    const it = input.menu.items.find((i) => i.id === l.catalogItemId)!;
    cart = addToCart(cart, l.catalogItemId, l.quantity);
    replies.push(s.added(l.quantity, displayName(it, lang)));
  }
  for (const a of parsed.ambiguous) replies.push(s.which(a.phrase, a.options.map((o) => o.name)));
  for (const u of parsed.unmatched) replies.push(s.notOnMenu(u));
  if (parsed.lines.length) {
    replies.push(cartText(input.menu, cart, lang).text);
    return out(replies, { state: "cart", cart });
  }
  if (replies.length) return out(replies);
  return out([s.unknown]);
}
