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
numbers and currency stay with the formatters. Only values were edited. No key was added or removed.

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

