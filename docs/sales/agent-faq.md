# Sales assistant knowledge base

This file is what the sales and support assistant (apps/api/src/services/sales-agent) may say about the product beyond the live tools. It is read at run time by the `search_knowledge` tool, so an edit here changes the assistant's answers with no deploy of code. Rules for editing:

- Every price, fee, plan name and percentage is a double-brace token from `packages/shared/src/legal-tokens.ts` (the same ones the legal pages use). The token is filled when the assistant reads it, so a number here cannot disagree with `plans.ts`. A test fails on an unknown token and on a hard-coded dollar amount or percentage in this file.
- Only write what is true today. If it is undecided, say "we have not decided" in the entry, so the assistant says the same and hands off.
- Sources: `docs/business/pricing.md`, `docs/research/landing-and-network.md`, `docs/research/merchant-onboarding.md`, the marketing site FAQ (`apps/web/src/copy/en-CA.ts`), `docs/sales/battlecards.md`.
- One question per `##` heading, written as an owner would ask it. Short answer first.

## Is it really free?

Yes for the loyalty program. Points, stamps, rewards, your customer list, basic reports, the map listing and the wallet pass are free forever, for unlimited locations, staff and members. There is no subscription and no fee on loyalty. Online orders on the {{plan.free.name}} plan carry a {{fee.orderFree}} fee. Free features can never move to a paid plan.

## What does it cost? What are the plans?

Shops: {{plan.free.name}} is {{plan.free.price}}; {{plan.plus.name}} is {{plan.plus.price}} ({{plan.plus.annual}}); {{plan.pro.name}} is {{plan.pro.price}} ({{plan.pro.annual}}). Restaurants have their own ladder beside those: {{restaurant.starter.name}} {{restaurant.starter.price}}, {{restaurant.growth.name}} {{restaurant.growth.price}}, {{restaurant.pro.name}} {{restaurant.pro.price}}. Any restaurant plan already includes everything in {{plan.plus.name}}, so a restaurant never pays for both. Annual plans pay 10 months, not 12. Prices are before HST. Use the `get_pricing` tool for the exact current table.

## Are the prices before HST? Is HST on the invoice?

Prices shown are before HST. We have not decided how HST appears on our invoices: we are confirming that with our accountant before billing starts. Do not guess; offer to have the team follow up.

## Do you take a cut of my sales? What are the fees?

Not on the loyalty program. Online orders on a restaurant plan or any paid plan carry {{fee.orderPaid}} platform fee (commission-free); on the {{plan.free.name}} plan it is {{fee.orderFree}}. Deposits (catering, banquet, quotes, online appointment deposits) and invoices carry {{fee.depositInvoice}}. Tiffin subscription billing carries {{fee.tiffin}}. Appointment checkout taken through the calendar carries {{fee.appointmentCheckout}}. Payments you record by hand (Interac e-transfer, cash, cheque) carry {{fee.manual}}. Card processing is Stripe's standard rate, passed through at cost. The optional customer service fee on orders is {{fee.customerService}} per order and only exists if the restaurant turns it on.

## Is there a contract? Can I cancel?

No contract and no setup fee. Cancel any time: you go back to {{plan.free.name}} and keep your loyalty data. Nothing is deleted when you downgrade; only paid features lock.

## Do I need a POS? Does it work with my POS?

No POS is needed. Staff type a customer's phone number in the free counter app. POS auto-award (Square, Clover, Shopify, Lightspeed, Toast) is a paid extra on {{plan.plus.name}}, and paid features open to every shop as the network grows. Do not promise a specific POS integration date.

## Whose customer data is it?

Yours. Each shop sees only its own members' activity at that shop, other shops never see your members, and customers only get offers if they opt in (CASL). You can export your list (a paid feature on {{plan.plus.name}}); after you leave, you can still download your members and visits as a CSV for {{retention.leaverExportDays}}.

## What languages do you support?

The assistant and the customer-facing screens work in English, Hindi, Urdu and Punjabi. Restaurant menus can be in all four. On {{restaurant.pro.name}}, kitchen and staff screens are available in Hindi, Urdu and Punjabi too.

## How long does set-up take?

Self sign-up takes about 2 minutes. A rep can come to your shop for a free 20-minute visit to set up your program, print your QR stand and show your staff the counter app. For restaurants, the ordering page and WhatsApp updates typically go live within a few days of signing; do not promise a date.

## What is the founding offer for restaurants?

The first {{founding.slots}} restaurants per corridor get {{founding.firstYearPct}}% off for 12 months, then {{founding.lifetimePct}}% off for life, while spots last. Spots left per corridor change; do not promise a spot. The team confirms availability.

## Are the paid plans available today?

Restaurant plans are live now. {{plan.plus.name}} and {{plan.pro.name}} features are rolling out as the network grows; pilot shops have them today. Use `get_pricing`, which says what is open right now. Start on {{plan.free.name}} and the team will say when paid features open.

## Do you do delivery? Do I keep DoorDash or Uber Eats?

We do not run delivery or drivers and take no delivery commission. Orders on your ordering page are pickup or your own delivery. Keep DoorDash or Uber Eats if you want them: use the apps to be found, and send your regulars to your own page.

## Do you certify halal?

No. The restaurant sets halal, zabihah, vegetarian, vegan, Jain and spice labels on each dish. We show them and let customers filter.

## How do tiffin customers pay?

By saved card or pre-authorized bank debit, charged on the restaurant's own Stripe account, with the {{fee.tiffin}} billing fee. A tiffin kitchen that takes e-transfer or cash can also sign customers up without a Stripe account.

## What does WhatsApp cost? How many messages are included?

{{restaurant.starter.name}} includes {{restaurant.starter.whatsapp}} WhatsApp messages a month, {{restaurant.growth.name}} {{restaurant.growth.whatsapp}} and {{restaurant.pro.name}} {{restaurant.pro.whatsapp}}. More come in packs: {{addon.whatsapp_1000.name}}, {{addon.whatsapp_1000.price}}. Marketing messages only go out between 8:00 and 21:00 and only to customers who opted in.

## What are the add-ons?

{{table.addons}}

## How do SMS and email campaigns work?

{{plan.plus.name}} includes {{plan.plus.sms}} SMS a month and {{plan.pro.name}} {{plan.pro.sms}}. Messages go only to customers who opted in (CASL), with an unsubscribe in every message.

## How does Local Loyalty make money?

Three ways, all optional for a shop: restaurant plans, paid shop add-ons as they open, and BIAs paying for street campaigns. The loyalty program itself never moves to a paid plan.

## I run a BIA. Can you help?

Yes: BIAs run street campaigns (passport weeks, points weekends) with a one-page board report. Take the person's details and hand off to the team; do not quote campaign prices.

## Can I move my existing loyalty members over?

Importing members from another loyalty app is a paid feature on {{plan.plus.name}} ("Import & migrate"). Check with the team about your specific file before promising it.

## Can I trust the AI assistant? Can I talk to a person?

You are talking to an AI assistant. It can be wrong, so for anything important a person on the team can take over at any time: type HUMAN. Chats are saved for {{retention.salesAgentDays}} so the team can follow up, and the AI processing is covered in the privacy policy.

## Can you guarantee more customers or more sales?

No. We cannot promise results. Shops that run a loyalty program give customers a reason to come back; how much depends on the shop. Never state a percentage increase.
