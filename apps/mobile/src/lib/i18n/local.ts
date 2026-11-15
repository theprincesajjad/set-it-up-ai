/**
 * Strings that belong to this app's launch-journey screens and are not yet in the shared catalogue (packages/shared, which another
 * stream owns). Each has all four languages. `t()` looks here first, so a key added to the shared catalogue later simply stops being
 * reached from here: move it over and delete it from this file.
 */
import type { Locale } from "@ll/shared";

type Words = Record<Locale, string>;

export const LOCAL_MESSAGES = {
  "mf.shop.nf.title": {
    en: "We couldn’t find that shop",
    hi: "हम वह दुकान नहीं ढूँढ पाए",
    ur: "ہمیں وہ دکان نہیں ملی",
    pa: "ਸਾਨੂੰ ਉਹ ਦੁਕਾਨ ਨਹੀਂ ਲੱਭੀ",
  },
  "mf.shop.nf.body": {
    en: "The link may be out of date, or the shop may have left. Your cards and points are safe.",
    hi: "लिंक पुराना हो सकता है, या दुकान बंद हो गई हो सकती है। आपके कार्ड और पॉइंट सुरक्षित हैं।",
    ur: "ہو سکتا ہے لنک پرانا ہو، یا دکان بند ہو گئی ہو۔ آپ کے کارڈ اور پوائنٹس محفوظ ہیں۔",
    pa: "ਲਿੰਕ ਪੁਰਾਣਾ ਹੋ ਸਕਦਾ ਹੈ, ਜਾਂ ਦੁਕਾਨ ਬੰਦ ਹੋ ਗਈ ਹੋ ਸਕਦੀ ਹੈ। ਤੁਹਾਡੇ ਕਾਰਡ ਅਤੇ ਪੁਆਇੰਟ ਸੁਰੱਖਿਅਤ ਹਨ।",
  },
  "mf.join.bad.title": {
    en: "This shop link didn’t work",
    hi: "यह दुकान का लिंक काम नहीं आया",
    ur: "دکان کا یہ لنک کام نہیں کر سکا",
    pa: "ਦੁਕਾਨ ਦਾ ਇਹ ਲਿੰਕ ਕੰਮ ਨਹੀਂ ਕਰ ਸਕਿਆ",
  },
  "mf.join.bad.body": {
    en: "Ask the shop for a new QR code. Your card is safe.",
    hi: "दुकान से नया QR कोड माँगें। आपका कार्ड सुरक्षित है।",
    ur: "دکان سے نیا QR کوڈ مانگیں۔ آپ کا کارڈ محفوظ ہے۔",
    pa: "ਦੁਕਾਨ ਤੋਂ ਨਵਾਂ QR ਕੋਡ ਮੰਗੋ। ਤੁਹਾਡਾ ਕਾਰਡ ਸੁਰੱਖਿਅਤ ਹੈ।",
  },
  "mf.join.bad.line": {
    en: "This shop link didn’t work. Ask the shop for a new QR code.",
    hi: "यह दुकान का लिंक काम नहीं आया। दुकान से नया QR कोड माँगें।",
    ur: "دکان کا یہ لنک کام نہیں کر سکا۔ دکان سے نیا QR کوڈ مانگیں۔",
    pa: "ਦੁਕਾਨ ਦਾ ਇਹ ਲਿੰਕ ਕੰਮ ਨਹੀਂ ਕਰ ਸਕਿਆ। ਦੁਕਾਨ ਤੋਂ ਨਵਾਂ QR ਕੋਡ ਮੰਗੋ।",
  },
  "mf.field.email": {
    en: "Enter a full email address, like name@example.com",
    hi: "पूरा ईमेल पता लिखें, जैसे name@example.com",
    ur: "پورا ای میل پتا لکھیں، جیسے name@example.com",
    pa: "ਪੂਰਾ ਈਮੇਲ ਪਤਾ ਲਿਖੋ, ਜਿਵੇਂ name@example.com",
  },
  "mf.redeem.cancelled": {
    en: "Code cancelled. Your points are back on your card.",
    hi: "कोड रद्द हो गया। आपके पॉइंट आपके कार्ड पर वापस हैं।",
    ur: "کوڈ منسوخ ہو گیا۔ آپ کے پوائنٹس آپ کے کارڈ میں واپس آ گئے ہیں۔",
    pa: "ਕੋਡ ਰੱਦ ਹੋ ਗਿਆ। ਤੁਹਾਡੇ ਪੁਆਇੰਟ ਤੁਹਾਡੇ ਕਾਰਡ ਵਿੱਚ ਵਾਪਸ ਹਨ।",
  },
} as const satisfies Record<string, Words>;

export type LocalKey = keyof typeof LOCAL_MESSAGES;

export function isLocalKey(key: string): key is LocalKey {
  return key in LOCAL_MESSAGES;
}
