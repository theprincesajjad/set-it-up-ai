# The shopper's experience: card, wallet, pass, alerts, privacy and the street

Oct 24, 2026 · Market: **the shopper in the GTA, on the web pass (`/for-shoppers`, `/join`, `/me`, `/discover`, `/map`, `/c/<id>`) and in the Expo app (wallet, discover, map, activity, you, card)** · Figma: [Local Loyalty — shopper app](https://www.figma.com/design/Xv2ZAI99E7nBHZfiDyXjWo)

Tags used for numbers: **(W)** read on the source page · **(S)** seen only in a search-result summary, page not opened or translated copy only · **(E)** our estimate · **(code)** read from this repo.

---

## 1. Who this is for

The shopper is not the buyer. A shop owner or a BIA pays; the shopper decides in under a minute, usually at a counter, usually with a queue behind them, whether to give a phone number to a stranger's card.

| Shopper | What they do today | What they ignore | Where |
| --- | --- | --- | --- |
| **The regular** (café, bakery, bookshop, salon) | Carries a paper stamp card or a PC Optimum / Scene+ / Tims card; walks the same street every week | Any shop-specific app; texts from places they joined once | Roncesvalles, the Danforth, Bloor West, Mississauga plazas |
| **The multilingual family** (Punjabi, Urdu, Hindi at home; English outside) | Orders by WhatsApp, pays cash or tap, shares a phone with a partner or parent | English-only alerts and forms; anything that needs a password | Gerrard India Bazaar, Ridgeway Plaza, Brampton |
| **The street walker** (comes for a festival, a passport, a friend's tip) | Follows a BIA link or a flyer QR; tries 3 shops in a day | A loyalty program that rewards only one shop | Any BIA street with a live campaign |

### What the evidence says (and how sure we are)

- **App fatigue is the default.** Canadians belong to 22 loyalty programs and use 9 regularly, about 41% (S, [LoyalT 2025](https://dmn.ca/announcing-the-2025-edition-of-loyalt-the-most-comprehensive-study-of-canadian-retail-loyalty-program-performance/)); an earlier LoyalT read 19 programs and 7 in regular use, regular use down from 50% to 36% (S, [Strategy](https://strategyonline.ca/?p=301403)); a Bond 2026 preview says 28% of members redeem once a year or less and estimates $13 to 15 billion in unredeemed points (S, [preview article](https://thewisemarketer.com/2026-bond-loyalty-report-shows-canadians-are-sitting-on-13-15-billion-in-unredeemed-loyalty-points/), not the report). The definitions differ per survey, so quote the direction, not a single number. **Implication:** the promise is "no new app", and the card must show something a seventh shop card cannot.
- **Fewer fields, no app.** 76% of Americans said they were more likely to join a program that asks only for a name and phone number (S, Harris Poll for Wilbur, a vendor that sells exactly that, so treat as directional, [report](https://mytotalretail.com/article/survey-consumers-less-likely-to-join-a-loyalty-program-that-collects-personal-data-or-requires-an-app)); 19% had downloaded a restaurant brand's app (S, Deloitte-linked survey); 70% would be more willing to sign up if guaranteed their data is not passed on (S, Technomic). Our join is already phone, code, first name. **Keep it.**
- **Wallet passes are a second copy, not the front door.** Oracle Hospitality found mobile wallets the least popular way to manage loyalty, 14% globally (S, [HospitalityTech summary](https://hospitalitytech.com/more-half-customers-around-world-want-restaurants-offer-loyalty-programs-mobile-app), global and dated). **Implication:** the QR on the web card and the typed member code stay primary; "Add to Wallet" is one optional button for the phone in hand.
- **Notification limits have no neutral threshold.** Braze's survey: 25% who opted out said they got too many pushes (S, [Braze](https://www.braze.com/resources/articles/opt-out-of-push-notifications-why-users-do-it)); vendor posts put the danger zone anywhere from 2 to 10 a week with no method shown; a "1 a week → 10% disable" figure could not be traced. Google caps notifying wallet messages at 3 per 24 hours per object (S, [Google Wallet docs](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications), translated copies read). **Implication:** do not pretend to know the magic number. Set a budget by design, state it in the settings screen, keep everything in the inbox.
- **Apple passes carry at most 10 locations** and show their text on the lock screen when the phone is near (S, [PassKit](https://help.passkit.com/en/articles/2010114-how-many-locations-will-trigger-a-lock-screen-message), [Pushwoosh](https://www.pushwoosh.com/blog/wallet-pass-lock-screen-locations/)). Already built (code); the text is what was missing in the shopper's language.
- **Language.** Statistics Canada, 2021 Census, Toronto CMA: immigrants with Punjabi as a mother tongue 130,395 (4.6%, third) and Urdu 101,955 (3.6%, fifth) (S, [StatCan Focus on Geography](https://www12.statcan.gc.ca/census-recensement/2021/as-sa/fogs-spg/page.cfm?lang=E&topic=9&dguid=2021S0503535), immigrants only); 26.3% of Toronto residents mostly speak a language other than English or French at home (S, StatCan 2021 promotional material). We did not find all-resident Hindi, Punjabi and Urdu counts for the CMA; do not quote one.
- **Consent and data.** CASL: express consent is the default, the sender must be able to prove it, unsubscribe must be honoured within 10 business days, a text needs a reply option and a web link (S, university and vendor compliance pages, [Queen's](https://www.queensu.ca/secretariat/legal-counsel/casl/how-comply-casl); confirm against the CRTC text before quoting to a customer). PIPEDA has no explicit deletion right but limits retention to purpose and lets people withdraw consent (S, [TrueVault](https://knowledge.truevault.com/article/319-pipeda-overview), secondary).
- **A street passport can matter.** Peterborough's DBIA Holiday Shopping Passport (a stamp per $10, 200+ businesses) reports $2.3 to 2.6 million in local spending and participation up 15% in one season (S, DBIA-reported and unaudited, [PTBO Canada](https://www.ptbocanada.com/journal/peterborough-dbia-holiday-shopping-passport-initiative-shows-thousands-of-dollars-spent-locally)). No Toronto passport publishes outcomes (see `landing-and-network.md`). **Implication:** the passport is the one thing a shared card can show that a single shop's card cannot, so the card must show it.
- **Ritual (Toronto)** earned its own network by making one app work across hundreds of locations, with 10 points per dollar (S, [MobileSyrup 2016](https://mobilesyrup.com/2016/06/01/ritual-claims-title-of-largest-food-and-beverage-loyalty-program-in-toronto/), old). It is an ordering app; ours must not need ordering to be useful.

---

## 2. Mobbin: what each reference taught us

| Screen | What it taught | Where it landed |
| --- | --- | --- |
| [Starbucks rewards menu](https://mobbin.com/screens/d710b636-5dbc-42fc-8cd5-85ffea6a5b8c), [Starbucks home](https://mobbin.com/screens/0320a019-4821-47a5-9dd4-fef9c4e1748c) | One balance, one "scan" action, status separate from offers | Wallet keeps one honest number; the card button stays a separate round control |
| [Chipotle points](https://mobbin.com/screens/39d407c1-15fd-4a32-a29e-443863cf8987) | "Forgot to scan?" sits beside the balance | Card sheet keeps "Forgot to scan? Claim a purchase" |
| [Everyday Rewards](https://mobbin.com/screens/c0d07517-325a-4d5c-8663-575ade1f2f00) | A progress bar to the next reward under the balance; a dismissible "boosters" row | Closest-reward bar kept; street block is our one "booster", shown only when live |
| [Ulta rewards](https://mobbin.com/screens/8f67ab22-1545-455e-86c8-cc2ee085d676) | "Points expiring" is its own row, not buried | Expiry rule stays next to each balance |
| [Too Good To Go home](https://mobbin.com/screens/e17c9d53-ac3c-488e-ae6d-58a3bf51cb13) and [store page](https://mobbin.com/screens/dd73f5fb-1631-46eb-868a-d8d89c68b075) | Location first, category chips, a "notification is on" pill per store | Discover keeps location + chips; per-shop mute stays in Privacy |
| [NYT notifications](https://mobbin.com/screens/2eb2f3b8-3992-4c41-bbca-e469d3bb6c61), [Fresha notification settings](https://mobbin.com/screens/fda7f9f7-3b82-413d-ac4b-0a98251a657a) | Group switches by purpose, a sentence under each; marketing separated from transactional with the STOP rule stated | Settings groups: points · orders · offers, each with its limit in words |
| [Instacart invite](https://mobbin.com/screens/803d323a-b046-4681-be4a-d058bcfaf9af), [Yami invite](https://mobbin.com/screens/f4582d60-aff1-4f75-99cc-7a4a7736691e), [TheFork](https://mobbin.com/screens/4d150cbe-8a99-4faa-bc52-8f75ec8c9c33) | One big share button above the code; counts below | Invite sheet: WhatsApp first, "more ways" second, invited / rewarded counts |
| [Neo food and drink rewards](https://mobbin.com/screens/4b2082a4-4cb8-49d2-836d-5969dcf14b75) | A flat list of nearby places with the reward at the right edge | Discover rows: shop, distance, "reward ready" tag |

PC Optimum and Tim Hortons did not come back as named results on Mobbin; we cite none. Corner and Hypelist are already studied in `docs/design/foundations.md`.

---

## 3. Jobs to be done (shopper), ranked by frequency × pain

1. **Get recognised at the counter in seconds**, offline, without opening an app (card QR and member code).
2. **Know if something is waiting for me** without doing arithmetic across shops (rewards ready first, never points plus stamps).
3. **Join without friction and without regret** (phone, code, first name; offers are separate, unticked).
4. **Read it in my language**, including the texts and the lock-screen message (hi, ur, pa; Urdu right to left).
5. **Not be spammed**: quiet hours, a daily budget, a way to mute one shop or one kind of message.
6. **Have a reason to carry one card down the whole street** (passport progress, neighbourhood bonuses).
7. **Bring a friend** the way families already do: WhatsApp.
8. **See and control my data**: per-shop offer consent with the date, export, delete.
9. **Keep my points when I lose or change phones** (phone sign-in; wallet pass as a second copy).

---

## 4. What we build and why

### 4.1 Audit of the current build (read from source, then checked in the running app)

| # | Component | Job | Verdict | Reason |
| --- | --- | --- | --- | --- |
| 1 | `/for-shoppers` hero copy, CTAs, store links | 3 | **Keep** | Says free, no app, no expiry in one line |
| 2 | `/for-shoppers` two hero phones (wallet + card) | none | **Cut** | Decoration. One phone shows what they will hold (their card) |
| 3 | `/for-shoppers` map phone next to the neighbourhood chips | none | **Cut** | The chips are the proof; the phone repeated them |
| 4 | `/for-shoppers` steps | 1, 3 | **Change** | Step 2 now says the wallet pass is optional |
| 5 | `/for-shoppers` "where your card works" chips | 6 | **Keep, change** | Adds the live street campaign, only while one is on |
| 6 | `/for-shoppers` data cards | 8 | **Keep** | Each claim maps to a control in `/me` |
| 7 | `/for-shoppers` English only | 4 | **Change** | Whole page in four languages; header language menu |
| 8 | Wallet hero number + shop rows (web and app) | 2 | **Keep** | Already honest; already follows the canvas |
| 9 | Web wallet: no passport row | 6 | **Change** | The app had it, the web did not; added "on your street" |
| 10 | Web **Activity** tab = points history only; the bell on Discover and the avatar both link to it | 2 | **Change** | The inbox sat at the bottom of Settings, so "Notifications" opened a ledger. Activity is now the inbox first, points history below |
| 11 | Notification settings: 14 types × per-channel switches | 5 | **Keep, change** | Same switches, now in the shopper's language with the budget stated; the English-only server descriptions are hidden in other languages |
| 12 | Push for every earn (one per shop per 10 minutes) | 5 | **Change** | A shopper on a passport gets one per shop. Budget of 3 routine pushes a day across all shops; the inbox keeps every one |
| 13 | Pushes, texts, wallet pass and invite text in English only | 4 | **Change** | `users.locale` existed but the app language lived on the phone and the API rejected hi/ur/pa. Locale is saved on sign-in and in Settings; every server message uses it |
| 14 | Wallet pass fields and lock-screen text | 1, 4 | **Change** | Written in the shopper's language; layout, QR and member code unchanged |
| 15 | Card sheet: QR, code, one wallet button for this phone, claim a purchase | 1 | **Keep** | Each element has a job |
| 16 | Web shop sheet: shop page button only | 7 | **Change** | Adds "Invite a friend" when the shop has referrals on |
| 17 | Invite screen (app): OS share sheet, link text doubled (the API text already holds the link) | 7 | **Change** | WhatsApp button first, text sent once, in the inviter's language |
| 18 | Web and app privacy: consent per shop with date, mute, export, delete | 8 | **Keep** | Localized strings only |
| 19 | App: You, Wallet, Activity, Settings, Privacy, Shops screens in English | 4 | **Change** | All headings, rows and messages through the catalog |
| 20 | Discover (web): hero for the live campaign, chips, near-you, rows | 6 | **Keep, change** | Localized; non-Latin text is not lowercased; a points weekend is not shown as a passport |
| 21 | Map, shop page, join flow | 3 | **Keep** | Join and auth were already translated by the restaurant team; not touched |

Cut count: 3 (two phones, map phone). Nothing else was removed because nothing else lacked a job; the gaps were language, the street, and the inbox.

### 4.2 Decisions

- **The budget is by design, not a magic number.** `ROUTINE_PUSH_TYPES` (points earned, passport progress) share 3 pushes per rolling 24 hours per shopper across all shops. Reward ready, redeem confirmed, orders, quotes, expiry warnings and offers (which already have their own one-a-day cap) are never counted. The notification still lands in the inbox, so nothing is lost. Apple pass lock-screen change messages are not throttled (the device shows them when the pass updates); open item.
- **Language is a property of the shopper, not of the phone.** One field, `users.locale` (`en | hi | ur | pa`), set from Settings and on sign-in (only when the page language is not English, so a new browser cannot overwrite a language chosen elsewhere). It drives pushes, inbox text, SMS fallbacks, the wallet pass (Apple and Google), the lock-screen relevance text and the invite message.
- **The street block is shown only while a campaign is live**, and only a passport gets progress dots; a points weekend shows its bonus and end date.
- **The wallet pass stays optional** and is offered as "keep it on your phone (optional)".
- **Shop-owned words stay as typed**: reward names, shop names and campaign names are not translated; only the unit words points and stamps are.

---

## 5. What we deliberately don't build

- **A shopper-facing "digest mode" or quiet-day picker.** Four switch groups, a fixed budget and quiet hours cover the job; a scheduler is one more thing to explain.
- **Cross-shop point transfers.** The FAQ says points stay with the shop; the street passport is the cross-shop reward.
- **An in-app language auto-detect from the phone.** The shopper picks once; guessing wrong in Urdu costs more than asking.
- **Translated reward names.** The shop owns the words; translating them would put words in a shop's mouth.
- **Per-type translated descriptions of every notification.** Labels are translated; the long English descriptions are hidden in other languages rather than shown half-translated (open item for a native review).

---

## 6. Design

Figma file: **[Local Loyalty — shopper app](https://www.figma.com/design/Xv2ZAI99E7nBHZfiDyXjWo)**. Every frame has a "why this exists" note beside it. PNGs: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/shopper-app/`.

| Frame | Size | Job | PNG |
| --- | --- | --- | --- |
| Card | 390 | 1 | `card-390.png` |
| Wallet (with "on your street") | 390 | 2, 6 | `wallet-390.png` |
| Wallet pass in Hindi (with lock-screen messages) | 390 | 1, 4 | `pass-hi-390.png` |
| Notification settings (language row, limits in words) | 390 | 4, 5 | `notifications-390.png` |
| Inbox (grouped by day, budget line) | 390 | 2, 5 | `inbox-390.png` |
| Discover | 390 | 6 | `discover-390.png` |
| Privacy and data | 390 | 8 | `privacy-390.png` |
| Invite a friend (WhatsApp first) | 390 | 7 | `invite-390.png` |
| /for-shoppers | 1440 and 390 | 3, 4 | `for-shoppers-1440.png`, `for-shoppers-390.png` |

Built screenshots next to these: `scratchpad/shots/shop-build/` (`for-shoppers-{en,hi,ur,pa}-{1440,390}.png`, `wallet-*`, `settings-hi-*`, `activity-*`, `discover-*`, `card-*`).

---

## 7. Build spec (as built)

### 7.1 Shared (`packages/shared`)
- `api/customer.ts`: `UpdateProfileBody.locale` accepts `en | hi | ur | pa | en-CA` (was `en-CA | fr-CA`); `ROUTINE_PUSH_TYPES`, `ROUTINE_PUSHES_PER_DAY = 3`; `NotificationPrefsResponse.limits`.
- `api/wallet.ts`: `WalletSummary.locale`.
- `i18n/shopper.ts`: `unitLabel`, `unitWord` (shop unit word with its count, translated for points and stamps).
- `i18n/messages/{en,hi,ur,pa}.ts`: 340 `sh.*` keys (wallet, card, settings, privacy, invite, discover, campaign, `/for-shoppers`, server notification texts, wallet pass text). Hindi, Urdu and Punjabi follow `docs/engineering/translation-glossary.md`; not yet signed off by a native speaker.

### 7.2 API (`apps/api`)
- `services/notifications.ts`: `userLocale`; localized earn, reward-ready, redeem, expiry and passport titles; routine-push budget (`SendResult.budgeted`); prefs response `limits`.
- `services/wallet.ts`, `wallet-apple.ts`, `wallet-google.ts`: pass text in the shopper's language (English output byte-identical); language change re-issues the pass.
- `services/customer.ts`: referral `shareText` and `shareUrl` (`&lang=`) in the inviter's language; profile locale change refreshes the pass.
- `services/campaigns.ts`, `routes/campaigns/index.ts`: `GET /v1/public/live-campaigns` (anonymous).
- Tests: `apps/api/test/shopper.test.ts` (9 cases for language, pass, budget, invite, live campaigns, unit words).

### 7.3 Web (`apps/web`)
- `/for-shoppers`: one card phone (`components/marketing/ShopperCard.tsx`), live street counts and live campaign, four languages, header language menu (`SiteHeader.tsx`).
- `/me`: `LocaleScope` with the profile language (`getLocaleForProfile`), "on your street" block, Activity = inbox + points history, Settings = language row + switches with limits, Privacy strings, `InviteSheet.tsx` (WhatsApp first), `RewardCard` and `PassTabBar` localized.
- `/discover`, `/c/<id>`: localized, Urdu right to left.
- Sign-in and join save a non-English page language on the profile (`saveProfileLocale`).

### 7.4 App (`apps/mobile`)
- Language choice saved on the profile (`lib/i18n`), You, Wallet, Activity, Notification settings, Privacy, Shops and messages, Card sheet, tab bar and Invite screen through the catalog; WhatsApp share; budget line under Activity.
- Tests: `src/lib/shopperI18n.test.ts`.

### 7.5 Acceptance checks
- A shopper who picks Hindi in Settings has `users.locale = hi`; the next earn push, inbox row, wallet pass fields and invite text are in Hindi, and an English shopper's output is unchanged (API tests).
- The fourth routine push in 24 hours is stored in the inbox without a push; reward ready is never held back (API test).
- `/for-shoppers?lang=ur` renders right to left with the translated heading; the header menu stays on `/for-shoppers` (e2e).
- A signed-in shopper opening `/me` with no cookie sees their profile language (e2e).
- The bell on Discover opens the inbox (e2e).

### 7.6 Open items
- Native review of the new Hindi, Urdu and Punjabi strings, and of the per-type notification descriptions (hidden outside English today).
- Mobile Discover and Map tabs, the join sheet and shop page strings in the app are still partly English.
- Apple lock-screen change messages are not rate-limited.
- A public per-neighbourhood campaign page language switcher; the campaign page uses the profile language or `?lang=`.
