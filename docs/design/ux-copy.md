# UX copy library

Voice and tone: [brand.md](./brand.md#2-voice-and-tone). Canadian English: neighbourhood, colour,
favourite, centre, cancelled, cheque, licence (noun) / license (verb), enrol, fulfil, catalogue.
Dates `Tue, Oct 21`; times `3:30 pm`; money `$4.50`; phone `(416) 555-0123`.

Placeholders are `{camelCase}`. `{brand}` = `BRAND.name`, `{terminology}` = the program's term
(`points`/`stamps`/`stars`; singular when 1). `{pts}` = formatted balance with unit
("120 pts", "8 stamps"). Keep copy keys stable; engineers should store these in
`apps/*/src/copy/en-CA.ts` so `fr-CA` can be added later.

---

## 0. Glossary: one word for each thing

Use the word in the first column every time, on every screen, in every language file. If you want a
different word, change this table first. Trade words (client, student, guest, diner) are fine inside
that trade's own tools; they never replace the shared word in Today, the counter, Customers, Rewards or
Reports.

| Say | Never say | Notes |
| --- | --- | --- |
| customer | member, guest, user | The person in a shop's program. "Membership" stays for a paid studio membership, and "Member code" and "Member number" stay on the customer's own card. |
| shop | merchant, business, store, vendor | "Merchant" is allowed only in the legal documents' titles. The admin console says shop too. |
| stamps, points (the shop's own unit) | "points" for a stamp shop, "stamps" for a points shop | Ask the program (`terminology`). Where the screen cannot know the unit, say "rewards". |
| reward | perk, prize, freebie | What a customer earns toward ("Free drink"). A draw prize is a "prize". |
| offer (what a customer sees), promo (what an owner makes) | deal, special | A shop's "Promos" page makes the "Offers" tab on its shop page. |
| neighbourhood bonus | network bonus, perk, street perk | The bonus for visiting several shops on one street. |
| street event, passport | campaign (customer side) | "Campaign" is fine for BIAs and owners ("Street campaigns"). Customers see an "event". |
| visit | transaction | One trip to the shop. A purchase is a "purchase". Studios keep "door check-in" for their class door. |
| opted in, can text | consent, subscribed | In tables and hints. The legal consent text itself is never reworded here. |
| balance history | ledger | Also "payment history" for what a customer paid. |
| text | SMS | "Text" in every sentence a person reads. "SMS" stays in plan lists and developer pages. |
| Pro, Service, Restaurant Starter, Restaurant Growth, Restaurant Pro | Plus, Café & Retail (the old name), Growth tier, tier | Name the plan, never its internal id. **Pro** is the $39 plan (renamed from "Café & Retail" on Oct 29, 2026; its id stays `plus`). The $99 plan is **Service** (id `pro`): never call it Pro. Say "Restaurant Pro" in full for the restaurant tier. In hi, ur and pa, keep "Pro" in Latin script, like the other plan names. |
| early access, live | beta, GA | |
| your kind of shop | your trade, vertical | "Trade" is a design-system word (trade colour), not a word for people. |
| once N shops have joined | network-gated, network-wide | Why a feature is not open yet, in plain words. |
| groom schedule, service schedule | cadence, cycle | |
| QR stand (the thing on the counter), QR kit (what you print) | QR standee | |

Capitals: sentence case for everything a person reads or taps: buttons, field labels, hints, table
headers, empty states, toasts and errors. The brand voice keeps lowercase for display titles only (page
titles, marketing headlines, the wallet and map labels, category chips; see [brand.md](./brand.md#2-voice-and-tone)).
A sentence is never lowercase, even under a lowercase title ("Nothing matches these filters.").

Never: OK, Submit, Click here, Yes or No as a button (say the verb), "Upgrade", "Invalid", "Error", "Oops",
and developer words (cursor, slug, payload, token, endpoint, override, flight, cohort, ledger, "the server").

---

## 1. Buttons and actions

| Key | Copy | Notes |
| --- | --- | --- |
| `action.getStarted` | Get started | Customer welcome |
| `action.sendCode` | Send code | Phone step |
| `action.textMeCode` | Text me a code | Web join |
| `action.resend` | Resend code | Countdown: "Resend in 0:27" |
| `action.done` | Done | |
| `action.join` | Join {shop} | |
| `action.showCard` | Show my card | |
| `action.addToAppleWallet` | Add to Apple Wallet | Use Apple's official badge artwork |
| `action.addToGoogleWallet` | Add to Google Wallet | Use Google's official badge artwork |
| `action.redeem` | Redeem | Accent button |
| `action.showCodeToStaff` | Show code to staff | Redeem confirm |
| `action.getNewCode` | Get a new code | |
| `action.directions` | Directions | |
| `action.call` | Call | |
| `action.notifyMe` | Notify me | LockedFeature; after: "We'll let you know" |
| `action.learnMore` | Learn more | |
| `action.tryAgain` | Try again | |
| `action.retryNow` | Retry now | Offline queue |
| `counter.findCustomer` | Find customer | |
| `counter.scanCard` | Scan card | |
| `counter.enterCode` | Code | Redeem code entry |
| `counter.addStamp` | Add stamp | Plural: "Add 2 stamps" |
| `counter.addVisit` | Add visit (+{n} pts) | |
| `counter.award` | Award {n} pts | Live updates; "Award {n} pts (2x today)" |
| `counter.addAndAward` | Add and award | New customer |
| `counter.confirmRedeem` | Confirm redeem | |
| `counter.undo` | Undo ({seconds}) | |
| `counter.switchStaff` | Switch | |
| `dash.saveProgram` | Save program | |
| `dash.publish` | Publish now | |
| `dash.schedule` | Schedule | |
| `dash.createPromo` | Create a promo | |
| `dash.inviteStaff` | Invite staff | |
| `dash.connect` | Connect | Integrations |
| `dash.reconnect` | Reconnect | |
| `dash.downloadPdf` | Download PDF | QR kit |
| `dash.exportCsv` | Export CSV | |
| `quote.approveDeposit` | Approve and pay {amount} deposit | |
| `quote.approve` | Approve quote | |
| `quote.decline` | Decline | |
| `invoice.pay` | Pay {amount} | |
| `destructive.remove` | Remove | Always in a confirm dialog |
| `destructive.deleteAccount` | Delete my account | |

Never: OK, Submit, Click here, Yes/No as button labels (use the verb).

## 2. Errors

Pattern: what happened + what to do. No blame, no "Oops", no exclamation marks.

| Key | Copy |
| --- | --- |
| `err.phone.incomplete` | Enter a 10-digit mobile number. |
| `err.phone.invalid` | That doesn't look like a Canadian or US mobile number. Check the area code. |
| `err.otp.wrong` | That code didn't match. Try again. |
| `err.otp.expired` | That code expired. We sent you a new one. |
| `err.otp.tooMany` | Too many tries. Try again in 10 minutes. |
| `err.otp.notReceived` | Didn't get it? Check the number, or resend in {seconds} seconds. |
| `err.network` | Can't connect right now. Check your connection and try again. |
| `err.server` | Something went wrong on our end. Try again in a moment. |
| `err.sessionExpired` | For your security, please sign in again. |
| `err.redeem.expired` | This code expired. Your points weren't used. |
| `err.redeem.otherShop` | This code is for {shop}. |
| `err.redeem.used` | Already redeemed at {time} by {staffName}. |
| `err.redeem.notEnough` | Not enough {terminology} yet. {n} more to go. |
| `err.redeem.offline` | Redeem needs internet. Awards still work. |
| `err.award.duplicate` | Couldn't add for ...{last4}: it was already added. |
| `err.award.programPaused` | Your program is paused. Ask the owner to resume it. |
| `err.award.memberBlocked` | This customer can't earn here. Ask a manager. |
| `err.award.noEarnCategory` | {category} doesn't earn {terminology}. |
| `err.pin.wrong` | Wrong PIN. Try again. |
| `err.pin.locked` | Too many tries. Wait 2 minutes or ask a manager. |
| `err.camera.denied` | Camera is off. Turn it on in Settings, or type the number instead. |
| `err.location.denied` | Turn on location to see what's closest, or pick your neighbourhood. |
| `err.qr.invalid` | This QR code isn't active. Ask staff for help. |
| `err.quote.expired` | This quote expired on {date}. Ask {shop} for a new one. |
| `err.link.invalid` | This link doesn't work anymore. Contact {shop}. |
| `err.payment.declined` | Your card was declined. Try another card or payment method. |
| `err.integration.disconnected` | {provider} disconnected. Reconnect to keep awarding points automatically. |
| `err.form.required` | {fieldLabel} is required. |
| `err.upload.tooBig` | That image is over 5 MB. Try a smaller one. |

## 3. Success and confirmations

| Key | Copy |
| --- | --- |
| `ok.joined` | You're in, {firstName}. |
| `ok.joinedBonus` | You're in. {bonus} added at {shop}. |
| `ok.welcomeBack` | Welcome back, {firstName}. |
| `ok.counter.stamp` | Added {n} stamp(s) |
| `ok.counter.points` | Awarded {n} pts |
| `ok.counter.next` | {n} more for a {reward} |
| `ok.counter.rewardReady` | Reward ready: {reward} |
| `ok.counter.offlineSaved` | Saved. Will send when you're back online. |
| `ok.counter.undone` | Undone. {firstName} is back to {pts}. |
| `ok.counter.redeemed` | {reward} redeemed. Hand it over. |
| `ok.redeem.customer` | Enjoy your {reward}. Confirmed by {staffName}. |
| `ok.online` | Back online. All {n} sent. |
| `ok.consent.off` | Done. {shop} won't send you offers. |
| `ok.consent.on` | You'll get offers from {shop}. Change this anytime. |
| `ok.muted` | {shop} is muted. Your {terminology} still work. |
| `ok.dataRequested` | Requested. We'll send your file within 24 hours. |
| `ok.saved` | Saved |
| `ok.promoPublished` | Your promo is live. |
| `ok.activation` | You hit 25 customers. Nice work. |
| `ok.quoteApproved` | Approved. We've let {shop} know. |
| `ok.paid` | Paid. You earned {pts} at {shop}. |

## 4. Empty states

| Key | Title | Body | Action |
| --- | --- | --- | --- |
| `empty.wallet` | Your shops will live here | Show your card at any shop on the map to start earning. | Show my card |
| `empty.noNeighbourhood` | We're not on your street yet | We launch one neighbourhood at a time. Want us in yours? | Suggest my street |
| `empty.rewardsReady` | No rewards ready yet | Keep collecting at your shops. We'll tell you the moment a reward is ready. | See your shops |
| `empty.activity` | Nothing here yet | Your {terminology} and rewards will show up here after your first visit. | Find shops nearby |
| `empty.orders` | No orders or repairs yet | When you order ahead or drop something off, you can follow it here. | (none) |
| `empty.mapSearch` | No shops match "{query}" | Try another word, or zoom out. | Clear search |
| `empty.counter` | Enter a number or scan a card | (none) | (none) |
| `empty.dash.customers` | No customers yet | Customers join when they scan your QR stand or give their number at the counter. | Print your QR stand |
| `empty.dash.today` | No visits yet today | Your QR stand is the fastest way to start. | Print your QR stand |
| `empty.dash.promos` | No promos yet | A simple offer gets people through the door. Try double stamps on a slow afternoon. | Create a promo |
| `empty.dash.discountCards` | Give your regulars a card to show | Seniors' day? Student discount? Customers carry it in the app. | Create a discount card |
| `empty.dash.messages` | Say hello to your regulars | {n} customers said yes to hearing from you. | Write an email |
| `empty.dash.messagesNoConsent` | No one can get messages yet | Customers opt in when they join. Ask them at the counter. | Print your QR stand |
| `empty.dash.reports` | Not enough data yet | Check back after a week of visits. | (none) |
| `empty.dash.staff` | It's just you so far | Add staff so they can add stamps or points with their own login. Unlimited, always free. | Invite staff |
| `empty.rep.merchants` | No merchants yet | Your first setup takes about 20 minutes. | Set up a merchant |

## 5. Coming soon (locked features)

Rules: honest reason, real number, no price as headline, no "Upgrade". One sentence of value.

| Key | Copy |
| --- | --- |
| `soon.badge` | Coming soon |
| `soon.network` | Switches on once {target} shops are on the network. {remaining} to go. |
| `soon.orderAhead` | **Order-ahead.** Customers order and pay before they arrive, and get a text when it's ready. |
| `soon.tickets` | **Service tickets.** Track every repair from drop-off to pickup, with photos and status updates. |
| `soon.quotes` | **Quote approvals.** Send a quote; your customer approves it on their phone. No more phone tag. |
| `soon.invoices` | **Invoices.** Send the final bill and get paid in the app. Customers earn points automatically. |
| `soon.sms` | **SMS campaigns.** Text your opted-in regulars. 500 texts a month included with Pro. |
| `soon.automations` | **Automations.** "We miss you" and "Your reward is ready" messages that send themselves. |
| `soon.boost` | **Boost a promo.** Show your offer to people near your street. Always labelled Sponsored. |
| `soon.beta` | In beta. Try it early and tell us what you think. |
| `soon.planAvailable` | Available on {plan} · ${price}/mo |
| `soon.notified` | We'll let you know |
| `soon.pricing.note` | Paid tools switch on once enough shops are on the network, so every feature launches with customers already using the app. |
| `soon.pricing.promise` | Our promise: a feature that's free today stays free. Loyalty will never move to a paid plan. |

## 6. Sponsored

| Key | Copy |
| --- | --- |
| `ad.label` | Sponsored |
| `ad.why.title` | Why you're seeing this |
| `ad.why.body` | {shop} paid to show this offer to people near {street}. Sponsored posts never change your {terminology}. |
| `ad.why.link` | Ad settings |
| `ad.a11yPrefix` | Sponsored. |

## 7. CASL consent

CASL requires express consent for commercial electronic messages: a clear purpose, the sender's
identity and contact info, and a statement that consent can be withdrawn. **Checkboxes are never
pre-checked, never bundled with Terms, and the consent request is never sent by SMS or email
itself** (a message asking for consent counts as a commercial message). Store with every consent:
member, merchant (or platform), channel(s), timestamp, source (`qr`, `web`, `app`, `kiosk`,
`staff`), IP/device, and `consentTextVersion`.

**`consent.merchant.v2`** (web join from the counter QR, canvas `docs/design/canvas/Join.dc.html`; offered on the phone step, unticked):

> Send me offers from **{shop}** by text or email. Optional. Unsubscribe any time.

Once ticked, the sender line (`consent.merchant.caption.v1`) appears under it.

**`consent.merchant.v1`** (per shop, join flows, kiosk, shop detail):

> Send me offers and news from **{shop}** by text and email. I can unsubscribe anytime.

Caption under it (`consent.merchant.caption.v1`):

> Messages come from {shop}, {shopAddress}, {shopEmailOrPhone}, sent via {brand}. Reply STOP or tap
> unsubscribe in any message, or change it in Settings.

**`consent.global.v1`** (app onboarding, pre-fills per-shop choice for shops joined in the app):

> Send me offers and news from shops I join, by text and email. I can unsubscribe anytime.

Caption: "Each shop is named in every message. You can turn this off for any shop in Settings."

**`consent.platform.v1`** (network news):

> Send me {brand} news and neighbourhood events by email. I can unsubscribe anytime.

Caption: "{brand}, {companyAddress}, {supportEmail}."

**`consent.push.preprompt.v1`**: Title "Know when you've earned a reward". Body "We'll only notify
you about your points, rewards and orders. Offers are off unless you turn them on."

**Withdrawal confirmation**: "Done. {shop} won't send you offers. Your {terminology} keep working."
Unsubscribe must take effect within 10 business days (we do it immediately).

**Email footer (required, non-editable)**: "{shop} · {shopAddress} · You're getting this because you
said yes to offers from {shop}. [Unsubscribe] · Sent via {brand}."

**Merchant-side reminder (Messages page)**: "Only customers who said yes get offers. That's the law
(CASL) and it's good manners."

**Import question**: "Did these customers agree to get marketing messages from you?" Options: "No,
or I'm not sure" (default) / "Yes, and I have records of it".

## 8. SMS templates (<= 160 characters, GSM-7 only)

Rules: GSM-7 characters only (straight apostrophes `'`, no emoji, no curly quotes, no `·` or `—`;
any of these switch the message to UCS-2 and cut the limit to 70). Lengths below were measured
with worst-case values: shop name 24 chars, first name 12, street 16, URL 24 (`local.example/j/K7Q4XZ`).
Truncate `{shop}` to 24 chars with no ellipsis. Promotional messages always start with the shop
name and end with "Reply STOP to opt out." Promos only to customers with marketing consent and not
muted. Quiet hours: no promotional SMS 9 pm-9 am Toronto time.

| Key | Type | Template | Max len |
| --- | --- | --- | --- |
| `sms.otp` | Transactional | `{code} is your {brand} code. It expires in 10 min. Don't share it.`<br>`(blank line)`<br>`@{domain} #{code}` | 103 |
| `sms.welcome` | Transactional | `{shop}: you're in! You have {pts}. Your card: {url} Msgs from {brand}. Reply STOP to opt out.` | 138 |
| `sms.staffAdded` | Transactional | `{shop} added this number to earn points. See your card: {url} Not you? Reply STOP.` | 117 |
| `sms.rewardReady` | Transactional | `{shop}: your {reward} is ready. Show your card next visit: {url}` | 109 |
| `sms.promo` | Promotional | `{shop}: {offer}. Show your card to save. Reply STOP to opt out.` (`{offer}` <= 60 chars) | 134 |
| `sms.birthday` | Promotional | `{shop}: happy birthday, {firstName}! A treat is waiting on your card: {url} Reply STOP to opt out.` | 133 |
| `sms.campaign` | Promotional (platform) | `{brand}: {street} Passport is on! Visit 5 shops by {date} to win. Details: {url} Reply STOP to opt out.` | 134 |
| `sms.orderReady` | Transactional | `{shop}: order {orderCode} is ready for pickup. Show code {orderCode} at the counter.` | 86 |
| `sms.quoteReady` | Transactional | `{shop}: your quote for {item} is ready ({total}). Review and approve: {url}` (`{item}` <= 20) | 122 |
| `sms.ticketReady` | Transactional | `{shop}: your {item} is ready for pickup. Balance due {total}. Pay or view: {url}` | 127 |
| `sms.invoice` | Transactional | `{shop}: invoice for {total}. Pay securely: {url}` | 85 |
| `sms.staffInvite` | Transactional | `{shop} added you as staff on {brand}. Get the app and sign in with this number: {url}` | 126 |
| `sms.stop` | Auto-reply | `You won't get more texts from {shop}. Your points are safe. Reply START to resubscribe.` | 105 |
| `sms.start` | Auto-reply | `{shop}: you're subscribed to offers again. Reply STOP to opt out.` | 83 |
| `sms.help` | Auto-reply | `{brand} texts for your local shops. Msg&data rates may apply. Reply STOP to opt out. Help: {domain}` | 117 |

STOP handling: keywords STOP, ARRET, ARRÊT, UNSUBSCRIBE, CANCEL, END, QUIT (case-insensitive)
opt the number out of promotional SMS **from the shop that sent the last message**; "STOP ALL" opts
out from every shop and the platform. Transactional messages (OTP, order/quote/invoice) continue.

## 9. Push notification templates

Title <= 40 chars, body <= 110 chars (lock-screen truncation on small phones). Shop name in the
title so it's recognisable. Deep link in the payload.

| Key | Type | Title | Body | Deep link |
| --- | --- | --- | --- | --- |
| `push.earned` | Transactional | {shop} | +{n} {terminology}. You have {pts}. {remaining} more for a {reward}. | `ll://shop/{slug}` |
| `push.rewardReady` | Transactional | Your reward is ready | {reward} at {shop}. Show your card next visit. | `ll://rewards/{rewardId}` |
| `push.redeemed` | Transactional | Enjoy your {reward} | Redeemed at {shop}. You have {pts} left. | `ll://shop/{slug}` |
| `push.welcomeBonus` | Transactional | Welcome to {shop} | {bonus} added to your card. | `ll://shop/{slug}` |
| `push.networkBonus` | Transactional | Neighbourhood bonus | You visited 3 shops on {street}. +{n} pts at {shop}. | `ll://rewards` |
| `push.campaignProgress` | Transactional | {campaign}: {visited} of {goal} | {remaining} more shops to be entered in the draw. | `ll://campaign/{id}` |
| `push.promo` | Promotional (consent) | {shop} | {offerTitle}. Ends {endDay}. | `ll://promo/{id}` |
| `push.nearby` (Phase 2) | Promotional (consent + Pro) | {shop} · {distance} away | {offerTitle} | `ll://promo/{id}` |
| `push.orderReady` | Transactional | Your order is ready | {shop}: show code {orderCode} at the counter. | `ll://order/{id}` |
| `push.quoteReady` | Transactional | Quote from {shop} | {item}: {total}. Tap to review and approve. | `ll://quote/{token}` |
| `push.ticketUpdate` | Transactional | {shop} | {item}: {statusLabel}. | `ll://ticket/{id}` |
| `push.ticketReady` | Transactional | Ready for pickup | Your {item} is ready at {shop}. | `ll://ticket/{id}` |
| `push.pointsExpiring` | Transactional | Your {terminology} at {shop} | {pts} expire on {date} unless you visit. | `ll://shop/{slug}` |

Ticket `statusLabel` strings: intake "Dropped off", diagnosing "Diagnosing", quote_sent "Quote
ready", approved "Approved", in_progress "Work started", waiting_parts "Waiting for parts", ready
"Ready for pickup", picked_up "Picked up", declined "Quote declined", cancelled "Cancelled".

Order status strings: pending "Order sent", accepted "Accepted", preparing "Being prepared",
ready "Ready for pickup", picked_up "Picked up", cancelled "Cancelled", refunded "Refunded".

## 10. Email subjects

| Key | Subject |
| --- | --- |
| `email.otp` | Your {brand} code: {code} |
| `email.dataExport` | Your {brand} data is ready |
| `email.accountDeleted` | Your {brand} account is deleted |
| `email.merchantWelcome` | You're live on {street}. Here's your first week. |
| `email.merchantWeekly` | {shop} this week: {visits} visits, {newMembers} new customers |
| `email.activationNudge` | You're {n} customers from your 30-day goal |
| `email.integrationError` | Action needed: {provider} disconnected |
| `email.promoFooter` | (see section 7, required footer) |

## 11. Staff script card

Printed with the QR kit (A6, back of the stand or a separate card):

> **Ask every customer:** "Are you on {brand}? You get a free {reward} after {goal} visits, here and
> at every shop on {street}."
>
> **Yes:** "Scan your card, or what's your number?" → tap **Add stamp**.
> **No:** "Just scan this. Takes 30 seconds, no app." → point at the stand.
>
> **Mistake?** Tap **Undo** within 10 seconds.

## 12. Microcopy odds and ends

| Key | Copy |
| --- | --- |
| `misc.pointsNeverExpire` | Your {terminology} never expire. |
| `misc.pointsExpireRule` | {Terminology} expire after {months} months without a visit. |
| `misc.noEarnLine` | {category} doesn't earn {terminology}. |
| `misc.pharmacyRule` | Prescriptions and pharmacy services don't earn points, as Ontario rules require. |
| `misc.stampsToGo` | {n} more for a {reward} |
| `misc.ptsToGo` | {n} pts to {reward} |
| `misc.balanceAfter` | Your balance after: {pts} |
| `misc.showAtCounter` | Show this at the counter |
| `misc.offlineCardWorks` | You're offline. Your card still works. |
| `misc.offlineQueue` | Offline · {n} waiting to send |
| `misc.updatedAgo` | Updated {relativeTime} |
| `misc.distance` | {meters} m · {minutes} min walk (switch to km above 1,000 m: "1.2 km") |
| `misc.openUntil` | Open · closes {time} |
| `misc.closedUntil` | Closed · opens {time} |
| `misc.freeForever` | Free forever · No fee on loyalty · Unlimited locations |
| `misc.madeInToronto` | Made in Toronto |
| `misc.joinTagline` | One card for every shop on your street. |
| `misc.standHeadline` | Scan to join |
| `misc.standSub` | earn points at {shop} and every shop on {street} |
| `misc.standTrust` | No app needed · Free · Takes 30 seconds |
| `misc.standFallback` | No phone camera? Just tell us your number. |

## 13. Solo pros, inbox, promos, site

Source of truth for the strings is `packages/shared/src/i18n/messages/en.ts` (the `phase-solo` blocks);
hi, ur and pa follow the [translation glossary](../engineering/translation-glossary.md). The marketing
pages for solo pros (`mkt.solo.*` in `apps/web/src/copy/en-CA.ts`) are English-only; their keys exist in
all four catalogues so the type stays whole.

Voice rules for this group:

- Talk to one person who works alone or with a small team. "Your link", "your regulars", "your clients".
  Trade words (client, regulars, chair) are fine inside the solo tools; Today, Customers and Reports keep "customer".
- The address is never in a headline. Say what the client sees and when they get the address: "Clients
  see your area, not your door. The address goes out after they book."
- Say where a message goes before it is sent: "Goes to their app", "Sent by email". Say why when it
  changed: "Your texts for this month are used up, so this went by email or waits in their app."
- Promos go by app and email, never by text. Say it once, on the promo screen and in the reminder
  preferences ("Offers never come by text").
- Texts stay near one segment. The nudge texts (`ob.solo.nudge.*`) carry one link and one ask.
- No "Upgrade". Name the plan: "See Pro".

| Group | Keys | Where it shows |
| --- | --- | --- |
| `su.*` | shop name, "Where do you work?", postal code, phone, errors, trade chips | Solo signup |
| `ob.solo.*` | six setup cards, activation card, "move" tiles, d1/d3/d7/d14/d25 nudges | `/m/:id/setup`, Home, owner texts and email |
| `inbox.*` | filters, empty state, send, "Sent by", Instagram read-only, "Create booking" | Owner inbox |
| `inbox.me.*`, `inbox.n.*` | the client's messages page, the message notification | Client pass |
| `people.*` | client profile, filters, visit note, intake question, reach channel, "Book again" | Customers, client profile |
| `promo.*`, `promo.tpl.*` | allowance counter, audience, send, 63 seasonal templates | Promo picker |
| `webpush.*`, `people.pref.*` | reminder prompt, iPhone steps, "How shops reach you" | Client pass, settings |
| `ig.card.*` | Instagram card, coming soon, connect, disconnect | Messages settings |
| `site.*`, `shell.nav.site` | public website labels, lapse banner | Built-in website |
| `bk.privacy.*`, `shop.byAppt`, `shop.area`, `shop.travels`, `bk.msg.*` | area rule, "by appointment", confirmation and reminder texts with the address | Booking page, confirmation |
| `ob.solo.share.*` | bio steps, text yourself the link, QR, paste a Linktree, Fresha or Booksy link | Share step |

The English was reviewed against sections 0 to 3 in this pass. Changes: "your trade" became "your
kind of work" (`ob.solo.services.body`), "Stamps are added at the till by themselves" became "...
automatically" (`ob.solo.pos.body`), and "Add your team; each gets their own column and PIN" became two
sentences (`ob.solo.staff.body`).

### Needs a native speaker (hi, ur, pa)

Written by the copy writer to the glossary; nobody fluent has read them yet.

1. **Promo templates** (`promo.tpl.*`, 126 strings per language). Check festival names and spellings
   (Eid, Diwali, Karva Chauth, Ramadan, Eid al-Adha, Thanksgiving, Halloween), that "Saturdays go first"
   and "double stamps" read like a shop owner talking, and that no template reads as a religious
   greeting from a shop of another faith. Hindi uses loanwords for Western days (मदर्स डे, फ़ादर्स डे).
2. **The invite message** (`ob.solo.invite.message`, and the copy of it in `ob.solo.nudge.d3.body`). It is sent
   from the owner's own phone. It opens with a neutral "Hello" (हेलो, ہیلو, ਹੈਲੋ) on purpose; confirm that
   is right for a regular's phone, and that the register is friendly without being familiar.
3. **Owner texts that must fit one segment** (`ob.solo.nudge.d1` to `d25`, `bk.msg.text24`, `text2`,
   `textBooked`, `textStop`). Hindi, Urdu and Punjabi take more characters than English; shorten if a
   carrier splits them. STOP stays Latin.
4. **Gender on the owner's side**: "मैं ... करता/करती हूँ" and the Urdu and Punjabi slash forms in `su.where.mobile`,
   `ob.solo.hours.working`, `ob.solo.services.addAll`, `ob.solo.invite.later`. A native speaker may prefer
   a neutral rewording.
5. **Words for the trades** (`su.chip.*`, `mkt.solo.*`): "नेल टेक", "ब्रो और लैश", "ग्रूमर", "बार्बर" and the
   Urdu and Punjabi equivalents are what people say in a salon; check against the words a client would
   use. Instagram is spelled in the local script where a label has no other script (inbox filter, source
   list) and in Latin inside sentences.
6. **Added in the final audit (Oct 29)**: the booking policy now says "we remind you" instead of "we text you" (`bk.policy.fee`,
   `bk.policy.nofee`: याद दिलाते हैं, یاد دلاتے ہیں, ਯਾਦ ਕਰਾਉਂਦੇ ਹਾਂ), and the admin console's `shell.console.siteDomains`
   (साइट डोमेन, سائٹ ڈومینز, ਸਾਈਟ ਡੋਮੇਨ), and `bk.introPrivate` for a home studio's booking page ("By appointment only.").
6. **Inbox status words** (`inbox.sentBy.*`, `inbox.via.*`, `people.status.*`): tense and gender must agree
   with the thing described ("नहीं आए", "کرسی پر ہیں", "ਕੁਰਸੀ ਤੇ ਹਨ").
7. **Reminder and Instagram wording** (`webpush.prompt.*`, `ig.card.*`): the iPhone steps name the buttons as the
   system shows them in each language; confirm against a phone set to that language.
8. **Urdu RTL screens**: read the three screenshots (setup, inbox, client profile at 390) for clipped
   Nastaliq, mixed-direction lines (amounts, links, "Pro") and number placement.
