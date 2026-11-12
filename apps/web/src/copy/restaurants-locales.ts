/**
 * /for-restaurants in Hindi, Urdu and Punjabi. The page promises the product "in English, Hindi, Urdu and Punjabi", so every section
 * a visitor reads after choosing a language is in that language, not only the hero. English is `copy.restaurants` (en-CA.ts), the one
 * source for the English page; the three objects below have the same shape (the type makes a missing line a compile error) and the
 * same {placeholders}. Product and plan names (WhatsApp, DoorDash, Stripe, Restaurant Pro) stay as they are written everywhere.
 * These are page copy, like en-CA.ts, so they live beside it; the hero and the visit form, which share strings with the app, read the
 * shared message catalogs.
 */
import type { Locale } from "@ll/shared";
import { copy } from "./en-CA";

const EN = copy.restaurants;

type Job = { key: (typeof EN.jobs)[number]["key"]; eyebrow: string; title: string; body: string; rows: readonly [string, string, string] };

export interface RestaurantSections {
  heroFacts: string;
  phoneNote: string;
  founding: { label: string; headline: string; also: string; alsoItem: string; sub: string };
  jobsEyebrow: string;
  jobsTitle: string;
  jobsNote: string;
  jobExample: string;
  rangeTo: string;
  jobs: readonly [Job, Job, Job, Job];
  festivalsEyebrow: string;
  festivalsTitle: string;
  festivalsSub: string;
  festivalBegins: string;
  festivalAbout: string;
  festivalEstimate: string;
  /** Festival names by the calendar's id; one that is missing falls back to the calendar's own (English) name. */
  festivalNames: Readonly<Record<string, string>>;
  /** A greeting for a festival whose calendar entry has none in this language (the calendar's own greeting is used when it has one). */
  festivalGreetings: Readonly<Record<string, string>>;
  kitchenEyebrow: string;
  kitchenTitle: string;
  kitchenSub: string;
  kitchenNote: string;
  plansEyebrow: string;
  plansTitle: string;
  plansBody: string;
  plansSource: string;
  perMonth: string;
  plansCta: string;
  weekEyebrow: string;
  weekTitle: string;
  week: readonly [{ t: string; b: string }, { t: string; b: string }, { t: string; b: string }];
  faqEyebrow: string;
  faqTitle: string;
  faq: readonly [{ q: string; a: string }, { q: string; a: string }, { q: string; a: string }, { q: string; a: string }, { q: string; a: string }];
}

const en: RestaurantSections = {
  heroFacts: EN.heroFacts,
  phoneNote: EN.phone.note,
  founding: EN.founding,
  jobsEyebrow: EN.jobsEyebrow,
  jobsTitle: EN.jobsTitle,
  jobsNote: EN.jobsNote,
  jobExample: EN.jobExample,
  rangeTo: EN.rangeTo,
  jobs: EN.jobs,
  festivalsEyebrow: EN.festivalsEyebrow,
  festivalsTitle: EN.festivalsTitle,
  festivalsSub: EN.festivalsSub,
  festivalBegins: EN.festivalBegins,
  festivalAbout: EN.festivalAbout,
  festivalEstimate: EN.festivalEstimate,
  festivalNames: {},
  festivalGreetings: {},
  kitchenEyebrow: EN.kitchenEyebrow,
  kitchenTitle: EN.kitchenTitle,
  kitchenSub: EN.kitchenSub,
  kitchenNote: EN.kitchenNote,
  plansEyebrow: EN.plansEyebrow,
  plansTitle: EN.plansTitle,
  plansBody: EN.plansBody,
  plansSource: EN.plansSource,
  perMonth: EN.perMonth,
  plansCta: EN.plansCta,
  weekEyebrow: EN.weekEyebrow,
  weekTitle: EN.weekTitle,
  week: EN.week,
  faqEyebrow: EN.faqEyebrow,
  faqTitle: EN.faqTitle,
  faq: EN.faq,
};

const hi: RestaurantSections = {
  heroFacts: "{price} प्रति माह से, तय क़ीमत · अपने ऑर्डर पर 0% कमीशन · मेन्यू ख़ुद जोड़ें, या हम टाइप कर देंगे · पहले साल {first}% की छूट",
  phoneNote: "उदाहरण ऑर्डर पेज, असली रेस्टोरेंट नहीं।",
  founding: {
    label: "पहले साल का ऑफ़र",
    headline: "{street} पर पहले साल के ऑफ़र की {total} में से {left} जगहें बाक़ी",
    also: "ये भी खुले हैं: {list}।",
    alsoItem: "{street} ({left} बाक़ी)",
    sub: "हर सड़क के पहले {slots} रेस्टोरेंट को 12 महीने {first}% की छूट मिलती है, फिर हमेशा के लिए {life}% की छूट। मेन्यू ख़ुद जोड़ें, या हम उसे टाइप कर देंगे और आपके ख़ास पकवानों की तस्वीरें मुफ़्त में खींचेंगे।",
  },
  jobsEyebrow: "आपको क्या मिलता है",
  jobsTitle: "देसी रसोई जैसे चलती है, वैसे ही बनाया गया।",
  jobsNote: "ये स्क्रीन उदाहरण हैं, असली ग्राहक या ऑर्डर नहीं।",
  jobExample: "{job} का उदाहरण",
  rangeTo: "{min} से {max}",
  jobs: [
    {
      key: "orders",
      eyebrow: "ऑर्डर",
      title: "बिना कमीशन के ऑर्डर।",
      body: "आपका अपना ऑर्डर पेज, हलाल और खान-पान के टैग के साथ, और मेन्यू चार भाषाओं में। पिकअप अभी; डिलीवरी आपके अपने ड्राइवरों से।",
      rows: ["चिकन बिरयानी · हलाल", "लैम्ब कड़ाही · हलाल", "वेज थाली · जैन विकल्प"],
    },
    {
      key: "tiffin",
      eyebrow: "टिफ़िन",
      title: "टिफ़िन जो अपने आप चलता है।",
      body: "हफ़्तावार और माहवार प्लान, एक दिन छोड़ें या रोकें, आपके ड्राइवरों के लिए रूट। नवीनीकरण पर सेव किए कार्ड या बैंक डेबिट से भुगतान होता है।",
      rows: ["हफ़्तावार लंच · 24 सब्सक्राइबर", "आज छोड़ा · 3", "रूट A · 11 स्टॉप"],
    },
    {
      key: "catering",
      eyebrow: "केटरिंग और देग",
      title: "भीड़ से पहले केटरिंग और देग।",
      body: "देग और मिठाई के डिब्बों के लिए कोटेशन, एडवांस और प्री-ऑर्डर, रोज़ की सीमा के साथ ताकि आप कभी ज़रूरत से ज़्यादा न बेचें।",
      rows: ["वलीमा · 150 मेहमान · कोटेशन भेजा गया", "ईद की देग · 20 में से 12 बाक़ी", "एडवांस मिला · $450"],
    },
    {
      key: "whatsapp",
      eyebrow: "WhatsApp",
      title: "WhatsApp, जहाँ ग्राहक पहले से हैं।",
      body: "ऑर्डर अपडेट, दोबारा ऑर्डर के लिंक और रिव्यू के अनुरोध। हर महीने {range} संदेश शामिल। ऑफ़र सिर्फ़ सुबह 8 से रात 9 बजे के बीच भेजे जाते हैं।",
      rows: ["आपका ऑर्डर तैयार है", "पिछले हफ़्ते का टिफ़िन दोबारा ऑर्डर करें", "बिरयानी कैसी लगी?"],
    },
  ],
  festivalsEyebrow: "त्योहारों का कैलेंडर",
  festivalsTitle: "कोई भीड़ हाथ से न जाए।",
  festivalsSub: "एक टैप में चार भाषाओं में कैंपेन के मसौदे, उन तारीख़ों के हिसाब से जिनके आसपास आपके ग्राहक योजना बनाते हैं। तारीख़ें ऐप के त्योहार कैलेंडर से आती हैं; चाँद पर आधारित तारीख़ें हर साल पक्की की जाती हैं।",
  festivalBegins: "{name} की शुरुआत",
  festivalAbout: "लगभग {date}",
  festivalEstimate: "(अनुमान)",
  festivalNames: { ramadan: "रमज़ान", eid_al_fitr: "ईद-उल-फ़ित्र", eid_al_adha: "ईद-उल-अज़हा", diwali: "दिवाली", vaisakhi: "बैसाखी", gurpurab: "गुरु नानक गुरपुरब", navratri: "नवरात्रि", holi: "होली" },
  festivalGreetings: {},
  kitchenEyebrow: "किचन स्क्रीन",
  kitchenTitle: "आपके रसोइये इसे अपनी भाषा में पढ़ते हैं।",
  kitchenSub: "Restaurant Pro पर हर रसोइया किचन डिस्प्ले और स्टाफ़ स्क्रीन के लिए उर्दू, हिंदी या पंजाबी चुनता है। दाएँ से बाएँ लिखावट भी शामिल है।",
  kitchenNote: "उदाहरण टिकट।",
  plansEyebrow: "प्लान",
  plansTitle: "तय क़ीमतें, कोई कमीशन नहीं।",
  plansBody: "{prices} प्रति माह। सालाना प्लान में 10 महीनों का भुगतान। ऐप्स से हटाए गए $5,000 के ऑर्डर पर, हमारी फ़ीस से पहले, आप हर महीने {range} अपने पास रखते हैं। डिलीवरी के लिए आपके अपने ड्राइवर चाहिए।",
  plansSource: "डिलीवरी ऐप की दरें DoorDash Canada से, {date} को पढ़ी गईं:",
  perMonth: "/माह",
  plansCta: "पूरी क़ीमतें देखें",
  weekEyebrow: "हम कैसे शुरू करते हैं",
  weekTitle: "एक हफ़्ते में चालू। ख़ुद सेट करें, या हम आपके साथ करें।",
  week: [
    { t: "दिन 1", b: "मेन्यू एडिटर में अपने पकवान जोड़ें, या हम आकर आपका मेन्यू टाइप करते हैं और आपके ख़ास पकवानों की तस्वीरें खींचते हैं।" },
    { t: "दिन 3", b: "आपका ऑर्डर पेज और WhatsApp अपडेट चालू हो जाते हैं। हम आपकी टिफ़िन सूची ले आते हैं।" },
    { t: "हफ़्ता 2", b: "पहला त्योहार कैंपेन आपके ग्राहकों की भाषा में तैयार।" },
  ],
  faqEyebrow: "सवाल",
  faqTitle: "रेस्टोरेंट जो सवाल पूछते हैं।",
  faq: [
    { q: "क्या आप डिलीवरी करते हैं?", a: "नहीं। आपके पेज के ऑर्डर पिकअप होते हैं या आपकी अपनी डिलीवरी। हम ड्राइवर नहीं चलाते और डिलीवरी पर कमीशन नहीं लेते।" },
    { q: "क्या आप हलाल प्रमाणित करते हैं?", a: "नहीं। हर पकवान पर हलाल, ज़बीहा और खान-पान के लेबल आप लगाते हैं। हम उन्हें दिखाते हैं और ग्राहकों को फ़िल्टर करने देते हैं।" },
    { q: "क्या DoorDash भी चालू रखा जा सकता है?", a: "हाँ, अगर आप चाहें। ऐप्स का इस्तेमाल नए ग्राहकों तक पहुँचने के लिए करें, और अपने पुराने ग्राहकों को अपने पेज पर भेजें।" },
    { q: "टिफ़िन ग्राहक भुगतान कैसे करते हैं?", a: "सेव किए कार्ड या पहले से मंज़ूर बैंक डेबिट से, जो आपके Stripe खाते पर चार्ज होता है, {billing} बिलिंग फ़ीस के साथ।" },
    { q: "अगर मेरा स्टाफ़ अंग्रेज़ी नहीं पढ़ता तो?", a: "Restaurant Pro में किचन और स्टाफ़ स्क्रीन उर्दू, हिंदी और पंजाबी में मिलती हैं।" },
  ],
};

const ur: RestaurantSections = {
  heroFacts: "{price} ماہانہ سے، مقررہ قیمت · اپنے آرڈرز پر 0% کمیشن · مینو خود شامل کریں، یا ہم ٹائپ کر دیں گے · پہلے سال {first}% رعایت",
  phoneNote: "مثالی آرڈر صفحہ، اصل ریستوران نہیں۔",
  founding: {
    label: "پہلے سال کی پیشکش",
    headline: "{street} پر پہلے سال کی پیشکش کی {total} میں سے {left} جگہیں باقی",
    also: "یہ بھی کھلے ہیں: {list}۔",
    alsoItem: "{street} ({left} باقی)",
    sub: "ہر سڑک کے پہلے {slots} ریستورانوں کو 12 ماہ تک {first}% رعایت ملتی ہے، پھر ہمیشہ کے لیے {life}% رعایت۔ مینو خود شامل کریں، یا ہم اسے ٹائپ کر دیں گے اور آپ کے خاص پکوانوں کی تصویریں مفت کھینچیں گے۔",
  },
  jobsEyebrow: "آپ کو کیا ملتا ہے",
  jobsTitle: "دیسی کچن جیسے چلتا ہے، ویسے ہی بنایا گیا۔",
  jobsNote: "یہ اسکرینیں مثالیں ہیں، اصل گاہک یا آرڈر نہیں۔",
  jobExample: "{job} کی مثال",
  rangeTo: "{min} سے {max}",
  jobs: [
    {
      key: "orders",
      eyebrow: "آرڈرز",
      title: "بغیر کمیشن کے آرڈرز۔",
      body: "آپ کا اپنا آرڈر صفحہ، حلال اور غذائی ٹیگز کے ساتھ، اور مینو چار زبانوں میں۔ پک اپ ابھی؛ ڈیلیوری آپ کے اپنے ڈرائیوروں سے۔",
      rows: ["چکن بریانی · حلال", "لیمب کڑاہی · حلال", "ویج تھالی · جین آپشن"],
    },
    {
      key: "tiffin",
      eyebrow: "ٹفن",
      title: "ٹفن جو خود چلتا ہے۔",
      body: "ہفتہ وار اور ماہانہ پلان، ایک دن چھوڑیں یا روکیں، آپ کے ڈرائیوروں کے لیے روٹ۔ تجدید پر محفوظ کارڈ یا بینک ڈیبٹ سے ادائیگی ہوتی ہے۔",
      rows: ["ہفتہ وار لنچ · 24 سبسکرائبر", "آج چھوڑا · 3", "روٹ A · 11 اسٹاپ"],
    },
    {
      key: "catering",
      eyebrow: "کیٹرنگ اور دیگ",
      title: "رش سے پہلے کیٹرنگ اور دیگیں۔",
      body: "دیگوں اور مٹھائی کے ڈبوں کے لیے کوٹیشن، ایڈوانس اور پیشگی آرڈر، روزانہ کی حد کے ساتھ تاکہ آپ کبھی گنجائش سے زیادہ نہ بیچیں۔",
      rows: ["ولیمہ · 150 مہمان · کوٹیشن بھیج دی گئی", "عید کی دیگ · 20 میں سے 12 باقی", "ایڈوانس ادا ہو گیا · $450"],
    },
    {
      key: "whatsapp",
      eyebrow: "WhatsApp",
      title: "WhatsApp، جہاں گاہک پہلے سے موجود ہیں۔",
      body: "آرڈر اپ ڈیٹس، دوبارہ آرڈر کے لنکس اور ریویو کی درخواستیں۔ ہر ماہ {range} پیغامات شامل۔ آفرز صرف صبح 8 سے رات 9 بجے کے درمیان بھیجی جاتی ہیں۔",
      rows: ["آپ کا آرڈر تیار ہے", "پچھلے ہفتے کا ٹفن دوبارہ آرڈر کریں", "بریانی کیسی لگی؟"],
    },
  ],
  festivalsEyebrow: "تہواروں کا کیلنڈر",
  festivalsTitle: "کوئی رش ہاتھ سے نہ جائے۔",
  festivalsSub: "ایک ٹیپ میں چار زبانوں میں مہم کے مسودے، ان تاریخوں کے مطابق جن کے گرد آپ کے گاہک منصوبہ بناتے ہیں۔ تاریخیں ایپ کے تہوار کیلنڈر سے آتی ہیں؛ چاند پر مبنی تاریخوں کی ہر سال تصدیق کی جاتی ہے۔",
  festivalBegins: "{name} کا آغاز",
  festivalAbout: "تقریباً {date}",
  festivalEstimate: "(اندازہ)",
  festivalNames: { ramadan: "رمضان", eid_al_fitr: "عید الفطر", eid_al_adha: "عید الاضحیٰ", diwali: "دیوالی", vaisakhi: "بیساکھی", gurpurab: "گرو نانک گرپورب", navratri: "نوراتری", holi: "ہولی" },
  festivalGreetings: { gurpurab: "گرپورب مبارک", vaisakhi: "بیساکھی مبارک", navratri: "نوراتری مبارک", holi: "ہولی مبارک", diwali: "دیوالی مبارک" },
  kitchenEyebrow: "کچن اسکرینیں",
  kitchenTitle: "آپ کے باورچی اسے اپنی زبان میں پڑھتے ہیں۔",
  kitchenSub: "Restaurant Pro پر ہر باورچی کچن ڈسپلے اور اسٹاف اسکرینوں کے لیے اردو، ہندی یا پنجابی چنتا ہے۔ دائیں سے بائیں تحریر بھی شامل ہے۔",
  kitchenNote: "مثالی ٹکٹ۔",
  plansEyebrow: "پلانز",
  plansTitle: "مقررہ قیمتیں، کوئی کمیشن نہیں۔",
  plansBody: "{prices} ماہانہ۔ سالانہ پلان میں 10 ماہ کی ادائیگی۔ ایپس سے ہٹائے گئے $5,000 کے آرڈرز پر، ہماری فیس سے پہلے، آپ ہر ماہ {range} اپنے پاس رکھتے ہیں۔ ڈیلیوری کے لیے آپ کے اپنے ڈرائیور درکار ہیں۔",
  plansSource: "ڈیلیوری ایپ کے نرخ DoorDash Canada سے، {date} کو پڑھے گئے:",
  perMonth: "/ماہ",
  plansCta: "مکمل قیمتیں دیکھیں",
  weekEyebrow: "ہم کیسے شروع کرتے ہیں",
  weekTitle: "ایک ہفتے میں چالو۔ خود سیٹ کریں، یا ہم آپ کے ساتھ مل کر کریں۔",
  week: [
    { t: "دن 1", b: "مینو ایڈیٹر میں اپنے پکوان شامل کریں، یا ہم آ کر آپ کا مینو ٹائپ کرتے ہیں اور آپ کے خاص پکوانوں کی تصویریں کھینچتے ہیں۔" },
    { t: "دن 3", b: "آپ کا آرڈر صفحہ اور WhatsApp اپ ڈیٹس چالو ہو جاتی ہیں۔ ہم آپ کی ٹفن فہرست منتقل کر دیتے ہیں۔" },
    { t: "ہفتہ 2", b: "پہلی تہوار مہم آپ کے گاہکوں کی زبان میں تیار۔" },
  ],
  faqEyebrow: "سوالات",
  faqTitle: "وہ سوالات جو ریستوران پوچھتے ہیں۔",
  faq: [
    { q: "کیا آپ ڈیلیوری کرتے ہیں؟", a: "نہیں۔ آپ کے صفحے کے آرڈر پک اپ ہوتے ہیں یا آپ کی اپنی ڈیلیوری۔ ہم ڈرائیور نہیں چلاتے اور ڈیلیوری پر کمیشن نہیں لیتے۔" },
    { q: "کیا آپ حلال کی تصدیق کرتے ہیں؟", a: "نہیں۔ ہر پکوان پر حلال، ذبیحہ اور غذائی لیبل آپ خود لگاتے ہیں۔ ہم انہیں دکھاتے ہیں اور گاہکوں کو فلٹر کرنے دیتے ہیں۔" },
    { q: "کیا DoorDash بھی جاری رکھا جا سکتا ہے؟", a: "جی ہاں، اگر آپ چاہیں۔ ایپس کو نئے گاہکوں تک پہنچنے کے لیے استعمال کریں، اور اپنے پرانے گاہکوں کو اپنے صفحے پر بھیجیں۔" },
    { q: "ٹفن کے گاہک ادائیگی کیسے کرتے ہیں؟", a: "محفوظ کارڈ یا پہلے سے منظور شدہ بینک ڈیبٹ سے، جو آپ کے Stripe اکاؤنٹ پر چارج ہوتا ہے، {billing} بلنگ فیس کے ساتھ۔" },
    { q: "اگر میرا عملہ انگریزی نہیں پڑھتا تو؟", a: "Restaurant Pro میں کچن اور اسٹاف اسکرینیں اردو، ہندی اور پنجابی میں ملتی ہیں۔" },
  ],
};

const pa: RestaurantSections = {
  heroFacts: "{price} ਪ੍ਰਤੀ ਮਹੀਨਾ ਤੋਂ, ਪੱਕੀ ਕੀਮਤ · ਆਪਣੇ ਆਰਡਰਾਂ ਤੇ 0% ਕਮਿਸ਼ਨ · ਮੀਨੂ ਆਪ ਜੋੜੋ, ਜਾਂ ਅਸੀਂ ਟਾਈਪ ਕਰ ਦੇਵਾਂਗੇ · ਪਹਿਲੇ ਸਾਲ {first}% ਛੋਟ",
  phoneNote: "ਉਦਾਹਰਣ ਆਰਡਰ ਪੰਨਾ, ਅਸਲ ਰੈਸਟੋਰੈਂਟ ਨਹੀਂ।",
  founding: {
    label: "ਪਹਿਲੇ ਸਾਲ ਦੀ ਪੇਸ਼ਕਸ਼",
    headline: "{street} ਤੇ ਪਹਿਲੇ ਸਾਲ ਦੀ ਪੇਸ਼ਕਸ਼ ਦੀਆਂ {total} ਵਿੱਚੋਂ {left} ਥਾਵਾਂ ਬਾਕੀ",
    also: "ਇਹ ਵੀ ਖੁੱਲ੍ਹੇ ਹਨ: {list}।",
    alsoItem: "{street} ({left} ਬਾਕੀ)",
    sub: "ਹਰ ਸੜਕ ਦੇ ਪਹਿਲੇ {slots} ਰੈਸਟੋਰੈਂਟਾਂ ਨੂੰ 12 ਮਹੀਨੇ {first}% ਛੋਟ ਮਿਲਦੀ ਹੈ, ਫਿਰ ਹਮੇਸ਼ਾ ਲਈ {life}% ਛੋਟ। ਮੀਨੂ ਆਪ ਜੋੜੋ, ਜਾਂ ਅਸੀਂ ਟਾਈਪ ਕਰ ਦੇਵਾਂਗੇ ਅਤੇ ਤੁਹਾਡੇ ਖ਼ਾਸ ਪਕਵਾਨਾਂ ਦੀਆਂ ਤਸਵੀਰਾਂ ਮੁਫ਼ਤ ਖਿੱਚਾਂਗੇ।",
  },
  jobsEyebrow: "ਤੁਹਾਨੂੰ ਕੀ ਮਿਲਦਾ ਹੈ",
  jobsTitle: "ਦੇਸੀ ਰਸੋਈ ਜਿਵੇਂ ਚੱਲਦੀ ਹੈ, ਉਸੇ ਤਰ੍ਹਾਂ ਬਣਾਇਆ ਗਿਆ।",
  jobsNote: "ਇਹ ਸਕਰੀਨਾਂ ਉਦਾਹਰਣਾਂ ਹਨ, ਅਸਲ ਗਾਹਕ ਜਾਂ ਆਰਡਰ ਨਹੀਂ।",
  jobExample: "{job} ਦੀ ਉਦਾਹਰਣ",
  rangeTo: "{min} ਤੋਂ {max}",
  jobs: [
    {
      key: "orders",
      eyebrow: "ਆਰਡਰ",
      title: "ਬਿਨਾਂ ਕਮਿਸ਼ਨ ਦੇ ਆਰਡਰ।",
      body: "ਤੁਹਾਡਾ ਆਪਣਾ ਆਰਡਰ ਪੰਨਾ, ਹਲਾਲ ਅਤੇ ਖੁਰਾਕ ਦੇ ਟੈਗਾਂ ਨਾਲ, ਅਤੇ ਮੀਨੂ ਚਾਰ ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ। ਪਿਕਅੱਪ ਹੁਣੇ; ਡਿਲਿਵਰੀ ਤੁਹਾਡੇ ਆਪਣੇ ਡਰਾਈਵਰਾਂ ਨਾਲ।",
      rows: ["ਚਿਕਨ ਬਿਰਯਾਨੀ · ਹਲਾਲ", "ਲੈਂਬ ਕੜਾਹੀ · ਹਲਾਲ", "ਵੈੱਜ ਥਾਲੀ · ਜੈਨ ਵਿਕਲਪ"],
    },
    {
      key: "tiffin",
      eyebrow: "ਟਿਫ਼ਿਨ",
      title: "ਟਿਫ਼ਿਨ ਜੋ ਆਪਣੇ ਆਪ ਚੱਲਦਾ ਹੈ।",
      body: "ਹਫ਼ਤਾਵਾਰੀ ਅਤੇ ਮਹੀਨਾਵਾਰ ਪਲਾਨ, ਇੱਕ ਦਿਨ ਛੱਡੋ ਜਾਂ ਰੋਕੋ, ਤੁਹਾਡੇ ਡਰਾਈਵਰਾਂ ਲਈ ਰੂਟ। ਨਵਿਆਉਣ ਤੇ ਸੇਵ ਕੀਤੇ ਕਾਰਡ ਜਾਂ ਬੈਂਕ ਡੈਬਿਟ ਤੋਂ ਭੁਗਤਾਨ ਹੁੰਦਾ ਹੈ।",
      rows: ["ਹਫ਼ਤਾਵਾਰੀ ਲੰਚ · 24 ਸਬਸਕ੍ਰਾਈਬਰ", "ਅੱਜ ਛੱਡਿਆ · 3", "ਰੂਟ A · 11 ਸਟਾਪ"],
    },
    {
      key: "catering",
      eyebrow: "ਕੇਟਰਿੰਗ ਅਤੇ ਦੇਗ",
      title: "ਭੀੜ ਤੋਂ ਪਹਿਲਾਂ ਕੇਟਰਿੰਗ ਅਤੇ ਦੇਗਾਂ।",
      body: "ਦੇਗਾਂ ਅਤੇ ਮਿਠਾਈ ਦੇ ਡੱਬਿਆਂ ਲਈ ਕੋਟੇਸ਼ਨ, ਐਡਵਾਂਸ ਅਤੇ ਪ੍ਰੀ-ਆਰਡਰ, ਰੋਜ਼ ਦੀ ਹੱਦ ਨਾਲ ਤਾਂ ਜੋ ਤੁਸੀਂ ਕਦੇ ਵੱਧ ਨਾ ਵੇਚੋ।",
      rows: ["ਵਲੀਮਾ · 150 ਮਹਿਮਾਨ · ਕੋਟੇਸ਼ਨ ਭੇਜੀ ਗਈ", "ਈਦ ਦੀ ਦੇਗ · 20 ਵਿੱਚੋਂ 12 ਬਾਕੀ", "ਐਡਵਾਂਸ ਮਿਲਿਆ · $450"],
    },
    {
      key: "whatsapp",
      eyebrow: "WhatsApp",
      title: "WhatsApp, ਜਿੱਥੇ ਗਾਹਕ ਪਹਿਲਾਂ ਤੋਂ ਹਨ।",
      body: "ਆਰਡਰ ਅੱਪਡੇਟ, ਦੁਬਾਰਾ ਆਰਡਰ ਦੇ ਲਿੰਕ ਅਤੇ ਰਿਵਿਊ ਦੀਆਂ ਬੇਨਤੀਆਂ। ਹਰ ਮਹੀਨੇ {range} ਸੁਨੇਹੇ ਸ਼ਾਮਲ। ਆਫ਼ਰ ਸਿਰਫ਼ ਸਵੇਰੇ 8 ਤੋਂ ਰਾਤ 9 ਵਜੇ ਦੇ ਵਿਚਕਾਰ ਭੇਜੇ ਜਾਂਦੇ ਹਨ।",
      rows: ["ਤੁਹਾਡਾ ਆਰਡਰ ਤਿਆਰ ਹੈ", "ਪਿਛਲੇ ਹਫ਼ਤੇ ਦਾ ਟਿਫ਼ਿਨ ਦੁਬਾਰਾ ਆਰਡਰ ਕਰੋ", "ਬਿਰਯਾਨੀ ਕਿਵੇਂ ਲੱਗੀ?"],
    },
  ],
  festivalsEyebrow: "ਤਿਉਹਾਰਾਂ ਦਾ ਕੈਲੰਡਰ",
  festivalsTitle: "ਕੋਈ ਭੀੜ ਹੱਥੋਂ ਨਾ ਜਾਵੇ।",
  festivalsSub: "ਇੱਕ ਟੈਪ ਵਿੱਚ ਚਾਰ ਭਾਸ਼ਾਵਾਂ ਵਿੱਚ ਮੁਹਿੰਮ ਦੇ ਖਰੜੇ, ਉਨ੍ਹਾਂ ਤਾਰੀਖ਼ਾਂ ਮੁਤਾਬਕ ਜਿਨ੍ਹਾਂ ਦੁਆਲੇ ਤੁਹਾਡੇ ਗਾਹਕ ਯੋਜਨਾ ਬਣਾਉਂਦੇ ਹਨ। ਤਾਰੀਖ਼ਾਂ ਐਪ ਦੇ ਤਿਉਹਾਰ ਕੈਲੰਡਰ ਤੋਂ ਆਉਂਦੀਆਂ ਹਨ; ਚੰਦ ਤੇ ਆਧਾਰਿਤ ਤਾਰੀਖ਼ਾਂ ਹਰ ਸਾਲ ਪੱਕੀਆਂ ਕੀਤੀਆਂ ਜਾਂਦੀਆਂ ਹਨ।",
  festivalBegins: "{name} ਦੀ ਸ਼ੁਰੂਆਤ",
  festivalAbout: "ਲਗਭਗ {date}",
  festivalEstimate: "(ਅੰਦਾਜ਼ਾ)",
  festivalNames: { ramadan: "ਰਮਜ਼ਾਨ", eid_al_fitr: "ਈਦ-ਉਲ-ਫ਼ਿਤਰ", eid_al_adha: "ਈਦ-ਉਲ-ਅਜ਼ਹਾ", diwali: "ਦੀਵਾਲੀ", vaisakhi: "ਵਿਸਾਖੀ", gurpurab: "ਗੁਰੂ ਨਾਨਕ ਗੁਰਪੁਰਬ", navratri: "ਨਰਾਤੇ", holi: "ਹੋਲੀ" },
  festivalGreetings: {},
  kitchenEyebrow: "ਰਸੋਈ ਸਕਰੀਨਾਂ",
  kitchenTitle: "ਤੁਹਾਡੇ ਰਸੋਈਏ ਇਸਨੂੰ ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਪੜ੍ਹਦੇ ਹਨ।",
  kitchenSub: "Restaurant Pro ਤੇ ਹਰ ਰਸੋਈਆ ਰਸੋਈ ਡਿਸਪਲੇ ਅਤੇ ਸਟਾਫ਼ ਸਕਰੀਨਾਂ ਲਈ ਉਰਦੂ, ਹਿੰਦੀ ਜਾਂ ਪੰਜਾਬੀ ਚੁਣਦਾ ਹੈ। ਸੱਜੇ ਤੋਂ ਖੱਬੇ ਲਿਖਤ ਵੀ ਸ਼ਾਮਲ ਹੈ।",
  kitchenNote: "ਉਦਾਹਰਣ ਟਿਕਟ।",
  plansEyebrow: "ਪਲਾਨ",
  plansTitle: "ਪੱਕੀਆਂ ਕੀਮਤਾਂ, ਕੋਈ ਕਮਿਸ਼ਨ ਨਹੀਂ।",
  plansBody: "{prices} ਪ੍ਰਤੀ ਮਹੀਨਾ। ਸਾਲਾਨਾ ਪਲਾਨ ਵਿੱਚ 10 ਮਹੀਨਿਆਂ ਦਾ ਭੁਗਤਾਨ। ਐਪਾਂ ਤੋਂ ਹਟਾਏ $5,000 ਦੇ ਆਰਡਰਾਂ ਤੇ, ਸਾਡੀ ਫ਼ੀਸ ਤੋਂ ਪਹਿਲਾਂ, ਤੁਸੀਂ ਹਰ ਮਹੀਨੇ {range} ਆਪਣੇ ਕੋਲ ਰੱਖਦੇ ਹੋ। ਡਿਲਿਵਰੀ ਲਈ ਤੁਹਾਡੇ ਆਪਣੇ ਡਰਾਈਵਰ ਚਾਹੀਦੇ ਹਨ।",
  plansSource: "ਡਿਲਿਵਰੀ ਐਪ ਦੀਆਂ ਦਰਾਂ DoorDash Canada ਤੋਂ, {date} ਨੂੰ ਪੜ੍ਹੀਆਂ:",
  perMonth: "/ਮਹੀਨਾ",
  plansCta: "ਪੂਰੀਆਂ ਕੀਮਤਾਂ ਵੇਖੋ",
  weekEyebrow: "ਅਸੀਂ ਕਿਵੇਂ ਸ਼ੁਰੂ ਕਰਦੇ ਹਾਂ",
  weekTitle: "ਇੱਕ ਹਫ਼ਤੇ ਵਿੱਚ ਚਾਲੂ। ਆਪ ਸੈੱਟ ਕਰੋ, ਜਾਂ ਅਸੀਂ ਤੁਹਾਡੇ ਨਾਲ ਕਰੀਏ।",
  week: [
    { t: "ਦਿਨ 1", b: "ਮੀਨੂ ਐਡੀਟਰ ਵਿੱਚ ਆਪਣੇ ਪਕਵਾਨ ਜੋੜੋ, ਜਾਂ ਅਸੀਂ ਆ ਕੇ ਤੁਹਾਡਾ ਮੀਨੂ ਟਾਈਪ ਕਰਦੇ ਹਾਂ ਅਤੇ ਤੁਹਾਡੇ ਖ਼ਾਸ ਪਕਵਾਨਾਂ ਦੀਆਂ ਤਸਵੀਰਾਂ ਖਿੱਚਦੇ ਹਾਂ।" },
    { t: "ਦਿਨ 3", b: "ਤੁਹਾਡਾ ਆਰਡਰ ਪੰਨਾ ਅਤੇ WhatsApp ਅੱਪਡੇਟ ਚਾਲੂ ਹੋ ਜਾਂਦੇ ਹਨ। ਅਸੀਂ ਤੁਹਾਡੀ ਟਿਫ਼ਿਨ ਸੂਚੀ ਲੈ ਆਉਂਦੇ ਹਾਂ।" },
    { t: "ਹਫ਼ਤਾ 2", b: "ਪਹਿਲੀ ਤਿਉਹਾਰ ਮੁਹਿੰਮ ਤੁਹਾਡੇ ਗਾਹਕਾਂ ਦੀ ਭਾਸ਼ਾ ਵਿੱਚ ਤਿਆਰ।" },
  ],
  faqEyebrow: "ਸਵਾਲ",
  faqTitle: "ਰੈਸਟੋਰੈਂਟ ਜੋ ਸਵਾਲ ਪੁੱਛਦੇ ਹਨ।",
  faq: [
    { q: "ਕੀ ਤੁਸੀਂ ਡਿਲਿਵਰੀ ਕਰਦੇ ਹੋ?", a: "ਨਹੀਂ। ਤੁਹਾਡੇ ਪੰਨੇ ਦੇ ਆਰਡਰ ਪਿਕਅੱਪ ਹੁੰਦੇ ਹਨ ਜਾਂ ਤੁਹਾਡੀ ਆਪਣੀ ਡਿਲਿਵਰੀ। ਅਸੀਂ ਡਰਾਈਵਰ ਨਹੀਂ ਚਲਾਉਂਦੇ ਅਤੇ ਡਿਲਿਵਰੀ ਤੇ ਕਮਿਸ਼ਨ ਨਹੀਂ ਲੈਂਦੇ।" },
    { q: "ਕੀ ਤੁਸੀਂ ਹਲਾਲ ਪ੍ਰਮਾਣਿਤ ਕਰਦੇ ਹੋ?", a: "ਨਹੀਂ। ਹਰ ਪਕਵਾਨ ਤੇ ਹਲਾਲ, ਜ਼ਬੀਹਾ ਅਤੇ ਖੁਰਾਕ ਦੇ ਲੇਬਲ ਤੁਸੀਂ ਲਾਉਂਦੇ ਹੋ। ਅਸੀਂ ਉਨ੍ਹਾਂ ਨੂੰ ਦਿਖਾਉਂਦੇ ਹਾਂ ਅਤੇ ਗਾਹਕਾਂ ਨੂੰ ਫ਼ਿਲਟਰ ਕਰਨ ਦਿੰਦੇ ਹਾਂ।" },
    { q: "ਕੀ DoorDash ਵੀ ਚਾਲੂ ਰੱਖਿਆ ਜਾ ਸਕਦਾ ਹੈ?", a: "ਹਾਂ, ਜੇ ਤੁਸੀਂ ਚਾਹੋ। ਐਪਾਂ ਨੂੰ ਨਵੇਂ ਗਾਹਕਾਂ ਤੱਕ ਪਹੁੰਚਣ ਲਈ ਵਰਤੋ, ਅਤੇ ਆਪਣੇ ਪੱਕੇ ਗਾਹਕਾਂ ਨੂੰ ਆਪਣੇ ਪੰਨੇ ਤੇ ਭੇਜੋ।" },
    { q: "ਟਿਫ਼ਿਨ ਗਾਹਕ ਭੁਗਤਾਨ ਕਿਵੇਂ ਕਰਦੇ ਹਨ?", a: "ਸੇਵ ਕੀਤੇ ਕਾਰਡ ਜਾਂ ਪਹਿਲਾਂ ਤੋਂ ਮਨਜ਼ੂਰ ਬੈਂਕ ਡੈਬਿਟ ਨਾਲ, ਜੋ ਤੁਹਾਡੇ Stripe ਖਾਤੇ ਤੇ ਚਾਰਜ ਹੁੰਦਾ ਹੈ, {billing} ਬਿਲਿੰਗ ਫ਼ੀਸ ਨਾਲ।" },
    { q: "ਜੇ ਮੇਰਾ ਸਟਾਫ਼ ਅੰਗਰੇਜ਼ੀ ਨਹੀਂ ਪੜ੍ਹਦਾ ਤਾਂ?", a: "Restaurant Pro ਵਿੱਚ ਰਸੋਈ ਅਤੇ ਸਟਾਫ਼ ਸਕਰੀਨਾਂ ਉਰਦੂ, ਹਿੰਦੀ ਅਤੇ ਪੰਜਾਬੀ ਵਿੱਚ ਮਿਲਦੀਆਂ ਹਨ।" },
  ],
};

const BY_LOCALE: Record<Locale, RestaurantSections> = { en, hi, ur, pa };

/** The restaurant page's sections in a language. */
export const restaurantCopy = (locale: Locale): RestaurantSections => BY_LOCALE[locale];
