# Translation glossary and QA log (hi, ur, pa)

Reviewed key by key against `packages/shared/src/i18n/messages/en.ts`, plus the Hindi, Urdu and Punjabi
copy in `apps/api/src/services/whatsapp-conversation.ts`, the greetings in
`packages/shared/src/festivals.ts` and the dish and tiffin translations in
`apps/api/src/seed/restaurants.ts`. Audience: a South Asian customer in the GTA and restaurant staff.

This file is the reference for anyone who writes or edits hi/ur/pa strings. Read the glossary and the style
rules before adding keys. A native speaker has not yet signed off; the open questions are at the end.

## Scope and counts

| Locale | Catalog strings reviewed | Catalog strings changed |
| --- | --- | --- |
| hi | 855 | 104 |
| ur | 855 | 73 |
| pa | 855 | 153 |

Other files reviewed (all three languages each):

| File | Strings reviewed | Changed (hi / ur / pa) |
| --- | --- | --- |
| `whatsapp-conversation.ts` bot replies and order lines | about 20 per language, plus the command keyword lists | 2 / 1 / 0 |
| `festivals.ts` greetings | 19 hi, 11 ur, 19 pa | 13 / 1 / 8 |
| `restaurants.ts` seed, dish names and descriptions | 31 dishes with 3 long descriptions, 27 tiffin dishes, 2 tiffin descriptions, 3 plan names and descriptions, 3 call transcripts, per language | 4 / 3 / 1 |

Placeholders (`{shop}`, `{amount}`, `{n, plural, ...}` and the rest) are unchanged in every edited string, and
numbers and currency stay with the formatters. In that review pass only values were edited and no key was added or removed; the keys added since are listed under Awaiting native review.

## Glossary

One term per concept. Use the left column's meaning, not a new synonym.

| Concept | Hindi (Devanagari) | Urdu (Nastaliq) | Punjabi (Gurmukhi) |
| --- | --- | --- | --- |
| order | ऑर्डर | آرڈر | ਆਰਡਰ |
| pre-order | प्री-ऑर्डर | پیشگی آرڈر | ਪ੍ਰੀ-ਆਰਡਰ |
| pickup | पिकअप | پک اپ | ਪਿਕਅੱਪ |
| delivery | डिलीवरी | ڈیلیوری | ਡਿਲੀਵਰੀ |
| deposit | डिपॉज़िट | ڈپازٹ | ਡਿਪਾਜ਼ਿਟ |
| balance | बाकी रकम | بقیہ رقم | ਬਾਕੀ ਰਕਮ |
| amount due | बकाया रकम | واجب الادا رقم | ਬਕਾਇਆ ਰਕਮ |
| payment (noun) | भुगतान | ادائیگی | ਭੁਗਤਾਨ |
| pay (button, with an amount) | {amount} चुकाएँ | {amount} ادا کریں | {amount} ਭਰੋ |
| refund, refunded | वापस किया गया (रकम वापस) | واپس کیا گیا | ਵਾਪਸ ਕੀਤਾ ਗਿਆ |
| cancel | रद्द करें | منسوخ کریں | ਰੱਦ ਕਰੋ |
| tiffin | टिफ़िन | ٹفن | ਟਿਫ਼ਿਨ |
| plan | प्लान | پلان | ਪਲਾਨ |
| meal | खाना (plural खाने) | کھانا (کھانے) | ਖਾਣਾ (ਖਾਣੇ) |
| skip (a day) | छोड़ें | چھوڑیں | ਛੱਡੋ |
| undo a skip | वापस लें | واپس لیں | ਵਾਪਸ ਲਓ |
| pause, resume | रोकें, फिर शुरू करें | روکیں، دوبارہ شروع کریں | ਰੋਕੋ, ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਕਰੋ |
| cutoff | अंतिम समय | آخری وقت | ਆਖ਼ਰੀ ਸਮਾਂ |
| expiry (of a code) | मियाद ख़त्म | میعاد ختم | ਮਿਆਦ ਖ਼ਤਮ |
| subscribe, subscription | सब्सक्राइब करें, सब्सक्रिप्शन | سبسکرائب کریں، سبسکرپشن | ਸਬਸਕ੍ਰਾਈਬ ਕਰੋ, ਸਬਸਕ੍ਰਿਪਸ਼ਨ |
| renewal | नवीनीकरण | تجدید | ਨਵੀਨੀਕਰਨ |
| catering | केटरिंग | کیٹرنگ | ਕੇਟਰਿੰਗ |
| inquiry | पूछताछ | انکوائری | ਪੁੱਛਗਿੱਛ |
| quote | कोटेशन | کوٹیشن | ਕੋਟੇਸ਼ਨ |
| approve | मंज़ूर करें | منظور کریں | ਮਨਜ਼ੂਰ ਕਰੋ |
| booking | बुकिंग | بکنگ | ਬੁਕਿੰਗ |
| confirmed (date, booking) | पक्का | پکا, تصدیق شدہ | ਪੱਕਾ |
| hold (noun, status) | होल्ड | ہولڈ | ਹੋਲਡ |
| hold the date (verb) | तारीख़ रोकें | تاریخ روکیں | ਤਾਰੀਖ਼ ਰੋਕੋ |
| hall, banquet hall | हॉल, बैंक्वेट हॉल | ہال، بینکوئٹ ہال | ਹਾਲ, ਬੈਂਕੁਇਟ ਹਾਲ |
| event (restaurant) | आयोजन | تقریب | ਸਮਾਗਮ |
| points | पॉइंट | پوائنٹس | ਪੁਆਇੰਟ |
| stamps | स्टैम्प | اسٹامپ | ਸਟੈਂਪ |
| reward | रिवॉर्ड | انعام | ਇਨਾਮ |
| card | कार्ड | کارڈ | ਕਾਰਡ |
| sign in | साइन इन करें | سائن اِن کریں | ਸਾਈਨ ਇਨ ਕਰੋ |
| code (text-message code) | कोड | کوڈ | ਕੋਡ |
| consent, agree | सहमत | متفق | ਸਹਿਮਤ |
| unsubscribe | अनसब्सक्राइब | اَن سبسکرائب | ਅਨਸਬਸਕ੍ਰਾਈਬ |
| optional | वैकल्पिक | اختیاری | ਵਿਕਲਪਿਕ |
| save (to storage) | सहेजें | محفوظ کریں | ਸੇਵ ਕਰੋ |
| manage | सँभालें | سنبھالیں | ਸੰਭਾਲੋ |
| visit | विज़िट | وزٹ | ਵਿਜ਼ਿਟ |
| thanks | शुक्रिया | شکریہ | ਧੰਨਵਾਦ |
| date | तारीख़ | تاریخ | ਤਾਰੀਖ਼ |
| e-transfer (Interac) | ई-ट्रांसफ़र | ای ٹرانسفر | ਈ-ਟ੍ਰਾਂਸਫ਼ਰ |
| reference code (to put in the message) | रेफ़रेंस कोड | ریفرنس کوڈ | ਰੈਫ਼ਰੈਂਸ ਕੋਡ |
| awaiting payment (waiting on the customer) | भुगतान का इंतज़ार | ادائیگی کا انتظار | ਭੁਗਤਾਨ ਦੀ ਉਡੀਕ |
| cash | नकद | نقد | ਨਕਦ |
| cheque | चेक | چیک | ਚੈੱਕ |
| service charge | सर्विस चार्ज | سروس چارج | ਸਰਵਿਸ ਚਾਰਜ |
| tax (HST/GST) | टैक्स | ٹیکس | ਟੈਕਸ |
| driver run, stop | रूट, स्टॉप | روٹ، سٹاپ | ਰੂਟ, ਸਟਾਪ |
| name | नाम | نام | ਨਾਂ |
| page | पेज | صفحہ | ਪੰਨਾ |
| halal, zabihah | हलाल, ज़बीहा | حلال، ذبیحہ | ਹਲਾਲ, ਜ਼ਬੀਹਾ |

Notes on the terms that mattered most:

- **Deposit** is the loanword in all three languages. बयाना, بیعانہ and ਬਿਆਨਾ are the traditional words for
  booking money, but they imply money the shop keeps. The product has partial and full refunds on hall
  deposits, so the neutral loanword avoids promising or denying a refund. The old catalog mixed
  "अग्रिम राशि", "जमा राशि", بیعانہ, ایڈوانس, ਬਿਆਨਾ, ਜਮ੍ਹਾਂ ਰਕਮ and ਪੇਸ਼ਗੀ ਰਕਮ for the same English word.
- **Skip** is "छोड़ें". The catalog used "छुट्टी लें/چھٹی کریں/ਛੁੱਟੀ ਕਰੋ" (take a holiday) in some places and
  "छोड़ें" in others. "Skipped" and "Skip" labels already used the verb for leaving something out, so the
  holiday phrasing was dropped.
- **Cutoff** is "अंतिम समय" (the last time you can still change it). "समय सीमा" and "समय-सीमा" are now only
  used for other things (none at present). A code that stops working has a "मियाद" (expiry), not a cutoff.
- **Hold** is the status shown on hall bookings, so the noun is होल्ड/ہولڈ/ਹੋਲਡ everywhere and the verb for
  blocking a date is "रोकें". Do not mix "रोक की अवधि" with "होल्ड" for the same thing.
- **Confirmed** is "पक्का/پکا/ਪੱਕਾ" in sentences and "تصدیق شدہ" is accepted as a status label in Urdu.
- **Inquiry** in Urdu is "انکوائری". The earlier "دریافت" means discovery or "asking", not a request sent to a kitchen.

## Style rules

All three languages

- Polite plural forms for the customer: आप, آپ, ਤੁਸੀਂ. Imperatives use the polite form (करें, کریں, ਕਰੋ). Do not
  mix the intimate form (कर, کر, ਕਰ) anywhere. Staff screens use the same polite forms.
- Verbs go last. When a placeholder sits in the middle (`{shop} ... कॉल या मैसेज करेगा`) keep the verb at the end.
- Keep common spoken loanwords that people really use: order, pickup, delivery, tiffin, plan, card, code,
  menu, app, photo, text, email, WhatsApp. Prefer the plain native word where one is common (खाना, کھانا, ਖਾਣਾ).
- Latin letters are allowed only for brand names (Stripe, WhatsApp, Google), the keyword STOP, QR, and a postal
  code example. The catalogs were scanned for any other Latin letters and for mixed scripts; none remain.
- Numbers, money and dates come from the formatters. Never type "$" or a number word in a catalog string except
  where the English string has a fixed number ("72 hours", "10 digits").
- A shop's halal claim is the shop's own. Say "दुकान द्वारा दी गई", "دکان کی طرف سے", "ਦੁਕਾਨ ਵੱਲੋਂ", never "certified" unless
  `diet.certifiedBy` supplies a certifier.
- Consent copy must say who is sending (the shop name), that it is optional where English says so, how to
  stop (unsubscribe, or reply STOP) and that this can be done at any time. Do not shorten these.
- Gender: customer copy avoids gendered self-reference. Where the legal consent line needs "I", use the
  slash form (सकता/सकती हूँ, سکتا/سکتی ہوں, ਸਕਦਾ/ਸਕਦੀ ਹਾਂ).

Hindi

- Devanagari only. Danda "।" ends sentences. Use chandrabindu in the standard places (शुभकामनाएँ, चुकाएँ, माँगें, आँच).
- Write "बाकी", "रकम", "तरीका", "खाली" without the nukta. Keep the nukta where people say the sound (ज़रूरी, फ़ोन,
  ख़त्म, तारीख़, मंज़ूर).
- Use "टिफ़िन", "केटरिंग", "शुक्रिया", "खाना". Do not use "भोजन" (stiff) or "धन्यवाद" (mixed with शुक्रिया).
- Plural of "खाना" is "खाने"; the plural-rule branches must reflect it.

Urdu

- Perso-Arabic Nastaliq. Use ک (keheh), ی (Farsi yeh), ہ (heh goal), ے, never ك ي ى ه ة.
- Punctuation: ۔ (full stop), ، (comma), ؟ (question mark). Latin digits and Latin STOP stay left to right.
- Urdu vocabulary, not Hindi in Arabic letters: ہندسوں (digits), تقریب (event), رابطہ (contact), معذرت (sorry),
  شکریہ (thanks), آخری وقت (cutoff). Where a loanword is what people say (ڈپازٹ, کوٹیشن, انکوائری, ٹفن) it is
  spelled the Urdu way.
- Spelling: "ہو گا/ہو گی" (two words), "پتہ", "اپ ڈیٹ", "اسٹامپ", "چُنیں". The sign-in label is
  "سائن اِن کریں" with the kasra, which the Playwright suite depends on.

Punjabi

- Gurmukhi only (never Shahmukhi). Use ਵੇਖੋ (not ਦੇਖੋ), ਤਾਰੀਖ਼ (not ਤਰੀਕ), ਨਾਂ, ਪੰਨਾ, ਧੰਨਵਾਦ, ਇਨਾਮ, ਕੇਟਰਿੰਗ, ਟਿਫ਼ਿਨ.
- ਭੁਗਤਾਨ is the noun for payment (replaces ਅਦਾਇਗੀ, which is Urdu-derived and was mixed in). "Pay {amount}" is "{amount} ਭਰੋ".
- Save is "ਸੇਵ ਕਰੋ"; "ਸੰਭਾਲੋ" means manage or look after. The old catalog used ਸੰਭਾਲੋ for both.
- ਗ਼ਲਤ and ਖ਼ਾਲੀ keep their nukta; ਫ਼ੋਨ, ਫ਼ੀਸ, ਮੁਫ਼ਤ keep theirs.

### Right-to-left layout (Urdu) in the apps

- Layout: the mobile root sets `direction` and `dir`, so rows flip. Use `start` / `end`, `marginStart` / `paddingStart` and `textAlign` through `Text`, never `left` / `right`, except for things tied to the map (pins, mini map) which keep their geometry (`direction: ltr`, `dir="ltr"`).
- Icons that mean a direction (back, next, disclosure chevrons) are mirrored by `ChevronLeft` / `ChevronRight` in `ui/icons.ts`. Icons that rotate (accordions) use `ChevronRightLtr`.
- Bidi: shop names, reward names, amounts and links that sit inside an Urdu sentence are wrapped in an isolate (`t()` does it for the variables listed in `lib/i18n/index.tsx`; `money()` wraps amounts). A message that opens with a Latin run or an isolated name gets a leading RLM (`withRtlMark`), because Chromium's `dir="auto"` looks inside isolates and would lay the whole paragraph out left to right.
- Script: `ui/scriptStyle.ts` gives Urdu text a line height of at least 1.7 times the font size (Nastaliq ascenders and descenders clip in a tight line box), and switches off letter-spacing (it breaks Arabic joins) and italics.
- Digits come out Latin in Urdu, Hindi and Punjabi (the formatters decide, see the rule on numbers above); OTP codes, phone numbers and the switch thumb stay left-to-right.

## Marketing site (`mkt.*`)

`mkt.nav.*` and `mkt.rest.*` carry the translated nav labels, hero line and contact form of `/for-restaurants` (the rest of the
marketing site is English only in v1; see docs/research/landing-and-network.md 7.3). They follow the glossary above. BIA is written
as an acronym in the local script (बीआईए, بی آئی اے, ਬੀਆਈਏ) because no everyday word exists. The thanks line promises a reply "within 1
business day", a fixed number allowed by the style rules. A native speaker has not yet reviewed these 26 strings per language.

## Reason codes used below

| Code | Meaning |
| --- | --- |
| D | One deposit term across the app, with matching gender and verb (डिपॉज़िट is masculine, so "की" became "का", "दी गई" became "चुकाया गया") |
| K | Skip, pause and cutoff wording |
| H | Hold wording on hall bookings |
| I | Inquiry wording (Urdu) |
| P | Payment vocabulary (Punjabi ਅਦਾਇਗੀ and ਅਦਾ ਕਰੋ to ਭੁਗਤਾਨ and ਭਰੋ) |
| V | Save and manage verbs (Punjabi) |
| C | Consent copy: wording tightened, legal content unchanged |
| G | Grammar or meaning fix (listed with before and after in the next section) |
| O | Orthography, spelling or consistency (nukta, chandrabindu, spacing, one spelling per term) |

## Strings changed, by namespace

Keys are listed with their reason codes. The English source is the key's value in `en.ts`.

### Hindi (hi): 104 changed

- **Core shop, menu, cart, kitchen, counter (menu.*)** (3): `menu.soldOut` (O), `menu.deposit` (D), `menu.depositDue` (D)
- **Core shop, menu, cart, kitchen, counter (tiffin.*)** (1): `tiffin.plan` (O)
- **Core shop, menu, cart, kitchen, counter (catering.*)** (1): `catering.thanks` (O)
- **rc.* (restaurant customer pages)** (43): `rc.optional` (O), `rc.ca.title` (O), `rc.ca.depositDue` (D), `rc.ca.depositPaid` (D), `rc.ca.balance` (G), `rc.ca.terms` (D), `rc.ca.approvePay` (D), `rc.ca.approvedBody` (D), `rc.ca.alreadyApproved` (D), `rc.ca.payTitle` (D), `rc.ca.pay` (D), `rc.ca.resume` (D), `rc.ca.payOffline` (D), `rc.ca.confirmedBody` (G), `rc.ca.confirmedPaid` (D), `rc.ca.confirmedNoDeposit` (D), `rc.cq.unavailable` (O), `rc.tf.intro` (K), `rc.tf.mealsPerDay` (K), `rc.tf.cutoff` (K), `rc.tf.startDate` (K), `rc.tf.payment` (O), `rc.tf.doneBody` (K), `rc.tm.upcoming` (K), `rc.tm.noUpcoming` (K), `rc.tm.skipBy` (K), `rc.tm.undo` (G), `rc.tm.pauseTitle` (K), `rc.tm.pauseConfirm` (K), `rc.tm.paused` (K), `rc.tm.resumed` (K), `rc.tm.cancelBody` (KG), `rc.tm.retryBody` (K), `rc.bq.base` (G), `rc.bq.deposit` (D), `rc.bq.held` (H), `rc.bq.heldTitle` (H), `rc.bq.heldBody` (DH), `rc.bq.heldNoPay` (D), `rc.bq.heldUntil` (H), `rc.bq.payDeposit` (D), `rc.links.tiffinSub` (K), `rc.links.catering` (O)
- **split.*** (1): `split.paidBody` (O)
- **payIntent.*** (3): `payIntent.kind.hall_deposit` (D), `payIntent.kind.catering_deposit` (D), `payIntent.amountDue` (O)
- **paySetup.*** (1): `paySetup.confirming` (G)
- **rest.* (restaurant app and web)** (44): `rest.err.eventType` (O), `rest.err.eventDate` (O), `rest.tiffin.plans` (O), `rest.tiffin.plan` (O), `rest.tiffin.mine` (O), `rest.tiffin.notOffered` (O), `rest.tiffin.none.body` (O), `rest.tiffin.payWith` (O), `rest.tiffin.mine.empty.title` (O), `rest.tiffin.mine.empty.body` (O), `rest.sub.past_due` (O), `rest.tiffin.retry.sub` (O), `rest.tiffin.cutoff.passed` (K), `rest.tiffin.skipped.credit` (G), `rest.tiffin.cutoffPassed` (K), `rest.tiffin.manage` (O), `rest.tiffin.pause.body` (KG), `rest.tiffin.cancel.title` (O), `rest.tiffin.cancel.body` (K), `rest.tiffin.cancelled` (O), `rest.tiffin.credit` (G), `rest.charge.pending` (O), `rest.cat.noCharge` (D), `rest.cat.step.confirmed.sub` (D), `rest.cat.depositPaid` (D), `rest.cat.balance` (O), `rest.bk.intro` (D), `rest.bk.loadingDays` (O), `rest.bk.depositPct` (D), `rest.bk.holdNote` (D), `rest.bk.held` (D), `rest.bk.depositDue` (D), `rest.bk.depositPaid` (D), `rest.cat.depositRefunded` (D), `rest.cat.depositKept` (D), `rest.cat.refunded` (D), `rest.bk.refunded` (D), `rest.bk.depositKept` (D), `rest.bk.policy.tier` (D), `rest.bk.policy.none` (D), `rest.bk.cancelPaid.body` (D), `rest.bk.cancelPaid.none` (D), `rest.bk.payDeposit` (D), `rest.bk.payAtShop` (D)
- **review.*** (1): `review.goneBody` (O)
- **orderPay.*** (1): `orderPay.goneBody` (O)
- **auth.* (sign in, consent, wallet)** (5): `auth.err.expired` (KG), `auth.consent.merchantApp` (C), `auth.m.welcome.body` (O), `auth.m.welcome.bodyShop` (O), `auth.m.code.expiredSent` (KG)

### Urdu (ur): 73 changed

- **Core shop, menu, cart, kitchen, counter (menu.*)** (2): `menu.deposit` (D), `menu.depositDue` (D)
- **Core shop, menu, cart, kitchen, counter (cart.*)** (1): `cart.items` (G)
- **Core shop, menu, cart, kitchen, counter (tiffin.*)** (1): `tiffin.active` (O)
- **Core shop, menu, cart, kitchen, counter (catering.*)** (2): `catering.title` (I), `catering.submit` (I)
- **rc.* (restaurant customer pages)** (17): `rc.event.religious` (G), `rc.ca.balance` (G), `rc.ca.confirmedBody` (G), `rc.cq.privacy` (I), `rc.cq.sentTitle` (I), `rc.cq.sentBody` (I), `rc.cq.another` (I), `rc.tf.intro` (K), `rc.tf.cutoff` (K), `rc.tf.doneBody` (K), `rc.tm.skipBy` (K), `rc.tm.undo` (G), `rc.mn.preorderOnly` (O), `rc.bq.held` (H), `rc.bq.heldTitle` (H), `rc.bq.heldBody` (H), `rc.bq.heldUntil` (H)
- **payIntent.*** (2): `payIntent.kind.hall_deposit` (D), `payIntent.kind.catering_deposit` (D)
- **rest.* (restaurant app and web)** (44): `rest.pickDate` (O), `rest.err.address` (O), `rest.err.eventType` (O), `rest.err.eventDate` (O), `rest.diet.halalSome` (G), `rest.diet.vegSome` (G), `rest.wa.title` (O), `rest.wa.on` (O), `rest.wa.off` (O), `rest.wa.enabled` (O), `rest.wa.disabled` (O), `rest.tiffin.intro` (O), `rest.tiffin.firstMeal` (O), `rest.tiffin.pausedUntil` (O), `rest.tiffin.manage` (O), `rest.tiffin.pause.sub` (O), `rest.tiffin.pause.body` (KG), `rest.tiffin.resumeOn` (O), `rest.tiffin.changeAddress` (O), `rest.tiffin.credit` (G), `rest.cat.noCharge` (D), `rest.cat.step.confirmed.sub` (D), `rest.cat.depositPaid` (D), `rest.bk.intro` (D), `rest.bk.clash` (O), `rest.bk.noTimes` (O), `rest.bk.depositPct` (D), `rest.bk.holdNote` (D), `rest.bk.held` (D), `rest.bk.taken` (O), `rest.bk.holdEnds` (O), `rest.bk.depositDue` (D), `rest.bk.depositPaid` (D), `rest.cat.depositRefunded` (D), `rest.cat.depositKept` (D), `rest.cat.refunded` (D), `rest.bk.refunded` (D), `rest.bk.depositKept` (D), `rest.bk.policy.tier` (D), `rest.bk.policy.none` (D), `rest.bk.cancelPaid.body` (D), `rest.bk.cancelPaid.none` (D), `rest.bk.payDeposit` (D), `rest.bk.payAtShop` (D)
- **review.*** (1): `review.thanksHigh` (O)
- **auth.* (sign in, consent, wallet)** (3): `auth.consent.merchantApp` (C), `auth.unit.stamps` (O), `auth.pin.managerNeeded` (O)

### Punjabi (pa): 153 changed

- **Core shop, menu, cart, kitchen, counter (menu.*)** (2): `menu.deposit` (D), `menu.depositDue` (D)
- **Core shop, menu, cart, kitchen, counter (tiffin.*)** (1): `tiffin.plan` (O)
- **Core shop, menu, cart, kitchen, counter (catering.*)** (1): `catering.budget` (O)
- **rc.* (restaurant customer pages)** (48): `rc.optional` (O), `rc.ca.title` (O), `rc.ca.depositDue` (D), `rc.ca.depositPaid` (D), `rc.ca.balance` (G), `rc.ca.terms` (D), `rc.ca.approvePay` (D), `rc.ca.approvedBody` (D), `rc.ca.alreadyApproved` (D), `rc.ca.payTitle` (D), `rc.ca.pay` (D), `rc.ca.resume` (D), `rc.ca.payOffline` (D), `rc.ca.confirmedBody` (G), `rc.ca.confirmedPaid` (D), `rc.ca.confirmedNoDeposit` (D), `rc.ca.completed` (O), `rc.cq.sentBody` (V), `rc.cq.unavailable` (O), `rc.tf.intro` (K), `rc.tf.cutoff` (K), `rc.tf.noPlansBody` (O), `rc.tf.doneBody` (K), `rc.tf.pending` (V), `rc.tm.signIn` (O), `rc.tm.skipBy` (K), `rc.tm.undo` (G), `rc.tm.resume` (O), `rc.tm.saveAddress` (V), `rc.tm.addressSaved` (V), `rc.tm.viewShop` (O), `rc.mn.noMatchBody` (O), `rc.bq.intro` (O), `rc.bq.deposit` (D), `rc.bq.held` (H), `rc.bq.heldTitle` (H), `rc.bq.heldBody` (DH), `rc.bq.heldNoPay` (D), `rc.bq.heldUntil` (H), `rc.bq.payDeposit` (D), `rc.bq.sentBody` (O), `rc.links.menuSub` (O), `rc.links.catering` (O), `rc.tm.cardOnFile` (V), `rc.tm.bankOnFile` (V), `rc.tm.cardNone` (PV), `rc.tm.cardChanging` (P), `rc.tm.cardSaved` (P)
- **split.*** (5): `split.total` (P), `split.pay` (P), `split.paid` (P), `split.paidBody` (P), `split.secure` (P)
- **payIntent.*** (14): `payIntent.title` (P), `payIntent.kind.tiffin` (O), `payIntent.kind.hall_deposit` (D), `payIntent.kind.catering_deposit` (D), `payIntent.amountDue` (O), `payIntent.paid` (P), `payIntent.paidBody` (P), `payIntent.processing` (P), `payIntent.canceled` (P), `payIntent.confirming` (P), `payIntent.gone` (P), `payIntent.goneBody` (P), `payIntent.loadError` (P), `payIntent.secure` (P)
- **paySetup.*** (5): `paySetup.heading` (P), `paySetup.save` (PV), `paySetup.saved` (PV), `paySetup.confirming` (PVG), `paySetup.slow` (O)
- **rest.* (restaurant app and web)** (61): `rest.save` (V), `rest.err.load` (O), `rest.err.save` (V), `rest.filter.halal.a11y` (O), `rest.shop.tiffin.sub` (O), `rest.shop.tiffin.from` (O), `rest.wa.title` (O), `rest.wa.on` (O), `rest.wa.off` (O), `rest.wa.enabled` (O), `rest.wa.disabled` (O), `rest.tiffin.plans` (O), `rest.tiffin.plan` (O), `rest.tiffin.mine` (O), `rest.tiffin.notOffered` (O), `rest.tiffin.none.body` (O), `rest.tiffin.renewsWeekly` (G), `rest.tiffin.renewsMonthly` (G), `rest.tiffin.mine.empty.title` (O), `rest.tiffin.mine.empty.body` (O), `rest.tiffin.payNow` (O), `rest.tiffin.cutoff.passed` (K), `rest.tiffin.skipped.credit` (G), `rest.tiffin.cutoffPassed` (K), `rest.tiffin.manage` (O), `rest.tiffin.pause.body` (G), `rest.tiffin.saved` (V), `rest.tiffin.cancel.title` (O), `rest.tiffin.cancel.body` (K), `rest.tiffin.cancelled` (O), `rest.tiffin.credit` (G), `rest.charge.pending` (O), `rest.cat.venueName` (O), `rest.cat.noCharge` (D), `rest.events.empty.body` (O), `rest.cat.quoteBanner` (O), `rest.cat.step.confirmed.sub` (D), `rest.cat.depositPaid` (D), `rest.cat.balance` (O), `rest.cat.openPage` (O), `rest.bk.intro` (D), `rest.bk.depositPct` (D), `rest.bk.holdNote` (D), `rest.bk.held` (D), `rest.bk.depositDue` (D), `rest.bk.depositPaid` (D), `rest.cat.depositRefunded` (DP), `rest.cat.depositKept` (D), `rest.cat.refunded` (D), `rest.bk.refunded` (D), `rest.bk.depositKept` (D), `rest.bk.policy.tier` (D), `rest.bk.policy.none` (D), `rest.bk.cancelPaid.body` (D), `rest.bk.cancelPaid.none` (D), `rest.tiffin.cardOnFile` (V), `rest.tiffin.bankOnFile` (V), `rest.tiffin.cardNone` (PV), `rest.bk.payDeposit` (D), `rest.bk.payAtShop` (D), `rest.bk.empty.body` (O)
- **review.*** (4): `review.title` (O), `review.feedbackHint` (O), `review.alreadyRated` (O), `review.error` (O)
- **orderPay.*** (1): `orderPay.pay` (O)
- **auth.* (sign in, consent, wallet)** (11): `auth.phone.orderTitle` (O), `auth.phone.invalid` (O), `auth.err.wrong` (G), `auth.consent.merchantApp` (C), `auth.consent.globalCaption` (O), `auth.footer.rewards` (O), `auth.join.firstName` (O), `auth.join.headlineStart` (O), `auth.m.name.title` (O), `auth.pin.wrong` (O), `auth.inline.hold` (O)

## Awaiting native review

The l10n pass that removed the last hard-coded English from customer-facing code added 501 keys to `en.ts`, `hi.ts`, `ur.ts` and `pa.ts`. They follow the glossary and style rules above, but a native speaker has not read them yet. Hindi, Urdu and Punjabi values sit next to the English one in `packages/shared/src/i18n/messages/`; the list below is the English source, so a reviewer can open the same key in each file. Placeholders and plural branches match across the four languages (the shared i18n test checks this).

What to look at first:

- **Owner nudges** (`ob.nudge.*`, `ob.stopLine`, `ob.smsFoot`, `ob.emailFoot`): real SMS and email to a shop owner, in `users.locale`. Keep each text near one SMS segment; the STOP keyword stays Latin so the carrier opt-out works.
- **Notification descriptions** (`sh.ntd.*`) are now shown in every language; before, they were hidden outside English.
- **Kinds of place** (`sh.kind.*`) feed map pins, the shop page and Discover; check that the Urdu and Hindi words are the ones a shopper would say, not the dictionary term.
- **Order and ticket statuses** (`ui.order.*`, `ui.ticket.*`) and the order tracker steps are short labels: tense and gender must agree with the thing they describe.
- Latin tokens left as they are on purpose: QR, PIN, STOP, WhatsApp, Apple Wallet, Google Wallet, brand and shop names. Amounts and counts stay with the formatters.

### `ui.*` shared widgets (order and ticket statuses, hours, distance, stamp card) (87)

| Key | English |
| --- | --- |
| `ui.sponsored` | Sponsored |
| `ui.sponsoredWhy` | Sponsored. Why you're seeing this |
| `ui.comingSoon` | Coming soon |
| `ui.offlineCard` | You're offline. Your card still works. |
| `ui.awardsStuck` | {n, plural, one {# award hasn't} other {# awards haven't}} sent for 24 h. Check the connection. |
| `ui.sendingWaiting` | Sending · {n} waiting |
| `ui.offlineSaves` | Offline · awards save on this phone |
| `ui.offlineWaiting` | Offline · {n} waiting to send |
| `ui.backOnline` | Back online · {n} sent |
| `ui.detentHint` | Double-tap to expand or collapse |
| `ui.expanded` | Expanded |
| `ui.collapsed` | Collapsed |
| `ui.validToday` | Valid today |
| `ui.offlineLoad` | You're offline. This will load when you're back. |
| `ui.loadFail` | This didn't load. Check your connection and try again. |
| `ui.notifyMe` | Notify me |
| `ui.notified` | We'll let you know |
| `ui.memberQr` | Your member QR code. Member number {code} |
| `ui.digitCode` | {n}-digit code |
| `ui.perkVisited` | {visited} of {goal} visited |
| `ui.perkDone` | bonus earned |
| `ui.perkA11yDone` | {headline}. {visited} of {goal} visited. Done. |
| `ui.perkA11y` | {headline}. {visited} of {goal} visited. |
| `ui.progressOf` | {value} of {max} |
| `ui.promoPts` | +{n} pts |
| `ui.promoOff` | {n}% off |
| `ui.redeemReward` | Redeem {reward} |
| `ui.redeemedOn` | Redeemed {date} |
| `ui.logoOf` | {shop} logo |
| `ui.muted` | Muted |
| `ui.stampsOf` | {n} of {goal} stamps. |
| `ui.stampReady` | {reward} is ready |
| `ui.stampMore` | {n} more for a {reward} |
| `ui.stampToGo` | {n} to go |
| `ui.stampCarry` | +{n} extra {n, plural, one {stamp carries} other {stamps carry}} over to your next card |
| `ui.stampCarryA11y` | {n} extra carry over. |
| `ui.ticket.intake` | Dropped off |
| `ui.ticket.diagnosing` | Diagnosing |
| `ui.ticket.quote_sent` | Quote ready |
| `ui.ticket.approved` | Approved |
| `ui.ticket.in_progress` | Work started |
| `ui.ticket.waiting_parts` | Waiting for parts |
| `ui.ticket.ready` | Ready for pickup |
| `ui.ticket.picked_up` | Picked up |
| `ui.ticket.declined` | Quote declined |
| `ui.ticket.cancelled` | Cancelled |
| `ui.ticket.done` | done |
| `ui.ticket.current` | current step |
| `ui.ticket.upcoming` | upcoming |
| `ui.order.pending` | Order sent |
| `ui.order.accepted` | Accepted |
| `ui.order.preparing` | Being prepared |
| `ui.order.ready` | Ready for pickup |
| `ui.order.picked_up` | Picked up |
| `ui.order.cancelled` | Cancelled |
| `ui.order.refunded` | Refunded |
| `ui.order.stepSent` | Sent |
| `ui.order.stepPreparing` | Preparing |
| `ui.order.stepReady` | Ready |
| `ui.order.stepPickedUp` | Picked up |
| `ui.order.refundedNote` | Your payment was refunded. |
| `ui.order.readyA11y` | Ready for pickup. Show order {n} at the counter. |
| `ui.order.showAtCounter` | Show this at the counter |
| `ui.order.statusA11y` | {status}. Order {n}. |
| `ui.order.pickupAt` | Pickup at {time} |
| `ui.skeleton.loading` | Loading... |
| `ui.clear` | Clear |
| `ui.delete` | Delete |
| `ui.promoToday` | Today only |
| `ui.promoEndsDay` | Ends {day} |
| `ui.promoEndsDate` | Ends {date} |
| `ui.distM` | {n} m |
| `ui.distKm` | {n} km |
| `ui.distWalk` | {dist} · {n} min walk |
| `ui.reward` | Reward |
| `ui.yesterday` | Yesterday |
| `ui.justNow` | just now |
| `ui.minAgo` | {n} min ago |
| `ui.hAgo` | {n} h ago |
| `ui.hours.open` | Open |
| `ui.hours.closed` | Closed |
| `ui.hours.openCloses` | Open · closes {time} |
| `ui.hours.closedOpens` | Closed · opens {time} |
| `ui.amountOff` | {amount} off |
| `ui.keypad` | Keypad |
| `ui.ring.ready` | {reward} is ready. |
| `ui.ring.toReward` | {n} {unit} to {reward}. |

### `sh.kind.*` kinds of place and `sh.ntd.*` notification descriptions (Settings > Notifications) (34)

| Key | English |
| --- | --- |
| `sh.kind.cafe` | café |
| `sh.kind.restaurant` | restaurant |
| `sh.kind.bakery` | bakery |
| `sh.kind.bar` | pub |
| `sh.kind.grocery` | market |
| `sh.kind.pharmacy` | pharmacy |
| `sh.kind.retail` | shop |
| `sh.kind.bookstore` | bookshop |
| `sh.kind.florist` | florist |
| `sh.kind.pet` | pet shop |
| `sh.kind.salon` | salon |
| `sh.kind.barber` | barber |
| `sh.kind.spa` | spa |
| `sh.kind.fitness` | studio |
| `sh.kind.repair_electronics` | phone repair |
| `sh.kind.repair_auto` | auto shop |
| `sh.kind.alterations` | tailor |
| `sh.kind.dry_cleaning` | dry cleaner |
| `sh.kind.print_shop` | print shop |
| `sh.kind.other` | shop |
| `sh.ntd.points_earned` | After a visit or purchase (at most one per shop every 10 minutes). |
| `sh.ntd.reward_ready` | When you have enough for a reward. |
| `sh.ntd.reward_expiring` | A month before a shop's points expire (only shops that use expiry). |
| `sh.ntd.redeem_confirmed` | Confirmation when you redeem a reward. |
| `sh.ntd.order_ready` | Order accepted, ready for pickup or cancelled. |
| `sh.ntd.ticket_updated` | Status changes on a repair or service ticket, invoices and payments. |
| `sh.ntd.quote_sent` | When a shop sends you a quote to approve. |
| `sh.ntd.booking_reminder` | Reminders for times you booked. |
| `sh.ntd.passport_progress` | Progress on neighbourhood challenges and bonuses. |
| `sh.ntd.tiffin_update` | Your tiffin is out for delivery or delivered, and when a payment fails. |
| `sh.ntd.tiffin_menu` | What's cooking for tomorrow, sent the evening before. Off unless you turn it on. |
| `sh.ntd.catering_update` | Tasting times, your catering quote, deposit receipts and changes to your event. |
| `sh.ntd.hall_update` | Your hall hold, deposit and booking confirmation. |
| `sh.ntd.promo_nearby` | Offers from shops you've joined, when you're close (at most one a day, never 9pm-8am). |

### `cp.*` messages that used to be English-only (empty states, errors, confirmations, consent line) (32)

| Key | English |
| --- | --- |
| `cp.action.getNewCode` | Get a new code |
| `cp.action.notNow` | Not now |
| `cp.ad.whyTitle` | Why you're seeing this |
| `cp.ad.whyBody` | {shop} paid to show this offer to people near {street}. Sponsored posts never change your {terminology}. |
| `cp.ad.link` | Ad settings |
| `cp.consent.sender` | Messages come from {shop}, sent via {brand}. |
| `cp.consent.pushTitle` | Know when you've earned a reward |
| `cp.consent.pushBody` | We'll only notify you about your points, rewards and orders. Offers are off unless you turn them on. |
| `cp.consent.withdrawn` | Done. {shop} won't send you offers. Your {terminology} keep working. |
| `cp.empty.activityBody` | Your {terminology} and rewards will show up here after your first visit. |
| `cp.empty.campaignsTitle` | No passport running nearby |
| `cp.empty.campaignsBody` | When your neighbourhood runs a passport or points weekend, your progress shows up here. |
| `cp.empty.mapSearchTitle` | No shops match "{query}" |
| `cp.empty.mapSearchBody` | Try another word, or zoom out. |
| `cp.empty.noHoodTitle` | We're not on your street yet |
| `cp.empty.noHoodBody` | We launch one neighbourhood at a time. Want us in yours? |
| `cp.empty.ordersTitle` | No orders or repairs yet |
| `cp.empty.ordersBody` | When you order ahead or drop something off, you can follow it here. |
| `cp.empty.walletBody` | Show your card at any shop on the map and your first points land here. |
| `cp.err.location` | Turn on location to see what's closest, or pick your neighbourhood. |
| `cp.err.redeemExpired` | This code expired. Your points weren't used. |
| `cp.err.notEnough` | Not enough {terminology} yet. {n} more to go. |
| `cp.err.offlineRedeem` | You're offline. Reconnect to redeem. |
| `cp.err.sessionExpired` | For your security, please sign in again. |
| `cp.misc.updatedAgo` | Updated {relativeTime} |
| `cp.ok.consentOn` | You'll get offers from {shop}. Change this anytime. |
| `cp.ok.muted` | {shop} is muted. Your {terminology} still work. |
| `cp.ok.unmuted` | {shop} is unmuted. |
| `cp.ok.quoteApproved` | Approved. We've let {shop} know. |
| `cp.ok.redeemCustomer` | Enjoy your {reward}. Confirmed by staff. |
| `cp.ok.saved` | Saved |
| `cp.soon.orderAhead` | Order-ahead. Order and pay before you arrive, and get a text when it's ready. |

### `ms.*` mobile app screens (186)

| Key | English |
| --- | --- |
| `ms.needsApproval` | Needs approval |
| `ms.allShops` | All shops |
| `ms.share` | Share |
| `ms.phone` | Phone |
| `ms.stampsProgress` | {n} / {goal} stamps |
| `ms.order.notFound` | We couldn't find this order. |
| `ms.order.title` | Order #{n} |
| `ms.order.items` | Items |
| `ms.order.payAtPickup` | Pay at pickup. |
| `ms.order.paidInApp` | Paid in the app. |
| `ms.order.payPending` | Payment pending. |
| `ms.order.earned` | You earned {amount}. |
| `ms.order.note` | Note: {note} |
| `ms.order.cancel` | Cancel order |
| `ms.order.cancelTitle` | Cancel this order? |
| `ms.order.cancelBody` | The shop hasn't started it yet. Any reward you used goes back to your card. |
| `ms.order.keep` | Keep order |
| `ms.hist.purchase` | Purchase {amount} |
| `ms.hist.reversed` | This transaction was reversed. |
| `ms.hist.txn` | Transaction {id} |
| `ms.hist.wrong` | Something wrong? Contact {shop}. |
| `ms.noRewardsYet` | This shop hasn't added rewards yet. |
| `ms.camp.a11y` | {name}. {visited} of {goal} shops visited. |
| `ms.camp.badgeLive` | live |
| `ms.camp.badgeSoon` | starts soon |
| `ms.camp.badgeEnded` | ended |
| `ms.camp.gone` | This campaign isn't running any more. |
| `ms.camp.visitedN` | You visited {n, plural, one {# shop} other {# shops}}. |
| `ms.camp.didIt` | You did it. You're entered in the draw. |
| `ms.camp.share` | I finished the {name}! Visit {goal} shops on {hood} to enter. |
| `ms.camp.ended` | This campaign has ended. You visited {n, plural, one {# shop} other {# shops}}. |
| `ms.camp.yourPassport` | Your passport |
| `ms.camp.visitedToGo` | shops visited · {n} to go |
| `ms.camp.gridA11y` | {done} of {goal} shops visited · {n} to go |
| `ms.camp.shopsHead` | Participating shops |
| `ms.redeem.closeKeep` | Close. The code stays open |
| `ms.redeem.codeA11y` | Code {code} |
| `ms.redeem.waiting` | Waiting for staff |
| `ms.redeem.waitingExp` | Waiting for staff · expires in {time} |
| `ms.redeem.cancelCode` | Cancel code |
| `ms.redeem.cancelTitle` | Cancel this code? |
| `ms.redeem.cancelBody` | Your points go back to your card. You can get a new code anytime. |
| `ms.redeem.keep` | Keep code |
| `ms.ref.emptyTitle` | No referral rewards yet |
| `ms.ref.emptyBody` | When a shop you've joined offers a referral bonus, you can invite friends here. |
| `ms.quote.badLink` | This link doesn't work anymore. Contact the shop. |
| `ms.quote.locked` | This quote can't be changed any more. |
| `ms.qr.close` | Close full screen card |
| `ms.qr.label` | Member QR code |
| `ms.qr.tap` | Tap anywhere to close |
| `ms.shop.offNetwork` | This shop isn't on the network right now. |
| `ms.profile.edit` | Edit profile |
| `ms.profile.emailTaken` | That email is used by another account. |
| `ms.profile.emailHint` | For receipts and your data export. |
| `ms.profile.phoneHint` | To change your number, contact support. |
| `ms.notif.on` | Notifications are on. |
| `ms.notif.denied` | Turn notifications on in your phone's settings. |
| `ms.notif.unavailable` | Notifications aren't available on this device yet. |
| `ms.notif.offHint` | Notifications are off. You can turn them on in Settings. |
| `ms.notif.pushHead` | Push notifications |
| `ms.notif.pointsDesc` | When you earn, and when a reward is ready. |
| `ms.notif.ordersDesc` | Order ready, quote to approve, repair updates. |
| `ms.suggest.title` | Suggest my street |
| `ms.suggest.send` | Send suggestion |
| `ms.suggest.intro` | We launch one neighbourhood at a time. Tell us where you shop. |
| `ms.suggest.street` | Street or neighbourhood |
| `ms.suggest.shops` | Shops you'd like to see |
| `ms.session.title` | Sign in again |
| `ms.wallet.inApple` | In Apple Wallet |
| `ms.wallet.inGoogle` | In Google Wallet |
| `ms.wallet.hint` | Opens your phone's wallet |
| `ms.wallet.off` | Wallet passes aren't available right now. Your card in the app works at the counter. |
| `ms.wallet.openFail` | Couldn't open your wallet. Check your connection and try again. |
| `ms.ticket.notFound` | We couldn't find this repair. |
| `ms.ticket.title` | Ticket #{n} |
| `ms.ticket.droppedOff` | Dropped off {date} |
| `ms.ticket.payDeposit` | Pay deposit |
| `ms.ticket.depositDue` | Deposit of {amount} is due. |
| `ms.ticket.quote` | Quote |
| `ms.ticket.invoice` | Invoice #{n} |
| `ms.ticket.depositApplied` | Deposit applied: {amount} |
| `ms.ticket.paid` | Paid. |
| `ms.ticket.paidEarned` | Paid. You earned {amount}. |
| `ms.ticket.willEarn` | You'll earn points at {shop} when you pay. |
| `ms.ticket.pay` | Pay {amount} |
| `ms.camp.shopVisited` | visited |
| `ms.camp.shopNotYet` | not visited yet |
| `ms.wallet.addApple` | Add to Apple Wallet |
| `ms.wallet.addGoogle` | Add to Google Wallet |
| `ms.map.shopsHere` | {n} shops here. Zoom in |
| `ms.map.label` | Map of shops |
| `ms.join.getBonus` | Get {amount} when you join. |
| `ms.join.neverExpire` | Your {unit} never expire unless the shop says otherwise. |
| `ms.join.inAt` | You're in at {shop}. |
| `ms.join.added` | {amount} added. Show your card next visit to keep earning. |
| `ms.join.next` | Show your card next visit and your first points land in your wallet. |
| `ms.redeem.uses` | Uses |
| `ms.redeem.after` | Your balance after |
| `ms.redeem.warn` | Only tap this at the counter. The code lasts 10 minutes. |
| `ms.camp.ofShops` | {visited} of {goal} shops |
| `ms.camp.a11yShops` | {name}. {visited} of {goal} shops. |
| `ms.card.added` | Added {amount}. You have {balance}. |
| `ms.card.claimDup` | That purchase was already added. |
| `ms.card.claimOld` | That receipt is more than 30 days old. |
| `ms.card.claimNotFound` | We couldn't find that receipt at this shop. Check the number on your receipt. |
| `ms.card.claimLimit` | You can claim up to 3 purchases a day per shop. |
| `ms.card.qrHint` | Opens the QR full screen |
| `ms.oa.title` | Order ahead |
| `ms.oa.soldOut` | Something in your order just sold out. Check your cart. |
| `ms.oa.pickupLine` | Pick up at {place}. Pay at pickup. |
| `ms.oa.nothingTitle` | Nothing to order right now |
| `ms.oa.nothingBody` | Check back later. |
| `ms.oa.less` | One less {name} |
| `ms.oa.more` | One more {name} |
| `ms.oa.about` | About {amount} before tax. The shop confirms the total. |
| `ms.oa.note` | Note for the shop |
| `ms.oa.notePh` | Oat milk please |
| `ms.shop.until` | until {time} |
| `ms.shop.opensAt` | opens {time} |
| `ms.shop.hoursNotListed` | hours not listed |
| `ms.shop.hoursCall` | Hours not listed. Call ahead. |
| `ms.shop.earnPerDollar` | {pts} per {amount} |
| `ms.shop.earnStamp` | 1 {unit} per visit · {goal} for a reward |
| `ms.shop.earnVisit` | {amount} per visit |
| `ms.shop.earn` | Earn {line} |
| `ms.shop.showToEarn` | Show your card at the counter to earn. |
| `ms.shop.joinFree` | Join free |
| `ms.shop.rxNoEarn` | Prescriptions don't earn points |
| `ms.shop.paused` | This shop has paused its program. Your {amount} are safe. |
| `ms.shop.showCode` | Show code |
| `ms.shop.codeWaiting` | {reward}: a code is waiting to be shown at the counter. |
| `ms.shop.orderServices` | Order and services |
| `ms.shop.oaSub` | Pick up at the counter, pay there |
| `ms.shop.myTickets` | My tickets here |
| `ms.shop.repairsN` | {n, plural, one {# repair} other {# repairs}} |
| `ms.shop.dropTrack` | Drop off at the counter, then track it here |
| `ms.shop.open` | Open {name} |
| `ms.shop.bothGet` | You both get {amount} |
| `ms.shop.unmute` | Unmute this shop |
| `ms.shop.offersOff` | Offers from this shop are off |
| `ms.shop.muteSub` | No offers from this shop. Your {unit} keep working. |
| `ms.shop.yourVisits` | Your visits |
| `ms.shop.seeAll` | See all |
| `ms.shop.askCounter` | Ask at the counter |
| `ms.shop.getDirections` | {address}. Get directions |
| `ms.shop.showCardRedeem` | Show my card to redeem |
| `ms.cat.all` | all |
| `ms.cat.eat` | eat |
| `ms.cat.bakery` | bakery |
| `ms.aud.mine` | my shops |
| `ms.aud.new` | new to me |
| `ms.map.openNow` | open now |
| `ms.map.show` | Show |
| `ms.map.showA11y` | Show: {label} |
| `ms.map.searchPlace` | Search {place} |
| `ms.map.searchPh` | Search shops or streets |
| `ms.map.closeSearch` | Close search |
| `ms.map.showMap` | Show map |
| `ms.map.showList` | Show list |
| `ms.map.showAsList` | Show as a list |
| `ms.map.hoodA11y` | Neighbourhood: {name}. Change |
| `ms.map.notSet` | not set |
| `ms.map.yourStreet` | your street |
| `ms.map.notifUnread` | Notifications, {n} unread |
| `ms.map.clearSearch` | Clear search |
| `ms.map.noMatch` | Nothing matches those filters |
| `ms.map.seeNear` | See shops near you |
| `ms.map.allowWhile` | Allow while using |
| `ms.map.locWhy` | We use your location only while the app is open, to sort shops by distance. Or pick your neighbourhood. |
| `ms.map.yourHood` | Your neighbourhood |
| `ms.map.useLoc` | Use my location |
| `ms.map.inPlace` | in {place} |
| `ms.map.onStrip` | on this street |
| `ms.map.nearby` | nearby |
| `ms.map.searchHere` | search here |
| `ms.map.recenter` | Recenter on my location |
| `ms.map.backToMap` | Back to map |
| `ms.map.closeShop` | Close shop |
| `ms.map.shopFail` | This shop didn't load. |
| `ms.disc.nearest` | nearest |
| `ms.disc.yourProgress` | your {n} / {goal} |
| `ms.perk.line` | Visit {n} shops {window} → +{pts} |
| `ms.perk.lineWhere` | Visit {n} shops on {place} {window} → +{pts} |
| `ms.perk.month` | this month |
| `ms.perk.week` | this week |
| `ms.perk.days` | in {n} days |

### `wp.*` web pass pages (public pages a customer opens) (92)

| Key | English |
| --- | --- |
| `wp.t.run` | Your run |
| `wp.t.invoice` | Your invoice |
| `wp.t.quote` | Your quote |
| `wp.t.pay` | Pay |
| `wp.t.changePay` | Change payment method |
| `wp.t.split` | Your share of the bill |
| `wp.t.review` | How was your visit? |
| `wp.t.preorder` | Pre-order a degh |
| `wp.t.preorderDesc` | Reserve a degh at {shop}: pick the size, the day and a pickup window. |
| `wp.t.banquetDesc` | Halls, packages and open dates at {shop}. |
| `wp.t.bookDesc` | Pick a stylist, services and a time at {shop}. |
| `wp.t.cateringDesc` | Ask {shop} for a catering quote. |
| `wp.t.menuDesc` | See the menu at {shop}. Halal, vegetarian and spice levels shown. |
| `wp.t.tiffinDesc` | Home-style meals on a weekly or monthly plan from {shop}. |
| `wp.t.discoverDesc` | What's on along your street: the live neighbourhood campaign and the shops near you. |
| `wp.t.mapTitle` | Shops near you |
| `wp.t.mapDesc` | Every independent shop on the network, near you. |
| `wp.t.shopEarn` | Earn rewards at {shop} |
| `wp.t.joinDesc` | Earn rewards at {shop}. No app needed. Free. Takes 30 seconds. |
| `wp.t.campaign` | Neighbourhood campaign |
| `wp.t.campaignDesc` | Visit {goal} shops on {hood} between {from} and {to}. |
| `wp.err.campaign` | Can't load this campaign right now |
| `wp.err.shops` | Can't load shops right now |
| `wp.err.card` | Can't load your card right now |
| `wp.err.order` | Can't load your order right now |
| `wp.err.shop` | Can't load this shop right now |
| `wp.order.goneTitle` | We couldn't find that order |
| `wp.order.goneBody` | It may belong to another account. Check the link in your text. |
| `wp.cal.pickupCode` | Pickup code {code} |
| `wp.cal.payAtPickup` | Pay {amount} at pickup |
| `wp.cal.dropoff` | {shop}: drop-off |
| `wp.t.shop` | Shop |
| `wp.shop.youHave` | You have |
| `wp.shop.noOffers` | No offers right now. Members hear about new ones first. |
| `wp.shop.visit` | Visit |
| `wp.shop.locationsN` | {n} locations |
| `wp.shop.hoursCaption` | Opening hours |
| `wp.shop.moreOn` | More shops on {hood} |
| `wp.shop.pharmacyRule` | Prescriptions and pharmacy services don't earn points, as Ontario rules require. |
| `wp.cat.label` | Categories |
| `wp.os.order` | Order |
| `wp.os.paid` | Paid in the app |
| `wp.os.pending` | Payment pending |
| `wp.os.earned` | You earned {amount} |
| `wp.cal.pickupAt` | Pick up at {shop} |
| `wp.ui.carry` | +{n} on your next card |
| `wp.ui.newTab` | (opens in a new tab) |
| `wp.ui.muted` | (muted) |
| `wp.ui.member` | Member |
| `wp.ui.joinCarry` | Join to carry this card |
| `wp.ui.selectedDays` | On selected days |
| `wp.ui.bonusPoints` | Bonus points |
| `wp.ui.discount` | Discount |
| `wp.ui.multiplier` | {n}x points |
| `wp.ui.startsOn` | Starts {date} |
| `wp.step.done` | Done: |
| `wp.step.current` | Current: |
| `wp.step.stopped` | Stopped: |
| `wp.step.waiting` | Waiting: |
| `wp.step.next` | Next: |
| `wp.step.progress` | Progress |
| `wp.os.refund` | Refund: {amount} back to your card. |
| `wp.os.pickupShort` | pickup {time} |
| `wp.os.progress` | Order progress |
| `wp.rc.enjoy` | Enjoy your {reward}. |
| `wp.rc.code` | Code {code} |
| `wp.rc.showStaff` | Show this code to staff. Your points are used when they confirm. |
| `wp.rc.expiresIn` | Expires in {time} |
| `wp.rc.expired` | This code expired. Tap Redeem to get a new one. |
| `wp.rc.cancelKeep` | Cancel and keep my points |
| `wp.map.viewLabel` | View |
| `wp.map.list` | List |
| `wp.map.searchPh` | Search coffee, books, repair |
| `wp.map.failed` | The map couldn't load on this device, so here's the list. |
| `wp.map.hood` | Neighbourhood |
| `wp.map.everywhere` | everywhere |
| `wp.map.dismiss` | Dismiss |
| `wp.map.nothing` | nothing here with these filters |
| `wp.map.showAll` | Show all shops |
| `wp.map.sorted` | Sorted by distance from you |
| `wp.map.balance` | Your balance |
| `wp.map.offerOn` | An offer is on now. Members hear about new ones first. |
| `wp.map.view` | View |
| `wp.map.moreHere` | {n} more here, zoom in |
| `wp.map.youHere` | You are here |
| `wp.wallet.off` | Wallet passes aren't available right now. Your card at /me works at the counter. |
| `wp.shop.tabs` | Shop |
| `wp.pay.declined` | Your card was declined. Try another card or payment method. |
| `wp.map.yourBal` | your {amount} |
| `wp.map.offerNow` | offer on now |
| `wp.map.hasOffer` | has an offer |
| `wp.w.wayTo` | {pct}% of the way to {reward} |

### `ob.*` shop onboarding: nudge texts (SMS and email to the owner, written in the owner's language) and the dashboard activation card (70)

| Key | English |
| --- | --- |
| `ob.nudge.d1.subject` | Give your first stamp at {shop} |
| `ob.nudge.d1.body` | {shop} is set up but nobody has been stamped yet. It takes three minutes: scan your own QR, then add a stamp. {url} |
| `ob.nudge.d3.subject` | {n} on the card so far |
| `ob.nudge.d3.body` | {shop}: {n, plural, one {# member} other {# members}} so far. Try saying this at the till today: "{till}" {url} |
| `ob.nudge.d7.subject` | A week in: {n} members |
| `ob.nudge.d7.body` | {shop} has {n} members after a week. Shops that reach {lead} by day {day} almost always reach {target}. {left} to go. {url} |
| `ob.nudge.d14.subject` | Two weeks in: {n} members |
| `ob.nudge.d14.body` | {shop} has {n} members at day 14, a little behind. We will call you this week to help you get the next few. {url} |
| `ob.nudge.d25.subject` | {days} days left to reach {target} |
| `ob.nudge.d25.body` | {shop} is {left} members from active. {days} days left in your first 30. {url} |
| `ob.stopLine` | Reply STOP to stop |
| `ob.smsFoot` | {stop}, or unsubscribe: {url} |
| `ob.emailFoot` | {brand} sent this because you set up a shop with us. Stop these setup reminders: {url} |
| `ob.step.program` | Program confirmed |
| `ob.step.first_stamp` | Give your first stamp |
| `ob.step.qr_kit` | Print the QR stand |
| `ob.step.staff` | Staff and counter app |
| `ob.step.first_members` | First {target} members |
| `ob.step.profile` | Logo, about text and GST/HST |
| `ob.step.pos` | Connect your POS |
| `ob.step.waiting` | Waiting for your first stamp |
| `ob.step.team` | {n} team member(s) |
| `ob.step.members` | {have} of {target} members have visited |
| `ob.src.counter` | At the counter, asked by staff |
| `ob.src.qr` | QR stand |
| `ob.src.link` | Join link |
| `ob.src.other` | Other |
| `ob.min.under` | under a minute later |
| `ob.min.min` | {n} min later |
| `ob.min.hours` | {n} h later |
| `ob.min.day` | day {n} |
| `ob.ms.signedUp` | Signed up |
| `ob.ms.firstStamp` | First stamp |
| `ob.ms.members` | {n} members |
| `ob.ms.notYet` | Not yet |
| `ob.ms.day` | Day {n} |
| `ob.ms.needs` | Needs {n} more |
| `ob.pace.activated` | Active shop |
| `ob.pace.ahead` | Ahead of pace |
| `ob.pace.on_track` | On pace |
| `ob.pace.behind` | Behind pace |
| `ob.pace.late` | Past day 30 |
| `ob.pace.dayOf` | {label} · day {day} of {total} |
| `ob.move.first.cta` | Stamp yourself |
| `ob.move.active.title` | You are an active shop |
| `ob.move.active.body` | Your regulars are on the card. Connect your POS so stamps happen on their own. |
| `ob.move.active.cta` | Connect POS |
| `ob.move.qr.body` | Customers join in 30 seconds with no app. Put it next to the card machine. |
| `ob.move.staff.title` | Add your first cashier |
| `ob.move.staff.body` | Every person at the till can stamp from their own phone, and members join faster when staff ask. |
| `ob.move.staff.cta` | Add staff |
| `ob.move.best.title` | Best next move |
| `ob.move.best.body` | Say it at the till: "{till}"{tail} |
| `ob.move.best.tail` | {counter} of your {members} joined at the counter, {qr} from the QR stand. |
| `ob.move.best.cta` | Open counter |
| `ob.card.title` | Your first 30 days |
| `ob.card.membersLine` | {members} of {target} members {members, plural, one {has visited} other {have visited}} |
| `ob.card.activeMembers` | Active members |
| `ob.card.pace` | {lead} by day {day} is the pace that gets you to {target} |
| `ob.card.targetLine` | {target} = active shop |
| `ob.card.milestones` | Milestones |
| `ob.card.reached` | (reached) |
| `ob.card.notYet` | (not yet) |
| `ob.card.sources` | Where members came from |
| `ob.card.none` | Nobody has joined yet. |
| `ob.card.setupLeft` | Setup left |
| `ob.card.guide` | Setup guide |
| `ob.card.doIt` | Do it |
| `ob.card.optional` | Optional |
| `ob.card.allSet` | Everything is set up. |


### Expired repair link and unsubscribe pages (`sv.t.expired*`, `unsub.*`) (13)

Added by the `perf` pass. The unsubscribe pages are rendered by the API (`apps/api/src/lib/unsubscribe-page.ts`) in the reader's language (`?lang=`, else `Accept-Language`), with `dir="rtl"` for Urdu. They are the pages a customer or shop owner sees after tapping the unsubscribe link in an email or text, so the confirm button must say plainly what it does, and the "nothing changes until you press the button" line must stay (a mail scanner opens the page too). The glossary terms used: subscribe / unsubscribe (सब्सक्राइब / سبسکرائب / ਸਬਸਕ੍ਰਾਈਬ), reward (रिवॉर्ड / انعام / ਰਿਵਾਰਡ), redeem (रिडीम / ریڈیم / ਰੀਡੀਮ), repair (रिपेयर / مرمت / ਮੁਰੰਮਤ), expiry (मियाद ख़त्म, میعاد ختم, ਮਿਆਦ ਖ਼ਤਮ). Open question for the reviewer: Hindi and Punjabi use the English-derived "अनसब्सक्राइब / ਅਨਸਬਸਕ੍ਰਾਈਬ" because that is the word on the email apps' own buttons; Urdu uses "سبسکرائب ختم کریں" ("end the subscription").

| Key | English |
| --- | --- |
| `sv.t.expiredTitle` | This status link has expired |
| `sv.t.expiredBody` | Repair status links stop working {days} days after the job closes. Contact {shop} if you need anything about this repair. |
| `unsub.confirmTitle` | Unsubscribe from {shop}? |
| `unsub.confirmBody` | You'll stop getting offers from {shop}. You'll still earn and redeem rewards there as usual. |
| `unsub.confirmButton` | Unsubscribe |
| `unsub.doneTitle` | You're unsubscribed |
| `unsub.doneBody` | You won't get offers from {shop} any more. You'll still earn and redeem rewards there as usual. |
| `unsub.nudge.confirmTitle` | Stop setup reminders for {shop}? |
| `unsub.nudge.confirmBody` | We'll stop sending setup reminders. Your account and your shop are not affected, and you can turn reminders back on from the setup page. |
| `unsub.nudge.confirmButton` | Stop reminders |
| `unsub.nudge.doneTitle` | No more setup reminders |
| `unsub.nudge.doneBody` | We won't send setup reminders for {shop} any more. Your account and your shop are not affected, and you can turn reminders back on from the setup page. |
| `unsub.leave` | Nothing changes until you press the button. You can close this page. |

### Restaurant menu section names (`apps/api/src/seed/restaurantMenuCategories.ts`) (23)

Added by the `tail` pass. The tab names on the demo restaurants' public menus (`?lang=hi|ur|pa`, stored in `merchant_categories.translations`). Owners can now edit them in the dashboard (Restaurant > Menu > Section names). Terms follow the glossary: pre-order is प्री-ऑर्डर / پیشگی آرڈر / ਪ੍ਰੀ-ਆਰਡਰ; "degh" (the pot) stays as the shops say it. Open question for the reviewer: "Kottu" is written phonetically in all three scripts, and "farsan" is kept in Hindi and Punjabi because that is the shop word.

| English | Hindi | Urdu | Punjabi |
| --- | --- | --- | --- |
| Biryani | बिरयानी | بریانی | ਬਿਰਯਾਨੀ |
| Biryani & rice | बिरयानी और चावल | بریانی اور چاول | ਬਿਰਯਾਨੀ ਤੇ ਚੌਲ |
| Curries | करी | سالن | ਕਰੀ |
| Karahi & curries | करी और कड़ाही | کڑاہی اور سالن | ਕੜਾਹੀ ਤੇ ਕਰੀ |
| Tandoor | तंदूर | تندور | ਤੰਦੂਰ |
| Tandoor & grill | तंदूर और ग्रिल | تندور اور گرل | ਤੰਦੂਰ ਤੇ ਗ੍ਰਿਲ |
| Breads | रोटियाँ | روٹیاں | ਰੋਟੀਆਂ |
| Sides & raita | साइड और रायता | سائیڈز اور رائتہ | ਸਾਈਡ ਤੇ ਰਾਇਤਾ |
| Sweets & chai | मिठाई और चाय | میٹھا اور چائے | ਮਿੱਠਾ ਤੇ ਚਾਹ |
| Desserts | मीठा | میٹھا | ਮਿੱਠਾ |
| Drinks | पेय | مشروبات | ਪੀਣ ਵਾਲੇ ਪਦਾਰਥ |
| Pre-order pots | प्री-ऑर्डर देग | پیشگی آرڈر دیگ | ਪ੍ਰੀ-ਆਰਡਰ ਦੇਗ |
| Thalis | थाली | تھالی | ਥਾਲੀ |
| Snacks & farsan | नाश्ता और फरसाण | ناشتہ اور فرسان | ਨਾਸ਼ਤਾ ਤੇ ਫਰਸਾਣ |
| Snacks | नाश्ता | ناشتہ | ਨਾਸ਼ਤਾ |
| Chaat & snacks | चाट और नाश्ता | چاٹ اور ناشتہ | ਚਾਟ ਤੇ ਨਾਸ਼ਤਾ |
| Mains | मुख्य व्यंजन | مین ڈشز | ਮੁੱਖ ਪਕਵਾਨ |
| Kottu roti | कोट्टू रोटी | کوتّو روٹی | ਕੋੱਟੂ ਰੋਟੀ |
| Hoppers & rice | हॉपर्स और भात | ہاپرز اور چاول | ਹੌਪਰਜ਼ ਤੇ ਚੌਲ |
| Dumplings | डम्पलिंग्स | ڈمپلنگز | ਡੰਪਲਿੰਗ |
| Mithai | मिठाई | مٹھائی | ਮਿਠਾਈ |
| Festival boxes | त्योहार बॉक्स | تہوار باکس | ਤਿਉਹਾਰ ਡੱਬੇ |
| Catering packages | कैटरिंग पैकेज | کیٹرنگ پیکجز | ਕੈਟਰਿੰਗ ਪੈਕੇਜ |

### `rx.*` pharmacy order-ready text, reminders and booking privacy line (6)

Added Oct 26, 2026 with the pharmacy vertical (`docs/research/pharmacies-wellness.md`). Read by seniors, so plain words. Not yet read by a native speaker.

- `rx.pickup.ready`: "{shop}: your order is ready for pickup." The one fixed order-ready text. It must never say what the order is; do not add a word for "medicine" or "prescription".
- `rx.pickup.title`: "{shop}: order ready" (push title and inbox title).
- `rx.appt.word`: "appointment". Used in place of the service name in reminders, so a lock screen never says "flu shot". Use the common spoken loanword (अपॉइंटमेंट, اپائنٹمنٹ, ਅਪਾਇੰਟਮੈਂਟ), not a formal medical term.
- `rx.book.privacyTitle`, `rx.book.privacyBody`: "No notes, no health details" and "We only record that you booked. Bring your health card to the pharmacy." Shown in place of the notes field at a pharmacy.
- `rx.book.noCharge`: "No charge here". Shown instead of a price on a pharmacy appointment type.

### `gr.*` grocer and butcher texts, flyer and pantry reminders (20)

Added Oct 27, 2026 with the grocer vertical (`docs/research/grocers.md`). Not yet read by a native speaker.

- `gr.msg.restock`, `gr.msg.restockTitle`: the consent-based "your {item} may be running out" text, always with the STOP line. Keep it a question, never a promise that stock is low.
- `gr.msg.weighed`: the text after the butcher weighs an order: weight, final total, balance due at pick-up.
- `gr.flyer.*`: the weekly flyer on the shop page. "Member" is the price for card holders; "per 100 g" is the unit price line (Ontario shoppers compare by it).
- `gr.butcher.*`: the butcher counter on the shop page. `scaleNote` says the final price is set on the scale at pick-up. Use the shop-floor words (तराज़ू, ترازو, ਤੱਕੜੀ), not formal ones.
- `gr.pantry.*`: "your pantry" on the shopper's pass: the list of bulk items with a reminder switch. Keep "STOP" in Latin letters.

| English | Hindi | Urdu | Punjabi |
| --- | --- | --- | --- |
| Butcher counter | मीट काउंटर | میٹ کاؤنٹر | ਮੀਟ ਕਾਊਂਟਰ |
| Weekly deals | इस हफ़्ते की डील | اس ہفتے کی ڈیلز | ਇਸ ਹਫ਼ਤੇ ਦੀਆਂ ਡੀਲਾਂ |
| Pantry | रसोई का स्टॉक | کچن کا اسٹاک | ਰਸੋਈ ਦਾ ਸਟਾਕ |

### v4 open items: restock page, Eid pick-up days, pharmacy reminder card, class screens in the app (28)

Added Oct 27, 2026 (grocers, fitness studios and pharmacies open items). Written by the build team in all four languages, not yet read by a native speaker. Placeholders and plural branches match across the four languages.

- `gr.restock.*` (12): the one-item reserve page a restock text opens (`/shops/<slug>/restock/<itemId>`). `ready` is "price, ready Saturday from 9 am"; `window` is a pick-up window "Sat 9 am to 12" (the end is the hour alone); `remind` is a plural ("every week", "every # weeks"); `payNote` says nothing is charged now (the order is paid at the counter); `turnOff` is a quiet text link, not a button; `goneTitle` and `goneBody` are shown when the item was switched off or has no catalog item.
- `gr.pre.eid`, `gr.pre.eidMoved` (2): the line under a qurbani item: "Eid al-Adha, {date} (date confirmed after moon sighting)." or "(moved after moon sighting)". Use the community's name for the festival (ईद अल-अज़हा, عید الاضحیٰ, ਈਦ ਅਲ-ਅਜ਼ਹਾ) and the plain word for moon sighting ("चाँद दिखने", "چاند نظر آنے", "ਚੰਨ ਦਿਸਣ").
- `rx.appt.reminder` (1): the one fixed pharmacy reminder text, "{shop}: your appointment is {when}. Change it: {link}." It is the exact SMS the pharmacy customer gets (the STOP line is added after it) and it is shown in the booked screen. It must never name the service: use the loanword for appointment (अपॉइंटमेंट, اپائنٹمنٹ, ਅਪਾਇੰਟਮੈਂਟ) and no word for vaccine, shot, medicine or prescription.
- `rx.book.reminderTitle` (1): "Reminder we will send", the small heading of that card.
- `cl.app.*` (12): the class screens in the Expo app (`apps/mobile/src/app/classes`). `shopRow` and `shopRowSub` are the row on the shop page; `tabSchedule` and `tabCard` the bottom tabs (the middle tab reuses `cl.ui.passes.title`); `joinTitle` ("Join {name}") and `readFirst` the agreement screen; `payOnWeb` says card payment happens on a secure web page, then the person comes back; `renews`, `minutes`, `zeroToday` and `anyClass` are short fragments on the schedule, the booking sheet and the passes screen. The rest of those screens reuses the `cl.ui.*` strings the web pages already carry.

| English | Hindi | Urdu | Punjabi |
| --- | --- | --- | --- |
| Reserve it | रिज़र्व करें | ریزرو کریں | ਰਿਜ਼ਰਵ ਕਰੋ |
| Pick-up time | पिकअप का समय | پک اپ کا وقت | ਪਿਕਅੱਪ ਦਾ ਸਮਾਂ |
| Reminder we will send | हम यह रिमाइंडर भेजेंगे | ہم یہ یاد دہانی بھیجیں گے | ਅਸੀਂ ਇਹ ਰਿਮਾਈਂਡਰ ਭੇਜਾਂਗੇ |
| Schedule | शेड्यूल | شیڈول | ਸ਼ੈਡਿਊਲ |
