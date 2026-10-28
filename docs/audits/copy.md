# Copy audit

Why: the founder said "wording for a lot of stuff just doesn't make sense". This is the pass that fixed it. The rules it applied are in [ux-copy.md](../design/ux-copy.md) (section 0 is the glossary), and the Hindi, Urdu and Punjabi follow-up is in [translation-glossary.md](../engineering/translation-glossary.md).

## How it was done

- A seeded stack (the way `apps/web/e2e/run-all.sh` builds it) was walked with Playwright: the owner screens for a café, a barber, a South Asian restaurant and a fitness studio (Today, Customers, Rewards, Promos, Messages, Reports, Settings, Setup, Billing, the counter and every trade module in the sidebar: calendar, orders, classes, walk-in line, kitchen, tiffin, catering, banquet, pre-orders, WhatsApp, reviews, pets, vehicles, tire season), then pet care, auto, grocer and pharmacy owners, the admin and rep consoles, the customer join, pass, rewards, shops, activity, shop, booking, queue, order and catering pages, and the marketing home, pricing, shoppers, restaurants, BIA, signup and login pages. About 285 screens, each captured as an image and as its visible text.
- The visible text was read against the source strings in `packages/shared/src/i18n/messages/en.ts`, the hard-coded English in the owner components (about 5,000 strings), the helper libraries, the mobile app and the API errors people see as toasts.
- Every string that is jargon, internal, vague, wrong for the shop, in the wrong unit, inconsistent or missing a next step was written down, rewritten, and the tests that assert the old text were updated.

## Numbers

- 293 strings rewritten in English (rows below): 94 message-catalog keys and 199 strings in components, helpers, the API and the mobile app. Several rows cover more than one place, so the number of changed source lines is higher.
- 267 Hindi, Urdu and Punjabi strings rewritten to match (89 keys, three languages each). Not native-reviewed; they are listed in translation-glossary.md under "Copy pass".
- No consent text was changed. Three notices that restate a rule were reworded and are listed for counsel at the end of this file.

## What was wrong, in one list

1. **Internal names on screen:** "Set up your trade", "Active shop", "Ahead of pace", "Activation goal", "Pilot shops", "Plus unlock", "Overrides", "Force on", "network-wide extras", "Opens when the network reaches 100 shops", "ledger", "merchant", "cadence", "cohorts", "Resource not found", "Invalid cursor", "Missing permission: quotes.send".
2. **Old plan names:** "needs Plus", "needs Growth", "Growth tier", "Plus and Pro" when the plans are called Café & Retail, Service and Restaurant Growth.
3. **The wrong unit:** stamp wording shown to points shops ("Stamp on scan", "Double stamps" promo templates, "we will add a stamp" starter text), points wording shown to stamp shops ("Points that expire without warning annoy customers"), and "dishes" on a café's order page.
4. **Different words for one thing:** member, customer and client; reward, perk and deal; promo and offer; campaign and event; network bonus and neighbourhood bonus; Payment due and Payment failed; "Order sent" and "Received".
5. **Grammar and typos that shipped:** "in 3 days ago", "in today", "Your balance update on the lock screen", "in your first 30" (no "days"), "M0, M1, M2" column headers, "37 / 0 merchants" gauge units.
6. **Banned button labels:** "Yes, cancel" (four dialogs), "OK".
7. **No next step:** the Rewards empty state button "See how close you are", the admin bonuses empty state, "Invalid request" for every form error.
8. **A path in the UI:** "Your card at /me works at the counter", and "docs/finance/unit-economics.md" on the admin Costs page.
9. **Brand contradiction:** the footer said "One app for every shop on your street" while every page says "no app needed". It now says "One card".

## Rows

Where = the screen or surface. Current text and new text are the visible words (placeholders in braces, `…` for a value filled in by code).

### Owner dashboard (134)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Owner Today: label before low-priority items | For your information | Formal and wordy for a small label | Good to know |
| Owner Today, restaurant card | Commission avoided | 'Commission avoided' does not say whose commission | Delivery-app fees you avoided |
| Owner Today, restaurant card | Estimate, not measured | 'Not measured' is system language | Our estimate |
| Owner Today: visits card | No typical day to compare yet | 'Typical day' is an internal measure | Not enough days to compare yet |
| Owner Today: regulars card | Overdue against their own rhythm | 'Overdue against their own rhythm' is analytics language | Haven't been in as often as usual |
| Owner Today stat tile | New members | Owner screens say customers (Customers page, nav); 'members' is for studio memberships | New customers |
| Owner Setup checklist | First {target} members | 'Members' vs 'customers' | First {target} customers |
| Owner Setup checklist progress | {have} of {target} members have visited | 'Members' vs 'customers' | {have} of {target} customers have visited |
| Owner Today: first-30-days milestones | {n} members | 'Members' vs 'customers' | {n} customers |
| Owner Today: first-30-days card | {members} of {target} members {members, plural, one {has visited} other {have visited}} | 'Members' vs 'customers' | {members} of {target} customers {members, plural, one {has visited} other {have visited}} |
| Owner Today: first-30-days card | {lead} by day {day} is the pace that gets you to {target} | 'The pace that gets you to' is vague | {lead} customers by day {day} keeps you on track for {target} |
| Owner Today: first-30-days card | {target} = active shop | 'Active shop' is an internal status name | Goal: {target} customers who have visited |
| Owner Today: first-30-days card badge | Active shop | 'Active shop' is an internal status name | Goal reached |
| Owner Today: first-30-days card badge | Ahead of pace | 'Pace' is jargon for schedule | Ahead of schedule |
| Owner Today: first-30-days card badge | On pace | 'Pace' is jargon for schedule | On track |
| Owner Today: first-30-days card badge | Behind pace | 'Pace' is jargon for schedule | Behind schedule |
| Owner Today: milestone list | (reached) | 'Reached' vs 'done' elsewhere in setup | (done) |
| Owner Today: next-step card | You are an active shop | 'Active shop' is an internal status name | Your regulars are on the card |
| Owner Today: next-step card | Your regulars are on the card. Connect your POS so stamps happen on their own. | Repeats the title; 'happen on their own' is vague | Connect your POS and stamps are added automatically at the till. |
| Owner Today: next-step card | Best next move | 'Best next move' is consultant speak | Try this next |
| Owner Today: next-step card button | Stamp yourself | Does not say what happens | Add your first stamp |
| Owner Today: setup list button | Do it | 'Do it' is vague | Start |
| Owner sidebar | Menu & catalog | 'Catalog' is retail-system language; the page is the menu and its prices | Menu and prices |
| Owner Today: first-30-days card | Where members came from | 'Members' vs 'customers' | Where customers came from |
| SMS and email to the owner, day 3 | {shop}: {n, plural, one {# member} other {# members}} so far. Try saying this at the till today: "{till}" {url} | 'Members' vs 'customers' | {shop}: {n, plural, one {# customer} other {# customers}} so far. Try saying this at the till today: "{till}" {url} |
| SMS and email to the owner, day 7 | A week in: {n} members | 'Members' vs 'customers' | A week in: {n} customers |
| SMS and email to the owner, day 7 | {shop} has {n} members after a week. Shops that reach {lead} by day {day} almost always reach {target}. {left} to go. {url} | 'Members' vs 'customers' | {shop} has {n} customers after a week. Shops that reach {lead} by day {day} almost always reach {target}. {left} to go. {url} |
| SMS and email to the owner, day 14 | Two weeks in: {n} members | 'Members' vs 'customers' | Two weeks in: {n} customers |
| SMS and email to the owner, day 14 | {shop} has {n} members at day 14, a little behind. We will call you this week to help you get the next few. {url} | 'Members' vs 'customers' | {shop} has {n} customers at day 14, a little behind. We will call you this week to help you get the next few. {url} |
| SMS and email to the owner, day 25 | {shop} is {left} members from active. {days} days left in your first {window}. {url} | 'Active' is an internal status; '{window}' was missing the word 'days' ('your first 30') | {shop} needs {left} more customers to reach its first goal. {days} days left in your first {window} days. {url} |
| Owner Today: Needs you | {n, plural, one {# member has a reward waiting} other {# members have a reward waiting}} | 'Members' vs 'customers' | {n, plural, one {# customer has a reward waiting} other {# customers have a reward waiting}} |
| Owner Today: first-30-days progress bar (screen reader) | Active members | 'Active members' is an internal status name | Customers who have visited |
| Owner Today: next-step card | {counter} of your {members} joined at the counter, {qr} from the QR stand. | '{members}' is a bare number with no noun | {counter} of your {members} customers joined at the counter, {qr} from the QR stand. |
| Owner Today: next-step card | Every person at the till can stamp from their own phone, and members join faster when staff ask. | 'Members' vs 'customers' | Every person at the till can stamp from their own phone, and customers join faster when staff ask. |
| Owner Today and Setup: checklist button | Give your first stamp / Stamp yourself | 'Stamp yourself' does not say what it opens | Give your first stamp / Add your first stamp |
| Owner Setup checklist | First 25 members | 'Members' vs 'customers' | First 25 customers |
| Owner Setup checklist | Set up your trade / Set up | 'Trade setup' is internal language | Set up your shop's tools / Set up |
| Owner Setup step | Your first 25 members / Activation goal: 25 members who have visited within 30 days. 12 by day 14 is the pace that gets you there. | 'Activation goal' and 'the pace that gets you there' are internal language | Your first 25 customers / Goal: 25 customers who have visited within 30 days. Having 12 by day 14 keeps you on track. |
| Owner Setup step | Set up your trade / The first things your customers need from you, for your kind of shop. | 'Trade' is internal language | Set up your shop's tools / The first things your customers need from you, for your kind of shop. |
| Owner Setup step (pharmacies) | gives the pharmacy's OCP accreditation number. Points stay off until this is done. It takes a minute. | 'OCP' is an unexplained acronym | enters the pharmacy's Ontario College of Pharmacists accreditation number. Points stay off until this is done. It takes a minute. |
| Owner Setup step | Optional. Once connected, stamps and points happen on their own at the till. | 'Happen on their own' is vague | Optional. Once connected, stamps and points are added automatically at the till. |
| Owner Setup step | Your first … members / Activation goal: … members who have visited within … days. … by day … is the pace that gets you there. | 'Activation goal' and 'the pace' are internal language | Your first … customers / Goal: … customers who have visited within … days. Having … by day … keeps you on track. |
| Owner Setup step progress bar | Active members / … of … active members | 'Active members' is internal language | Customers who have visited / … of … customers have visited |
| Owner Setup step (POS) | POS sync is part of {PLANS.plus.name}, … a month. Stamps from the counter work the same way in the meantime. | 'POS sync' and 'work the same way in the meantime' are vague | Connecting your POS is part of {PLANS.plus.name}, … a month. Until then, add stamps from the counter. |
| Owner Today: upgrade line | promos, texts, POS sync and the tools for your trade · | 'Tools for your trade' is internal language | promos, texts, POS sync and the tools for your kind of shop · |
| Owner Today: upsell card | You are an active shop: … members visited | 'Active shop' is an internal status name | Your regulars are on the card: … customers have visited |
| Owner Today: first 30 days | … of … member… … visited | 'Members' vs 'customers' | … of … customer… … visited |
| Owner Today and Setup: pace badge (API label) | Active shop / Ahead of pace / On pace / Behind pace / Past day 30 | 'Active shop' and 'pace' are internal language | Goal reached / Ahead of schedule / On track / Behind schedule / Past day 30 |
| Owner customer panel (screen reader label) | Ledger history | 'Ledger' is accounting language | Balance history |
| Owner Settings > Privacy: your data | We keep ledger history for 7 years for tax and dispute reasons. Phone numbers stay masked in lists. | 'Ledger' is accounting language; 'masked' is technical | We keep balance and purchase history for 7 years for tax and dispute reasons. Phone numbers stay hidden in lists. |
| Owner Tiffin > Subscribers: void payment dialog | the receipt stays in the ledger as voided | 'Ledger' is accounting language | the receipt stays in the payment history as voided |
| Owner Billing: page subtitle | Subscribe to the tools for your trade any time and cancel any time. | 'Tools for your trade' is internal language | Subscribe to the tools for your kind of shop any time, and cancel any time. |
| Owner Billing: FAQ answer | Subscribe below and your trade's tools switch on at once. Only network-wide extras (sponsored promos and listings, map pins, BIA campaigns) open when the network reaches … shops. | 'Network-wide extras' and 'the network reaches' are internal language | Subscribe below and your shop's tools switch on at once. A few extras that need many shops nearby (sponsored promos and listings, map pins, BIA campaigns) open once … shops have joined. |
| Owner: locked page (network feature) | Opens when the network reaches … shops${shops != null ?  | 'The network reaches' is internal language | Opens once … shops have joined${shops != null ?  |
| Owner: locked feature card | Network progress / … of … shops on the network | 'Network progress' is internal language | Shops joined / … of … shops have joined |
| Owner: take a phone pre-order | Pre-orders need the Growth tier. | 'Growth tier' is not the plan's name | Pre-orders come with Restaurant Growth. |
| Owner Festivals: channel picker | WhatsApp (needs Growth) | Names a plan that does not exist | WhatsApp (Restaurant Growth) |
| Owner Festivals: channel picker | Text message (needs Plus) | 'Plus' is not a plan name; it is Café & Retail | Text message (Café & Retail) |
| Owner Festivals: channel picker | Email (needs Plus) | 'Plus' is not a plan name; it is Café & Retail | Email (Café & Retail) |
| Owner Festivals: template card | Email (needs Plus) | 'Plus' is not a plan name | Email (Café & Retail) |
| Owner Festivals: template card | Text message (needs Plus) | 'Plus' is not a plan name | Text message (Café & Retail) |
| Owner Festivals: template card | App push (needs Plus) | 'Plus' is not a plan name; 'push' is jargon | App notification (Café & Retail) |
| Owner Festivals: template card | WhatsApp broadcast (needs Growth) | 'Growth' is not the plan's name | WhatsApp broadcast (Restaurant Growth) |
| Owner Festivals: template card | App push | 'Push' is jargon | App notification |
| Owner Rewards: At the counter | Stamp on scan / A scan, or four digits that match one person, stamps straight away. Undo stays for 10 seconds. / Not available with points per dollar: the amount has to be typed. | Says 'stamp' for points shops; 'stamps straight away' is vague | Add a … on scan / A scan, or four digits that match one customer, adds a … straight away. Undo stays for 10 seconds. / Not available with points per dollar: the amount has to be typed. |
| Owner Rewards: switch label (screen reader) | Stamp on scan | Says 'stamp' for points shops | Add a … on scan |
| Owner Rewards: At the counter | Duplicate guard / No second … within … minutes of the last one | 'Duplicate guard' is developer language | Block repeat scans / No second … within … minutes of the last one. Stops a double scan from counting twice. |
| Owner Rewards: field label (screen reader) | Duplicate guard minutes | 'Duplicate guard' is developer language | Minutes between awards |
| Owner Rewards: never-expire switch | Recommended. Points that expire without warning annoy customers. | Says 'points' for stamp shops; 'annoy' is casual | Recommended. Customers don't like losing … without warning. |
| Owner Rewards: welcome bonus row | Given when someone joins from the counter QR | Does not name who gets it | Given when a customer joins from your counter QR code |
| Owner Rewards: More ways to earn | Referral (each) / Both friends get this. | '(each)' is unclear | Referral reward / Both friends get this amount. |
| Owner Rewards: reward cost field | Only used in Reports to estimate what rewards owed will cost. Customers never see it. | 'Rewards owed will cost' is hard to read | Only used in Reports to estimate what you owe in rewards. Customers never see it. |
| Owner Rewards: step 1 | Earn type | 'Earn type' is internal language | How customers earn |
| Owner Rewards: locked section | Birthday treat, refer a friend, and VIP levels come with Café &amp; Retail. They stay off this screen until you can use them. | 'Stay off this screen until you can use them' is vague | Birthday treat, refer a friend and VIP levels come with Café &amp; Retail. They show up here once you subscribe. |
| Owner Rewards: minimum purchase | Stops $1 stamps. Set it to your cheapest drink. | '$1 stamps' reads like a typo | Stops tiny purchases from earning a stamp. Set it to your cheapest drink. |
| Owner Rewards: wallet pass preview | {stamps ? "Stamps" : "Your balance"} update on the lock screen. | 'Your balance update' is a grammar mistake | {stamps ? "Stamps" : "Your balance"} {stamps ? "update" : "updates"} on the lock screen. |
| Owner Customers: page subtitle | members · … can be texted · phone numbers are masked and reveals are logged | 'Masked' and 'reveals are logged' are system language; 'members' vs 'customers' | customers · … can be texted · Phone numbers are hidden here, and each time you reveal one it's logged |
| Owner Customers: page subtitle (filtered) | … · phone numbers are masked and reveals are logged | 'Masked' and 'reveals are logged' are system language; 'members' vs 'customers' | … · Phone numbers are hidden here, and each time you reveal one it's logged |
| Owner Customers: column header | Visits (30 d) | '30 d' abbreviation | Visits, last 30 days |
| Owner Customers: column header | Usually | 'Usually' alone does not say what | Usual visit time |
| Owner Customers: column header | Texts | 'Texts' alone does not say what the column means | Text offers |
| Owner Customers: column value | Can text / Muted / No consent | 'No consent' is legal language for a table cell | Can text / Muted / Hasn't opted in |
| Owner customer panel | value: consent ?? "No consent on file" | 'No consent on file' is legal language | value: consent ?? "Hasn't opted in to offers" |
| Owner Customers: filter and labels | No consent | 'No consent' is legal language | Hasn't opted in |
| Owner customer panel (screen reader) | Reveal phone for … | 'Member' vs 'customer' | Reveal phone for … |
| Owner Settings: receipts switch | You earned 12 points at your shop. Balance 48. | 'Transactional' is system language | A short text with what they earned and their new balance. Customers who muted your shop never get one. |
| Owner Settings: receipts switch | Text customers a receipt after each award | 'Award' is staff language | Text customers a receipt each time they earn |
| Owner Settings: toast | SMS receipts on / SMS receipts off | 'SMS' vs 'text' | Text receipts are on / Text receipts are off |
| Owner Settings: toast | toast(v ? "You're in the beta" : "Beta turned off") | 'Beta' is jargon; matches the switch it came from | toast(v ? "Early access is on" : "Early access is off") |
| Owner Settings: Early access | Try new tools in beta | 'In beta' is jargon | Try new tools early |
| Owner Settings: Early access | Beta features turn on for you and your customers before everyone else. You can leave any time. | 'Beta features' and 'leave' are vague | New tools turn on for you and your customers before everyone else. You can switch this off any time. |
| Owner Reports: key numbers | New members | 'Members' vs 'customers' | New customers |
| Owner Reports: key numbers | Active members with 2+ visits | 'Active members' is internal language | Customers with 2 or more visits |
| Owner Reports: POS block (screen reader) | Spend by members | 'Members' vs 'customers' | Spend by customers |
| Owner Reports: POS block | Spend by members | 'Members' vs 'customers' | Spend by customers |
| Owner Reports: POS block | Members who redeemed | 'Members' vs 'customers' | Customers who redeemed a reward |
| Owner Reports: rewards card | Rewards owed right now | 'Rewards owed' is accounting language | Rewards customers can claim right now |
| Owner Reports: network block | Your members also visit (opt-in network) | 'Opt-in network' is internal language | Other shops your customers visit |
| Owner Reports: network block (screen reader) | Your members also visit | 'Members' vs 'customers' | Other shops your customers visit |
| Owner Reports: retention | Share of each month's new members who visited again. | 'Share of' is analyst language | How many of each month's new customers came back. |
| Owner Reports: retention table (screen reader) | Retention cohorts | 'Cohorts' is analyst language | Customers who came back, by the month they joined |
| Owner Reports: retention table | Members | 'Members' vs 'customers' | Customers |
| Owner Reports: retention table | <th key={i} scope="col" className="py-2 text-end">M{i}</th> | 'M0, M1, M2' is cryptic | Join month / Month … |
| Owner Reports: network block | Shops see totals only, never each other&apos;s customers. | Reworded for clearer order | Shops only see totals, never each other&apos;s customers. |
| Owner Promos: promo kind hint | Discount / A percentage off for members. | 'Members' vs 'customers' | Discount / A percentage off for your customers. |
| Owner Promos: promo kind hint | Offer / A deal or freebie, e.g. free cookie with any coffee. | 'E.g.' is abbreviation | Offer / A deal or a freebie, like a free cookie with any coffee. |
| Owner Promos: promo kind hint | Double points / Points multiply during the promo. | Says 'points' for stamp shops; 'multiply' is maths | Double points / Customers earn extra while the promo runs. |
| Owner Promos: promo kind hint | Bonus points / A flat bonus on each qualifying purchase. | 'Flat' and 'qualifying' are finance language | Bonus points / A fixed bonus on each qualifying purchase. |
| Owner Promos: template card | Brings new members | 'Members' vs 'customers' | Brings new customers |
| Owner Promos: template card | Raises the ticket | 'Raises the ticket' is restaurant jargon | Raises the average sale |
| Owner Promos: template card | Fills the dead zone | 'Dead zone' is negative and vague | Fills quiet hours |
| Owner Promos: empty state | A simple offer gets people through the door. Try double stamps on a slow afternoon. | Says 'stamps' to points shops | A simple offer gets people through the door. Try double … on a slow afternoon. |
| Owner Promos: title field | Double stamps on slow afternoons | Says 'stamps' to points shops | Double … on slow afternoons |
| Owner: locked Promos page | Post offers like double stamps on a slow afternoon. | Says 'stamps' to points shops | Post offers like double rewards on a slow afternoon. |
| Owner Promos: editor | Also email opted-in members | 'Opted-in members' is jargon | Also email customers who opted in |
| Owner Promos: editor | Tell your regulars | Heading does not say what | Tell your regulars about it |
| Owner Messages: starter text for new customers | Come back this week and we will add a stamp for you. | Says 'stamp' to points shops; 'we will add' promises something the shop may not do | Come back this week and show your card to start earning toward your next …. |
| Owner Messages: audience | New this fortnight | 'Fortnight' is not common in Canada | New in the last 2 weeks |
| Owner Messages: audience | Not seen in … weeks | 'Not seen' is vague | Haven't visited in … weeks |
| Owner sidebar | Menu & catalog | 'Catalog' is retail-system language | Menu and prices |
| Owner Menu and prices page header | Menu & catalog / What customers can order ahead. Prices are always set here, never by the app. | 'Catalog' is retail-system language; 'never by the app' is vague | Menu and prices / What customers can order ahead, and what it costs. Prices are always set here. |
| Owner Weekly flyer: column header | Per unit | 'Per unit' does not say which unit | Price per 100 g |
| Owner Pet page: groom schedule field | Cadence | 'Cadence' is jargon for 'how often' | Groom every |
| Owner Pet page: toast | Cadence saved | 'Cadence' is jargon | Groom schedule saved |
| Owner Pets: page subtitle | shots and groom cadence. | 'Cadence' is jargon | shots and groom schedule. |
| Owner Groom rebooking: page subtitle | Each pet is on its own cadence. One text per cycle, only to owners who said yes, never overnight. | 'Cadence' and 'cycle' are jargon | Each pet has its own groom schedule. One text each time a groom is due, only to owners who said yes, never overnight. |
| Owner Groom rebooking: stat | Pets on a cadence | 'Cadence' is jargon | Pets with a groom schedule |
| Owner Groom rebooking: column header | Cadence | 'Cadence' is jargon | Groom every |
| Owner Groom rebooking: automation switch | once per cycle, only owners who said yes | 'Cycle' is jargon | once for each groom due, only owners who said yes |
| Owner Promos: results table | Visits in window | 'In window' is analyst language | Visits during promo |
| Owner Promos: results table | Typical | 'Typical' does not say typical what | Usual visits |
| Owner Promo page: stat | Lift vs before | 'Lift' is marketing jargon | Change in visits |
| Owner Promo page: stat caption | Needs 14 days of history / Avg daily visits vs the 14 days before | 'Avg' and 'vs' are abbreviations | Needs 14 days of history first / Average daily visits compared with the 14 days before |
| Owner Settings: tab | Danger zone | 'Danger zone' is dramatic and does not say what is in it | Pause or close |

### Counter (staff) (26)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Staff counter: who came in, list row | new member | Lowercase fragment; 'member' vs 'customer' | New customer |
| Staff counter: list row | in today | 'in today' reads like a typo | Visited today |
| Staff counter: list row | in yesterday | 'in yesterday' reads like a typo | Visited yesterday |
| Staff counter: list row | in {n} days ago | 'in 3 days ago' is wrong grammar | Visited {n} days ago |
| Staff counter: list row | in {n} weeks ago | 'in 2 weeks ago' is wrong grammar | Visited {n} weeks ago |
| Staff counter: list row | in {n} months ago | 'in 3 months ago' is wrong grammar | Visited {n} months ago |
| Staff counter: add-new sheet title | New member | 'Member' vs 'customer' | New customer |
| Staff counter: amount keypad error | The part that doesn't count is more than the total. | Does not say what to do | The amount that doesn't earn can't be more than the total. |
| Staff counter: pharmacy banner | Points are off until the pharmacist-owner confirms the pharmacy rules and gives the OCP accreditation number. | 'OCP' is an unexplained acronym; 'gives' is vague | Points are off until the pharmacist-owner confirms the pharmacy rules and enters the Ontario College of Pharmacists accreditation number. |
| Staff counter: sync strip | Sending · {n} waiting to send | 'Sending ... waiting to send' says the same thing twice | Sending · {n} left |
| Staff counter: recent list type label | Earn | Verb in the base form where the customer app says 'Earned' | Earned |
| Staff counter: recent list type label | Redeem | Verb in the base form where the customer app says 'Redeemed' | Redeemed |
| Staff counter: recent list type label | Adjust | Base form again; the customer sees 'Adjusted' | Adjusted |
| Staff counter: recent list type label | Network bonus | 'Network' is internal; customers see 'Neighbourhood bonus' | Neighbourhood bonus |
| Staff counter: recent list type label | Reversal | Noun where the customer app says 'Reversed' | Reversed |
| Staff counter: recent list type label | Expire | Base form where the customer app says 'Expired' | Expired |
| Staff counter: recent list type label | Import | Base form where the customer app says 'Imported' | Imported |
| Staff counter: list of matches | Matching members | 'Members' vs 'customers' | Matching customers |
| Staff counter: match heading | One member ends in {digits} | 'Members' vs 'customers' | One customer ends in {digits} |
| Staff counter: match heading | {count} members end in {digits} | 'Members' vs 'customers' | {count} customers end in {digits} |
| Staff counter: match list link | Not here? Add as a new member with their number | 'Members' vs 'customers' | Not here? Add them as a new customer with their number |
| Staff counter: no match | Check the digits, or add them as a new member with their number. | 'Members' vs 'customers' | Check the digits, or add them as a new customer with their number. |
| Staff counter: no match button | Add as a new member | 'Members' vs 'customers' | Add as a new customer |
| Staff counter: error | No member found. Check the code or number. | 'Members' vs 'customers' | No customer found. Check the code or number. |
| Staff counter: add-new sheet title | New member: {phone} | 'Member' vs 'customer' | New customer: {phone} |
| Staff counter: success screen | New member · first stamp | 'Member' vs 'customer' | New customer · first stamp |

### Customer pages and app (31)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Customer web: join done and pass pages | Wallet passes aren't available right now. Your card at /me works at the counter. | Shows a URL path (/me), which means nothing to a customer | Wallet passes aren't available right now. The card on this page works at the counter. |
| Customer web: menu section count (a café shows '6 dishes' for drinks) | {n, plural, one {# dish} other {# dishes}} | 'Dishes' is wrong for a café, bakery or any non-restaurant menu | {n, plural, one {# item} other {# items}} |
| Customer web: empty order page | Pick a few dishes from the menu and they will show up here. | 'Dishes' is wrong for a café order | Add something from the menu and it will show up here. |
| Customer web: order page button | Add more dishes | 'Dishes' is wrong for a café order | Add more items |
| Customer web: order page notice | A dish in your order is no longer on the menu, so we took it out. | 'Dish' is wrong for a café order | An item in your order is no longer on the menu, so we took it out. |
| Customer app and web: Rewards tab, empty | No rewards yet | Says 'no rewards' when the customer has rewards to work toward; the tab lists ready rewards | No rewards ready yet |
| Customer app and web: Rewards tab, empty | Keep visiting your shops. We'll tell you the moment one's ready. | 'Visiting' and 'one' are vague; says what happens next | Keep collecting at your shops. We'll tell you the moment a reward is ready. |
| Customer app and web: Rewards tab empty-state button | See how close you are | Button label does not say where it goes | See your shops |
| Customer app: Settings, notifications inbox, empty | Nothing yet. Points, rewards and order updates land here. | 'Land here' is slang; hard-codes 'points' when the shop may use stamps | No updates yet. They show up here when you earn, a reward is ready or an order changes. |
| Customer web: classes, confirmation button | OK | 'OK' is a banned button label; say the action | Done |
| Customer web: cancel tiffin subscription dialog | Yes, cancel | 'Yes' as a button label; say the action | Cancel subscription |
| Customer web: cancel appointment dialog | Yes, cancel | 'Yes' as a button label; say the action | Cancel appointment |
| Customer web: cancel membership dialog | Yes, cancel | 'Yes' as a button label; say the action | Cancel membership |
| Customer web: cancel pre-order reservation dialog | Yes, cancel | 'Yes' as a button label; say the action | Cancel reservation |
| Customer web: page title for a passport or points weekend | Neighbourhood campaign | 'Campaign' is marketing language; customers see an event | Neighbourhood event |
| Customer web: error loading an event page | Can't load this campaign right now | 'Campaign' is marketing language; say what to do next is covered by the retry button | Can't load this event right now |
| Customer app: event page that ended | This campaign isn't running any more. | 'Campaign' is marketing language | This event isn't running any more. |
| Customer app: event page that ended | This campaign has ended. You visited {n, plural, one {# shop} other {# shops}}. | 'Campaign' is marketing language | This event has ended. You visited {n, plural, one {# shop} other {# shops}}. |
| Customer app: activity detail | Transaction {id} | 'Transaction' is system language | Reference {id} |
| Customer app: activity detail | This transaction was reversed. | 'Transaction' is system language | This purchase was reversed. |
| Customer app: shop page for a shop that left | This shop isn't on the network right now. | 'The network' is internal; customers don't know it | This shop isn't taking part right now. |
| Customer web: map list, no results | nothing here with these filters | Lowercase sentence with no full stop; differs from the app's wording | Nothing matches these filters. |
| Customer app: map list, no results | Nothing matches those filters | Different wording from the web for the same state; no full stop | Nothing matches these filters. |
| Customer app and web: street bonus progress card | bonus earned | Lowercase label that is not a display title | Bonus earned |
| Customer web: 'Nearby on your street' badge | Deal | 'Deal' vs 'offer' vs 'promo' for the same thing; customers say offer | Offer |
| Customer web: 'Nearby on your street' badge | Perk | 'Perk' vs 'reward' vs 'bonus': one word for the neighbourhood bonus | Street bonus |
| Customer web: My vehicles, service status chip | OK | 'OK' says nothing about what is fine | Up to date |
| Customer web: tiffin payment choice | Bank debit (PAD) | 'PAD' is a banking acronym | Bank debit |
| Customer app: tiffin subscription status | Payment due | Same state is 'Payment failed' on the web | Payment failed |
| Customer web: order payment page status | Received | The same state is 'Order sent' on the order page and in the app | Order sent |
| Customer web and app: shop page tab | Promos | Owners make 'promos'; customers see 'offers' (the rest of the app says offers) | Offers |

### Mobile app (counter and customer) (14)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Counter and mobile: stuck-sync banner | {n, plural, one {# award hasn't} other {# awards haven't}} sent for 24 h. Check the connection. | '24 h' abbreviation; the fix is not clear | {n, plural, one {# award hasn't} other {# awards haven't}} sent in 24 hours. Check your connection. |
| Mobile counter: match row | in … days ago | 'in 3 days ago' is wrong grammar | Visited … days ago |
| Mobile counter: match row | in … weeks ago | 'in 2 weeks ago' is wrong grammar | Visited … weeks ago |
| Mobile counter: match row | in … months ago | 'in 3 months ago' is wrong grammar | Visited … months ago |
| Mobile counter: matches heading | … member… end… in … | 'Members' vs 'customers' | … customer… end… in … |
| Mobile counter: error | No members end in those 4 digits. | 'Members' vs 'customers'; does not say what to do | No customers end in those 4 digits. Check the digits and try again. |
| Mobile copy library | err.award.memberBlocked / This member can't earn here. Ask a manager. | 'Member' vs 'customer' | err.award.memberBlocked / This customer can't earn here. Ask a manager. |
| Mobile counter: scan hint | Wallet pass, app, or printed QR. Stamps on scan. | Says 'stamps' to points shops | Wallet pass, app, or printed QR. A scan adds it for you. |
| Mobile kitchen screen: locked | Kitchen display comes with the Pro plan. | 'The Pro plan' is not a plan's name | The kitchen display comes with Restaurant Pro. |
| Mobile counter: order screen error | Can't reach the server. Try again. | 'The server' is system language | Can't connect right now. Check your connection and try again. |
| Mobile counter: no match | Not here? Add as a new member with their number | 'Member' vs 'customer' | Not here? Add them as a new customer with their number |
| Mobile counter: no match | Check the digits, or add them as a new member with their number. | 'Member' vs 'customer' | Check the digits, or add them as a new customer with their number. |
| Mobile counter: no match button | Add as a new member</Button> | 'Member' vs 'customer' | Add as a new customer</Button> |
| Mobile counter: scanner title | Scan the member card or reward code | 'Member' vs 'customer' | Scan the customer card or reward code |

### Marketing site (15)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Owner Billing and public Pricing: Free plan card | bestFor: ["Every merchant"] | 'Merchant' is internal; the product says 'shop' | bestFor: ["Every shop"] |
| Owner Billing and public Pricing: Café & Retail card | Promos, VIP levels, email & SMS marketing, POS auto-award, CSV, webhooks, order-ahead, appointment booking, and class schedules with packs and memberships. | 'CSV' and 'webhooks' are developer terms for a shop owner | Promos, VIP levels, email and text marketing, POS auto-award, customer exports, order-ahead, appointment booking, and class schedules with packs and memberships. |
| Public Pricing: note under the plans | Only network-wide extras (sponsored promos and listings, map pins, BIA campaigns, nearby push) wait until the network reaches {target} shops. | 'Network-wide extras' and 'the network reaches' are internal language | A few extras that need many shops nearby (sponsored promos and listings, map pins, BIA campaigns, nearby push) open once {target} shops have joined. |
| Public Pricing: FAQ answer | Yes. Subscribe from your dashboard and your trade's tools switch on right away: calendar and booking, classes and memberships, the walk-in line, pets, grocer and auto tools. Only network-wide extras (sponsored promos and listings, map pins, BIA campaigns) wait until the network reaches {target} shops. | 'Network-wide extras' and 'your trade' are internal language | Yes. Subscribe from your dashboard and your shop's tools switch on right away: calendar and booking, classes and memberships, the walk-in line, pets, grocer and auto tools. A few extras that need many shops nearby (sponsored promos and listings, map pins, BIA campaigns) open once {target} shops have joined. |
| Public Pricing and Billing: note | Paid tools switch on once enough shops are on the network, so every feature launches with customers already using the app. | 'On the network' is internal language | Paid tools switch on once enough shops have joined, so every feature launches with customers already using the app. |
| Marketing home: comparison footnote | Tools for your trade are optional: | 'Tools for your trade' is internal language | Tools for your kind of shop are optional: |
| Public Pricing: section label | Your trade, included | 'Your trade' is internal language | Your kind of shop, included |
| Public Pricing: section line | Subscribe to Café & Retail and your trade's tools switch on. | 'Your trade' is internal language | Subscribe to Café & Retail and the tools for your kind of shop switch on. |
| Public Pricing: feature table | Opens when the network reaches {f.unlockAtMerchants} shops. | 'The network reaches' is internal language | Opens once {f.unlockAtMerchants} shops have joined. |
| Public Pricing: plan header | {p !== "free" && !available[p] ? " · pilot shops" : ""} | 'Pilot shops' is internal language | {p !== "free" && !available[p] ? " · early access" : ""} |
| Public Pricing: table cell (screen reader label) | soon ? "Included, pilot shops now" : "Included" | 'Pilot shops' is internal language | soon ? "Included, early access" : "Included" |
| Public Pricing: note | The network has … active shops today. | 'The network has N active shops' is internal language | … shops have joined so far. |
| Public Neighbourhoods page: status | Live / Pilot | 'Pilot' is internal language | Live / Just starting |
| Marketing home: network section | Neighbourhood perks such as “visit 3 shops, get 50 points”, paid for by the network, not by you. | 'Perks' vs 'bonuses'; 'the network' is internal | Neighbourhood bonuses such as “visit 3 shops, get 50 points”, paid for by Local Loyalty, not by you. |
| Public site footer and page descriptions | One app for every shop on your street. | Says 'app' while every page says 'no app needed'; the card is the product | One card for every shop on your street. |

### API errors (shown in toasts and banners) (27)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Any screen: session ended (API error) | Sign in required | Does not say what to do; no full stop | Please sign in to continue. |
| Any dashboard screen: not allowed (API error) | You don't have access to this | Does not say what to do | You don't have access to this. Ask the shop owner. |
| Any screen: something was removed or the link is old (API error) | Resource / … not found | 'Resource not found' says nothing useful and is the same for every object | Shop / We couldn't find that shop. / VIP level / We couldn't find that …. |
| Owner dashboard: locked feature (API error) | Upgrade to use … / … is coming soon | 'Upgrade to use' is a banned phrase; 'coming soon' leaves out what to do | … isn't on your plan yet. / … isn't available yet. |
| Owner dashboard: role too low (API error) | Requires … access | 'Requires manager access' sounds like a system rule | Only the shop owner can do this. / Only …s and owners can do this. Ask the shop owner. |
| Owner dashboard: missing permission (API error) | Missing permission: … | Shows an internal permission key | You don't have permission to do this. Ask the shop owner. |
| Customer app and web: session ended (API error) | Sign in required | Does not say what to do | Please sign in to continue. |
| Any screen: server error (API error) | Something went wrong | Does not say what to do | Something went wrong on our end. Try again in a moment. |
| Any form: a field failed validation (API error) | Invalid request | 'Invalid request' is system language and says nothing about what to fix | Some of what you entered isn't right. Check the form and try again. |
| Any long list (API error) | Invalid cursor | 'Invalid cursor' is developer language | That list is out of date. Reload the page. |
| Customer activity list (API error) | Invalid cursor | 'Invalid cursor' is developer language | That list is out of date. Reload the page. |
| Customer notifications list (API error) | Invalid cursor | 'Invalid cursor' is developer language | That list is out of date. Reload the page. |
| Owner Customers list (API error) | Invalid cursor | 'Invalid cursor' is developer language | That list is out of date. Reload the page. |
| Owner Pre-orders: date range (API error) | 'to' is before 'from' | Developer language | The end date is before the start date. |
| Kitchen display: date range (API error) | 'to' is before 'from' | Developer language | The end date is before the start date. |
| Owner Invoices (API error) | This ticket has no approved quote. Send fromQuote=false with the line items. | Shows a request parameter | This ticket has no approved quote. Add the invoice lines yourself instead. |
| Owner Tickets: handing over an item (API error) | Mark it paid or pass allowUnpaid. | Shows a request parameter | Mark it paid first, or confirm that you want to go on without payment. |
| Shop setup (API error) | Unknown vertical: … | 'Vertical' is internal language | We don't recognise that type of shop. |
| Owner Daycare (API error) | This stay is not expected today. | 'Stay' is system language | This dog isn't expected today. |
| Owner Ads (API error) | Only network-wide promos can be boosted | 'Network-wide' is internal language | Only promos shown to everyone nearby can be boosted. |
| Owner Ads (API error) | This campaign's flight has ended | 'Flight' is ad-industry jargon | This campaign's dates have passed. |
| Staff counter (API error) | Loyalty program is not set up yet | Does not say what to do | Set up your loyalty program first, then try again. |
| Staff counter (API error) | Loyalty program is not set up yet | Does not say what to do | Set up your loyalty program first, then try again. |
| Owner Pets: groom schedule (API error) | Cadence is 1 to 26 weeks. | 'Cadence' is jargon | Choose between 1 and 26 weeks. |
| Owner Promos (API error) | Only drafts can be deleted; archive it instead | Does not say what 'it' is | Only drafts can be deleted. Archive this promo instead. |
| Integrations (API error) | Unknown webhook provider | 'Webhook provider' is developer language | We don't recognise that app. |
| Owner Webhooks (API error) | Unknown events: … | Wording | We don't recognise these events: …. |

### Admin and rep consoles (46)

| Where | Current text | Problem | New text |
| --- | --- | --- | --- |
| Admin and rep console nav | Areas & perks | 'Areas & perks' is internal | Neighbourhoods and bonuses |
| Admin console nav | Activation | 'Activation' is internal | New shops' progress |
| Admin: network density gauge | Pro unlock | 'Pro unlock' names a plan that is now called Service | Service tools |
| Admin: network density gauge | Plus unlock | 'Plus unlock' names a plan that is now called Café & Retail | Café & Retail tools |
| Admin: network density gauges | unit: "merchants" | 'Merchants' vs 'shops' | unit: "shops" |
| Admin: network density gauges (screen reader label) | Network density | 'Network density' is internal language | Shops joined, by feature |
| Admin Rollout: stage names | Hidden / Beta | 'GA' is jargon, and the page subtitle already says 'Live' | Hidden / Early access / Live |
| Admin Rollout: plan names | every plan / Plus / Pro | 'Plus' and 'Pro' are not the plans' names | every plan / Café & Retail / Service |
| Admin Rollout: stage change explanation | every merchant / merchants on … | 'Merchant' is internal; the product says 'shop' | every shop / shops on … |
| Admin Rollout: stage change explanation | disappears for everyone except merchants with an override. Their data is kept. | 'Override' is internal language | disappears for everyone except shops that were given access by hand. Their data is kept. |
| Admin Rollout: stage change explanation | who opted into betas. Their customers will see it too. | 'Opted into betas' is jargon | who turned on early access. Their customers will see it too. |
| Admin Rollout: group title | Phase 2 · Plus | 'Plus' is not the plan's name | Phase 2 · Café & Retail |
| Admin Rollout: group title | Phase 2 · Pro | 'Pro' is not the plan's name | Phase 2 · Service |
| Admin Rollout: group title | Phase 3 · Network | 'Network' is internal language | Phase 3 · Needs many shops |
| Admin Rollout: stage change dialog | The network has {feature.activeMerchants} active merchants; the target for this feature is {feature.unlockAtMerchants}. | 'The network has N active merchants; the target for this feature is' is system language | {feature.activeMerchants} shops are active; this feature is meant to open at {feature.unlockAtMerchants}. |
| Admin Rollout: stage change dialog | Saved in the audit log. | 'Audit log' alone does not say who reads it | Saved in the audit log, so the team can see why. |
| Admin Rollout: stage switch | Beta | 'Beta' and 'GA' are jargon; the subtitle says 'Live' | Early access / Live |
| Admin Rollout: table header | Asked for it | 'Asked for it' does not say who asked | Notify requests |
| Admin Rollout: table header | Overrides | 'Overrides' is internal language | Shop exceptions |
| Admin Rollout: exceptions sheet | Overrides: … / Force this feature on for pilot shops (or off), whatever the stage or plan. | 'Overrides' and 'pilot shops' are internal language | Shop exceptions: … / Turn this feature on (or off) for specific shops, whatever the feature's stage or their plan. |
| Admin Rollout: exceptions sheet | o.reason ?? "No reason" | Reads like a status | o.reason ?? "No reason given" |
| Admin Rollout: exceptions sheet | {o.enabled ? "Forced on" : "Forced off"} | 'Forced' is system language | {o.enabled ? "On for this shop" : "Off for this shop"} |
| Admin Rollout: exceptions sheet (screen reader) | Remove override for … | 'Override' is internal language | Remove exception for … |
| Admin Rollout: exceptions sheet | No overrides yet. | Does not say what an exception is | No shops added yet. |
| Admin Rollout: exceptions sheet | Find a merchant | 'Merchant' is internal; the product says 'shop' | Find a shop |
| Admin Rollout: exceptions sheet (screen reader) | Merchant results | 'Merchant' is internal | Shop results |
| Admin Rollout: exceptions sheet | Override / Force on / Force off | 'Force on/off' is system language | Access / Turn on / Turn off |
| Admin Rollout: exceptions sheet | Pilot shop, Roncesvalles | 'Pilot shop' is internal language | Early access for the Roncesvalles shops |
| Admin Rollout: exceptions sheet button | Save override | 'Override' is internal language | Save exception |
| Admin and rep console (API error) | Start a support session with a reason before changing this shop | No full stop; wording | Start a support session and give a reason before you change this shop. |
| Admin Neighbourhoods (API error) | A neighbourhood with slug "…" already exists | 'Slug' is developer language | A neighbourhood with the web address "…" already exists. |
| Admin Campaigns (API error) | A winner was already drawn; pass redraw: true to draw again | Shows a request parameter | A winner was already drawn. Choose to draw again if you want a new one. |
| Admin Ads review (API error) | This campaign's flight has already ended | 'Flight' is ad-industry jargon | This campaign's dates have already passed. |
| Admin Neighbourhoods | Areas & perks / The launch calendar (opens, street day, who walks it), BIA details and network-funded perks. | 'Areas & perks' is internal; 'perk' vs 'bonus' | Neighbourhoods and bonuses / The launch calendar (opening dates, street day, who walks it), BIA details and the bonuses the network pays for. |
| Admin Neighbourhoods | Network perks | 'Perk' vs 'bonus' | Neighbourhood bonuses |
| Admin Neighbourhoods | >Add perk</Button>}> | 'Perk' vs 'bonus' | >Add bonus</Button>}> |
| Admin Neighbourhoods: empty state | No perks yet. | Empty state with no next step | No bonuses yet. Add one to reward shoppers for visiting more shops. |
| Admin Neighbourhoods: dialog title | p?.id ? "Edit perk" : "Add perk" | 'Perk' vs 'bonus' | p?.id ? "Edit bonus" : "Add bonus" |
| Admin Neighbourhoods: dialog button | >Save perk</Button> | 'Perk' vs 'bonus' | >Save bonus</Button> |
| Admin Neighbourhoods: bonus location picker | Network-wide | 'Network-wide' is internal language | All neighbourhoods |
| Admin Neighbourhoods: bonus row | ?? "Network-wide"} | 'Network-wide' is internal language | ?? "All neighbourhoods"} |
| Admin Today: revenue caption | Plus …, Pro … | 'Plus' and 'Pro' are not the plans' names | Café & Retail …, Service … |
| Admin Today: revenue split | ["Plus and Pro", d.money.mrrSplit.plansCents] | 'Plus' and 'Pro' are not the plans' names | ["Café & Retail and Service", d.money.mrrSplit.plansCents] |
| Admin Today: error | We could not load the network overview. | Does not say what to do | We could not load the overview. Reload the page to try again. |
| Admin Costs: footnote | Unit costs are assumptions from the finance model (docs/finance/unit-economics.md): texts | Shows a file path and 'unit costs' | Costs per text, message and shop are our own estimates from the finance model: texts |
| Admin Rollout: stage change dialog title | Turn … to …? | 'Turn X to GA' reads oddly; 'Switch' fits every stage | Switch … to …? |

## Looked at and left alone

| What | Why |
| --- | --- |
| Every legal and consent string: `consent.*`, `auth.consent.*`, `cp.consent.*`, `ms` and `sh` consent lines, the withdrawal and unsubscribe pages, "Reply STOP" lines, the Messages page note about who can be texted, expiry disclosures ("Your stamps never expire."), and the pharmacy rule text. | The brief says to keep these identical unless unclear. None was unclear enough to risk a new consent text version. One is worth counsel's eye: `auth.consent.merchant` says "Not ticked for you.", which reads oddly (it means the box is not pre-ticked). |
| Lowercase display titles ("wallet", "my card", "one card for every shop on your street.", "kitchen", map and category chips). | Brand voice (docs/design/brand.md): lowercase is for display titles only. Sentences, buttons and labels were already sentence case, and the lowercase sentences that were not ("nothing here with these filters", "bonus earned", "in today") were fixed. |
| "Merchant agreement" in the site footer. | It is the title of a legal document. |
| Trade words inside trade tools: client, student, guest, diner, pot, degh, dum, bump, fire. | They are what people in those shops say. The glossary limits them to those tools. |
| Developer pages ("Webhooks & API", `X-LL-Api-Key`). | The reader is a developer. |
| Admin feature keys (`promos.basic`) next to feature names. | The admin console uses them to find a feature; owners never see them. |
| "Terms", "Privacy", "Rewards terms". | Legal page names. |

## For counsel

Consent and unsubscribe wording is untouched. These strings restate a legal or regulatory rule and were reworded for plainness; the rule they state is the same.

| Where | Before | After |
| --- | --- | --- |
| Owner Settings > Privacy: your data (`YourDataPanel.tsx`, two places) | We keep ledger history for 7 years for tax and dispute reasons. Phone numbers stay masked in lists. | We keep balance and purchase history for 7 years for tax and dispute reasons. Phone numbers stay hidden in lists. |
| Staff counter, pharmacy banner (`counter.pharm.off`, four languages) | Points are off until the pharmacist-owner confirms the pharmacy rules and gives the OCP accreditation number. | Points are off until the pharmacist-owner confirms the pharmacy rules and enters the Ontario College of Pharmacists accreditation number. |
| Owner Setup, pharmacy step (`setup/steps.ts`) | The pharmacist-owner confirms the rules and gives the pharmacy's OCP accreditation number. | The pharmacist-owner confirms the rules and enters the pharmacy's Ontario College of Pharmacists accreditation number. |
| Public Pricing note and FAQ (`en-CA.ts`), Owner Billing FAQ | Only network-wide extras (...) wait until the network reaches {target} shops. | A few extras that need many shops nearby (...) open once {target} shops have joined. |

## Known gaps

- The admin console still shows a gauge such as "37 / 0 shops" for features whose unlock target is 0. That is a data problem (the target is 0), not a wording problem; it needs a product decision.
- French (fr-CA) is not covered; the keys are stable so it can be added.
- Hindi, Urdu and Punjabi need a native read (see translation-glossary.md).
