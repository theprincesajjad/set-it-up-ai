/**
 * Words for the two public restaurant pages (/r/<token> review, /pay/order/<id> pay), in the four
 * languages shops serve. Kept local to these pages: the shared catalog (packages/shared i18n) is owned
 * elsewhere, and these strings only appear here. `{shop}`, `{n}`, `{amount}` are filled by `fill`.
 */
import type { Locale } from "@ll/shared";

export interface RestaurantCopy {
  // review
  reviewTitle: string;
  reviewSub: string;
  starLabel: string;
  feedbackLabel: string;
  optional: string;
  feedbackHint: string;
  send: string;
  thanksHigh: string;
  thanksLow: string;
  googleLead: string;
  googleAlso: string;
  alreadyRated: string;
  reviewError: string;
  reviewGoneTitle: string;
  reviewGoneBody: string;
  yourRating: string;
  // pay
  orderNo: string;
  amountDue: string;
  paid: string;
  yourOrder: string;
  total: string;
  pay: string;
  paidTitle: string;
  paidBody: string;
  payAtPickup: string;
  cancelled: string;
  secure: string;
  confirming: string;
  payGoneTitle: string;
  payGoneBody: string;
  status: Record<string, string>;
  loadError: string;
  tryAgain: string;
}

export const COPY: Record<Locale, RestaurantCopy> = {
  en: {
    reviewTitle: "How was your visit to {shop}?",
    reviewSub: "Tap a star. It takes ten seconds.",
    starLabel: "{n} out of 5 stars",
    feedbackLabel: "Anything you'd like us to know?",
    optional: "(optional)",
    feedbackHint: "Only {shop} sees this.",
    send: "Send",
    thanksHigh: "Thank you. If you have a minute, a Google review helps {shop} a lot.",
    thanksLow: "Thank you for telling us. {shop} will read this and may reach out. You are also welcome to leave a public Google review.",
    googleLead: "Leave a Google review",
    googleAlso: "Leave a Google review too",
    alreadyRated: "You rated this visit {n} out of 5. Thank you.",
    reviewError: "Something went wrong. Please try again.",
    reviewGoneTitle: "This link doesn't work anymore",
    reviewGoneBody: "Ask the shop to send you a new one.",
    yourRating: "Your rating",
    orderNo: "Order #{n}",
    amountDue: "Amount due",
    paid: "Paid",
    yourOrder: "Your order",
    total: "Total",
    pay: "Pay {amount}",
    paidTitle: "Paid. Thank you.",
    paidBody: "{shop} has your payment and is getting your order ready.",
    payAtPickup: "Pay at the counter when you pick up.",
    cancelled: "This order was cancelled by {shop}.",
    secure: "Payments processed securely by Stripe.",
    confirming: "Confirming your payment...",
    payGoneTitle: "This payment link doesn't work anymore",
    payGoneBody: "Ask the shop to send you a new one.",
    status: { pending: "Received", accepted: "Accepted", preparing: "Being prepared", ready: "Ready for pickup", picked_up: "Picked up", cancelled: "Cancelled", refunded: "Refunded" },
    loadError: "We can't load this right now. Check your connection and try again.",
    tryAgain: "Try again",
  },
  hi: {
    reviewTitle: "{shop} में आपकी विज़िट कैसी रही?",
    reviewSub: "एक तारे पर टैप करें। बस दस सेकंड लगेंगे।",
    starLabel: "5 में से {n} तारे",
    feedbackLabel: "कुछ और बताना चाहेंगे?",
    optional: "(वैकल्पिक)",
    feedbackHint: "इसे सिर्फ़ {shop} देखेगा।",
    send: "भेजें",
    thanksHigh: "शुक्रिया। अगर आपके पास एक मिनट हो, तो Google पर एक रिव्यू {shop} के लिए बहुत मददगार होगा।",
    thanksLow: "बताने के लिए शुक्रिया। {shop} इसे पढ़ेगा और ज़रूरत हो तो आपसे संपर्क कर सकता है। आप चाहें तो Google पर सार्वजनिक रिव्यू भी दे सकते हैं।",
    googleLead: "Google पर रिव्यू दें",
    googleAlso: "Google पर भी रिव्यू दें",
    alreadyRated: "आपने इस विज़िट को 5 में से {n} तारे दिए। शुक्रिया।",
    reviewError: "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।",
    reviewGoneTitle: "यह लिंक अब काम नहीं करता",
    reviewGoneBody: "दुकान से नया लिंक मांग लें।",
    yourRating: "आपकी रेटिंग",
    orderNo: "ऑर्डर #{n}",
    amountDue: "बकाया रकम",
    paid: "भुगतान हो गया",
    yourOrder: "आपका ऑर्डर",
    total: "कुल",
    pay: "{amount} का भुगतान करें",
    paidTitle: "भुगतान हो गया। शुक्रिया।",
    paidBody: "{shop} को आपका भुगतान मिल गया है और आपका ऑर्डर तैयार किया जा रहा है।",
    payAtPickup: "पिकअप के समय काउंटर पर भुगतान करें।",
    cancelled: "यह ऑर्डर {shop} ने रद्द कर दिया है।",
    secure: "भुगतान Stripe के ज़रिए सुरक्षित रूप से होता है।",
    confirming: "आपका भुगतान पक्का किया जा रहा है...",
    payGoneTitle: "यह भुगतान लिंक अब काम नहीं करता",
    payGoneBody: "दुकान से नया लिंक मांग लें।",
    status: { pending: "मिल गया", accepted: "स्वीकार किया गया", preparing: "तैयार हो रहा है", ready: "पिकअप के लिए तैयार", picked_up: "ले लिया गया", cancelled: "रद्द", refunded: "रकम वापस हुई" },
    loadError: "अभी यह लोड नहीं हो पा रहा। अपना कनेक्शन जाँचें और फिर कोशिश करें।",
    tryAgain: "फिर कोशिश करें",
  },
  ur: {
    reviewTitle: "{shop} میں آپ کی وزٹ کیسی رہی؟",
    reviewSub: "کسی ستارے پر ٹیپ کریں۔ بس دس سیکنڈ لگیں گے۔",
    starLabel: "5 میں سے {n} ستارے",
    feedbackLabel: "کچھ اور بتانا چاہیں گے؟",
    optional: "(اختیاری)",
    feedbackHint: "اسے صرف {shop} دیکھے گا۔",
    send: "بھیجیں",
    thanksHigh: "شکریہ۔ اگر آپ کے پاس ایک منٹ ہو تو گوگل پر ایک ریویو {shop} کے لیے بہت مددگار ہوگا۔",
    thanksLow: "بتانے کا شکریہ۔ {shop} اسے پڑھے گا اور ضرورت ہوئی تو آپ سے رابطہ کر سکتا ہے۔ آپ چاہیں تو گوگل پر عوامی ریویو بھی دے سکتے ہیں۔",
    googleLead: "گوگل پر ریویو دیں",
    googleAlso: "گوگل پر بھی ریویو دیں",
    alreadyRated: "آپ نے اس وزٹ کو 5 میں سے {n} ستارے دیے۔ شکریہ۔",
    reviewError: "کچھ گڑبڑ ہو گئی۔ براہِ کرم دوبارہ کوشش کریں۔",
    reviewGoneTitle: "یہ لنک اب کام نہیں کرتا",
    reviewGoneBody: "دکان سے نیا لنک مانگ لیں۔",
    yourRating: "آپ کی ریٹنگ",
    orderNo: "آرڈر #{n}",
    amountDue: "واجب الادا رقم",
    paid: "ادائیگی ہو گئی",
    yourOrder: "آپ کا آرڈر",
    total: "کل",
    pay: "{amount} ادا کریں",
    paidTitle: "ادائیگی ہو گئی۔ شکریہ۔",
    paidBody: "{shop} کو آپ کی ادائیگی مل گئی ہے اور آپ کا آرڈر تیار کیا جا رہا ہے۔",
    payAtPickup: "پک اپ کے وقت کاؤنٹر پر ادائیگی کریں۔",
    cancelled: "یہ آرڈر {shop} نے منسوخ کر دیا ہے۔",
    secure: "ادائیگیاں Stripe کے ذریعے محفوظ طریقے سے ہوتی ہیں۔",
    confirming: "آپ کی ادائیگی کی تصدیق ہو رہی ہے...",
    payGoneTitle: "یہ ادائیگی کا لنک اب کام نہیں کرتا",
    payGoneBody: "دکان سے نیا لنک مانگ لیں۔",
    status: { pending: "موصول ہوا", accepted: "قبول کر لیا گیا", preparing: "تیار ہو رہا ہے", ready: "پک اپ کے لیے تیار", picked_up: "لے لیا گیا", cancelled: "منسوخ", refunded: "رقم واپس کر دی گئی" },
    loadError: "ابھی یہ لوڈ نہیں ہو سکا۔ اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں۔",
    tryAgain: "دوبارہ کوشش کریں",
  },
  pa: {
    reviewTitle: "{shop} ਵਿੱਚ ਤੁਹਾਡੀ ਫੇਰੀ ਕਿਹੋ ਜਿਹੀ ਰਹੀ?",
    reviewSub: "ਇੱਕ ਤਾਰੇ 'ਤੇ ਟੈਪ ਕਰੋ। ਸਿਰਫ਼ ਦਸ ਸਕਿੰਟ ਲੱਗਣਗੇ।",
    starLabel: "5 ਵਿੱਚੋਂ {n} ਤਾਰੇ",
    feedbackLabel: "ਹੋਰ ਕੁਝ ਦੱਸਣਾ ਚਾਹੋਗੇ?",
    optional: "(ਮਰਜ਼ੀ ਅਨੁਸਾਰ)",
    feedbackHint: "ਇਹ ਸਿਰਫ਼ {shop} ਹੀ ਦੇਖੇਗਾ।",
    send: "ਭੇਜੋ",
    thanksHigh: "ਧੰਨਵਾਦ। ਜੇ ਤੁਹਾਡੇ ਕੋਲ ਇੱਕ ਮਿੰਟ ਹੋਵੇ ਤਾਂ Google 'ਤੇ ਇੱਕ ਰਿਵਿਊ {shop} ਲਈ ਬਹੁਤ ਮਦਦਗਾਰ ਹੋਵੇਗਾ।",
    thanksLow: "ਦੱਸਣ ਲਈ ਧੰਨਵਾਦ। {shop} ਇਹ ਪੜ੍ਹੇਗਾ ਅਤੇ ਲੋੜ ਪਈ ਤਾਂ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰ ਸਕਦਾ ਹੈ। ਤੁਸੀਂ ਚਾਹੋ ਤਾਂ Google 'ਤੇ ਜਨਤਕ ਰਿਵਿਊ ਵੀ ਦੇ ਸਕਦੇ ਹੋ।",
    googleLead: "Google 'ਤੇ ਰਿਵਿਊ ਦਿਓ",
    googleAlso: "Google 'ਤੇ ਵੀ ਰਿਵਿਊ ਦਿਓ",
    alreadyRated: "ਤੁਸੀਂ ਇਸ ਫੇਰੀ ਨੂੰ 5 ਵਿੱਚੋਂ {n} ਤਾਰੇ ਦਿੱਤੇ। ਧੰਨਵਾਦ।",
    reviewError: "ਕੁਝ ਗਲਤ ਹੋ ਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    reviewGoneTitle: "ਇਹ ਲਿੰਕ ਹੁਣ ਕੰਮ ਨਹੀਂ ਕਰਦਾ",
    reviewGoneBody: "ਦੁਕਾਨ ਤੋਂ ਨਵਾਂ ਲਿੰਕ ਮੰਗ ਲਓ।",
    yourRating: "ਤੁਹਾਡੀ ਰੇਟਿੰਗ",
    orderNo: "ਆਰਡਰ #{n}",
    amountDue: "ਬਕਾਇਆ ਰਕਮ",
    paid: "ਭੁਗਤਾਨ ਹੋ ਗਿਆ",
    yourOrder: "ਤੁਹਾਡਾ ਆਰਡਰ",
    total: "ਕੁੱਲ",
    pay: "{amount} ਦਾ ਭੁਗਤਾਨ ਕਰੋ",
    paidTitle: "ਭੁਗਤਾਨ ਹੋ ਗਿਆ। ਧੰਨਵਾਦ।",
    paidBody: "{shop} ਨੂੰ ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਮਿਲ ਗਿਆ ਹੈ ਅਤੇ ਤੁਹਾਡਾ ਆਰਡਰ ਤਿਆਰ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ।",
    payAtPickup: "ਪਿਕਅੱਪ ਵੇਲੇ ਕਾਊਂਟਰ 'ਤੇ ਭੁਗਤਾਨ ਕਰੋ।",
    cancelled: "ਇਹ ਆਰਡਰ {shop} ਨੇ ਰੱਦ ਕਰ ਦਿੱਤਾ ਹੈ।",
    secure: "ਭੁਗਤਾਨ Stripe ਰਾਹੀਂ ਸੁਰੱਖਿਅਤ ਢੰਗ ਨਾਲ ਹੁੰਦੇ ਹਨ।",
    confirming: "ਤੁਹਾਡੇ ਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ ਹੋ ਰਹੀ ਹੈ...",
    payGoneTitle: "ਇਹ ਭੁਗਤਾਨ ਲਿੰਕ ਹੁਣ ਕੰਮ ਨਹੀਂ ਕਰਦਾ",
    payGoneBody: "ਦੁਕਾਨ ਤੋਂ ਨਵਾਂ ਲਿੰਕ ਮੰਗ ਲਓ।",
    status: { pending: "ਮਿਲ ਗਿਆ", accepted: "ਮਨਜ਼ੂਰ ਹੋ ਗਿਆ", preparing: "ਤਿਆਰ ਹੋ ਰਿਹਾ ਹੈ", ready: "ਪਿਕਅੱਪ ਲਈ ਤਿਆਰ", picked_up: "ਲੈ ਲਿਆ ਗਿਆ", cancelled: "ਰੱਦ", refunded: "ਰਕਮ ਵਾਪਸ ਕੀਤੀ ਗਈ" },
    loadError: "ਇਹ ਹੁਣੇ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ। ਆਪਣਾ ਕਨੈਕਸ਼ਨ ਜਾਂਚੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    tryAgain: "ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ",
  },
};

/**
 * Replace `{name}` tokens. The shop name is wrapped in Unicode isolates (FSI ... PDI) so a Latin shop name
 * and its trailing full stop don't scramble inside right-to-left Urdu text.
 */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (k === "shop" ? `\u2068${vars[k]}\u2069` : String(vars[k])) : m));
}
