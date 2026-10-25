/**
 * The sales and support assistant (apps/api/src/services/sales-agent/*): the parts both the API and the web widget
 * need and that must never come from the model.
 *
 *  - The disclosure (first message), the STOP / START / hand-off / offline texts, in en, hi, ur and pa.
 *    Fixed text, not model output: Meta's escalation rule, CASL sender identification and "tell people it is an
 *    AI" are things we promise in code, so a prompt change cannot remove them.
 *  - Language detection from script, and the words that ask for a person.
 *  - The widget's own strings.
 *
 * Wording to be checked by a native speaker of each language before launch (docs/engineering/translation-glossary.md).
 */
import { BRAND } from "./brand.js";
import { RETENTION } from "./retention.js";

export const AGENT_LANGS = ["en", "hi", "ur", "pa"] as const;
export type AgentLang = (typeof AGENT_LANGS)[number];
export const isAgentLang = (v: unknown): v is AgentLang => typeof v === "string" && (AGENT_LANGS as readonly string[]).includes(v);

/** Script-based guess. Latin text stays English: romanised Hindi and Urdu read fine to the model, which replies in kind. */
export function detectAgentLanguage(text: string): AgentLang | null {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (/[਀-੿]/.test(text)) return "pa";
  if (/[؀-ۿݐ-ݿ]/.test(text)) return "ur";
  return null;
}

const HUMAN_NATIVE = ["इंसान", "इन्सान", "व्यक्ति से", "किसी से बात", "मानव", "انسان", "کسی سے بات", "شخص سے", "ਇਨਸਾਨ", "ਬੰਦੇ", "ਕਿਸੇ ਨਾਲ ਗੱਲ", "ਵਿਅਕਤੀ ਨਾਲ"];
const HUMAN_BARE = /^(human|a human|person|a person|agent|an agent|representative|real person|someone|operator|help|support)$/;
const HUMAN_PHRASE = /\b(talk|speak|chat|connect|transfer|put me)\b.{0,20}\b(human|person|someone|agent|representative|real person|the team)\b|\b(human|real person|live agent)\b.{0,12}\b(please|now|needed)\b/;

/** True when the message asks for a person. Code, not the model, so "HUMAN" always works. */
export function wantsHuman(text: string): boolean {
  const t = text.normalize("NFKC").toLowerCase().replace(/[.!?,;:"']/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.length > 120) return false;
  if (HUMAN_BARE.test(t) || HUMAN_PHRASE.test(t)) return true;
  return HUMAN_NATIVE.some((w) => text.includes(w)) && t.length <= 60;
}

export interface AgentTexts {
  /** First message of every conversation: who we are, that it is an AI, what it can do, how to reach a person, how to stop. */
  disclosure: (o: { whatsapp: boolean }) => string;
  stopped: string;
  started: string;
  /** No model reachable (no API key, outage): the chat still opens a hand-off. */
  offline: string;
  /** Sent when the conversation goes to a person (asked for, or the assistant did not know). */
  handoff: string;
  /** Sent once when a person takes over. */
  humanJoined: string;
  rateLimited: string;
  tooLong: string;
  /** A reply failed a check (a figure or a promise we cannot stand behind): replaced, and handed off. */
  guardrail: string;
  unsupported: string;
}

const brand = BRAND.name;

export const AGENT_TEXTS: Record<AgentLang, AgentTexts> = {
  en: {
    disclosure: ({ whatsapp }) =>
      `Hi, I'm ${brand}'s AI assistant. I can answer questions about pricing, fees, how it works and set-up, and I can start your sign-up. I can be wrong, so for anything important a person from the team can step in at any time: type HUMAN. ${whatsapp ? "Reply STOP to stop messages." : "Chats are saved so the team can follow up."}`,
    stopped: `You will not get WhatsApp messages from ${brand} any more. Reply START to turn them back on.`,
    started: "Welcome back. Ask me anything about pricing or set-up, or type HUMAN for a person.",
    offline: "Our assistant is not available right now. I have passed your message to the team and a person will reply here.",
    handoff: "I'll check with the team. A person will reply in this chat. Until then I will not answer new questions.",
    humanJoined: "A person from the team has joined this chat.",
    rateLimited: "You are sending messages very quickly. Please wait a few minutes and try again, or type HUMAN.",
    tooLong: "That message is too long for me. Please send a shorter one.",
    guardrail: "I'm not able to confirm that, so I'll check with the team. A person will reply in this chat.",
    unsupported: "I can only read text messages. Please type your question, or type HUMAN for a person.",
  },
  hi: {
    disclosure: ({ whatsapp }) =>
      `नमस्ते, मैं ${brand} का AI सहायक हूँ। मैं क़ीमत, शुल्क, यह कैसे काम करता है और सेट-अप के बारे में बता सकता हूँ, और आपका साइन-अप शुरू कर सकता हूँ। मुझसे ग़लती हो सकती है, इसलिए ज़रूरी बात के लिए टीम का कोई व्यक्ति कभी भी जुड़ सकता है: HUMAN लिखें। ${whatsapp ? "संदेश बंद करने के लिए STOP लिखें।" : "चैट सहेजी जाती है ताकि टीम आपसे बात कर सके।"}`,
    stopped: `अब आपको ${brand} के WhatsApp संदेश नहीं मिलेंगे। दोबारा शुरू करने के लिए START लिखें।`,
    started: "वापसी पर स्वागत है। क़ीमत या सेट-अप के बारे में कुछ भी पूछें, या किसी व्यक्ति के लिए HUMAN लिखें।",
    offline: "हमारा सहायक अभी उपलब्ध नहीं है। मैंने आपका संदेश टीम को भेज दिया है, और कोई व्यक्ति यहीं जवाब देगा।",
    handoff: "मैं टीम से पूछकर बताता हूँ। इस चैट में कोई व्यक्ति जवाब देगा। तब तक मैं नए सवालों के जवाब नहीं दूँगा।",
    humanJoined: "टीम का एक व्यक्ति इस चैट में जुड़ गया है।",
    rateLimited: "आप बहुत तेज़ी से संदेश भेज रहे हैं। कुछ मिनट रुककर फिर कोशिश करें, या HUMAN लिखें।",
    tooLong: "यह संदेश मेरे लिए बहुत लंबा है। कृपया छोटा संदेश भेजें।",
    guardrail: "मैं इसकी पुष्टि नहीं कर सकता, इसलिए टीम से पूछता हूँ। इस चैट में कोई व्यक्ति जवाब देगा।",
    unsupported: "मैं सिर्फ़ टेक्स्ट संदेश पढ़ सकता हूँ। कृपया अपना सवाल लिखें, या किसी व्यक्ति के लिए HUMAN लिखें।",
  },
  ur: {
    disclosure: ({ whatsapp }) =>
      `السلام علیکم، میں ${brand} کا AI معاون ہوں۔ میں قیمت، فیس، یہ کیسے کام کرتا ہے اور سیٹ اپ کے بارے میں بتا سکتا ہوں، اور آپ کا سائن اپ شروع کر سکتا ہوں۔ مجھ سے غلطی ہو سکتی ہے، اس لیے اہم بات کے لیے ٹیم کا کوئی فرد کسی بھی وقت شامل ہو سکتا ہے: HUMAN لکھیں۔ ${whatsapp ? "پیغامات بند کرنے کے لیے STOP لکھیں۔" : "چیٹ محفوظ کی جاتی ہے تاکہ ٹیم آپ سے رابطہ کر سکے۔"}`,
    stopped: `اب آپ کو ${brand} کے WhatsApp پیغامات نہیں ملیں گے۔ دوبارہ شروع کرنے کے لیے START لکھیں۔`,
    started: "دوبارہ خوش آمدید۔ قیمت یا سیٹ اپ کے بارے میں کچھ بھی پوچھیں، یا کسی فرد کے لیے HUMAN لکھیں۔",
    offline: "ہمارا معاون ابھی دستیاب نہیں ہے۔ میں نے آپ کا پیغام ٹیم کو بھیج دیا ہے، اور کوئی فرد یہیں جواب دے گا۔",
    handoff: "میں ٹیم سے پوچھ کر بتاتا ہوں۔ اس چیٹ میں کوئی فرد جواب دے گا۔ تب تک میں نئے سوالوں کے جواب نہیں دوں گا۔",
    humanJoined: "ٹیم کا ایک فرد اس چیٹ میں شامل ہو گیا ہے۔",
    rateLimited: "آپ بہت تیزی سے پیغامات بھیج رہے ہیں۔ چند منٹ رک کر دوبارہ کوشش کریں، یا HUMAN لکھیں۔",
    tooLong: "یہ پیغام میرے لیے بہت لمبا ہے۔ براہِ کرم چھوٹا پیغام بھیجیں۔",
    guardrail: "میں اس کی تصدیق نہیں کر سکتا، اس لیے ٹیم سے پوچھتا ہوں۔ اس چیٹ میں کوئی فرد جواب دے گا۔",
    unsupported: "میں صرف متن والے پیغامات پڑھ سکتا ہوں۔ براہِ کرم اپنا سوال لکھیں، یا کسی فرد کے لیے HUMAN لکھیں۔",
  },
  pa: {
    disclosure: ({ whatsapp }) =>
      `ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ${brand} ਦਾ AI ਸਹਾਇਕ ਹਾਂ। ਮੈਂ ਕੀਮਤ, ਫ਼ੀਸ, ਇਹ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ ਅਤੇ ਸੈੱਟ-ਅੱਪ ਬਾਰੇ ਦੱਸ ਸਕਦਾ ਹਾਂ, ਅਤੇ ਤੁਹਾਡਾ ਸਾਈਨ-ਅੱਪ ਸ਼ੁਰੂ ਕਰ ਸਕਦਾ ਹਾਂ। ਮੇਰੇ ਤੋਂ ਗ਼ਲਤੀ ਹੋ ਸਕਦੀ ਹੈ, ਇਸ ਲਈ ਜ਼ਰੂਰੀ ਗੱਲ ਲਈ ਟੀਮ ਦਾ ਕੋਈ ਵਿਅਕਤੀ ਕਦੇ ਵੀ ਜੁੜ ਸਕਦਾ ਹੈ: HUMAN ਲਿਖੋ। ${whatsapp ? "ਸੁਨੇਹੇ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।" : "ਚੈਟ ਸੰਭਾਲੀ ਜਾਂਦੀ ਹੈ ਤਾਂ ਜੋ ਟੀਮ ਤੁਹਾਡੇ ਨਾਲ ਗੱਲ ਕਰ ਸਕੇ।"}`,
    stopped: `ਹੁਣ ਤੁਹਾਨੂੰ ${brand} ਦੇ WhatsApp ਸੁਨੇਹੇ ਨਹੀਂ ਮਿਲਣਗੇ। ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਕਰਨ ਲਈ START ਲਿਖੋ।`,
    started: "ਵਾਪਸੀ ਤੇ ਸੁਆਗਤ ਹੈ। ਕੀਮਤ ਜਾਂ ਸੈੱਟ-ਅੱਪ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ, ਜਾਂ ਕਿਸੇ ਵਿਅਕਤੀ ਲਈ HUMAN ਲਿਖੋ।",
    offline: "ਸਾਡਾ ਸਹਾਇਕ ਹੁਣੇ ਉਪਲਬਧ ਨਹੀਂ ਹੈ। ਮੈਂ ਤੁਹਾਡਾ ਸੁਨੇਹਾ ਟੀਮ ਨੂੰ ਭੇਜ ਦਿੱਤਾ ਹੈ, ਅਤੇ ਕੋਈ ਵਿਅਕਤੀ ਇੱਥੇ ਹੀ ਜਵਾਬ ਦੇਵੇਗਾ।",
    handoff: "ਮੈਂ ਟੀਮ ਤੋਂ ਪੁੱਛ ਕੇ ਦੱਸਦਾ ਹਾਂ। ਇਸ ਚੈਟ ਵਿੱਚ ਕੋਈ ਵਿਅਕਤੀ ਜਵਾਬ ਦੇਵੇਗਾ। ਉਦੋਂ ਤੱਕ ਮੈਂ ਨਵੇਂ ਸਵਾਲਾਂ ਦੇ ਜਵਾਬ ਨਹੀਂ ਦੇਵਾਂਗਾ।",
    humanJoined: "ਟੀਮ ਦਾ ਇੱਕ ਵਿਅਕਤੀ ਇਸ ਚੈਟ ਵਿੱਚ ਜੁੜ ਗਿਆ ਹੈ।",
    rateLimited: "ਤੁਸੀਂ ਬਹੁਤ ਤੇਜ਼ੀ ਨਾਲ ਸੁਨੇਹੇ ਭੇਜ ਰਹੇ ਹੋ। ਕੁਝ ਮਿੰਟ ਰੁਕ ਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ, ਜਾਂ HUMAN ਲਿਖੋ।",
    tooLong: "ਇਹ ਸੁਨੇਹਾ ਮੇਰੇ ਲਈ ਬਹੁਤ ਲੰਮਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਛੋਟਾ ਸੁਨੇਹਾ ਭੇਜੋ।",
    guardrail: "ਮੈਂ ਇਸਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਕਰ ਸਕਦਾ, ਇਸ ਲਈ ਟੀਮ ਤੋਂ ਪੁੱਛਦਾ ਹਾਂ। ਇਸ ਚੈਟ ਵਿੱਚ ਕੋਈ ਵਿਅਕਤੀ ਜਵਾਬ ਦੇਵੇਗਾ।",
    unsupported: "ਮੈਂ ਸਿਰਫ਼ ਟੈਕਸਟ ਸੁਨੇਹੇ ਪੜ੍ਹ ਸਕਦਾ ਹਾਂ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ਸਵਾਲ ਲਿਖੋ, ਜਾਂ ਕਿਸੇ ਵਿਅਕਤੀ ਲਈ HUMAN ਲਿਖੋ।",
  },
};

export interface WidgetTexts {
  launcher: string;
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  close: string;
  chips: [string, string, string];
  whatsapp: string;
  retention: string;
  privacy: string;
  human: string;
  assistant: string;
  error: string;
  typing: string;
}

const days = RETENTION.salesAgentDays;
export const WIDGET_TEXTS: Record<AgentLang, WidgetTexts> = {
  en: { launcher: "Ask us", title: "Ask us anything", subtitle: "AI assistant. A person can join.", placeholder: "Type your question", send: "Send", close: "Close chat", chips: ["What does it cost?", "Do I need a POS?", "Who owns my data?"], whatsapp: "Continue on WhatsApp", retention: `Chats are kept ${days} days.`, privacy: "Privacy", human: "Team", assistant: "AI assistant", error: "Something went wrong. Please try again, or email us.", typing: "Typing" },
  hi: { launcher: "हमसे पूछें", title: "कुछ भी पूछें", subtitle: "AI सहायक। कोई व्यक्ति जुड़ सकता है।", placeholder: "अपना सवाल लिखें", send: "भेजें", close: "चैट बंद करें", chips: ["इसकी क़ीमत क्या है?", "क्या POS चाहिए?", "मेरा डेटा किसका है?"], whatsapp: "WhatsApp पर जारी रखें", retention: `चैट ${days} दिन रखी जाती है।`, privacy: "गोपनीयता", human: "टीम", assistant: "AI सहायक", error: "कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश करें, या हमें ईमेल करें।", typing: "लिख रहा है" },
  ur: { launcher: "ہم سے پوچھیں", title: "کچھ بھی پوچھیں", subtitle: "AI معاون۔ کوئی فرد شامل ہو سکتا ہے۔", placeholder: "اپنا سوال لکھیں", send: "بھیجیں", close: "چیٹ بند کریں", chips: ["اس کی قیمت کیا ہے؟", "کیا POS چاہیے؟", "میرا ڈیٹا کس کا ہے؟"], whatsapp: "WhatsApp پر جاری رکھیں", retention: `چیٹ ${days} دن رکھی جاتی ہے۔`, privacy: "رازداری", human: "ٹیم", assistant: "AI معاون", error: "کچھ گڑبڑ ہو گئی۔ براہِ کرم دوبارہ کوشش کریں، یا ہمیں ای میل کریں۔", typing: "لکھ رہا ہے" },
  pa: { launcher: "ਸਾਨੂੰ ਪੁੱਛੋ", title: "ਕੁਝ ਵੀ ਪੁੱਛੋ", subtitle: "AI ਸਹਾਇਕ। ਕੋਈ ਵਿਅਕਤੀ ਜੁੜ ਸਕਦਾ ਹੈ।", placeholder: "ਆਪਣਾ ਸਵਾਲ ਲਿਖੋ", send: "ਭੇਜੋ", close: "ਚੈਟ ਬੰਦ ਕਰੋ", chips: ["ਇਸਦੀ ਕੀਮਤ ਕੀ ਹੈ?", "ਕੀ POS ਚਾਹੀਦਾ ਹੈ?", "ਮੇਰਾ ਡੇਟਾ ਕਿਸਦਾ ਹੈ?"], whatsapp: "WhatsApp ਤੇ ਜਾਰੀ ਰੱਖੋ", retention: `ਚੈਟ ${days} ਦਿਨ ਰੱਖੀ ਜਾਂਦੀ ਹੈ।`, privacy: "ਗੋਪਨੀਯਤਾ", human: "ਟੀਮ", assistant: "AI ਸਹਾਇਕ", error: "ਕੁਝ ਗੜਬੜ ਹੋ ਗਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ, ਜਾਂ ਸਾਨੂੰ ਈਮੇਲ ਕਰੋ।", typing: "ਲਿਖ ਰਿਹਾ ਹੈ" },
};

/** Limits shared by the API and the widget. */
export const SALES_AGENT_LIMITS = {
  /** Characters in one user message. */
  maxMessageChars: 1000,
  /** Messages (both sides) sent to the model as history. */
  historyMessages: 30,
  /** Model round trips (tool loops) for one user message. */
  maxToolRounds: 6,
  /** Per conversation. */
  perConversationPerHour: 30,
  /** Per web visitor address / WhatsApp number. */
  perContactPerHour: 40,
  /** Whole assistant, a cost ceiling. */
  perDay: 3000,
  /** OTP codes the assistant may send per phone per hour (also capped in auth.ts). */
  otpPerHour: 3,
} as const;
