import type { Locale } from "./locales.js";

type Tr = readonly [hi: string, ur: string, pa: string];

/**
 * Menu tab names in hi / ur / pa for the section names shops usually start with, so a shop that has not typed its own
 * translations still shows tabs in the guest's language. An owner's own translation always wins; a name not listed here stays as written.
 * Same words as `translation-glossary.md`; a native speaker has not signed these off yet.
 */
const NAMES: Record<string, Tr> = {
  biryani: ["बिरयानी", "بریانی", "ਬਿਰਯਾਨੀ"],
  "biryani and rice": ["बिरयानी और चावल", "بریانی اور چاول", "ਬਿਰਯਾਨੀ ਤੇ ਚੌਲ"],
  rice: ["चावल", "چاول", "ਚੌਲ"],
  curries: ["करी", "سالن", "ਕਰੀ"],
  "karahi and curries": ["करी और कड़ाही", "کڑاہی اور سالن", "ਕੜਾਹੀ ਤੇ ਕਰੀ"],
  mains: ["मुख्य व्यंजन", "مین ڈشز", "ਮੁੱਖ ਪਕਵਾਨ"],
  tandoor: ["तंदूर", "تندور", "ਤੰਦੂਰ"],
  "tandoor and grill": ["तंदूर और ग्रिल", "تندور اور گرل", "ਤੰਦੂਰ ਤੇ ਗ੍ਰਿਲ"],
  grill: ["ग्रिल", "گرل", "ਗ੍ਰਿਲ"],
  kebabs: ["कबाब", "کباب", "ਕਬਾਬ"],
  breads: ["रोटियाँ", "روٹیاں", "ਰੋਟੀਆਂ"],
  sides: ["साइड", "سائیڈز", "ਸਾਈਡ"],
  "sides and raita": ["साइड और रायता", "سائیڈز اور رائتہ", "ਸਾਈਡ ਤੇ ਰਾਇਤਾ"],
  starters: ["स्टार्टर", "اسٹارٹرز", "ਸਟਾਰਟਰ"],
  snacks: ["नाश्ता", "ناشتہ", "ਨਾਸ਼ਤਾ"],
  chaat: ["चाट", "چاٹ", "ਚਾਟ"],
  thalis: ["थाली", "تھالی", "ਥਾਲੀ"],
  desserts: ["मीठा", "میٹھا", "ਮਿੱਠਾ"],
  sweets: ["मिठाई", "مٹھائی", "ਮਿਠਾਈ"],
  mithai: ["मिठाई", "مٹھائی", "ਮਿਠਾਈ"],
  "sweets and chai": ["मिठाई और चाय", "میٹھا اور چائے", "ਮਿੱਠਾ ਤੇ ਚਾਹ"],
  drinks: ["पेय", "مشروبات", "ਪੀਣ ਵਾਲੇ ਪਦਾਰਥ"],
  chai: ["चाय", "چائے", "ਚਾਹ"],
  "pre-order pots": ["प्री-ऑर्डर देग", "پیشگی آرڈر دیگ", "ਪ੍ਰੀ-ਆਰਡਰ ਦੇਗ"],
  degh: ["देग", "دیگ", "ਦੇਗ"],
  // Butcher counter
  goat: ["बकरा", "بکرا", "ਬੱਕਰਾ"],
  lamb: ["मेमना", "میمنا", "ਲੇਲਾ"],
  beef: ["बीफ़", "بیف", "ਬੀਫ਼"],
  chicken: ["चिकन", "چکن", "ਚਿਕਨ"],
  qurbani: ["क़ुर्बानी", "قربانی", "ਕੁਰਬਾਨੀ"],
  "fresh meat": ["ताज़ा गोश्त", "تازہ گوشت", "ਤਾਜ਼ਾ ਗੋਸ਼ਤ"],
};

const key = (name: string) => name.trim().toLowerCase().replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ");

/** The default hi / ur / pa tab name for a section, or null when we have none for it (or the locale is English). */
export function defaultSectionName(name: string, locale: Locale): string | null {
  if (locale === "en") return null;
  const row = NAMES[key(name)];
  return row ? (row[locale === "hi" ? 0 : locale === "ur" ? 1 : 2] ?? null) : null;
}
