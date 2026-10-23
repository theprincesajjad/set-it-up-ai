/**
 * Reply drafts for private feedback in the guest's language. The owner edits the text before sending; these are a
 * starting point, not a script. Hindi, Urdu and Punjabi are drafts that a native speaker should review (docs/engineering/translation-glossary.md).
 */
export type ReplyLang = "en" | "hi" | "ur" | "pa";
export const REPLY_LANGS: { value: ReplyLang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ur", label: "Urdu" },
  { value: "pa", label: "Punjabi" },
];
export const languageName = (l: ReplyLang) => REPLY_LANGS.find((x) => x.value === l)!.label;

const BODY: Record<ReplyLang, string> = {
  en: "Hi {name}, it is {shop}. Thank you for telling us, and we are sorry we let you down. We would like to make it right.",
  hi: "नमस्ते {name}, मैं {shop} से हूँ। हमें बताने के लिए शुक्रिया, और माफ़ कीजिए कि हम आपकी उम्मीद पर खरे नहीं उतरे। हम इसे ठीक करना चाहेंगे।",
  ur: "السلام علیکم {name}، میں {shop} سے ہوں۔ ہمیں بتانے کا شکریہ، اور معذرت کہ ہم آپ کی توقع پر پورے نہیں اترے۔ ہم اسے ٹھیک کرنا چاہیں گے۔",
  pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name}, ਮੈਂ {shop} ਤੋਂ ਹਾਂ। ਸਾਨੂੰ ਦੱਸਣ ਲਈ ਧੰਨਵਾਦ, ਅਤੇ ਮਾਫ਼ ਕਰਨਾ ਕਿ ਅਸੀਂ ਤੁਹਾਡੀ ਉਮੀਦ ਤੇ ਖਰੇ ਨਹੀਂ ਉਤਰੇ। ਅਸੀਂ ਇਸਨੂੰ ਠੀਕ ਕਰਨਾ ਚਾਹਾਂਗੇ।",
};
const CHAI: Record<ReplyLang, string> = {
  en: "Come in for a free chai on us: show code {code} at the counter.",
  hi: "आइए, चाय हमारी तरफ़ से: काउंटर पर कोड {code} दिखाइए।",
  ur: "تشریف لائیے، چائے ہماری طرف سے: کاؤنٹر پر کوڈ {code} دکھائیں۔",
  pa: "ਆਓ, ਚਾਹ ਸਾਡੇ ਵੱਲੋਂ: ਕਾਊਂਟਰ ਤੇ ਕੋਡ {code} ਦਿਖਾਓ।",
};

/** The guest's language from their setting ("ur", "ur-CA"); English when unknown. */
export function replyLang(raw: string | null | undefined): ReplyLang {
  const l = (raw ?? "").slice(0, 2).toLowerCase();
  return l === "hi" || l === "ur" || l === "pa" ? l : "en";
}

export function replyDraft(lang: ReplyLang, v: { name: string | null; shop: string; chaiCode?: string | null }): string {
  const first = v.name?.trim().split(/\s+/)[0] ?? "";
  const body = BODY[lang].replace("{name}", first || (lang === "en" ? "there" : "")).replace(/\s+،/, "،").replace("{shop}", v.shop);
  return [body, v.chaiCode ? CHAI[lang].replace("{code}", v.chaiCode) : null].filter(Boolean).join(" ");
}

/** "1 star, 2 stars": which ratings still have unread feedback. */
export function unreadCaption(by: Record<"1" | "2" | "3", number> | undefined): string {
  if (!by) return "";
  return (["1", "2", "3"] as const).filter((k) => by[k] > 0).map((k) => (by[k] > 1 ? `${by[k]} at ${k} star${k === "1" ? "" : "s"}` : `${k} star${k === "1" ? "" : "s"}`)).join(", ");
}

const ORDER_CHANNEL: Record<string, string> = { phone: "Phone", whatsapp: "WhatsApp", web: "Web", app: "App", counter: "Counter" };
export const orderChannelLabel = (c: string | null | undefined) => (c ? (ORDER_CHANNEL[c] ?? c) : null);

const ASK_CHANNEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email", push: "App" };
export const askChannelLabel = (c: string) => ASK_CHANNEL[c] ?? c;

/** Outcome of an ask in words: "5 stars, Google opened", "Opened the page", "Waiting". */
export function resultLabel(r: { rating: number | null; googleOpenedAt?: string | null; clickedAt: string | null }): string {
  if (r.rating != null) return `${r.rating} star${r.rating === 1 ? "" : "s"}${r.googleOpenedAt ? ", Google opened" : ""}`;
  return r.clickedAt ? "Opened the page" : "Waiting";
}
